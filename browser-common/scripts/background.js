/**
 * AI Quota Cookie Bridge — Background Service Worker
 *
 * 浏览器扩展按已配置服务采集并推送凭证（Kimi/MiMo Cookie + GLM API Key）到 VSCode，
 * VSCode 端收到后自动分发到对应的 AI 服务（GLM/Kimi/MiMo），无需手动配置。
 * 凭证失效检测 + 后台自动刷新。
 */

// ===== Cookie / 凭证目标配置（全量定义，按需启用）=====

const COOKIE_TARGETS = {
  glm: {
    /** GLM 使用 API Key（存储在 chrome.storage.local），不是 Cookie */
    storageKey: 'glmApiKey',
    probeUrl: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  },
  kimi: {
    domain: '.kimi.com',
    names: ['kimi-auth'],
    url: 'https://www.kimi.com',
    /** 用于检测/刷新凭证的轻量 API */
    probeUrl: 'https://www.kimi.com/api-user/user/info',
    /** 访问 API 端点触发 cookie 刷新（比首页更可靠） */
    refreshUrl: 'https://www.kimi.com/api-user/user/info',
  },
  mimo: {
    domain: '.xiaomimimo.com',
    names: ['api-platform_serviceToken', 'userId'],
    url: 'https://platform.xiaomimimo.com',
    probeUrl: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/detail',
    /** 访问网站触发 session cookie 生成 */
    refreshUrl: 'https://platform.xiaomimimo.com',
  },
};

// ===== Cookie 类凭证本地缓存与后台刷新（MiMo / Kimi 通用）=====

const CREDENTIAL_CACHE_KEYS = {
  mimo: 'mimoCredentialCache',
  kimi: 'kimiCredentialCache',
};

/** 为指定 kind 生成后台刷新使用的缓存键名 */
function getCredentialCacheKey(kind) {
  return CREDENTIAL_CACHE_KEYS[kind];
}

/** 加载本地缓存的凭证 */
async function loadCredentialCache(kind) {
  const key = getCredentialCacheKey(kind);
  if (!key) return null;
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  } catch (err) {
    console.error(`[CredentialCache] ${kind} 加载缓存失败:`, err.message);
    return null;
  }
}

/** 保存凭证到本地缓存 */
async function saveCredentialCache(kind, cookieString) {
  const key = getCredentialCacheKey(kind);
  if (!key) return;
  try {
    const cache = {
      cookie: cookieString,
      capturedAt: Date.now(),
    };
    await chrome.storage.local.set({ [key]: cache });
    console.log(`[CredentialCache] ${kind} 已更新缓存`);
  } catch (err) {
    console.error(`[CredentialCache] ${kind} 保存缓存失败:`, err.message);
  }
}

/** 清除本地缓存的凭证 */
async function clearCredentialCache(kind) {
  const key = getCredentialCacheKey(kind);
  if (!key) return;
  try {
    await chrome.storage.local.remove(key);
    console.log(`[CredentialCache] ${kind} 已清除缓存`);
  } catch (err) {
    console.error(`[CredentialCache] ${kind} 清除缓存失败:`, err.message);
  }
}

/** 用缓存的凭证探测是否仍有效 */
async function probeCachedCredential(kind, cookieString) {
  const config = COOKIE_TARGETS[kind];
  if (!config || !config.probeUrl) return 'unknown';

  try {
    const headers = {
      'Accept': 'application/json',
    };
    // Kimi 使用 Bearer Token（kimi-auth 值），MiMo 使用 Cookie 头
    if (kind === 'kimi') {
      headers['Authorization'] = `Bearer ${cookieString}`;
    } else {
      headers['Cookie'] = cookieString;
    }

    const res = await fetch(config.probeUrl, {
      method: 'GET',
      headers,
      signal: timeoutSignal(8000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return 'invalid';
      }
      return 'unknown';
    }

    const data = await res.json().catch(() => null);
    if (data && typeof data.code === 'number' && data.code !== 0) {
      return 'invalid';
    }

    return 'valid';
  } catch (err) {
    console.warn(`[CredentialCache] ${kind} 探测缓存凭证失败:`, err.message);
    return 'unknown';
  }
}

/** 通过后台非激活标签页访问指定站点，触发 session cookie 生成 */
async function loadCredentialViaBackgroundTab(kind) {
  const config = COOKIE_TARGETS[kind];
  if (!config || !config.refreshUrl) {
    console.warn(`[CredentialRefresh] ${kind} 未配置刷新 URL`);
    return null;
  }
  console.log(`[CredentialRefresh] ${kind} 创建后台非激活标签页访问 ${config.refreshUrl}...`);

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({
      url: config.refreshUrl,
      active: false,
      pinned: true,
    });
    tabId = tab.id;

    // 等待页面加载完成或超时
    await new Promise((resolve) => {
      let resolved = false;
      const onUpdated = (id, changeInfo) => {
        if (id === tabId && changeInfo.status === 'complete') {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
          }
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }, 15000);
    });

    // 额外等待 JS 设置 cookie
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 重新读取 cookie
    const cookies = [];
    for (const name of config.names) {
      const cookie = await findCookieByName(config.url, config.domain, name);
      if (cookie?.value) {
        cookies.push(`${cookie.name}=${cookie.value}`);
      }
    }

    // Kimi 只需要 kimi-auth 作为 Bearer Token
    if (kind === 'kimi') {
      const authCookie = cookies.find(c => c.startsWith('kimi-auth='));
      if (authCookie) {
        const token = authCookie.split('=').slice(1).join('=');
        await saveCredentialCache(kind, token);
        console.log(`[CredentialRefresh] ${kind} 后台访问成功，已缓存 token`);
        return token;
      }
    } else if (cookies.length > 0) {
      const cookieString = cookies.join('; ');
      await saveCredentialCache(kind, cookieString);
      console.log(`[CredentialRefresh] ${kind} 后台访问成功，已缓存 cookie`);
      return cookieString;
    }

    console.warn(`[CredentialRefresh] ${kind} 后台访问后仍未找到目标 cookie`);
    return null;
  } catch (err) {
    console.error(`[CredentialRefresh] ${kind} 后台访问失败:`, err.message);
    return null;
  } finally {
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch { /* ignore */ }
    }
  }
}

