/**
 * Kimi 访问令牌被动镜像 — background 子模块
 *
 * kimi-auth Cookie 已被 Kimi 废弃（停止续期+签名轮换），新凭证为页面
 * localStorage.access_token（约 15 分钟有效，网页自动续期）。此处仅被动镜像，
 * 绝不调用 RefreshToken 端点（单消费者，接管会踢用户网页下线）。
 * 见 scripts/kimi-content.js（content script 上报方）。
 *
 * 无 kimi.com 标签页导致镜像陈旧时，兜底创建后台非激活标签页触发网页续期
 * （10 分钟限速），避免周期推送拿到过期令牌打出误导性 401。
 *
 * 依赖：protocol（消息 action / 超时）、cookie-utils（凭证 TTL）。
 */

import { TIMEOUTS, MSG } from '../../protocol/index.js';
import { CREDENTIAL_TTL_MS } from './cookie-utils.js';

/** relay 镜像的 storage.local 键名（SW 重启后不丢） */
const KIMI_TOKEN_STORAGE_KEY = 'kimiTokenRelay';
/** access_token 有效期约 15 分钟，超过 10 分钟视为陈旧，优先向页面实时索取 */
const KIMI_TOKEN_STALE_MS = 10 * 60 * 1000;

/**
 * 后台标签页续期的限速参数：
 * relay 周期推送默认 600s 一轮，若每轮镜像都陈旧会周期性弹后台标签页，
 * 10 分钟限速保证最坏情况下每小时最多开 6 次后台页（通常远少于此）。
 * 限速时间戳持久化到 storage.local（键 kimiRelayLastTabRefresh），
 * SW 休眠/重启后仍然生效（仿 credential.js bridgeLastRefresh_* 模式）。
 */
const BACKGROUND_TAB_MIN_INTERVAL_MS = 10 * 60 * 1000;
/** 开后台页后等待新令牌的最长等待时间。
 *  等待改为「主动向续期页 content script 索取 + storage 旁路轮询」双路并行，
 *  窗口放宽到 20s：页面 load complete 后 kimi 应用还要异步鉴权才会写入新令牌，
 *  8s 常在慢网络下超时导致救援失败（黑洞 A） */
const BACKGROUND_TAB_TOKEN_WAIT_MS = 20_000;
/** 轮询间隔 */
const BACKGROUND_TAB_POLL_MS = 500;
/** 限速时间戳的 storage.local 键名 */
const LAST_TAB_REFRESH_KEY = 'kimiRelayLastTabRefresh';
/** 续期用后台标签页的目标地址 */
const RENEWAL_TAB_URL = 'https://www.kimi.com';

/** 内存镜像（SW 存活期间免读 storage） */
let kimiTokenMemory = null;

/** 被 401 作废的令牌短期记忆（SW 内存级）：防止死令牌经标签页索取再次武装镜像形成 401 循环（R1） */
let invalidatedToken = null;
let invalidatedAt = 0;
/** 作废豁免期：期内同一令牌值拒绝重新入库（用户重新登录后 kimi.com 会写入新令牌值，不受影响） */
const INVALIDATED_TOKEN_GRACE_MS = 5 * 60 * 1000;

/** 令牌是否处于「已作废豁免期」（死令牌拒绝重新入库/供应） */
function isInvalidatedToken(token) {
  if (!token || !invalidatedToken) return false;
  if (Date.now() - invalidatedAt > INVALIDATED_TOKEN_GRACE_MS) {
    invalidatedToken = null;
    return false;
  }
  return token === invalidatedToken;
}

/** 保存 content script 上报的令牌（内存 + storage.local 双写，含 capturedAt）。
 *  与近期被 401 作废的死令牌相同时拒绝入库（R1/R2：作废后页面 localStorage 残留的旧值
 *  不会重新武装镜像）。 */
export async function saveKimiTokenRelay(payload) {
  if (isInvalidatedToken(payload?.accessToken)) {
    console.warn('[KimiRelay] 上报令牌与近期作废的死令牌相同，拒绝入库');
    return;
  }
  const record = {
    accessToken: payload?.accessToken || null,
    // refresh_token 只镜像存储、不推送远端（阶段 2 预留）
    refreshToken: payload?.refreshToken || null,
    capturedAt: payload?.capturedAt || Date.now(),
  };
  kimiTokenMemory = record;
  try {
    await chrome.storage.local.set({ [KIMI_TOKEN_STORAGE_KEY]: record });
  } catch (err) {
    console.error('[KimiRelay] 保存令牌镜像失败:', err.message);
  }
}

