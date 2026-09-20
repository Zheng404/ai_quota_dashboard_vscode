/**
 * Kimi 访问令牌被动镜像 — background 子模块
 *
 * kimi-auth Cookie 已被 Kimi 废弃（停止续期+签名轮换），新凭证为页面
 * localStorage.access_token（约 15 分钟有效，网页自动续期）。此处仅被动镜像，
 * 绝不调用 RefreshToken 端点（单消费者，接管会踢用户网页下线）。
 * 见 scripts/kimi-content.js（content script 上报方）。
 *
 * 无 kimi.com 标签页导致镜像陈旧时，兜底创建后台非激活标签页触发网页续期
 * （10 分钟限速，fire-and-forget）：绝不在 SW 内长等待——纯定时器等待下 MV3 SW
 * 约 30s 即被回收，finally 不执行会残留死续期页，死页又被「复用」命中导致续期
 * 永远空等（自动续期失活的事故链）。新令牌由 content script 上报经镜像收敛，
 * 后续 relay 周期自然消费；续期页在镜像变新鲜或存活超 15 分钟后自动关闭，
 * 由 URL hash 标记（#aqd-renewal）+ tabId 跟踪表双标识识别，杜绝误复用/残留。
 *
 * 依赖：protocol（消息 action / 超时）、cookie-utils（凭证 TTL）。
 */

import { TIMEOUTS, MSG } from '../../protocol/index.js';
import { CREDENTIAL_TTL_MS } from './cookie-utils.js';

/** relay 镜像的 storage.local 键名（SW 重启后不丢） */
const KIMI_TOKEN_STORAGE_KEY = 'kimiTokenRelay';
/** access_token 有效期约 15 分钟，超过 10 分钟视为陈旧，优先向页面实时索取 */
const KIMI_TOKEN_STALE_MS = 10 * 60 * 1000;
/** 令牌新鲜度余量：exp 距现在不足 60s 即视为陈旧（即将过期的令牌武装镜像只会打出 401） */
const TOKEN_FRESH_MARGIN_MS = 60_000;

/**
 * 解析 JWT payload 的 exp（秒）。非 JWT 或解析失败返回 null。
 * 新鲜度判定以 exp 为准：content script 重复上报同一旧令牌时会刷新 capturedAt，
 * 单纯依赖 capturedAt 会把旧令牌误判为「新鲜」（续期后台页被提前关页的根因）。
 */
