/**
 * AI Quota Data Bridge — Background Service Worker（瘦入口）
 *
 * 浏览器扩展按已配置服务拉取配额数据（GLM/Kimi/MiMo）并推送到 VSCode，
 * VSCode 端收到后直接使用（Data Bridge 数据推送），无需手动配置。
 * 凭证失效检测 + 后台自动刷新（浏览器自身拉数仍依赖有效凭证）。
 *
 * 本文件仅负责：init 流程、事件监听注册（onInstalled/onStartup/alarms/
 * cookies.onChanged/storage.onChanged/onMessage/commands/permissions）与跨模块编排调用。
 * 具体职责见 scripts/lib/ 各子模块：
 * - lib/config-sync.js    监控目标 / 显示名称 / 刷新间隔配置
 * - lib/bridge-client.js  Bridge 端口发现 / 推送 / 重试队列 / 互斥锁
 * - lib/cookie-utils.js   Cookie 读取与 JWT 挑选共享工具
 * - lib/credential.js     凭证缓存 / TTL / 失效探测 / 后台标签页刷新
 * - lib/kimi-relay.js     Kimi access_token 被动镜像
 * - lib/relay.js          配额数据采集 / 推送 / 防抖与频率限制
 */

// 协议常量单一可信源（消息 action 名 / 快速检查间隔，与 VSCode 端镜像对齐）
import { BRIDGE_FAST_CHECK_INTERVAL_MS, MSG } from '../protocol/index.js';
import {
	activeKinds,
	loadActiveKinds,
	applyServicesConfig,
	loadRefreshInterval,
	clampRefreshIntervalSeconds,
	updateRefreshIntervalMs,
	refreshIntervalMs,
	COOKIE_TARGETS,
} from './lib/config-sync.js';
import { BRIDGE, discoverPort, retryPending, loadPending } from './lib/bridge-client.js';
import {
	checkCredentialValidity,
	loadCredentialCache,
	probeCachedCredential,
	clearCredentialCache,
	shouldForceRefresh,
	isAutoRefreshEnabled,
	loadCredentialViaBackgroundTab,
	recordRefresh,
} from './lib/credential.js';
import { saveKimiTokenRelay, getKimiAccessToken, invalidateKimiTokenRelay, setOnTokenRenewedHook, sweepRenewalTabs } from './lib/kimi-relay.js';
import { relayData } from './lib/relay.js';

// 新 Kimi 令牌经镜像入库（页面换发 / 续期页收敛）时：广播 COOKIE_CHANGED 让打开的
// popup/dashboard 即时单服务刷新，同时 relayData(true) 把新数据即时推给 VSCode，
// 不必等下一轮 healthCheck 周期（R3：新令牌的数据不积压）
setOnTokenRenewedHook(() => {
  chrome.runtime.sendMessage({ action: MSG.COOKIE_CHANGED, kind: 'kimi' }).catch(() => {
    // 无监听者（Popup/Dashboard 未打开），忽略
  });
  relayData(true).catch(() => { /* 推送失败由重传队列兜底 */ });
});

// ===== 凭证失效检测 + 自动刷新（编排层：检测在 credential，数据推送在 relay）=====

/** 凭证失效刷新的下限间隔（10 分钟）：避免每轮 credentialCheck 重复刷新 */
const CREDENTIAL_REFRESH_MIN_GAP_MS = 10 * 60 * 1000;

/** 各 kind 上一轮凭证检测结果：用于 invalid→valid 翻转检测（翻转时补一次即时推送，R3） */
const lastCredentialStatus = {};

/** 定期检查所有活跃服务的凭证状态，失效则自动刷新
 *
 * 策略：
 * 1. 凭证 missing/expired/invalid → 强制刷新（受 10 分钟下限间隔 gate）
 * 2. 凭证 valid 但超过刷新间隔 → 预防性刷新（针对 Cookie 类服务）
 *    因为服务器端 session 可能已过期，但客户端 cookie 仍存在
 */