/** 作废当前镜像（内存 + storage 双清）：relay 令牌被网页 API 401 拒绝时调用，
 * 防止「capturedAt 新鲜但令牌已死」的镜像被反复供应（下次索取/续期重建） */
export async function invalidateKimiTokenRelay() {
  // 先记录被作废的令牌值：后续标签页索取/上报若原样带回同一死令牌，豁免期内拒绝重新入库
  const record = kimiTokenMemory ?? await loadKimiTokenRelay();
  if (record?.accessToken) {
    invalidatedToken = record.accessToken;
    invalidatedAt = Date.now();
  }
  kimiTokenMemory = null;
  try {
    await chrome.storage.local.remove(KIMI_TOKEN_STORAGE_KEY);
    console.log('[KimiRelay] 镜像已作废（令牌 401），等待重续期');
  } catch (err) {
    console.warn('[KimiRelay] 作废镜像失败:', err.message);
  }
}

/** 读取当前镜像（内存优先，SW 重启后回退 storage；超 24h 未更新视为过期并清除） */async function loadKimiTokenRelay() {
  if (kimiTokenMemory) return kimiTokenMemory;
  try {
    const result = await chrome.storage.local.get(KIMI_TOKEN_STORAGE_KEY);
    const record = result[KIMI_TOKEN_STORAGE_KEY] || null;
    if (record && (!record.capturedAt || Date.now() - record.capturedAt > CREDENTIAL_TTL_MS)) {
      // 无时间戳的存量条目或超时条目视为过期，清除一次
      await chrome.storage.local.remove(KIMI_TOKEN_STORAGE_KEY);
      kimiTokenMemory = null;
      return null;
    }
    kimiTokenMemory = record;
  } catch (err) {
    console.error('[KimiRelay] 读取令牌镜像失败:', err.message);
  }
  return kimiTokenMemory;
}

/** 向各标签页并行发送 queryKimiToken（单个请求 2s 超时），返回 allSettled 结果 */
async function queryKimiTokensFromTabs(tabs) {
  return Promise.allSettled(tabs.map(tab =>
    Promise.race([
      chrome.tabs.sendMessage(tab.id, { action: MSG.QUERY_KIMI_TOKEN }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUTS.tokenQuery)),
    ])
  ));
}

/** 从 allSettled 结果中取首个含 accessToken 的响应，顺带输出诊断日志 */
function pickFirstTokenResult(results) {
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    if (r.value?.accessToken) {
      return r.value;
    }
    // 脚本存活但无 access_token：打印 localStorage 键名，
    // 区分「脚本活着但 key 名不符」与「脚本没注入（rejected）」
    console.warn('[KimiRelay] content script 存活但无 access_token，localStorage keys:', r.value?.foundKeys);
  }
  return null;
}

/**
 * 判断镜像记录是否为「新鲜」令牌：
 * 存在 accessToken 且距 capturedAt 未超陈旧阈值。
 * credential.js 的凭证检测链（checkKimiRelayValidity）依赖此判定。
 */
export function isFreshRecord(record) {
  return Boolean(record?.accessToken)
    && (Date.now() - (record.capturedAt || 0)) <= KIMI_TOKEN_STALE_MS;
}

/** 读取上次后台开页续期时间戳（storage.local，SW 重启后限速仍然生效） */
async function readLastTabRefresh() {
  try {
    const result = await chrome.storage.local.get(LAST_TAB_REFRESH_KEY);
    return typeof result[LAST_TAB_REFRESH_KEY] === 'number' ? result[LAST_TAB_REFRESH_KEY] : 0;
  } catch {
    return 0;
  }
}

/** 记录后台开页续期时间戳（先写后开：开页失败/超时也计入限速，防止故障时狂刷后台页） */
async function writeLastTabRefresh(ts) {
  try {
    await chrome.storage.local.set({ [LAST_TAB_REFRESH_KEY]: ts });
  } catch { /* ignore */ }
}

