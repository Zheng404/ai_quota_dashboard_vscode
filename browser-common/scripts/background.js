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
    /** 访问 API 端点触发 cookie 刷新（比首页更可靠） */
    refreshUrl: 'https://www.kimi.com/api-user/user/info',
  },
  mimo: {
    domain: '.xiaomimimo.com',
    names: ['api-platform_serviceToken', 'userId'],
    url: 'https://platform.xiaomimimo.com',
    probeUrl: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/detail',
    /** 访问 API 端点触发 cookie 刷新（比首页更可靠） */
    refreshUrl: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/detail',
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
  ports: [37100, 37101, 37102, 37103, 37104, 37105, 37106, 37107, 37108, 37109, 37110],
  activePort: null,
  authToken: null,
  healthCheckInterval: 30_000,
  /** 未连接时的快速检查间隔（毫秒） */
  fastCheckInterval: 10_000,
};

const RELAY = {
  debounceMs: 1500,
  minIntervalMs: 10_000,
};

let relayTimeout = null;
let lastRelayTime = 0;
let isRelaying = false;

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
        console.error('[Bridge] 重试次数已耗尽，丢弃数据包');
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

  for (const port of portsToTry) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: timeoutSignal(2000), // 增加超时到 2 秒
      });
      if (res.ok) {
        const data = await res.json();
        BRIDGE.activePort = port;
        BRIDGE.authToken = data.authToken || null;
        console.log(`[Bridge] 已连接到端口: ${port}`);
        await saveLastKnownPort(port);
        return true;
      }
    } catch {
      // 端口不通
    }
  }
  BRIDGE.activePort = null;
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
        console.log(`[Bridge] 推送成功: ${result.received} 条`);
        return true;
      }

      if (res.status === 401) {
        BRIDGE.authToken = null;
        BRIDGE.activePort = null;
        console.log('[Bridge] 认证失效，正在重新发现...');
        return false;
      }

      console.error(`[Bridge] 推送失败，HTTP 状态码: ${res.status}`);
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
        console.error(`[Cookie] 读取 ${config.url} 的 ${name} 失败:`, err.message);
      }
    }
  }

  return cookies;
}

// ===== 推送逻辑（按需）=====

async function relayCookies(force = false) {
  if (isRelaying) {
    console.log('[Relay] 已有推送在进行中，跳过');
    return;
  }

  if (activeKinds.size === 0) {
    console.log('[Relay] 无活跃服务，跳过推送');
    return;
  }

  const now = Date.now();
  if (!force && now - lastRelayTime < RELAY.minIntervalMs) {
    return;
  }

  isRelaying = true;

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
    console.log('[Relay] 无可用的认证凭证');
    isRelaying = false;
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

  try {
    const success = await sendToVscode(payload);
    if (success) {
      lastRelayTime = now;
    } else {
      enqueuePayload(payload);
    }
  } finally {
    isRelaying = false;
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
      // MiMo 使用 Cookie 认证，但在 Service Worker 中 fetch 跨域请求时
      // 由于 SameSite 限制，无法自动携带 Cookie。因此改用直接检查 Cookie 值。
      // 如果 Cookie 存在且未过期，认为凭证有效。
      console.log(`[Credential] ${kind} Cookie 存在且未过期，视为有效`);
      return 'valid';
    }
  } catch (err) {
    // 网络错误不算凭证失效
    console.warn(`[Credential] ${kind} 探测失败:`, err.message);
    return 'unknown';
  }

  return 'valid';
}