/** 读取扩展设置中指定 kind 的自动刷新开关 */
async function isAutoRefreshEnabled(kind) {
  try {
    const result = await chrome.storage.local.get('dashboardConfig');
    return result.dashboardConfig?.settings?.[`${kind}AutoRefresh`] === true;
  } catch {
    return false;
  }
}

// ===== 兼容旧 MiMo 专用函数名（保持现有日志和调用点行为） =====

async function loadMimoCache() { return loadCredentialCache('mimo'); }
async function saveMimoCache(cookieString) { return saveCredentialCache('mimo', cookieString); }
async function clearMimoCache() { return clearCredentialCache('mimo'); }
async function probeMimoCookie(cookieString) { return probeCachedCredential('mimo', cookieString); }
async function loadMimoViaBackgroundTab() { return loadCredentialViaBackgroundTab('mimo'); }
async function isMimoAutoRefreshEnabled() { return isAutoRefreshEnabled('mimo'); }

// ===== 当前活跃的监控目标（从 dashboardConfig.services 推导）=====

let activeKinds = new Set();

/** 从 services 配置推导需要监控的 kind 列表 */
function deriveActiveKinds(services) {
  const kinds = new Set();
  if (!Array.isArray(services)) return kinds;
  for (const svc of services) {
    if (svc.enabled !== false && COOKIE_TARGETS[svc.kind]) {
      kinds.add(svc.kind);
    }
  }
  return kinds;
}

// ===== VSCode Bridge 服务器配置 =====

const BRIDGE = {
  ports: [37100, 37101, 37102, 37103, 37104, 37105, 37106, 37107, 37108, 37109, 37110],
  activePort: null,
  authToken: null,
  healthCheckInterval: 30_000,
  /** 未连接时的快速检查间隔（毫秒） */
  fastCheckInterval: 10_000,
  /** 连续认证失败次数（用于防止 401 循环） */
  authFailures: 0,
  /** 最后一次连接/推送失败的错误信息（用于 popup 诊断） */
  lastError: null,
};

const RELAY = {
  debounceMs: 1500,
  minIntervalMs: 10_000,
};

let refreshIntervalMs = 600_000;
const MIN_REFRESH_INTERVAL_MS = 30_000;
const MAX_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function clampRefreshIntervalSeconds(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds <= 0) return 600;
  return Math.max(MIN_REFRESH_INTERVAL_MS / 1000, Math.min(MAX_REFRESH_INTERVAL_MS / 1000, seconds));
}

async function loadRefreshInterval() {
  try {
    const stored = await chrome.storage.local.get('dashboardConfig');
    const seconds = stored.dashboardConfig?.settings?.refreshInterval;
    const clampedSeconds = clampRefreshIntervalSeconds(seconds);
    refreshIntervalMs = clampedSeconds * 1000;
    console.log(`[Config] 加载刷新间隔: ${refreshIntervalMs}ms (${clampedSeconds}s)`);
  } catch (err) {
    console.error('[Config] 加载刷新间隔失败:', err);
    refreshIntervalMs = 600_000;
  }
}

let relayTimeout = null;
let lastRelayTime = 0;
let isRelaying = false;
let relayDirty = false;

// ===== 重试队列 =====

const pendingPayloads = [];
let isRetrying = false;
const MAX_PENDING = 50;
const PENDING_STORAGE_KEY = 'bridgePendingPayloads';

/** 从 chrome.storage.local 恢复待重传队列（Service Worker 重启后数据不丢失） */
async function loadPending() {
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

async function enqueuePayload(payload) {
	if (pendingPayloads.length >= MAX_PENDING) {
		pendingPayloads.shift();
	}
	pendingPayloads.push({ payload, retries: 0 });
	await persistPending();
}

async function retryPending() {
	if (isRetrying) return;
	isRetrying = true;
	try {
		while (pendingPayloads.length > 0) {
			const item = pendingPayloads[0];
			if (item.retries >= 3) {
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
				await new Promise(resolve => setTimeout(resolve, 3000));
				break;
			}
		}
	} finally {
		isRetrying = false;
	}
}

// ===== 互斥锁 =====

// 简易互斥锁：确保 Bridge 推送操作串行执行，避免并发导致数据竞争。
// 实现原理：维护一个 Promise 链，每个调用者等待前一个完成后再执行。
// _mutexPromise 始终指向链尾的 Promise，新调用者 await prev 后才执行 fn()。
// finally 中的 release() 推进链尾，即使 fn() 抛出异常也能正确解锁。
let _mutexPromise = Promise.resolve();

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

// 锁层级说明：
// - relayCookies() 在 withBridgeMutex 外部管理 isRelaying 标记（非互斥，仅防重入）
// - relayCookies() 内部调用 sendToVscode()，sendToVscode() 使用 withBridgeMutex
// - 不会产生嵌套锁：relayCookies 不持锁，仅 sendToVscode 持锁
// - discoverPort() 也使用 withBridgeMutex，保证端口发现与推送串行

const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
};

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
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: timeoutSignal(2000), // 增加超时到 2 秒
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

