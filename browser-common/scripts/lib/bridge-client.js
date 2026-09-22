/**
 * VSCode Bridge 客户端 — background 子模块
 *
 * 职责：Bridge 连接状态（BRIDGE）、端口发现（discoverPort）、配额数据推送
 * （sendToVscode）、失败重试队列（持久化到 storage.local）、互斥锁
 * （推送/端口发现串行化）、fetch 超时工具（timeoutSignal）。
 *
 * 依赖：仅 protocol（依赖图底层，杜绝循环引用）。
 */

// 协议常量单一可信源（端口/探测密钥/超时/端点路径，与 VSCode 端镜像对齐）
import {
	BRIDGE_PORTS,
	BRIDGE_PROBE_HEADER,
	BRIDGE_PROBE_SECRET,
	BRIDGE_AUTH_HEADER,
	BRIDGE_HEALTH_PATH,
	BRIDGE_DATA_PATH,
	MAX_PENDING_PAYLOADS,
	MAX_RETRY_ATTEMPTS,
	RETRY_DELAY_MS,
	TIMEOUTS,
} from '../../protocol/index.js';

// ===== VSCode Bridge 服务器配置 =====

export const BRIDGE = {
  /** 预定义端口列表（范围见 protocol/constants.js 的 BRIDGE_PORTS） */
  ports: BRIDGE_PORTS,
  activePort: null,
  authToken: null,
  /** 连续认证失败次数（用于防止 401 循环） */
  authFailures: 0,
  /** 最后一次连接/推送失败的错误信息（用于 popup 诊断） */
  lastError: null,
};

// ===== 互斥锁 =====

// 简易互斥锁：确保 Bridge 推送操作串行执行，避免并发导致数据竞争。
// 实现原理：维护一个 Promise 链，每个调用者等待前一个完成后再执行。
// _mutexPromise 始终指向链尾的 Promise，新调用者 await prev 后才执行 fn()。
// finally 中的 release() 推进链尾，即使 fn() 抛出异常也能正确解锁。
let _mutexPromise = Promise.resolve();

export async function withBridgeMutex(fn) {
	let release;
	const promise = new Promise(resolve => { release = resolve; });
	const prev = _mutexPromise;
	_mutexPromise = prev.then(() => promise, () => promise);
	await prev;
	try {
		return await fn();
	} finally {
		release();
	}
}

// ===== fetch 超时工具（credential 等模块复用）=====

export const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
};

// ===== 重试队列 =====

const pendingPayloads = [];
let isRetrying = false;
const PENDING_STORAGE_KEY = 'bridgePendingPayloads';

/**
 * 冷启动初始化 gate：SW 重启后 init() 的 loadPending() 恢复 storage 队列是异步的，
 * 挂起期间事件驱动的 enqueuePayload 若直接 persistPending 会用未恢复完成的内存队列
 * 覆盖 storage，导致旧队列条目丢失。此处以模块级 Promise 保证恢复只执行一次，
 * enqueuePayload 在恢复完成前等待该 Promise。
 */
let pendingRestorePromise = null;

/** 从 chrome.storage.local 恢复待重传队列（Service Worker 重启后数据不丢失） */
export function loadPending() {
	if (!pendingRestorePromise) {
		pendingRestorePromise = doLoadPending();
	}
	return pendingRestorePromise;
}

async function doLoadPending() {
	try {
		const result = await chrome.storage.local.get(PENDING_STORAGE_KEY);
		if (Array.isArray(result[PENDING_STORAGE_KEY])) {
			pendingPayloads.push(...result[PENDING_STORAGE_KEY]);
			if (pendingPayloads.length > 0) {
				console.log(`[Bridge] 恢复 ${pendingPayloads.length} 条待重传数据`);
			}
		}
	} catch { /* ignore */ }
}

/** 将当前队列持久化到 chrome.storage.local */
async function persistPending() {
	try {
		await chrome.storage.local.set({ [PENDING_STORAGE_KEY]: pendingPayloads });
	} catch { /* ignore */ }
}

export async function enqueuePayload(payload) {
	// 等待冷启动恢复完成，避免以未恢复的内存队列覆盖 storage 中的旧队列
	if (pendingRestorePromise) {
		await pendingRestorePromise;
	}
	if (pendingPayloads.length >= MAX_PENDING_PAYLOADS) {
		pendingPayloads.shift();
	}
	pendingPayloads.push({ payload, retries: 0 });
	await persistPending();
}

export async function retryPending() {
	if (isRetrying) return;
	isRetrying = true;
	try {
		while (pendingPayloads.length > 0) {
		const item = pendingPayloads[0];
		if (item.retries >= MAX_RETRY_ATTEMPTS) {
			console.error('[Bridge] 重试次数已耗尽，丢弃数据包');
			pendingPayloads.shift();
			await persistPending();
			continue;
		}
		item.retries++;
		const success = await sendToVscode(item.payload);
		if (success) {
			pendingPayloads.shift();
			await persistPending();
		} else {
			// 失败路径也持久化：item.retries 已自增，写回 storage 保证 SW 重启后
			// 计数不归零（否则 MAX_RETRY_ATTEMPTS 可能永不达成）
			await persistPending();
			await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
			break;
		}
		}
	} finally {
		isRetrying = false;
	}
}