async function checkAndRefreshCredentials() {
  console.log('[Credential] 开始凭证检测循环...');
  for (const kind of activeKinds) {
    let status = await checkCredentialValidity(kind);
    console.log(`[Credential] ${kind} 凭证状态: ${status}`);

    // MiMo 特殊处理：session cookie 可能已消失，但本地缓存仍有效
    // （kimi 走 relay 镜像检测链，不返回 missing，天然不适用）
    if (kind === 'mimo' && status === 'missing') {
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
    // 失效刷新下限间隔：needsRefresh 每轮都成立时，10 分钟内最多真正刷新一次
    const refreshAllowed = needsRefresh
      ? await shouldForceRefresh(kind, CREDENTIAL_REFRESH_MIN_GAP_MS)
      : true;
    const isCookieService = !COOKIE_TARGETS[kind]?.storageKey;
    // 对 Cookie 类服务，仅在状态未知时定期探测性刷新
    const shouldPreventiveRefresh = isCookieService && status === 'unknown'
      && await shouldForceRefresh(kind);

    if ((needsRefresh && refreshAllowed) || shouldPreventiveRefresh) {
      const reason = needsRefresh ? '凭证失效' : '预防性刷新';
      console.log(`[Credential] ${kind} ${reason}，开始刷新...`);

      let refreshed = false;
      if (kind === 'kimi') {
        // kimi 的续期已在 checkCredentialValidity 内经 kimi-relay 完成
        //（镜像鲜度判定 + 标签页索取/注入 + 限速后台页），无需再走 cookie 刷新链
        console.log('[Credential] kimi: relay 续期已尝试，跳过 cookie 后台刷新链');
        // R3：凭证链本轮完成续期（invalid → valid 翻转）时补一次即时推送，
        // 新令牌的数据不必等下一 healthCheck 周期
        if (status === 'valid' && lastCredentialStatus[kind] === 'invalid') {
          console.log(`[Credential] ${kind} 凭证由失效恢复有效，触发即时推送`);
          refreshed = true;
        }
      } else if (kind === 'mimo') {
        // MiMo 使用后台非激活标签页刷新（携带用户 same-site 登录态）
        const autoRefresh = await isAutoRefreshEnabled(kind);
        if (autoRefresh) {
          refreshed = !!(await loadCredentialViaBackgroundTab(kind));
        } else {
          console.log(`[Credential] ${kind}: 未开启自动刷新，跳过后台访问`);
        }
      } else {
        // 仅 glm（storage 类凭证）会走到此分支，无自动刷新载体，直接跳过
        console.log(`[Credential] ${kind}: storage 类凭证，无自动刷新，跳过`);
      }

      if (refreshed) {
        console.log(`[Credential] ${kind} 刷新成功，立即推送最新数据到 VSCode`);
        await recordRefresh(kind);
        await relayData(true);
      } else if (needsRefresh) {
        console.warn(`[Credential] ${kind} 刷新失败或受限流 gate 拦截，跳过推送`);
      }
    } else {
      if (needsRefresh && !refreshAllowed) {
        console.log(`[Credential] ${kind} 凭证失效但距上次刷新不足 10 分钟，跳过本轮`);
      } else {
        console.log(`[Credential] ${kind} 凭证有效且未到刷新间隔，跳过`);
      }
    }

    lastCredentialStatus[kind] = status;
  }
  console.log('[Credential] 凭证检测循环结束');
}

// ===== 定期任务调度（alarms）=====

/** 动态调整健康检查间隔 */
/** 已调度的 healthCheck 周期（毫秒）：alarm 处理器据此自校正。
 *  连接可经 init / RECONNECT / 推送重试等「闹钟外」路径建立，这些路径不会重排 alarm，
 *  若不校正，断开时的 10s 快速档会一直存活，推送周期被架空为 10s（R4） */
let scheduledHealthPeriodMs = 0;

function scheduleHealthCheck() {
  // 清除现有 alarm
  chrome.alarms.clear('healthCheck');
  // 已连接时使用用户配置的刷新间隔，未连接时使用更短的间隔保证快速发现
  const interval = BRIDGE.activePort ? refreshIntervalMs : Math.min(refreshIntervalMs, BRIDGE_FAST_CHECK_INTERVAL_MS);
  scheduledHealthPeriodMs = interval;
  const periodMinutes = Math.max(interval / 60000, 0.5);
  chrome.alarms.create('healthCheck', { periodInMinutes: periodMinutes });
  console.log(`[Alarm] healthCheck 已调度，周期: ${Math.round(periodMinutes * 60)}s`);
}

/** 端口发现统一入口：建立连接时广播 BRIDGE_CONNECTED 给 popup/dashboard，
 *  让桥卡即时刷新（否则 GET_STATUS 非阻塞后，桥卡要等下一刷新周期才收敛，R5） */
async function discoverPortAndBroadcast() {
  const found = await discoverPort();
  if (found) {
    chrome.runtime.sendMessage({ action: MSG.BRIDGE_CONNECTED, port: BRIDGE.activePort }).catch(() => {
      // 无监听者（popup/dashboard 未打开），忽略
    });
  }
  return found;
}

/** 确保 credentialCheck alarm 存在（避免 Service Worker 重启后丢失）。
 *  周期 = max(刷新间隔, 5 分钟)：凭证探测是带凭证的网络请求，60s 刷新间隔下
 *  不再每 60s 全量探测（P2-1），5 分钟足够及时发现失效 */
async function ensureCredentialAlarm() {
  await chrome.alarms.clear('credentialCheck');
  const periodMinutes = Math.max(refreshIntervalMs / 60000, 5);
  chrome.alarms.create('credentialCheck', { periodInMinutes: periodMinutes });
  console.log(`[Alarm] credentialCheck alarm 已创建，周期: ${Math.round(periodMinutes * 60)}s`);
}

// ===== 事件监听 =====

// 配置监听：动态更新监控目标 + 配置变更后推送最新配额数据
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // 配置变更（添加/删除服务）
  if (changes.dashboardConfig) {
    const newConfig = changes.dashboardConfig.newValue;
    const services = newConfig?.services ?? [];
    applyServicesConfig(services);
    console.log('[Config] 监控目标已更新:', [...activeKinds]);
    // 配置变更后按新的活跃服务列表推送对应配额数据
    relayData(true);

    // 刷新间隔变更时重新调度 alarms
    const newSeconds = newConfig?.settings?.refreshInterval;
    if (typeof newSeconds === 'number' && !Number.isNaN(newSeconds)) {
      const clampedSeconds = clampRefreshIntervalSeconds(newSeconds);
      const newIntervalMs = clampedSeconds * 1000;
      if (newIntervalMs !== refreshIntervalMs) {
        updateRefreshIntervalMs(newIntervalMs);
        console.log(`[Config] 刷新间隔已更新: ${newIntervalMs}ms (${clampedSeconds}s)`);
        scheduleHealthCheck();
        ensureCredentialAlarm();
      }
    }
  }

  // GLM API Key 变化：不再触发推送（浏览器自身拉数使用），
  // 变更后下一次 relayData 会自然带上最新数据
});