async function discoverPort() {
  const found = await withBridgeMutex(async () => {
    return await _doDiscoverPort();
  });
  if (found) {
    setTimeout(() => retryPending(), 0);
  }
  return found;
}

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
        BRIDGE.lastError = null;
        BRIDGE.authFailures = 0;
        console.log(`[Bridge] 推送成功: ${result.received} 条`);
        return true;
      }

      if (res.status === 401) {
        BRIDGE.authToken = null;
        BRIDGE.activePort = null;
        BRIDGE.authFailures++;
        BRIDGE.lastError = `VSCode Bridge 认证失败（第 ${BRIDGE.authFailures} 次）`;
        console.log(`[Bridge] 认证失效（第 ${BRIDGE.authFailures} 次），正在重新发现...`);
        // 连续认证失败超过 5 次：清空待重传队列，避免无限循环
        if (BRIDGE.authFailures >= 5) {
          console.warn('[Bridge] 连续认证失败超过 5 次，清空待重传队列');
          pendingPayloads.length = 0;
          await persistPending();
          BRIDGE.authFailures = 0;
        }
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

// ===== 权限与 Cookie 采集 =====

/**
 * 检查并请求指定 origin 的 Cookie 权限
 */
async function ensureCookiePermission(origin) {
  if (!chrome.permissions) return true;
  try {
    const has = await chrome.permissions.contains({
      permissions: ['cookies'],
      origins: [origin],
    });
    if (has) return true;
    console.warn(`[Permissions] 缺少 ${origin} 的 Cookie 权限，尝试请求...`);
    const granted = await chrome.permissions.request({
      permissions: ['cookies'],
      origins: [origin],
    });
    console.log(`[Permissions] ${origin} 权限请求结果:`, granted);
    return granted;
  } catch (err) {
    console.error(`[Permissions] 检查/请求 ${origin} 权限失败:`, err.message);
    return false;
  }
}

// ===== Cookie 采集（按活跃服务）=====

const COOKIE_REQUIRED_NAMES = {
  mimo: ['api-platform_serviceToken'],
};

/** 读取单个 Cookie，支持多策略兜底 */
async function findCookieByName(url, domain, name) {
  // 策略 1：精确 url 读取
  try {
    const exact = await chrome.cookies.get({ url, name });
    if (exact && exact.value) {
      return exact;
    }
  } catch (err) {
    console.error(`[Cookie] 精确读取 ${url} 的 ${name} 失败:`, err.message);
  }

  // 策略 2：按 url 搜索所有 cookie（覆盖子域、path 不同等场景）
  try {
    const byUrl = await chrome.cookies.getAll({ url });
    const match = byUrl.find(c => c.name === name && c.value);
    if (match) {
      return match;
    }
  } catch (err) {
    console.error(`[Cookie] 按 url 搜索 ${url} 的 ${name} 失败:`, err.message);
  }

  // 策略 3：按 domain 搜索（带点与不带点都尝试）
  if (domain) {
    const domainsToTry = new Set();
    const normalized = domain.startsWith('.') ? domain.slice(1) : domain;
    domainsToTry.add(normalized);
    domainsToTry.add(`.${normalized}`);

    for (const d of domainsToTry) {
      try {
        const all = await chrome.cookies.getAll({ domain: d });
        const match = all.find(c => c.name === name && c.value);
        if (match) {
          return match;
        }
      } catch (err) {
        console.error(`[Cookie] 按 domain ${d} 读取 ${name} 失败:`, err.message);
      }
    }
  }

  // 策略 4：全局枚举并过滤（最后兜底，性能开销可接受）
  try {
    const all = await chrome.cookies.getAll({});
    const match = all.find(c => {
      if (c.name !== name || !c.value) return false;
      if (!domain) return true;
      const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain;
      return c.domain === domain || c.domain === normalizedDomain ||
        c.domain.endsWith(domain) || c.domain.endsWith(`.${normalizedDomain}`);
    });
    if (match) {
      console.log(`[Cookie] 通过全局搜索找到 ${name} (domain=${match.domain}, path=${match.path})`);
      return match;
    }
  } catch (err) {
    console.error(`[Cookie] 全局搜索 ${name} 失败:`, err.message);
  }

  return null;
}

/** 采集当前活跃服务中 Cookie 类凭证 */
async function gatherAllCookies() {
  const cookies = [];
  const kindCounts = {};

  for (const kind of activeKinds) {
    const config = COOKIE_TARGETS[kind];
    if (!config || config.storageKey) continue; // 跳过 storage 类 / 非目标

    // 采集前确保拥有该域 Cookie 权限
    const permissionGranted = await ensureCookiePermission(`${config.url}/*`);
    if (!permissionGranted) {
      console.warn(`[Cookie] ${kind}: 未获得 ${config.url} 的 Cookie 权限`);
    }

    // MiMo 只需要 api-platform_serviceToken，userId 为可选，避免误报未找到
    const requiredNames = COOKIE_REQUIRED_NAMES[kind] || config.names;
    const optionalNames = COOKIE_REQUIRED_NAMES[kind]
      ? config.names.filter(n => !requiredNames.includes(n))
      : [];

    for (const name of config.names) {
      const cookie = await findCookieByName(config.url, config.domain, name);
      if (cookie && cookie.value) {
        cookies.push({
          service: kind,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
        });
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;
      } else if (requiredNames.includes(name)) {
        console.log(`[Cookie] ${kind}: 未找到必需 Cookie ${name} (url=${config.url}, domain=${config.domain})`);
      }
    }

    // 若从浏览器成功读取到 Cookie 类凭证，更新本地缓存
    if (kindCounts[kind] && (kind === 'mimo' || kind === 'kimi')) {
      if (kind === 'kimi') {
        const authCookie = cookies.find(c => c.service === 'kimi' && c.name === 'kimi-auth');
        if (authCookie) {
          await saveCredentialCache('kimi', authCookie.value);
        }
      } else {
        const cookieStr = cookies
          .filter(c => c.service === 'mimo')
          .map(c => `${c.name}=${c.value}`)
          .join('; ');
        await saveCredentialCache('mimo', cookieStr);
      }
    }

    // Kimi / MiMo 的登录凭证是 session cookie，浏览器关闭后可能消失。
    // 处理策略：
    // 1. 优先使用浏览器当前 cookie
    // 2. 无当前 cookie 时，尝试本地缓存；缓存有效则使用缓存
    // 3. 缓存无效/不存在且用户开启自动刷新时，后台非激活标签页访问重新获取
    if (!kindCounts[kind] && (kind === 'mimo' || kind === 'kimi')) {
      const autoRefresh = await isAutoRefreshEnabled(kind);
      console.log(`[Cookie] ${kind}: 当前浏览器无 session cookie，autoRefresh=${autoRefresh}`);

      const cache = await loadCredentialCache(kind);
      if (cache?.cookie) {
        const status = await probeCachedCredential(kind, cache.cookie);
        console.log(`[CredentialCache] ${kind} 缓存探测结果: ${status}`);
        if (status === 'valid') {
          console.log(`[CredentialCache] ${kind} 使用本地缓存凭证`);
          cookies.push({
            service: kind,
            name: `__${kind}_cached_cookie__`,
            value: cache.cookie,
            domain: config.domain || '',
            path: '/',
            fromCache: true,
          });
          kindCounts[kind] = 1;
        } else {
          // 缓存已失效，清除
          await clearCredentialCache(kind);
        }
      }

      if (!kindCounts[kind] && autoRefresh) {
        console.log(`[Cookie] ${kind}: 尝试后台非激活标签页重新获取...`);
        const refreshed = await loadCredentialViaBackgroundTab(kind);
        if (refreshed) {
          cookies.push({
            service: kind,
            name: `__${kind}_cached_cookie__`,
            value: refreshed,
            domain: config.domain || '',
            path: '/',
            fromCache: true,
          });
          kindCounts[kind] = 1;
        }
      }

      if (!kindCounts[kind]) {
        console.log(`[Cookie] ${kind}: 无法获取有效凭证，等待用户手动访问 ${config.url} 后自动推送`);
      }
    }

    if (!kindCounts[kind]) {
      const optionalSummary = optionalNames.length > 0 ? `，可选: [${optionalNames.join(', ')}]` : '';
      console.log(`[Cookie] ${kind}: 未找到必需 Cookie (url=${config.url}, domain=${config.domain}, 必需=[${requiredNames.join(', ')}]${optionalSummary})`);
    }
  }

  const summary = Object.entries(kindCounts).map(([k, v]) => `${k}=${v}`).join(', ') || '全部为空';
  console.log(`[Cookie] 采集结果: ${summary}`);
  return cookies;
}

/** 采集当前活跃服务中 storage 类凭证（目前只有 GLM API Key） */
async function gatherAllStorageCredentials() {
  const storageCredentials = {};

  for (const kind of activeKinds) {
    const target = COOKIE_TARGETS[kind];
    if (!target?.storageKey) continue;

    try {
      const result = await chrome.storage.local.get(target.storageKey);
      const value = result[target.storageKey];
      if (value) {
        storageCredentials[target.storageKey] = value;
      }
    } catch (err) {
      console.error(`[Relay] 读取 ${target.storageKey} 失败:`, err.message);
    }
  }

  return storageCredentials;
}

// ===== 推送逻辑（按活跃服务推送凭证）=====

async function relayCookies(force = false) {
  if (isRelaying) {
    relayDirty = true;
    console.log('[Relay] 已有推送在进行中，标记 dirty');
    return;
  }

  const now = Date.now();
  if (!force && now - lastRelayTime < RELAY.minIntervalMs) {
    relayDirty = true;
    console.log('[Relay] 距离上次推送不足 minInterval，延迟调度');
    clearTimeout(relayTimeout);
    const remaining = RELAY.minIntervalMs - (now - lastRelayTime) + 100;
    relayTimeout = setTimeout(() => relayCookies(true), remaining);
    return;
  }

  isRelaying = true;
  relayDirty = false;

  // 采集当前活跃服务的 Cookie 类凭证（kimi, mimo）
  const cookies = await gatherAllCookies();

  // 采集当前活跃服务的 storage 类凭证（glm）
  const storageCredentials = await gatherAllStorageCredentials();

  if (cookies.length === 0 && Object.keys(storageCredentials).length === 0) {
    console.log('[Relay] 无可用的认证凭证');
    isRelaying = false;
    if (relayDirty) {
      relayDirty = false;
      setTimeout(() => relayCookies(true), 0);
    }
    return;
  }

  const mimoCookies = cookies.filter(c => c.service === 'mimo');
  const mimoCookieStr = mimoCookies.length > 0
    ? mimoCookies.map(c => c.name === '__mimo_cached_cookie__' ? c.value : `${c.name}=${c.value}`).join('; ')
    : null;

  const kimiCookies = cookies.filter(c => c.service === 'kimi');
  const kimiAuthToken = kimiCookies.length > 0
    ? (kimiCookies.find(c => c.name === '__kimi_cached_cookie__')?.value
      || kimiCookies.find(c => c.name === 'kimi-auth')?.value
      || null)
    : null;

  const payload = {
    source: 'ai-quota-cookie-bridge',
    timestamp: now,
    cookies,
    kimiAuthToken,
    mimoCookie: mimoCookieStr,
    glmApiKey: storageCredentials['glmApiKey'] || null,
    activeKinds: [...activeKinds],
  };

  const statusParts = [];
  for (const kind of activeKinds) {
    if (kind === 'kimi') statusParts.push(`kimi=${payload.kimiAuthToken ? '✓' : '✗'}`);
    else if (kind === 'mimo') statusParts.push(`mimo=${payload.mimoCookie ? payload.mimoCookie.length + ' chars' : '✗'}`);
    else if (kind === 'glm') statusParts.push(`glm=${payload.glmApiKey ? '✓' : '✗'}`);
  }
  console.log(`[Relay] 凭证状态: ${statusParts.join(', ') || '无活跃服务'}`);

  try {
    const success = await sendToVscode(payload);
    if (success) {
      lastRelayTime = now;
    } else {
      await enqueuePayload(payload);
    }
  } finally {
    isRelaying = false;
    if (relayDirty) {
      relayDirty = false;
      setTimeout(() => relayCookies(true), 0);
    }
  }
}

function debouncedRelay() {
  clearTimeout(relayTimeout);
  relayTimeout = setTimeout(() => relayCookies(true), RELAY.debounceMs);
}

// ===== 配置加载与监听 =====

async function loadActiveKinds() {
  try {
    const stored = await chrome.storage.local.get('dashboardConfig');
    const services = stored.dashboardConfig?.services ?? [];
    activeKinds = deriveActiveKinds(services);
    console.log('[Config] 活跃服务列表:', [...activeKinds]);
  } catch (err) {
    console.error('[Config] 加载配置失败:', err);
    activeKinds = new Set();
  }
}

// 监听 storage 变化，动态更新监控目标 + API Key 变化时触发推送
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // 配置变更（添加/删除服务）
  if (changes.dashboardConfig) {
    const newConfig = changes.dashboardConfig.newValue;
    const services = newConfig?.services ?? [];
    activeKinds = deriveActiveKinds(services);
    console.log('[Config] 监控目标已更新:', [...activeKinds]);
    // 配置变更后按新的活跃服务列表推送对应凭证
    relayCookies(true);

    // 刷新间隔变更时重新调度 alarms
    const newSeconds = newConfig?.settings?.refreshInterval;
    if (typeof newSeconds === 'number' && !Number.isNaN(newSeconds)) {
      const clampedSeconds = clampRefreshIntervalSeconds(newSeconds);
      const newIntervalMs = clampedSeconds * 1000;
      if (newIntervalMs !== refreshIntervalMs) {
        refreshIntervalMs = newIntervalMs;
        console.log(`[Config] 刷新间隔已更新: ${refreshIntervalMs}ms (${clampedSeconds}s)`);
        scheduleHealthCheck();
        ensureCredentialAlarm();
      }
    }
  }

  // GLM API Key 变化
  if (changes.glmApiKey) {
    console.log('[Config] GLM API Key 已更新');
    debouncedRelay();
  }
});