/**
 * 轮询等待新令牌（双路并行）：
 *   ① 主动向续期标签页的 content script 索取（每轮一次，不等其 60s 轮询兜底上报）——
 *      页面 JS 写入新令牌后立即可得，消除「60s 轮询兜底 vs 8s 等待窗」的救援超时（黑洞 A）
 *   ② storage 镜像轮询旁路（content script 60s 轮询 / storage 事件上报落盘）
 * @param {number} previousCapturedAt 续期前旧镜像的 capturedAt
 * @param {number} waitMs 最长等待毫秒数
 * @param {number|null} [tabId] 续期标签页 id（null 时仅走 storage 旁路）
 * @returns {Promise<string|null>} 新 access_token 或 null（超时）
 */
async function waitForFreshToken(previousCapturedAt, waitMs, tabId = null) {
  const deadline = Date.now() + waitMs;

  /** 判定候选记录是否为「晚于基准的新鲜令牌」，命中则入库并返回令牌值。
   *  注意 content script 应答的 capturedAt 恒为读取时刻（对旧令牌也是新值），
   *  必须经 isInvalidatedToken 拒绝作废豁免期内的死令牌（会话已死时页面可能原样保留旧值） */
  const tryAccept = async (record) => {
    if (isFreshRecord(record)
      && (record.capturedAt || 0) > previousCapturedAt
      && !isInvalidatedToken(record?.accessToken)) {
      await saveKimiTokenRelay(record);
      return record.accessToken;
    }
    return null;
  };

  while (Date.now() < deadline) {
    // 旁路 ②：storage 镜像轮询
    try {
      const result = await chrome.storage.local.get(KIMI_TOKEN_STORAGE_KEY);
      const accepted = await tryAccept(result[KIMI_TOKEN_STORAGE_KEY] || null);
      if (accepted) return accepted;
    } catch { /* ignore，下一轮重试 */ }

    // 旁路 ①：主动向续期标签页索取
    if (tabId != null) {
      try {
        const resp = await Promise.race([
          chrome.tabs.sendMessage(tabId, { action: MSG.QUERY_KIMI_TOKEN }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUTS.tokenQuery)),
        ]);
        const accepted = await tryAccept(resp || null);
        if (accepted) return accepted;
      } catch { /* 标签页未就绪/脚本未注入，下一轮重试 */ }
    }

    await new Promise(resolve => setTimeout(resolve, BACKGROUND_TAB_POLL_MS));
  }
  return null;
}

/** 等待指定标签页加载完成或超时（与 credential.js 一致的模式） */
function waitTabLoad(tabId) {
  return new Promise((resolve) => {
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
}

/**
 * 查找是否已有处于续期等待中的后台 kimi.com 标签页（双开收敛）：
 * 本扩展创建的后台续期页特征为 pinned + 非激活 + kimi.com 地址。
 * 命中则复用等待其镜像结果，不再新开标签页（注意不关闭它——非本调用创建）。
 */
async function findExistingRenewalTab() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://www.kimi.com/*', 'https://kimi.com/*'] });
    return tabs.find(t => t.pinned && !t.active) || null;
  } catch {
    return null;
  }
}

/** Kimi 后台开页续期开关（popup 设置页 kimiAutoRefresh）：关闭时不创建后台 kimi.com 标签页。
 *  默认开（!== false）：存量用户未触碰开关时保持既有续期行为（P1-2：开关必须真实生效）。 */
async function isKimiAutoRefreshEnabled() {
  try {
    const result = await chrome.storage.local.get('dashboardConfig');
    return result.dashboardConfig?.settings?.kimiAutoRefresh !== false;
  } catch {
    return true;
  }
}

/**
 * 后台标签页续期兜底：无 kimi.com 标签页（或标签页索取/注入均失败）时，
 * 创建后台非激活标签页访问 kimi.com，触发页面 JS 写入新 access_token，
 * 由 kimi-content.js 镜像上报到 storage 的 kimiTokenRelay。
 *
 * 复用 credential.js loadCredentialViaBackgroundTab 的模式：
 * 开页（active: false, pinned: true）→ 等加载 → 轮询镜像 → finally 关页。
 *
 * 双开收敛：若已有续期等待中的后台 kimi.com 页，直接复用等待，不再新开。
 * 调用方负责 10 分钟限速（见 getKimiAccessToken / checkKimiRelayValidity）。
 * 开页失败/等待超时返回 null。
 *
 * @param {number} previousCapturedAt 续期前旧镜像的 capturedAt（轮询判定「新」令牌的基准）
 * @returns {Promise<string|null>} 新 access_token 或 null
 */
