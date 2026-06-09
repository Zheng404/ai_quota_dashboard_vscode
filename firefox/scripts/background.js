/**
 * AI Quota Cookie Bridge — Background Service Worker
 *
 * 按需监控：只有 popup 中添加了对应服务卡片，才开启该服务的 Cookie Bridge。
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
    /** 后台刷新时访问的页面（触发 cookie 更新） */
    refreshUrl: 'https://www.kimi.com',
  },
  mimo: {
    domain: '.xiaomimimo.com',
    names: ['api-platform_serviceToken', 'userId'],
    url: 'https://platform.xiaomimimo.com',
    probeUrl: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/detail',
    refreshUrl: 'https://platform.xiaomimimo.com',
  },
};

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
  ports: [37100, 37101, 37102],
  activePort: null,
  authToken: null,
  healthCheckInterval: 60_000,
};

const RELAY = {
  debounceMs: 1500,
  minIntervalMs: 10_000,
};

let relayTimeout = null;
let lastRelayTime = 0;

// ===== 重试队列 =====

const pendingPayloads = [];
let isRetrying = false;
const MAX_PENDING = 50;

function enqueuePayload(payload) {
  if (pendingPayloads.length >= MAX_PENDING) {
    pendingPayloads.shift();
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
        await new Promise(resolve => setTimeout(resolve, 3000));
        break;
      }
    }
  } finally {
    isRetrying = false;
  }
}

// ===== 互斥锁 =====

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

const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
};