// ===== 凭证失效检测 + 自动刷新 =====

/** 检测单个 kind 的凭证是否有效 */
async function checkCredentialValidity(kind) {
  const config = COOKIE_TARGETS[kind];
  if (!config) return 'no-target';

  // GLM：API Key 存储在 chrome.storage.local
  if (config.storageKey) {
    try {
      const result = await chrome.storage.local.get(config.storageKey);
      const apiKey = result[config.storageKey];
      if (!apiKey) {
        console.log(`[Credential] ${kind} API Key 未配置`);
        return 'missing';
      }
      // 用轻量 API 探测有效性
      const res = await fetch(config.probeUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        signal: timeoutSignal(5000),
      });
      if (res.status === 401) return 'invalid';
      return 'valid';
    } catch (err) {
      console.warn(`[Credential] ${kind} 探测失败:`, err.message);
      return 'unknown';
    }
  }

  // Cookie 类凭证（kimi, mimo）
  // 1. 检查 Cookie 是否存在
  for (const name of config.names) {
    try {
      const cookie = await chrome.cookies.get({ url: config.url, name });
      if (!cookie || !cookie.value) {
        console.log(`[Credential] ${kind} Cookie ${name} 未找到`);
        return 'missing';
      }
      // 检查是否过期（session cookie 的 expirationDate 为 undefined）
      // 注意：session 可能是 false 或 undefined，都表示非 session cookie
      if (!cookie.session && cookie.expirationDate && cookie.expirationDate * 1000 < Date.now()) {
        console.log(`[Credential] ${kind} Cookie ${name} 已过期`);
        return 'expired';
      }
    } catch (err) {
      console.error(`[Credential] ${kind} 检查失败:`, err.message);
      return 'error';
    }
  }

  // 2. 用轻量 API 探测凭证有效性
  try {
    if (kind === 'kimi') {
      const cookie = await chrome.cookies.get({ url: config.url, name: 'kimi-auth' });
      const token = cookie?.value;
      if (!token) return 'missing';

      const res = await fetch(config.probeUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: timeoutSignal(5000),
      });
      // kimi 探测接口：200-299 = 有效，401/403 = 无效，其他错误返回 unknown
      if (res.status === 401 || res.status === 403) {
        console.log(`[Credential] ${kind} API 返回 ${res.status}，凭证无效`);
        return 'invalid';
      }
      if (!res.ok) {
        console.warn(`[Credential] ${kind} API 返回 ${res.status}，网络错误`);
        return 'unknown';
      }
      return 'valid';
    }

    if (kind === 'mimo') {
      // MiMo 使用 Cookie 认证。Service Worker 中的 fetch 在已授权 host_permissions 下
      // 可通过 credentials: 'include' 携带跨域 Cookie，因此增加 API 探测以识别服务端
      // session 已过期但客户端 Cookie 仍存在的情况。
      try {
        const res = await fetch(config.probeUrl, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
          signal: timeoutSignal(5000),
        });

        // 部分站点对未登录返回 200 但 JSON code 非 0，也视为需要刷新/重新登录
        if (res.status === 401 || res.status === 403) {
          console.log(`[Credential] ${kind} API 返回 ${res.status}，凭证无效`);
          return 'invalid';
        }

        if (!res.ok) {
          console.warn(`[Credential] ${kind} API 返回 ${res.status}，网络错误`);
          return 'unknown';
        }

        // 解析 body 检查业务级未登录错误
        try {
          const data = await res.json();
          if (data && typeof data.code === 'number' && data.code !== 0) {
            console.log(`[Credential] ${kind} API 业务码 ${data.code}，可能未登录: ${data.message || ''}`);
            return 'invalid';
          }
        } catch {
          // 非 JSON 响应，忽略业务码检查
        }

        console.log(`[Credential] ${kind} API 探测通过`);
        return 'valid';
      } catch (err) {
        console.warn(`[Credential] ${kind} 探测失败:`, err.message);
        return 'unknown';
      }
    }
  } catch (err) {
    // 网络错误不算凭证失效
    console.warn(`[Credential] ${kind} 探测失败:`, err.message);
    return 'unknown';
  }

  return 'valid';
}