async function refreshTokenViaBackgroundTab(previousCapturedAt) {
  // P1-2：用户关闭「自动后台访问 Kimi 网站刷新凭证」时不创建后台标签页
  if (!(await isKimiAutoRefreshEnabled())) {
    console.log('[KimiRelay] 用户已关闭 Kimi 自动后台续期，跳过开页');
    return null;
  }

  // 双开收敛：已有续期等待中的后台页则复用（主动索取 + storage 轮询），不开新页
  const existing = await findExistingRenewalTab();
  if (existing) {
    console.log(`[KimiRelay] 检测到续期中的后台标签页 ${existing.id}，复用等待而非新开`);
    return waitForFreshToken(previousCapturedAt, BACKGROUND_TAB_TOKEN_WAIT_MS, existing.id);
  }

  console.log('[KimiRelay] 创建后台非激活标签页访问 kimi.com 续期 access_token...');

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({
      url: RENEWAL_TAB_URL,
      active: false,
      pinned: true,
    });
    tabId = tab.id;

    // 等待页面加载完成或超时
    await waitTabLoad(tabId);

    // 双路等待新令牌：主动向续期页索取（不等 60s 轮询）+ storage 镜像旁路
    const token = await waitForFreshToken(previousCapturedAt, BACKGROUND_TAB_TOKEN_WAIT_MS, tabId);
    if (token) {
      console.log('[KimiRelay] 后台标签页续期成功，已获取新 access_token');
      return token;
    }

    console.warn('[KimiRelay] 后台标签页续期超时，未等到新令牌镜像');
    return null;
  } catch (err) {
    console.error('[KimiRelay] 后台标签页续期失败:', err.message);
    return null;
  } finally {
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch { /* ignore */ }
    }
  }
}

/**
 * Kimi 凭证有效性检测（检测域上移：credential.js 的 checkCredentialValidity 调用）：
 * 镜像新鲜 → 'valid'；缺失/陈旧 → 走 getKimiAccessToken 全链续期
 * （标签页索取/注入/限速后台页），续期后重判，仍失败 → 'invalid'（引导用户访问 kimi.com）。
 * 替代已废弃的 kimi-auth Cookie 检测链。
 *
 * @returns {Promise<'valid'|'invalid'>}
 */
export async function checkKimiRelayValidity() {
  const record = await loadKimiTokenRelay();
  if (isFreshRecord(record)) return 'valid';

  console.log('[KimiRelay] 镜像缺失或陈旧，触发续期后重判...');
  await getKimiAccessToken();

  const after = await loadKimiTokenRelay();
  if (isFreshRecord(after)) return 'valid';
  console.warn('[KimiRelay] 续期后仍无新鲜令牌，判定 invalid（需用户访问 kimi.com 保持登录）');
  return 'invalid';
}

/**
 * 获取 Kimi access_token（被动镜像）：
 * 镜像缺失或超过 10 分钟时，向打开的 kimi.com 标签页广播 queryKimiToken
 * 实时索取（单个请求 2s 超时，取首个成功响应）；
 * 全部失败/超时（典型场景：扩展重载后已打开的标签页没有 content script——
 * manifest 注入仅发生在 document load 时）时，编程式注入 content script
 * 后再重试一次；仍无结果时兜底创建后台非激活标签页续期（10 分钟内最多一次，
 * 仅 allowBackgroundTab 开启时——popup 首屏请求路径关闭此兜底避免 15s+ 阻塞，
 * 交由 relay 周期推送负责续期）。续期失败时：allowBackgroundTab=true（relay 路径）
 * 返回最近一次镜像值（可能已过期，调用方自行承担 401）；allowBackgroundTab=false
 * （popup 请求路径）返回 null，避免过期令牌打出误导性 401。
 * @param {{ allowBackgroundTab?: boolean, forceRenewal?: boolean }} [options]
 *        allowBackgroundTab=false 时跳过后台开页续期（popup 请求路径），默认 true；
 *        forceRenewal=true 时绕过 10 分钟限速立即开页续期（401 自愈路径专用：
 *        失败信号明确，且作废豁免期保证最坏频率 ≥ 1 次/5 分钟），默认 false
 */