// ===== 端口发现与推送 =====

// 锁层级说明：
// - relayData() 在 withBridgeMutex 外部管理 isRelaying 标记（非互斥，仅防重入）
// - relayData() 内部调用 sendToVscode()，sendToVscode() 使用 withBridgeMutex
// - 不会产生嵌套锁：relayData 不持锁，仅 sendToVscode 持锁
// - discoverPort() 也使用 withBridgeMutex，保证端口发现与推送串行

/** 尝试从端口文件读取 VSCode Bridge 端口（Chrome 扩展无法直接读取文件系统，
 * 但通过 fetch 本地 HTTP 服务器是可行的。此处保留端口文件逻辑注释供参考。
 * 实际方案：优先尝试常用端口，增加超时时间提高成功率） */

async function _doDiscoverPort() {
  if (BRIDGE.activePort) return true;

  // 优先尝试上次成功的端口（如果有）
  const lastPort = await getLastKnownPort();
  const portsToTry = lastPort
    ? [lastPort, ...BRIDGE.ports.filter(p => p !== lastPort)]
    : BRIDGE.ports;

  let lastErr = null;
  for (const port of portsToTry) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${BRIDGE_HEALTH_PATH}`, {
        headers: { [BRIDGE_PROBE_HEADER]: BRIDGE_PROBE_SECRET },
        signal: timeoutSignal(TIMEOUTS.healthProbe), // 增加超时到 2 秒
      });
      if (res.ok) {
        const data = await res.json();
        BRIDGE.activePort = port;
        BRIDGE.authToken = data.authToken || null;
        BRIDGE.lastError = null;
        console.log(`[Bridge] 已连接到端口: ${port}`);
        await saveLastKnownPort(port);
        return true;
      }
      lastErr = `端口 ${port} 返回 HTTP ${res.status}`;
    } catch (err) {
      lastErr = err.message || String(err);
      // 端口不通
    }
  }
  BRIDGE.activePort = null;
  BRIDGE.authToken = null;
  BRIDGE.lastError = lastErr || '未找到可用的 VSCode Bridge 端口';
  console.error('[Bridge] 端口发现失败:', BRIDGE.lastError);
  return false;
}

/** 从 storage 读取上次成功的端口 */
async function getLastKnownPort() {
  try {
    const result = await chrome.storage.local.get('bridgeLastPort');
    const port = result.bridgeLastPort;
    if (port && BRIDGE.ports.includes(port)) {
      return port;
    }
  } catch { /* ignore */ }
  return null;
}

/** 保存上次成功的端口到 storage */
async function saveLastKnownPort(port) {
  try {
    await chrome.storage.local.set({ bridgeLastPort: port });
  } catch { /* ignore */ }
}

export async function discoverPort() {
  const found = await withBridgeMutex(async () => {
    return await _doDiscoverPort();
  });
  if (found) {
    setTimeout(() => retryPending(), 0);
  }
  return found;
}

export async function sendToVscode(payload) {
  return withBridgeMutex(async () => {
    if (!BRIDGE.activePort) {
      const discovered = await _doDiscoverPort();
      if (!discovered) {
        console.log('[Bridge] VSCode 未连接，跳过推送');
        return false;
      }
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (BRIDGE.authToken) {
        headers[BRIDGE_AUTH_HEADER] = BRIDGE.authToken;
      }

      const res = await fetch(`http://127.0.0.1:${BRIDGE.activePort}${BRIDGE_DATA_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: timeoutSignal(TIMEOUTS.push),
      });

      if (res.ok) {
        const result = await res.json();
        BRIDGE.lastError = null;
        BRIDGE.authFailures = 0;
        // 注意：重试队列中滞留的旧格式 cookie payload（hasBridgeData=false）会被
        // VSCode 端同样回 200，在此出队——这是有意的 drain 路径，无需特殊处理
        console.log(`[Bridge] 推送成功: ${result.received} 条`);
        return true;
      }

      if (res.status === 401) {
        BRIDGE.authToken = null;
        BRIDGE.activePort = null;
        BRIDGE.authFailures++;
        BRIDGE.lastError = `VSCode Bridge 认证失败（第 ${BRIDGE.authFailures} 次）`;
        console.log(`[Bridge] 认证失效（第 ${BRIDGE.authFailures} 次），正在重新发现...`);
        // 不再清空整个待重传队列：旧 token 连续 401 会由 retryPending 的单包 retries>=3 机制丢弃。
        // 这样 VSCode 重启后扩展持有的旧 token 失效时，不会丢失队列中尚未推送的有效数据，
        // 只会在重试耗尽后丢弃单个包。
        return false;
      }

      BRIDGE.lastError = `推送失败，HTTP ${res.status}`;
      console.error(`[Bridge] 推送失败，HTTP 状态码: ${res.status}`);
      return false;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        BRIDGE.lastError = '推送 VSCode Bridge 超时';
        console.error('[Bridge] 推送超时');
      } else {
        BRIDGE.lastError = `连接失败: ${err.message || String(err)}`;
        console.error('[Bridge] 连接失败:', err.message);
      }
      BRIDGE.activePort = null;
      return false;
    }
  });
}