// Cookie 变化监听（仅关注处于活跃状态的凭证目标）
// 注意：不再触发数据推送（Data Bridge 推送配额数据，而非凭证）；
// 仅保留 MSG.COOKIE_CHANGED 广播给 Popup / Dashboard，作为单服务数据刷新信号
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

    // Kimi 改名场景：新 JWT cookie 名字不在 names 中，但 value 呈 JWT 形态（eyJ 开头），
    // 同样视为凭证变化触发单服务刷新（其他 kind 行为不变；removed 事件的 value 仍在 changeInfo 中）
    if (kind === 'kimi' && cookie.value && cookie.value.startsWith('eyJ')) {
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

  // 通知 Popup / Dashboard 即时刷新对应服务
  chrome.runtime.sendMessage({ action: MSG.COOKIE_CHANGED, kind: matchedKind }).catch(() => {
    // 无监听者（Popup/Dashboard 未打开），忽略
  });
});

// 扩展安装 / 启动时统一调用 init
chrome.runtime.onInstalled.addListener(() => init());

chrome.runtime.onStartup.addListener(() => init());

// 定期任务：健康检查 + 凭证检测

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'healthCheck') {
    // 续期页周期清扫：与 relay 链解耦，保证超期残留续期页必定被回收
    sweepRenewalTabs().catch(() => { /* 清扫失败由下一轮 alarm 兜底 */ });
    if (!BRIDGE.activePort) {
      discoverPortAndBroadcast().then((found) => {
        if (found) {
          retryPending();
          // 连接成功后调整检查间隔并立即推送一轮数据
          scheduleHealthCheck();
          relayData(true);
        }
      });
    } else {
      // 已连接：周期推送前自校正 alarm 周期（连接经闹钟外路径建立时，快速档可能未收敛）
      if (scheduledHealthPeriodMs !== refreshIntervalMs) {
        scheduleHealthCheck();
      }
      // 已连接：按用户刷新间隔（refreshIntervalMs，见 scheduleHealthCheck）
      // 周期推送最新配额数据，保证 VSCode 端稳态数据不冻结。
      // relayData(false) 受 RELAY_MIN_INTERVAL_MS 节流，不会刷爆
      relayData(false);
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
  if (msg.action === MSG.RELAY_NOW) {
    relayData(true)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 手动触发 Data Bridge 重连：重新端口发现 → 恢复重传队列 → 立即推送一轮。
  // 最坏 ~22s（11 端口串行探测 × 2s 超时），调用方（popup 重连按钮）需展示等待态
  if (msg.action === MSG.RECONNECT_BRIDGE) {
    (async () => {
      const found = await discoverPortAndBroadcast();
      if (found) {
        retryPending();
        await relayData(true);
      }
      return { success: found, port: BRIDGE.activePort };
    })()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === MSG.GET_STATUS) {
    // 非阻塞响应：立即返回上次已知状态。端口发现（最坏 ~22s 串行探测）放后台异步执行，
    // 不得卡在 popup 首屏配额请求之前（发现成功后 BRIDGE 状态更新，下次查询自然带上）。
    if (!BRIDGE.activePort) {
      discoverPortAndBroadcast().catch(() => { /* 探测失败保留 lastError，下次再试 */ });
    }
    sendResponse({
      connected: !!BRIDGE.activePort,
      port: BRIDGE.activePort,
      activeKinds: [...activeKinds],
      lastError: BRIDGE.lastError,
    });
    return false;
  }

  // 配置变更通知（popup 保存配置后发送）
  // 注意：storage.onChanged 监听器已负责更新 activeKinds、调度 alarms 和 relayData，
  // 此处不再重复 relayData（避免双重推送），仅兜底确保端口已连接，
  // storage.onChanged 的 relayData 会在端口就绪后实际推送。
  if (msg.action === MSG.CONFIG_UPDATED) {
    loadActiveKinds().then(async () => {
      await discoverPort();
      sendResponse({ success: true });
    });
    return true;
  }

  // 手动触发凭证检测 + 刷新
  if (msg.action === MSG.CHECK_CREDENTIALS) {
    checkAndRefreshCredentials()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // content script 上报的 Kimi 令牌镜像（新鉴权机制，见 scripts/kimi-content.js）
  if (msg.action === MSG.KIMI_TOKEN_UPDATED) {
    saveKimiTokenRelay(msg)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  // api 侧上报 relay 令牌被网页 API 401 拒绝：作废镜像并触发全链重续期
  //（含后台开页兜底；popup 无法直接清 background 内存镜像，必须经此消息）
  if (msg.action === MSG.KIMI_TOKEN_INVALID) {
    (async () => {
      await invalidateKimiTokenRelay();
      // 401 是明确失败信号：forceRenewal 绕过 10 分钟限速立即重续期
      //（作废豁免期兜底，最坏频率仍 ≥ 1 次/5 分钟）
      const token = await getKimiAccessToken({ forceRenewal: true });
      if (token) {
        // 续期成功：立即推 VSCode + 广播凭证变化让 popup 刷新 Kimi 卡。
        // 否则 popup 错误卡要等错误缓存过期（最长 5 分钟）、VSCode 要等下一轮周期（黑洞 B）
        chrome.runtime.sendMessage({ action: MSG.COOKIE_CHANGED, kind: 'kimi' }).catch(() => {
          // 无监听者（popup/dashboard 未打开），忽略
        });
        relayData(true).catch(() => { /* 推送失败由重传队列兜底 */ });
      }
      return { success: Boolean(token) };
    })()
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  // popup 侧按需索取 relay 镜像的 Kimi access_token（api/kimi.js 调用）
  // fire-and-forget 续期不阻塞首屏：镜像陈旧时会顺带确保续期后台页存在并立即返回，
  // 新令牌经镜像收敛后，popup 下次刷新即可拿到
  if (msg.action === MSG.GET_KIMI_TOKEN) {
    getKimiAccessToken()
      .then(token => sendResponse({ token: token || null }))
      .catch(() => sendResponse({ token: null }));
    return true;
  }
});

// 打开 Dashboard 页面（快捷键触发，当没有 default_popup 时生效）
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});

// 当用户授予 Cookie 等权限后，立即重新推送最新配额数据
if (chrome.permissions?.onAdded) {
	chrome.permissions.onAdded.addListener(() => {
		console.log('[Permissions] 权限变更，重新推送数据');
		relayData(true);
	});
}

// ===== 初始化 =====

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

	// 启动后按当前活跃服务列表尝试连接并推送最新配额数据
	const found = await discoverPortAndBroadcast();
	if (found) {
		await relayData(true);
		// 初次安装/浏览器启动后，凭证恢复或权限授予可能稍有延迟，5 秒后再兜底重试一次
		setTimeout(() => relayData(true), 5000);
	}
}

init();