function readJwtExp(token) {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/** 令牌按 exp 判定是否新鲜（非 JWT 回退 capturedAt 陈旧阈值） */
function isFreshToken(token, capturedAt) {
  const exp = readJwtExp(token);
  if (exp != null) return exp * 1000 - Date.now() > TOKEN_FRESH_MARGIN_MS;
  return Date.now() - (capturedAt || 0) <= KIMI_TOKEN_STALE_MS;
}

/**
 * 后台标签页续期的限速参数：
 * relay 周期推送默认 600s 一轮，若每轮镜像都陈旧会周期性弹后台标签页，
 * 10 分钟限速保证最坏情况下每小时最多开 6 次后台页（通常远少于此）。
 * 限速时间戳持久化到 storage.local（键 kimiRelayLastTabRefresh），
 * SW 休眠/重启后仍然生效（仿 credential.js bridgeLastRefresh_* 模式）。
 */
const BACKGROUND_TAB_MIN_INTERVAL_MS = 10 * 60 * 1000;
/** 续期页最大存活时间：到期即视为残留关闭（access_token 全生命周期仅 15 分钟，
 *  存活超过 15 分钟的续期页绝无可能再写出新令牌） */
const RENEWAL_TAB_MAX_AGE_MS = 15 * 60 * 1000;
/** 同一续期页创建后的最小保留窗口：防止并发的 401 双请求触发「创建后立即重载」抖动 */
const RENEWAL_TAB_MIN_CREATE_GAP_MS = 30_000;
/** 限速时间戳的 storage.local 键名 */
const LAST_TAB_REFRESH_KEY = 'kimiRelayLastTabRefresh';
/** 续期页 URL hash 标记：识别本扩展创建的续期页（SW 回收残留后仍可信标清理/复用） */
const RENEWAL_HASH = '#aqd-renewal';
/** 续期用后台标签页的目标地址（带 hash 标记） */
const RENEWAL_TAB_URL = `https://www.kimi.com/${RENEWAL_HASH}`;
/** 本扩展创建的续期页跟踪表（tabId + 创建时间）的 storage.local 键名 */
const RENEWAL_TABS_KEY = 'kimiRenewalTabs';

/** 内存镜像（SW 存活期间免读 storage） */
let kimiTokenMemory = null;

/** 新令牌入库通知钩子（background.js 注入：广播 COOKIE_CHANGED 给 popup/dashboard
 *  单服务刷新 + relayData(true) 即时推送 VSCode）。依赖反转注入而非 import relay.js，
 *  避免 kimi-relay ↔ relay 循环依赖。 */
let onTokenRenewedHook = null;

/** 注册新令牌入库钩子（重复注册覆盖，background 启动时调用一次） */
export function setOnTokenRenewedHook(fn) {
  onTokenRenewedHook = typeof fn === 'function' ? fn : null;
}

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
 *  不会重新武装镜像）。
 *  与现有镜像相同或过期时间更早的令牌上报直接跳过（content script 启动/60s 轮询/
 *  续期页加载都会立即重报页面 localStorage 里的旧令牌）：保存会让旧令牌借新的
 *  capturedAt 伪装新鲜，导致续期等待误判成功、提前关闭续期后台页（自动续期失效的根因）。 */
export async function saveKimiTokenRelay(payload) {
  if (isInvalidatedToken(payload?.accessToken)) {
    console.warn('[KimiRelay] 上报令牌与近期作废的死令牌相同，拒绝入库');
    return;
  }
  const existing = kimiTokenMemory ?? await loadKimiTokenRelay();
  if (payload?.accessToken && existing?.accessToken) {
    // 两种上报不覆盖现有镜像：
    // ① 同一令牌重复上报（不重置 capturedAt，防旧令牌借新时间戳伪装新鲜）；
    // ② 过期时间更早的滞后令牌（多标签页场景下旧页未刷新、重报更旧的令牌值，
    //    不得让镜像倒退）。新换发的令牌 exp 必然更晚，正常上报不受影响。
    const existingExp = readJwtExp(existing.accessToken);
    const incomingExp = readJwtExp(payload.accessToken);
    if (payload.accessToken === existing.accessToken
      || (existingExp != null && incomingExp != null && incomingExp <= existingExp)) {
      console.log('[KimiRelay] 上报令牌不新于现有镜像，跳过保存');
      return;
    }
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
  // 镜像已更新（续期使命完成）：fire-and-forget 关闭续期后台页
  void closeRenewalTabs();
  // 通知 background：新令牌已入库，即时刷新 popup/dashboard 卡片并推送 VSCode
  if (onTokenRenewedHook) {
    try { onTokenRenewedHook(record); } catch { /* 钩子异常不影响入库 */ }
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
 * 存在 accessToken 且按 exp（JWT 过期时间）判定未临近过期；
 * 非 JWT 令牌回退 capturedAt 陈旧阈值。
 * credential.js 的凭证检测链（checkKimiRelayValidity）依赖此判定。
 */
export function isFreshRecord(record) {
  return Boolean(record?.accessToken)
    && isFreshToken(record.accessToken, record.capturedAt);
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

// ===== 续期后台标签页管理（fire-and-forget：SW 内零长等待，防回收残留死页）=====

/** 读取续期页跟踪表（tabId → createdAt） */
async function readRenewalTabIds() {
  try {
    const result = await chrome.storage.local.get(RENEWAL_TABS_KEY);
    const list = result[RENEWAL_TABS_KEY];
    return new Map(Array.isArray(list) ? list.map(e => [e.id, e.createdAt || 0]) : []);
  } catch {
    return new Map();
  }
}

/** 写回续期页跟踪表（整表覆写，条目为 { id, createdAt }） */
async function writeRenewalTabIds(tracked) {
  try {
    await chrome.storage.local.set({
      [RENEWAL_TABS_KEY]: [...tracked].map(([id, createdAt]) => ({ id, createdAt })),
    });
  } catch { /* ignore */ }
}

/** 关闭并取消跟踪本扩展续期页（含 SW 回收残留的 hash 标记页）。
 *  绝不关闭用户正在查看的激活页（tab.active）——续期使命已完成也不夺人所看，
 *  激活页留在跟踪表内，转为非激活后由时龄清理接手。 */
async function closeRenewalTabs() {
  const marked = await listMarkedRenewalTabs({ skipAgeOut: true });
  const closable = marked.filter(t => !t.active);
  for (const tab of closable) {
    try { await chrome.tabs.remove(tab.id); } catch { /* 页可能已被用户关闭 */ }
  }
  if (closable.length > 0) {
    const tracked = await readRenewalTabIds();
    for (const tab of closable) tracked.delete(tab.id);
    await writeRenewalTabIds(tracked);
    console.log(`[KimiRelay] 已关闭 ${closable.length} 个续期后台页`);
  }
}

/**
 * 列出本扩展创建的续期页（URL hash 标记或跟踪表命中）。
 * 超过 RENEWAL_TAB_MAX_AGE_MS 的非激活残留页顺手关闭并取消跟踪（激活页不夺人所看，
 * 保留跟踪待其非激活后下轮清理）；仅有 hash 标记但不在跟踪表的页按「现在」收养入表；
 * 已被用户关闭的死 tabId 从跟踪表剪除（只增不减会让存储无限累积）。
 */
async function listMarkedRenewalTabs({ skipAgeOut = false } = {}) {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://www.kimi.com/*', 'https://kimi.com/*'] });
    const tracked = await readRenewalTabIds();
    const now = Date.now();
    const alive = [];
    const expired = [];
    const adopted = [];
    const liveIds = new Set();
    for (const tab of tabs) {
      liveIds.add(tab.id);
      const hashMarked = (tab.url ?? '').includes(RENEWAL_HASH);
      if (!hashMarked && !tracked.has(tab.id)) continue;
      if (!tracked.has(tab.id)) { tracked.set(tab.id, now); adopted.push(tab.id); }
      const createdAt = tracked.get(tab.id) ?? now;
      (now - createdAt > RENEWAL_TAB_MAX_AGE_MS ? expired : alive).push(tab);
    }
    // 剪除已被用户关闭的死 tabId（liveIds 外的跟踪条目）
    let pruned = false;
    for (const id of tracked.keys()) {
      if (!liveIds.has(id)) { tracked.delete(id); pruned = true; }
    }
    if (adopted.length > 0 || pruned) await writeRenewalTabIds(tracked);
    if (!skipAgeOut) {
      const closable = expired.filter(t => !t.active);
      for (const tab of closable) {
        try { await chrome.tabs.remove(tab.id); } catch { /* ignore */ }
      }
      if (closable.length > 0) {
        for (const tab of closable) tracked.delete(tab.id);
        await writeRenewalTabIds(tracked);
        console.log(`[KimiRelay] 清理 ${closable.length} 个超期续期残留页`);
      }
    }
    return alive;
  } catch {
    return [];
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

/** 续期页确保操作的并发护栏（并发 401 双请求同时进入时只放行一次） */
let ensureRenewalInFlight = false;

/**
 * 确保存在一个工作中的续期后台页（fire-and-forget，立即返回）：
 * 新令牌由续期页 content script 上报、经 saveKimiTokenRelay 落镜像收敛，
 * 后续 relay 周期自然消费——不在此长等待（MV3 SW 在纯定时器等待下约 30s 即被回收，
 * finally 不执行会残留死续期页，死页又被复用逻辑命中导致续期永远空等）。
 *
 * 行为：
 * - 已有存活续期页且非 forceRenewal → 直接复用（等其上报收敛）；
 * - forceRenewal（401 自愈）→ 重载现有页触发页面重新鉴权，或（无存活页时）新开一页；
 * - 新开受 10 分钟限速（先写时间戳后开页，失败也计窗口）。
 * @param {boolean} [forceRenewal] 401 自愈路径：绕过限速立即重载/新开
 */
async function ensureRenewalTab(forceRenewal = false) {
  if (ensureRenewalInFlight) return;
  ensureRenewalInFlight = true;
  try {
    if (!(await isKimiAutoRefreshEnabled())) {
      console.log('[KimiRelay] 用户已关闭 Kimi 自动后台续期，跳过开页');
      return;
    }

    const marked = await listMarkedRenewalTabs();
    const idle = marked.find(t => t.pinned && !t.active);
    const now = Date.now();

    if (idle && !forceRenewal) {
      console.log(`[KimiRelay] 续期后台页 ${idle.id} 工作中，等待镜像收敛`);
      return;
    }

    if (idle) {
      const tracked = await readRenewalTabIds();
      const createdAt = tracked.get(idle.id) ?? 0;
      if (now - createdAt < RENEWAL_TAB_MIN_CREATE_GAP_MS) {
        // 刚创建的页正在加载，避免并发 401 双请求触发创建后立即重载的抖动
        return;
      }
      await writeLastTabRefresh(now);
      try {
        await chrome.tabs.reload(idle.id);
        console.log(`[KimiRelay] 重载续期后台页 ${idle.id} 触发页面重新鉴权`);
      } catch (err) {
        console.warn('[KimiRelay] 重载续期页失败:', err.message);
      }
      return;
    }

    if (!forceRenewal) {
      const last = await readLastTabRefresh();
      if (now - last < BACKGROUND_TAB_MIN_INTERVAL_MS) {
        console.log(`[KimiRelay] 后台续期限流中（${Math.round((BACKGROUND_TAB_MIN_INTERVAL_MS - (now - last)) / 1000)}s 后解禁）`);
        return;
      }
    }

    await writeLastTabRefresh(now);
    // 无存活续期页：清理残留后新开（active=false + pinned + hash 标记）
    await closeRenewalTabs();
    try {
      const tab = await chrome.tabs.create({ url: RENEWAL_TAB_URL, active: false, pinned: true });
      const tracked = await readRenewalTabIds();
      tracked.set(tab.id, Date.now());
      await writeRenewalTabIds(tracked);
      console.log(`[KimiRelay] 已创建续期后台页 ${tab.id}，页面换发令牌后经镜像收敛`);
    } catch (err) {
      console.error('[KimiRelay] 创建续期后台页失败:', err.message);
    }
  } finally {
    ensureRenewalInFlight = false;
  }
}

/**
 * Kimi 凭证有效性检测（检测域上移：credential.js 的 checkCredentialValidity 调用）：
 * 镜像新鲜 → 'valid'；缺失/陈旧 → 触发 getKimiAccessToken 全链续期
 * （标签页索取/注入/fire-and-forget 后台页），随后重判——续期为异步收敛
 * （新令牌经镜像上报、由后续周期消费），故续期刚触发时可能仍判 'invalid'，
 * 下一轮 credentialCheck 自然翻转，不视为误报。
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
 * 镜像新鲜 → 直接供应，并顺手关闭已完成使命的续期页；
 * 镜像缺失/陈旧 → 先向已打开的 kimi.com 标签页实时索取（单个请求 2s 超时，
 * 取首个成功响应），全部失败/超时（典型场景：扩展重载后已打开的标签页没有
 * content script——manifest 注入仅发生在 document load 时）时编程式注入后重试一次；
 * 仍无新鲜令牌时 fire-and-forget 确保续期后台页存在（新令牌经镜像上报收敛，
 * 后续 relay 周期自然消费），并返回当前镜像值。
 *
 * 返回值语义：镜像有值（可能已过期）→ 原样返回，relay 用其请求打出 401 后走
 * 「作废 + forceRenewal 自愈」闭环；镜像为空 → null，调用方降级 Code API Key
 * 或展示引导文案。绝不在本函数内长等待——MV3 SW 在纯定时器等待下约 30s 即被
 * 回收，等待残留的死续期页会卡死后续复用（自动续期失活的事故链）。
 * @param {{ forceRenewal?: boolean }} [options]
 *        forceRenewal=true 时绕过 10 分钟开页限速立即重载/新开续期页
 *        （401 自愈路径专用：失败信号明确，且作废豁免期保证最坏频率 ≥ 1 次/5 分钟）
 */
export async function getKimiAccessToken({ forceRenewal = false } = {}) {
  const record = await loadKimiTokenRelay();

  // 镜像新鲜：直接供应；续期使命已完成，幂等关闭续期页（无续期页时零开销）
  if (isFreshRecord(record)) {
    void closeRenewalTabs();
    return record.accessToken;
  }

  // 镜像缺失/陈旧：先向已打开的 kimi.com 标签页索取（页面可能已换发新令牌）
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
      // 页面持有的令牌临近过期时不武装镜像（只会打出 401），视为未命中走续期链
      if (hit && !isFreshRecord(hit)) {
        console.warn('[KimiRelay] 标签页令牌临近过期，视为未命中，改走续期链');
        hit = null;
      }
      if (hit) {
        await saveKimiTokenRelay(hit);
        return hit.accessToken;
      }

      // 第一轮全部失败：编程式注入 content script 后重试一次。
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
        if (hit && !isFreshRecord(hit)) {
          console.warn('[KimiRelay] 注入重试令牌临近过期，视为未命中，改走续期链');
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

  // 兜底：确保续期后台页存在（fire-and-forget，立即返回；新令牌经镜像收敛）
  await ensureRenewalTab(forceRenewal);

  return record?.accessToken || null;
}
