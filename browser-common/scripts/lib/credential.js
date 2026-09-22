/**
 * 凭证域 — background 子模块
 *
 * 职责：Cookie 类凭证本地缓存（TTL 读/写/清/探测）、GLM API Key TTL 读取、
 * 后台非激活标签页刷新（loadCredentialViaBackgroundTab）、凭证失效检测
 * （checkCredentialValidity）、强制刷新判定与刷新记录、自动刷新开关读取。
 *
 * 依赖：protocol、config-sync（COOKIE_TARGETS / refreshIntervalMs）、
 * bridge-client（timeoutSignal）、cookie-utils（TTL / Cookie 读取 / JWT 挑选）。
 */

import { TIMEOUTS } from '../../protocol/index.js';
import { COOKIE_TARGETS, refreshIntervalMs } from './config-sync.js';
import { timeoutSignal } from './bridge-client.js';
import { findCookieByName } from './cookie-utils.js';
import { checkKimiRelayValidity } from './kimi-relay.js';
// GLM API Key 读取（TTL 校验 + dashboardConfig 自愈重播种）统一收敛在 api/glm.js，
// 本模块与配额拉取侧共用同一实现，避免副本过期后探测/拉取行为漂移
import { getGlmApiKey } from '../../api/glm.js';

// ===== Cookie 类凭证本地缓存与后台刷新（MiMo / Kimi 通用）=====

const CREDENTIAL_CACHE_KEYS = {
  mimo: 'mimoCredentialCache',
  kimi: 'kimiCredentialCache',
};

/** 为指定 kind 生成后台刷新使用的缓存键名 */
function getCredentialCacheKey(kind) {
  return CREDENTIAL_CACHE_KEYS[kind];
}

/** 保存凭证到本地缓存（唯一存活调用方为下方 loadCredentialViaBackgroundTab 的刷新落盘） */
export async function saveCredentialCache(kind, cookieString) {
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

/** 通过后台非激活标签页访问指定站点，触发 session cookie 生成 */
export async function loadCredentialViaBackgroundTab(kind) {
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
      }, TIMEOUTS.tabLoad);
    });

    // 额外等待 JS 设置 cookie
    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.tabSettle));

    // 重新读取 cookie
    const cookies = [];
    for (const name of config.names) {
      const cookie = await findCookieByName(config.url, config.domain, name);
      if (cookie?.value) {
        cookies.push(`${cookie.name}=${cookie.value}`);
      }
    }

    if (cookies.length > 0) {
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
export async function isAutoRefreshEnabled(kind) {
  try {
    const result = await chrome.storage.local.get('dashboardConfig');
    return result.dashboardConfig?.settings?.[`${kind}AutoRefresh`] === true;
  } catch {
    return false;
  }
}

// ===== 凭证失效检测 =====

/** 检测单个 kind 的凭证是否有效 */
export async function checkCredentialValidity(kind) {
  const config = COOKIE_TARGETS[kind];
  if (!config) return 'no-target';

  // Kimi：检测域上移——kimi-auth Cookie 已废弃，改判 relay 镜像鲜度
  //（陈旧时经 kimi-relay 续期链重判，含限速后台页），不走红 cookie 检测链
  if (kind === 'kimi') {
    return checkKimiRelayValidity();
  }

  // GLM：API Key 存储在 chrome.storage.local
  if (config.storageKey) {
    try {
      // 带 TTL 的对象副本，读取时校验有效期（过期视为未配置；副本断供时
      // 经 getGlmApiKey 从 dashboardConfig 自愈重播种，与配额拉取侧口径一致）
      const apiKey = await getGlmApiKey();
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
        signal: timeoutSignal(TIMEOUTS.apiProbe),
      });
      if (res.status === 401) return 'invalid';
      // 5xx/网络层等非 401 失败不得误报 valid（对齐下方 MiMo 分支口径）
      if (!res.ok) return 'unknown';
      return 'valid';
    } catch (err) {
      console.warn(`[Credential] ${kind} 探测失败:`, err.message);
      return 'unknown';
    }
  }

  // Cookie 类凭证（mimo；kimi 已在上方走 relay 镜像检测链）
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
    if (kind === 'mimo') {
      // MiMo 使用 Cookie 认证。Service Worker 中的 fetch 在已授权 host_permissions 下
      // 可通过 credentials: 'include' 携带跨域 Cookie，因此增加 API 探测以识别服务端
      // session 已过期但客户端 Cookie 仍存在的情况。
      try {
        const res = await fetch(config.probeUrl, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
          signal: timeoutSignal(TIMEOUTS.apiProbe),
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

// ===== 强制刷新判定与刷新记录 =====

/** 凭证刷新记录键前缀 */
const LAST_REFRESH_PREFIX = 'bridgeLastRefresh_';

/** 检查是否需要强制刷新（距离上次刷新超过阈值） */
export async function shouldForceRefresh(kind, intervalMs = refreshIntervalMs) {
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
export async function recordRefresh(kind) {
  try {
    const key = `${LAST_REFRESH_PREFIX}${kind}`;
    await chrome.storage.local.set({ [key]: Date.now() });
  } catch { /* ignore */ }
}
