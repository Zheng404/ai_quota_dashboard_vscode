/**
 * AI Quota Cookie Bridge — Background Service Worker
 *
 * 监控目标站点的 Cookie 变化，自动推送给本地 VSCode 扩展。
 */

// ===== 配置 =====

/** 需要监控的 Cookie 目标 */
const TARGET_COOKIES = {
  kimi: {
    domain: '.kimi.com',
    names: ['kimi-auth'],
    url: 'https://www.kimi.com',
  },
  mimo: {
    domain: '.xiaomimimo.com',
    // MiMo 需要多个 Cookie 组合为完整 Cookie 字符串
    names: ['api-platform_serviceToken', 'userId'],
    url: 'https://platform.xiaomimimo.com',
  },
};

/** VSCode Bridge 服务器配置 */
const BRIDGE = {
  /** 尝试连接的端口列表 */
  ports: [37100, 37101, 37102],
  /** 当前活跃端口 */
  activePort: null,
  /** 认证 token（从 /health 获取） */
  authToken: null,
  /** 健康检查间隔（ms） */
  healthCheckInterval: 60_000,
};

/** 防抖 / 节流配置 */
const RELAY = {
  /** Cookie 变化后延迟推送（ms） */
  debounceMs: 1500,
  /** 两次推送的最小间隔（ms） */
  minIntervalMs: 10_000,
};

let relayTimeout = null;
let lastRelayTime = 0;

// ===== 重试队列 =====

/** 待重试的 payload 队列 */
const pendingPayloads = [];
let isRetrying = false;
const MAX_PENDING = 50;

function enqueuePayload(payload) {
  if (pendingPayloads.length >= MAX_PENDING) {
    pendingPayloads.shift(); // FIFO eviction
  }
  pendingPayloads.push({ payload, retries: 0 });
}

async function retryPending() {
  if (isRetrying) return;
  isRetrying = true;
  try {
    while (pendingPayloads.length > 0) {
      const item = pendingPayloads[0];
      if (item.retries >= 3) {
        console.error('[Bridge] 重试耗尽，丢弃 payload');
        pendingPayloads.shift();
        continue;
      }

      item.retries++;
      const success = await sendToVscode(item.payload);
      if (success) {
        pendingPayloads.shift();
      } else {
        // 等待 3 秒后再次尝试
        await new Promise(resolve => setTimeout(resolve, 3000));
        // 跳出循环，避免阻塞；下次调用继续处理
        break;
      }
    }
  } finally {
    isRetrying = false;
  }
}

// ===== 互斥锁 =====

let _mutexPromise = Promise.resolve();

/**
 * 获取 Bridge 互斥锁，确保 discoverPort / sendToVscode 串行执行
 */
async function withBridgeMutex(fn) {
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

// ===== VSCode Bridge 通信 =====

const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
};

/** 内部：实际端口发现逻辑（调用方需已持有互斥锁） */
async function _doDiscoverPort() {
  // 若已连接则直接返回
  if (BRIDGE.activePort) return true;

  for (const port of BRIDGE.ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: timeoutSignal(1000),
      });
      if (res.ok) {
        const data = await res.json();
        BRIDGE.activePort = port;
        BRIDGE.authToken = data.authToken || null;
        console.log(`[Bridge] 已连接: port ${port}`);
        return true;
      }
    } catch {
      // 端口不通，尝试下一个
    }
  }
  BRIDGE.activePort = null;
  return false;
}

/** 发现 VSCode Bridge 端口 */
async function discoverPort() {
  const found = await withBridgeMutex(async () => {
    return await _doDiscoverPort();
  });
  if (found) {
    // 延迟触发重试队列，避免与当前锁冲突
    setTimeout(() => retryPending(), 0);
  }
  return found;
}