// ===== 不可见页面加载（Cookie 刷新载体）=====

/**
 * 通过 Offscreen API 发起网络请求刷新 Cookie（Chrome 116+）。
 * 完全不可见，无窗口、无标签页、无任务栏图标。
 *
 * 策略：offscreen 内先 fetch（快速），如果 Cookie 没变则回退 iframe（可靠）。
 *
 * @param {string} url - 要访问的刷新 URL
 * @param {string} cookieUrl - Cookie 所属 URL（用于判断刷新结果）
 * @param {string[]} cookieNames - 需要检查的 Cookie 名称列表
 * @returns {Promise<boolean>} true=Cookie 刷新成功，false=失败
 */
async function loadViaOffscreen(url, cookieUrl, cookieNames) {
  // 确保只有一个 offscreen 文档
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['IFRAME_SCRIPTING'],
      justification: 'Refresh website cookies via fetch/iframe for credential renewal',
    });
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'offscreenRefresh',
      url,
      cookieUrl,
      cookieNames,
    });
    return response?.loaded ?? false;
  } finally {
    try { await chrome.offscreen.closeDocument(); } catch { /* ignore */ }
  }
}

/**
 * 通过最小化 popup 窗口加载 URL（Firefox / Offscreen 不可用时的回退方案）。
 * popup 窗口无标签栏、无地址栏，最小化后几乎不可见。
 */