async function _doDiscoverPort() {
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
      // 端口不通
    }
  }
  BRIDGE.activePort = null;
  return false;
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
        console.log(`[Bridge] 推送成功: ${result.received} 条`);
        return true;
      }

      if (res.status === 401) {
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

// ===== Cookie 采集（按需）=====

/** 采集指定 kind 列表的 Cookie */
async function gatherCookies(kinds) {
  const cookies = [];

  for (const kind of kinds) {
    const config = COOKIE_TARGETS[kind];
    if (!config) continue;

    for (const name of config.names) {
      try {
        const cookie = await chrome.cookies.get({ url: config.url, name });
        if (cookie && cookie.value) {
          cookies.push({
            service: kind,
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

// ===== 推送逻辑（按需）=====

async function relayCookies(force = false) {
  if (activeKinds.size === 0) {
    console.log('[Relay] 无活跃服务，跳过');
    return;
  }

  const now = Date.now();
  if (!force && now - lastRelayTime < RELAY.minIntervalMs) {
    return;
  }

  // 采集 Cookie 类凭证（kimi, mimo）
  const cookieKinds = [...activeKinds].filter(k => !COOKIE_TARGETS[k]?.storageKey);
  const cookies = cookieKinds.length > 0 ? await gatherCookies(cookieKinds) : [];

  // 采集 storage 类凭证（glm）
  const storageCredentials = {};
  for (const kind of activeKinds) {
    const target = COOKIE_TARGETS[kind];
    if (target?.storageKey) {
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
  }

  if (cookies.length === 0 && Object.keys(storageCredentials).length === 0) {
    console.log('[Relay] 无可用凭证');
    return;
  }

  const mimoCookies = cookies.filter(c => c.service === 'mimo');
  const mimoCookieStr = mimoCookies.length > 0
    ? mimoCookies.map(c => `${c.name}=${c.value}`).join('; ')
    : null;

  const payload = {
    source: 'ai-quota-cookie-bridge',
    timestamp: now,
    cookies,
    kimiAuthToken: cookies.find(c => c.service === 'kimi' && c.name === 'kimi-auth')?.value || null,
    mimoCookie: mimoCookieStr,
    glmApiKey: storageCredentials['glmApiKey'] || null,
  };

  const success = await sendToVscode(payload);
  if (success) {
    lastRelayTime = now;
  } else {
    enqueuePayload(payload);
  }
}

function debouncedRelay() {
  clearTimeout(relayTimeout);
  relayTimeout = setTimeout(() => relayCookies(), RELAY.debounceMs);
}

// ===== 配置加载与监听 =====

async function loadActiveKinds() {
  try {
    const stored = await chrome.storage.local.get('dashboardConfig');
    const services = stored.dashboardConfig?.services ?? [];
    activeKinds = deriveActiveKinds(services);
    console.log('[Config] 活跃服务:', [...activeKinds]);
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
    console.log('[Config] 监控目标更新:', [...activeKinds]);
    if (activeKinds.size > 0) {
      relayCookies(true);
    }
  }

  // GLM API Key 变化
  if (changes.glmApiKey && activeKinds.has('glm')) {
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
        console.log(`[Credential] ${kind} API Key 不存在`);
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
        console.log(`[Credential] ${kind} Cookie ${name} 不存在`);
        return 'missing';
      }
      // 检查是否过期（session cookie 的 expirationDate 为 undefined）
      if (cookie.session === false && cookie.expirationDate && cookie.expirationDate * 1000 < Date.now()) {
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
    const cookieObjs = await gatherCookies([kind]);
    if (cookieObjs.length === 0) return 'missing';

    if (kind === 'kimi') {
      const token = cookieObjs.find(c => c.name === 'kimi-auth')?.value;
      if (!token) return 'missing';

      const res = await fetch(config.probeUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: timeoutSignal(5000),
      });
      // kimi 探测接口：200 = 有效，401 = 无效
      if (res.status === 401) return 'invalid';
      return 'valid';
    }

    if (kind === 'mimo') {
      const res = await fetch(config.probeUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
        signal: timeoutSignal(5000),
      });
      // mimo 探测接口：200 = 有效，401 = 无效
      if (res.status === 401) return 'invalid';
      return 'valid';
    }
  } catch (err) {
    // 网络错误不算凭证失效
    console.warn(`[Credential] ${kind} 探测失败:`, err.message);
    return 'unknown';
  }

  return 'valid';
}

/** 后台自动刷新凭证：打开临时标签页访问对应网站（仅 Cookie 类服务） */
async function refreshCredential(kind) {
  const config = COOKIE_TARGETS[kind];
  if (!config || !config.refreshUrl) {
    // GLM 等存储类凭证无法自动刷新
    console.log(`[Refresh] ${kind} 不支持自动刷新`);
    return false;
  }

  console.log(`[Refresh] 正在刷新 ${kind} 凭证...`);

  try {
    // 创建后台标签页
    const tab = await chrome.tabs.create({
      url: config.refreshUrl,
      active: false, // 不激活，后台打开
    });

    // 等待页面加载完成
    await new Promise((resolve) => {
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);

      // 超时 15 秒后强制关闭
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }, 15_000);
    });

    // 额外等待 2 秒，让 JS 完全执行（可能触发 cookie 刷新）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 关闭标签页
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // 标签页可能已关闭
    }

    console.log(`[Refresh] ${kind} 刷新页面已访问`);

    // 检查刷新后的凭证状态
    const status = await checkCredentialValidity(kind);
    if (status === 'valid') {
      console.log(`[Refresh] ${kind} 凭证已恢复`);
      return true;
    }

    console.warn(`[Refresh] ${kind} 凭证仍无效 (${status})`);
    return false;
  } catch (err) {
    console.error(`[Refresh] ${kind} 刷新失败:`, err.message);
    return false;
  }
}

/** 定期检查所有活跃服务的凭证状态，失效则自动刷新 */
async function checkAndRefreshCredentials() {
  for (const kind of activeKinds) {
    const status = await checkCredentialValidity(kind);
    console.log(`[Credential] ${kind} 状态: ${status}`);

    if (status === 'missing' || status === 'expired' || status === 'invalid') {
      const refreshed = await refreshCredential(kind);
      if (refreshed) {
        // 凭证恢复后重新推送给 VSCode
        await relayCookies(true);
      }
    }
  }
}

// ===== 事件监听 =====

// Cookie 变化监听（仅关注活跃服务的目标 Cookie）
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;

  // 只关注当前活跃的服务
  let matchedKind = null;
  for (const kind of activeKinds) {
    const config = COOKIE_TARGETS[kind];
    if (!config) continue;

    const domainMatch = cookie.domain === config.domain || cookie.domain.endsWith(config.domain);
    if (!domainMatch) continue;

    if (config.names.includes(cookie.name)) {
      matchedKind = kind;
      break;
    }
  }

  if (!matchedKind) return;

  if (removed) {
    console.log(`[Cookie] ${cookie.name} 被移除 (${matchedKind})`);
  } else {
    console.log(`[Cookie] ${cookie.name} 已更新 (${matchedKind})`);
  }

  debouncedRelay();
});

// 扩展安装 / 启动时加载配置 + 首次推送
chrome.runtime.onInstalled.addListener(async () => {
  await loadActiveKinds();
  if (activeKinds.size > 0) {
    await relayCookies(true);
  }
});
chrome.runtime.onStartup.addListener(async () => {
  await loadActiveKinds();
  if (activeKinds.size > 0) {
    await relayCookies(true);
  }
});

// 定期任务：健康检查 + 凭证检测
chrome.alarms.create('healthCheck', { periodInMinutes: 1 });
chrome.alarms.create('credentialCheck', { periodInMinutes: 30 });

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

  if (alarm.name === 'credentialCheck') {
    checkAndRefreshCredentials();
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
    sendResponse({
      connected: BRIDGE.activePort !== null,
      port: BRIDGE.activePort,
      activeKinds: [...activeKinds],
    });
    return false;
  }

  // 配置变更通知（popup 保存配置后发送）
  if (msg.action === 'configUpdated') {
    loadActiveKinds().then(() => {
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

// 初始化：加载配置
loadActiveKinds();