/** 后台自动刷新凭证：打开临时标签页访问对应网站（仅 Cookie 类服务）
 *
 * 核心逻辑：
 * 1. 记录刷新前的 cookie 状态（expirationDate 等）
 * 2. 打开标签页访问 refreshUrl，触发网站刷新 cookie
 * 3. 关闭标签页后，比较 cookie 是否变化
 * 4. 如果 cookie 已更新（expirationDate 变化或之前不存在），认为刷新成功
 *
 * 注意：此方法依赖于网站在访问时自动刷新 Cookie。
 * - Kimi: 访问首页或 API 端点可能触发 JWT token 刷新
 * - MiMo: 访问 API 端点会触发 session cookie 刷新
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

    // 2. 创建后台标签页访问刷新 URL
    console.log(`[Refresh] ${kind} 打开标签页: ${config.refreshUrl}`);
    const tab = await chrome.tabs.create({
      url: config.refreshUrl,
      active: false,
    });

    // 等待页面加载完成
    await new Promise((resolve) => {
      let resolved = false;
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
          }
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);

      // 超时 15 秒后强制关闭
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }, 15_000);
    });

    // 额外等待 5 秒，让 JS 完全执行并触发 cookie 刷新
    console.log(`[Refresh] ${kind} 等待 cookie 刷新...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. 关闭标签页
    try {
      await chrome.tabs.remove(tab.id);
      console.log(`[Refresh] ${kind} 标签页已关闭`);
    } catch {
      // 标签页可能已关闭
    }

    // 4. 等待 cookie 更新写入
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. 检查刷新后的 cookie 状态
    let refreshed = false;
    for (const name of config.names) {
      try {
        const afterCookie = await chrome.cookies.get({ url: config.url, name });
        const before = beforeCookies.get(name);

        if (!afterCookie) {
          console.log(`[Refresh] ${kind} 刷新后 ${name}: 仍不存在`);
          continue;
        }

        console.log(`[Refresh] ${kind} 刷新后 ${name}: expirationDate=${afterCookie.expirationDate ? new Date(afterCookie.expirationDate * 1000).toISOString() : 'session'}`);

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
async function shouldForceRefresh(kind, intervalMs = 30 * 60 * 1000) {
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
    const status = await checkCredentialValidity(kind);
    console.log(`[Credential] ${kind} 凭证状态: ${status}`);

    const needsRefresh = status === 'missing' || status === 'expired' || status === 'invalid';
    const isCookieService = !COOKIE_TARGETS[kind]?.storageKey;
    // 对 Cookie 类服务，即使状态是 valid，也定期预防性刷新
    const shouldPreventiveRefresh = isCookieService && (status === 'valid' || status === 'unknown')
      && await shouldForceRefresh(kind);

    if (needsRefresh || shouldPreventiveRefresh) {
      const reason = needsRefresh ? '凭证失效' : '预防性刷新';
      console.log(`[Credential] ${kind} ${reason}，开始刷新...`);
      const refreshed = await refreshCredential(kind);
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
    console.log(`[Cookie] ${cookie.name} 已被移除 (${matchedKind})`);
  } else {
    console.log(`[Cookie] ${cookie.name} 已更新 (${matchedKind})`);
  }

  debouncedRelay();
});

// 扩展安装 / 启动时统一调用 init
chrome.runtime.onInstalled.addListener(() => init());
chrome.runtime.onStartup.addListener(() => init());

// 定期任务：健康检查 + 凭证检测
/** 动态调整健康检查间隔 */
function scheduleHealthCheck() {
  // 清除现有 alarm
  chrome.alarms.clear('healthCheck');
  // 未连接时更频繁检查（10秒），已连接时减少检查（30秒）
  const interval = BRIDGE.activePort ? BRIDGE.healthCheckInterval : BRIDGE.fastCheckInterval;
  chrome.alarms.create('healthCheck', { periodInMinutes: interval / 60000 });
}

/** 确保 credentialCheck alarm 存在（避免 Service Worker 重启后丢失） */
async function ensureCredentialAlarm() {
  const alarms = await chrome.alarms.getAll();
  const hasCredentialAlarm = alarms.some(a => a.name === 'credentialCheck');
  if (!hasCredentialAlarm) {
    chrome.alarms.create('credentialCheck', { periodInMinutes: 30 });
    console.log('[Alarm] credentialCheck alarm 已创建');
  }
}

// 初始化时确保 alarm 存在
ensureCredentialAlarm();

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
    sendResponse({
      connected: BRIDGE.activePort !== null,
      port: BRIDGE.activePort,
      activeKinds: [...activeKinds],
    });
    return false;
  }

  // 配置变更通知（popup 保存配置后发送）
  if (msg.action === 'configUpdated') {
    loadActiveKinds().then(async () => {
      // 配置更新后立即尝试发现端口并推送
      if (activeKinds.size > 0) {
        const found = await discoverPort();
        if (found) {
          await relayCookies(true);
        }
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

// 初始化：加载配置 + 立即尝试连接 + 确保 alarm 存在
async function init() {
  await loadActiveKinds();
  // 总是调度 healthCheck（即使当前无活跃服务，用户可能稍后添加）
  scheduleHealthCheck();
  // 确保 credentialCheck alarm 也存在
  await ensureCredentialAlarm();

  if (activeKinds.size > 0) {
    const found = await discoverPort();
    if (found) {
      await relayCookies(true);
    }
  }
}
init();