async function loadViaMinimizedWindow(url) {
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    focused: false,
    state: 'minimized',
  });

  const tabId = win.tabs?.[0]?.id;

  // 等待页面加载完成
  await new Promise((resolve) => {
    if (!tabId) { resolve(); return; }
    let resolved = false;
    const onUpdated = (tid, changeInfo) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }, 15_000);
  });

  // 等待 JS 执行 + Cookie 刷新
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    if (win.id) await chrome.windows.remove(win.id);
  } catch { /* ignore */ }
}

/**
 * 以不可见方式发起网络请求刷新 Cookie。
 * Chrome: Offscreen（fetch 优先 → iframe 回退，完全不可见）
 * Firefox: 最小化 popup 窗口（近不可见）
 *
 * @param {string} url - 刷新 URL
 * @param {string} cookieUrl - Cookie 所属 URL
 * @param {string[]} cookieNames - 需要检查的 Cookie 名称
 * @returns {Promise<boolean>} true=使用了 offscreen，false=使用了窗口回退
 */
async function loadInvisiblePage(url, cookieUrl, cookieNames) {
  if (typeof chrome !== 'undefined' && chrome.offscreen) {
    try {
      return await loadViaOffscreen(url, cookieUrl, cookieNames);
    } catch (err) {
      console.warn('[Refresh] Offscreen 失败，回退到窗口方式:', err.message);
    }
  }
  await loadViaMinimizedWindow(url);
  return false;
}

// ===== 凭证刷新 =====

/** 后台自动刷新凭证（仅 Cookie 类服务）
 *
 * 核心逻辑：
 * 1. 记录刷新前的 cookie 状态（expirationDate 等）
 * 2. 以不可见方式发起网络请求刷新 Cookie（Chrome: Offscreen fetch，Firefox: 最小化 popup 窗口）
 * 3. 比较 cookie 是否变化，判断刷新是否成功
 *
 * 注意：此方法依赖于网站在访问时自动刷新 Cookie。
 * - Kimi: 访问 API 端点可能触发 JWT token 刷新
 * - MiMo: 访问网站首页触发 session cookie 刷新
 */