/** 向 VSCode 发送 Cookie 数据 */
async function sendToVscode(payload) {
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
        headers['X-Auth-Token'] = BRIDGE.authToken;
      }

      const res = await fetch(`http://127.0.0.1:${BRIDGE.activePort}/cookies`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: timeoutSignal(5000),
      });

      if (res.ok) {
        const result = await res.json();
        console.log(`[Bridge] 推送成功: ${result.received} 条`);
        return true;
      }

      if (res.status === 401) {
        // token 失效，重新获取
        BRIDGE.authToken = null;
        BRIDGE.activePort = null;
        console.log('[Bridge] 认证失效，重新发现...');
        return false;
      }

      console.error(`[Bridge] 推送失败: HTTP ${res.status}`);
      return false;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        console.error('[Bridge] 推送超时');
      } else {
        console.error('[Bridge] 连接失败:', err.message);
      }
      BRIDGE.activePort = null;
      return false;
    }
  });
}

// ===== Cookie 采集 =====

/** 采集所有目标站点的 Cookie */
async function gatherAllCookies() {
  const cookies = [];

  for (const [serviceKey, config] of Object.entries(TARGET_COOKIES)) {
    for (const name of config.names) {
      try {
        const cookie = await chrome.cookies.get({ url: config.url, name });
        if (cookie && cookie.value) {
          cookies.push({
            service: serviceKey,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
          });
        }
      } catch (err) {
        console.error(`[Cookie] 读取 ${config.url} ${name} 失败:`, err.message);
      }
    }
  }

  return cookies;
}

// ===== 推送逻辑 =====

/** 采集并推送所有 Cookie */
async function relayCookies(force = false) {
  const now = Date.now();
  if (!force && now - lastRelayTime < RELAY.minIntervalMs) {
    return;
  }

  const cookies = await gatherAllCookies();
  if (cookies.length === 0) {
    console.log('[Relay] 无可用 Cookie');
    return;
  }

  // 从已采集的 cookies 中推导 MiMo Cookie 字符串，避免重复读取
  const mimoCookies = cookies.filter(c => c.service === 'mimo');
  const mimoCookieStr = mimoCookies.length > 0
    ? mimoCookies.map(c => `${c.name}=${c.value}`).join('; ')
    : null;

  const payload = {
    source: 'ai-quota-cookie-bridge',
    timestamp: now,
    cookies,
    // Kimi: 直接用 kimi-auth 值作为 Bearer Token
    kimiAuthToken: cookies.find(c => c.service === 'kimi' && c.name === 'kimi-auth')?.value || null,
    // MiMo: 组合 Cookie 字符串
    mimoCookie: mimoCookieStr,
  };

  const success = await sendToVscode(payload);
  if (success) {
    lastRelayTime = now;
  } else {
    enqueuePayload(payload);
  }
}

/** 防抖推送 */
function debouncedRelay() {
  clearTimeout(relayTimeout);
  relayTimeout = setTimeout(() => relayCookies(), RELAY.debounceMs);
}

// ===== 事件监听 =====

// Cookie 变化监听
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;

  // 只关注目标域名
  const isTarget = Object.values(TARGET_COOKIES).some(config => {
    return cookie.domain === config.domain || cookie.domain.endsWith(config.domain);
  });
  if (!isTarget) return;

  // 只关注目标 Cookie 名称
  const isTargetName = Object.values(TARGET_COOKIES).some(config => {
    return config.names.includes(cookie.name);
  });
  if (!isTargetName) return;

  if (removed) {
    console.log(`[Cookie] ${cookie.name} 被移除`);
  } else {
    console.log(`[Cookie] ${cookie.name} 已更新`);
  }

  debouncedRelay();
});

// 扩展安装 / 启动时立即采集一次
chrome.runtime.onInstalled.addListener(() => relayCookies(true));
chrome.runtime.onStartup.addListener(() => relayCookies(true));

// 定期健康检查 + 自动推送（保持 Service Worker 活跃）
chrome.alarms.create('healthCheck', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'healthCheck') {
    if (!BRIDGE.activePort) {
      discoverPort().then((found) => {
        if (found) {
          retryPending();
        }
      });
    }
  }
});

// 来自 popup / dashboard 的手动触发
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'relayNow') {
    relayCookies(true)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (msg.action === 'getStatus') {
    sendResponse({
      connected: BRIDGE.activePort !== null,
      port: BRIDGE.activePort,
    });
    return false;
  }
});

// 打开 Dashboard 页面
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});

// Action 点击打开 Dashboard
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});