export async function getKimiAccessToken({ allowBackgroundTab = true, forceRenewal = false } = {}) {
  const record = await loadKimiTokenRelay();
  const isStale = !record?.accessToken || (Date.now() - record.capturedAt) > KIMI_TOKEN_STALE_MS;

  if (isStale) {
    try {
      // 同时匹配 www 与裸域（用户可能处于无 www 重定前的地址）
      const tabs = await chrome.tabs.query({ url: ['https://www.kimi.com/*', 'https://kimi.com/*'] });
      if (tabs.length > 0) {
        // 第一轮：并行索取，取首个成功响应
        let hit = pickFirstTokenResult(await queryKimiTokensFromTabs(tabs));
        if (hit && isInvalidatedToken(hit.accessToken)) {
          console.warn('[KimiRelay] 标签页回报的令牌与近期作废的死令牌相同，视为未命中');
          hit = null;
        }
        if (hit) {
          await saveKimiTokenRelay(hit);
          return hit.accessToken;
        }

        // 第一轮全部失败：对匹配标签页编程式注入 content script 后重试一次。
        // 重复注入已有脚本的标签页无害（幂等，脚本自身无去重需求）；
        // 注入后脚本立即执行启动上报并注册应答监听器，故可再次 sendMessage 索取。
        console.warn('[KimiRelay] 各标签页均未响应令牌询问，尝试编程式注入 content script 后重试');
        let injected = false;
        for (const tab of tabs) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['scripts/kimi-content.js'],
            });
            injected = true;
          } catch (err) {
            // 标签页可能处于 chrome:// 等不可注入状态，跳过该标签页
            console.warn(`[KimiRelay] 标签页 ${tab.id} 注入失败:`, err.message);
          }
        }

        if (injected) {
          hit = pickFirstTokenResult(await queryKimiTokensFromTabs(tabs));
          if (hit && isInvalidatedToken(hit.accessToken)) {
            console.warn('[KimiRelay] 注入重试回报的令牌与近期作废的死令牌相同，视为未命中');
            hit = null;
          }
          if (hit) {
            await saveKimiTokenRelay(hit);
            return hit.accessToken;
          }
        }
      }
    } catch (err) {
      console.warn('[KimiRelay] 向标签页索取令牌失败:', err.message);
    }

    // 兜底续期：标签页索取/注入均失败（含无 kimi.com 标签页场景）时，
    // 后台开页触发页面自动续期。10 分钟限速（持久化，SW 重启后仍生效）避免后台页刷屏。
    // allowBackgroundTab=false（popup 请求路径）时跳过：15s+ 的等加载+轮询不得阻塞 popup 首屏，
    // 镜像续期由 relay 周期推送路径（默认 true）负责。
    if (!allowBackgroundTab) {
      // popup 请求路径：跳过后台开页续期，且**不返回陈旧令牌**——过期令牌会打出误导性 401
      // （「登录态同步失败（unauthenticated）」）。返回 null 让调用方走 Code API Key 兜底
      // 或双引导文案；镜像续期由 relay 周期推送 / credentialCheck 闹钟负责恢复新鲜
      console.log('[KimiRelay] popup 请求路径：镜像陈旧且索取失败，返回 null（不返回过期令牌）');
      return null;
    }
    const now = Date.now();
    const lastRefresh = await readLastTabRefresh();
    // forceRenewal（401 自愈路径）凭明确失败信号绕过限速立即续期一次；
    // 仍写入时间戳推窗，作废豁免期（5 分钟）天然限制最坏频率（黑洞 B 之一）
    if (forceRenewal || now - lastRefresh >= BACKGROUND_TAB_MIN_INTERVAL_MS) {
      await writeLastTabRefresh(now);
      const refreshed = await refreshTokenViaBackgroundTab(record?.capturedAt || 0);
      if (refreshed) {
        return refreshed;
      }
    } else {
      console.log(`[KimiRelay] 后台续期限流中（${Math.round((BACKGROUND_TAB_MIN_INTERVAL_MS - (now - lastRefresh)) / 1000)}s 后解禁），沿用旧镜像`);
    }
  }

  return record?.accessToken || null;
}