async function refreshCredential(kind) {
  const config = COOKIE_TARGETS[kind];
  if (!config || !config.refreshUrl) {
    console.log(`[Refresh] ${kind} 不支持自动刷新凭证`);
    return false;
  }

  console.log(`[Refresh] 正在刷新 ${kind} 凭证...`);

  try {
    // 1. 记录刷新前的 cookie 状态
    const beforeCookies = new Map();
    for (const name of config.names) {
      try {
        const cookie = await chrome.cookies.get({ url: config.url, name });
        if (cookie) {
          beforeCookies.set(name, {
            value: cookie.value,
            expirationDate: cookie.expirationDate,
          });
          console.log(`[Refresh] ${kind} 刷新前 ${name}: expirationDate=${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : 'session'}`);
        } else {
          console.log(`[Refresh] ${kind} 刷新前 ${name}: 不存在`);
        }
      } catch (err) {
        console.warn(`[Refresh] ${kind} 读取刷新前 cookie 失败:`, err.message);
      }
    }

    // 2. 以不可见方式发起网络请求刷新 Cookie
    console.log(`[Refresh] ${kind} 后台请求: ${config.refreshUrl}`);
    const usedOffscreen = await loadInvisiblePage(
      config.refreshUrl,
      config.url,
      config.names,
    );

    // 3. 等待 cookie 更新写入
    // fetch 方式响应更快，无需等页面渲染；窗口方式已内置等待，此处额外等待让 JS 设置 cookie
    if (usedOffscreen) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 4. 检查刷新后的 cookie 状态
    let refreshed = false;
    for (const name of config.names) {
      try {
        const afterCookie = await findCookieByName(config.url, config.domain, name);
        const before = beforeCookies.get(name);

        if (!afterCookie) {
          console.log(`[Refresh] ${kind} 刷新后 ${name}: 仍不存在`);
          continue;
        }

        console.log(`[Refresh] ${kind} 刷新后 ${name}: domain=${afterCookie.domain}, expirationDate=${afterCookie.expirationDate ? new Date(afterCookie.expirationDate * 1000).toISOString() : 'session'}`);

        // 判断 cookie 是否已更新：
        // - 之前不存在，现在存在
        // - 或 expirationDate 变化了（被延长了）
        // - 或 value 变化了
        if (!before) {
          console.log(`[Refresh] ${kind} ${name}: 从缺失变为存在`);
          refreshed = true;
        } else if (before.expirationDate !== afterCookie.expirationDate) {
          console.log(`[Refresh] ${kind} ${name}: expirationDate 已更新`);
          refreshed = true;
        } else if (before.value !== afterCookie.value) {
          console.log(`[Refresh] ${kind} ${name}: value 已更新`);
          refreshed = true;
        } else {
          console.log(`[Refresh] ${kind} ${name}: 未变化`);
        }
      } catch (err) {
        console.warn(`[Refresh] ${kind} 读取刷新后 cookie 失败:`, err.message);
      }
    }

    // 如果所有目标 cookie 都仍不存在，但可能服务端通过 JS 设置了其他 session cookie，
    // 此时按"已访问过页面"视为刷新成功，让上层重新采集一次。
    if (!refreshed) {
      const anyExists = (await Promise.all(
        config.names.map(async name => {
          try {
            const c = await findCookieByName(config.url, config.domain, name);
            return !!c?.value;
          } catch {
            return false;
          }
        })
      )).some(Boolean);
      if (anyExists) {
        console.log(`[Refresh] ${kind}: 至少一个目标 cookie 已存在，视为刷新成功`);
        refreshed = true;
      }
    }

    if (refreshed) {
      console.log(`[Refresh] ${kind} 凭证已刷新成功`);
      return true;
    }

    console.warn(`[Refresh] ${kind} 凭证未刷新，可能需要手动重新登录`);
    return false;
  } catch (err) {
    console.error(`[Refresh] ${kind} 刷新失败:`, err.message);
    return false;
  }
}

/** 凭证刷新记录键前缀 */
const LAST_REFRESH_PREFIX = 'bridgeLastRefresh_';

/** 检查是否需要强制刷新（距离上次刷新超过阈值） */
async function shouldForceRefresh(kind, intervalMs = refreshIntervalMs) {
  try {
    const key = `${LAST_REFRESH_PREFIX}${kind}`;
    const result = await chrome.storage.local.get(key);
    const lastRefresh = result[key] || 0;
    return Date.now() - lastRefresh > intervalMs;
  } catch {
    return true;
  }
}

/** 记录刷新时间 */
async function recordRefresh(kind) {
  try {
    const key = `${LAST_REFRESH_PREFIX}${kind}`;
    await chrome.storage.local.set({ [key]: Date.now() });
  } catch { /* ignore */ }
}

/** 定期检查所有活跃服务的凭证状态，失效则自动刷新
 *
 * 策略：
 * 1. 凭证 missing/expired/invalid → 强制刷新
 * 2. 凭证 valid 但超过刷新间隔 → 预防性刷新（针对 Cookie 类服务）
 *    因为服务器端 session 可能已过期，但客户端 cookie 仍存在
 */
async function checkAndRefreshCredentials() {
  console.log('[Credential] 开始凭证检测循环...');
  for (const kind of activeKinds) {
    let status = await checkCredentialValidity(kind);
    console.log(`[Credential] ${kind} 凭证状态: ${status}`);

    // Kimi / MiMo 特殊处理：session cookie 可能已消失，但本地缓存仍有效
    if ((kind === 'kimi' || kind === 'mimo') && status === 'missing') {
      const cache = await loadCredentialCache(kind);
      if (cache?.cookie) {
        const probeStatus = await probeCachedCredential(kind, cache.cookie);
        console.log(`[Credential] ${kind} 本地缓存探测结果: ${probeStatus}`);
        if (probeStatus === 'valid') {
          status = 'valid';
        } else {
          await clearCredentialCache(kind);
        }
      }
    }

    const needsRefresh = status === 'missing' || status === 'expired' || status === 'invalid';
    const isCookieService = !COOKIE_TARGETS[kind]?.storageKey;
    // 对 Cookie 类服务，仅在状态未知时定期探测性刷新
    const shouldPreventiveRefresh = isCookieService && status === 'unknown'
      && await shouldForceRefresh(kind);

    if (needsRefresh || shouldPreventiveRefresh) {
      const reason = needsRefresh ? '凭证失效' : '预防性刷新';
      console.log(`[Credential] ${kind} ${reason}，开始刷新...`);

      let refreshed = false;
      if (kind === 'kimi' || kind === 'mimo') {
        // Kimi / MiMo 使用后台非激活标签页刷新（携带用户 same-site 登录态）
        const autoRefresh = await isAutoRefreshEnabled(kind);
        if (autoRefresh) {
          refreshed = !!(await loadCredentialViaBackgroundTab(kind));
        } else {
          console.log(`[Credential] ${kind}: 未开启自动刷新，跳过后台访问`);
        }
      } else {
        refreshed = await refreshCredential(kind);
      }

      if (refreshed) {
        console.log(`[Credential] ${kind} 刷新成功，立即推送给 VSCode`);
        await recordRefresh(kind);
        await relayCookies(true);
      } else {
        console.warn(`[Credential] ${kind} 刷新失败，跳过推送`);
      }
    } else {
      console.log(`[Credential] ${kind} 凭证有效且未到刷新间隔，跳过`);
    }
  }
  console.log('[Credential] 凭证检测循环结束');
}

// ===== 事件监听 =====

// Cookie 变化监听（仅关注处于活跃状态的凭证目标）
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;

  let matchedKind = null;
  for (const kind of Object.keys(COOKIE_TARGETS)) {
    const config = COOKIE_TARGETS[kind];
    if (!config || config.storageKey) continue;

    const domainMatch = cookie.domain === config.domain || cookie.domain.endsWith(config.domain);
    if (!domainMatch) continue;

    if (config.names.includes(cookie.name)) {
      matchedKind = kind;
      break;
    }
  }

  if (!matchedKind || !activeKinds.has(matchedKind)) return;

  if (removed) {
    console.log(`[Cookie] ${cookie.name} 已被移除 (${matchedKind})`);
  } else {
    console.log(`[Cookie] ${cookie.name} 已更新 (${matchedKind})`);
  }

  debouncedRelay();

  // 通知 Popup / Dashboard 即时刷新对应服务
  chrome.runtime.sendMessage({ action: 'cookieChanged', kind: matchedKind }).catch(() => {
    // 无监听者（Popup/Dashboard 未打开），忽略
  });
});

// 扩展安装 / 启动时统一调用 init
chrome.runtime.onInstalled.addListener(() => init());
chrome.runtime.onStartup.addListener(() => init());

// 定期任务：健康检查 + 凭证检测
/** 动态调整健康检查间隔 */
function scheduleHealthCheck() {
  // 清除现有 alarm
  chrome.alarms.clear('healthCheck');
  // 已连接时使用用户配置的刷新间隔，未连接时使用更短的间隔保证快速发现
  const interval = BRIDGE.activePort ? refreshIntervalMs : Math.min(refreshIntervalMs, 10_000);
  const periodMinutes = Math.max(interval / 60000, 0.5);
  chrome.alarms.create('healthCheck', { periodInMinutes: periodMinutes });
  console.log(`[Alarm] healthCheck 已调度，周期: ${Math.round(periodMinutes * 60)}s`);
}

/** 确保 credentialCheck alarm 存在（避免 Service Worker 重启后丢失） */
async function ensureCredentialAlarm() {
  await chrome.alarms.clear('credentialCheck');
  const periodMinutes = Math.max(refreshIntervalMs / 60000, 0.5);
  chrome.alarms.create('credentialCheck', { periodInMinutes: periodMinutes });
  console.log(`[Alarm] credentialCheck alarm 已创建，周期: ${Math.round(periodMinutes * 60)}s`);
}

// 初始化时确保 alarm 存在

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'healthCheck') {
    if (!BRIDGE.activePort) {
      discoverPort().then((found) => {
        if (found) {
          retryPending();
          // 连接成功后调整检查间隔
          scheduleHealthCheck();
        }
      });
    }
  }

  if (alarm.name === 'credentialCheck') {
    // 使用自执行 async 函数确保 Service Worker 等待操作完成
    (async () => {
      console.log('[Alarm] 开始凭证检测...');
      await checkAndRefreshCredentials();
      console.log('[Alarm] 凭证检测完成');
    })();
  }
});

// 来自 popup 的消息
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'relayNow') {
    relayCookies(true)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === 'getStatus') {
    if (!BRIDGE.activePort) {
      discoverPort().then((found) => {
        sendResponse({
          connected: found,
          port: BRIDGE.activePort,
          activeKinds: [...activeKinds],
          lastError: BRIDGE.lastError,
        });
      });
      return true;
    }
    sendResponse({
      connected: true,
      port: BRIDGE.activePort,
      activeKinds: [...activeKinds],
      lastError: BRIDGE.lastError,
    });
    return false;
  }

  // 配置变更通知（popup 保存配置后发送）
  if (msg.action === 'configUpdated') {
    loadActiveKinds().then(async () => {
      // 配置更新后按当前活跃服务列表推送对应凭证
      const found = await discoverPort();
      if (found) {
        await relayCookies(true);
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // 手动触发凭证检测 + 刷新
  if (msg.action === 'checkCredentials') {
    checkAndRefreshCredentials()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 打开 Dashboard 页面（快捷键触发，当没有 default_popup 时生效）
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});

// 初始化：加载配置 + 加载待重传队列 + 立即尝试连接 + 确保 alarm 存在
let initialized = false;
async function init() {
	if (initialized) return;
	initialized = true;
	await loadActiveKinds();
	await loadPending();
	await loadRefreshInterval();
	// 总是调度 healthCheck（即使当前无活跃服务，用户可能稍后添加）
	scheduleHealthCheck();
	// 确保 credentialCheck alarm 也存在
	await ensureCredentialAlarm();

	// 启动后按当前活跃服务列表尝试连接并推送对应凭证
	const found = await discoverPort();
	if (found) {
		await relayCookies(true);
		// 初次安装/浏览器启动后，Cookie 恢复或权限授予可能稍有延迟，5 秒后再兜底重试一次
		setTimeout(() => relayCookies(true), 5000);
	}
}
// 当用户授予 Cookie 等权限后，立即重新推送凭证
if (chrome.permissions?.onAdded) {
	chrome.permissions.onAdded.addListener(() => {
		console.log('[Permissions] 权限变更，重新推送凭证');
		debouncedRelay();
	});
}

init();
