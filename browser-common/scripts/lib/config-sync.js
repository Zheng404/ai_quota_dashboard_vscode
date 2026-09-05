/**
 * 监控目标与刷新间隔配置 — background 子模块
 *
 * 职责：Cookie/凭证目标配置（COOKIE_TARGETS）、活跃服务推导与状态
 * （activeKinds / activeDisplayNames，ESM live binding 供其他模块读取）、
 * 刷新间隔加载与钳制（refreshIntervalMs）。
 *
 * 依赖：仅 protocol（依赖图底层，杜绝循环引用）。
 */

// ===== Cookie / 凭证目标配置（全量定义，按需启用）=====

export const COOKIE_TARGETS = {
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

// 各 AI 服务的默认显示名称（用于推送 displayNames 给 VSCode 端）
const SERVICE_LABELS = {
  glm: 'GLM Coding Plan (CN)',
  kimi: 'Kimi Membership',
  mimo: 'Xiaomi MiMo Token Plan',
};

// ===== 当前活跃的监控目标（从 dashboardConfig.services 推导）=====
// 说明：以 ESM live binding 导出（let 声明，本模块内重赋值），
// relay/background 等模块 import 后读取到的始终是最新值。

export let activeKinds = new Set();
export let activeDisplayNames = {};

/** 从 services 配置推导需要监控的 kind 列表 */
export function deriveActiveKinds(services) {
  const kinds = new Set();
  if (!Array.isArray(services)) return kinds;
  for (const svc of services) {
    if (svc.enabled !== false && COOKIE_TARGETS[svc.kind]) {
      kinds.add(svc.kind);
    }
  }
  return kinds;
}

/** 从 services 配置推导各 AI 服务的显示名称映射（kind -> displayName） */
export function deriveDisplayNames(services) {
  const names = {};
  if (!Array.isArray(services)) return names;
  for (const svc of services) {
    if (svc.enabled !== false && COOKIE_TARGETS[svc.kind]) {
      names[svc.kind] = (typeof svc.name === 'string' && svc.name.trim())
        ? svc.name.trim()
        : (SERVICE_LABELS[svc.kind] || svc.kind);
    }
  }
  return names;
}

/** 应用新的 services 配置，更新活跃目标状态（loadActiveKinds 与 storage.onChanged 共用） */
export function applyServicesConfig(services) {
  activeKinds = deriveActiveKinds(services);
  activeDisplayNames = deriveDisplayNames(services);
}

/** 从 storage 加载 dashboardConfig 并推导活跃目标 */
export async function loadActiveKinds() {
  try {
    const stored = await chrome.storage.local.get('dashboardConfig');
    const services = stored.dashboardConfig?.services ?? [];
    applyServicesConfig(services);
    console.log('[Config] 活跃服务列表:', [...activeKinds]);
  } catch (err) {
    console.error('[Config] 加载配置失败:', err);
    activeKinds = new Set();
    activeDisplayNames = {};
  }
}

// ===== 刷新间隔（refreshIntervalMs，live binding 供 alarm 调度读取）=====

export let refreshIntervalMs = 60_000;
const MIN_REFRESH_INTERVAL_MS = 30_000;
const MAX_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function clampRefreshIntervalSeconds(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds <= 0) return 60;
  return Math.max(MIN_REFRESH_INTERVAL_MS / 1000, Math.min(MAX_REFRESH_INTERVAL_MS / 1000, seconds));
}

export async function loadRefreshInterval() {
  try {
    const stored = await chrome.storage.local.get('dashboardConfig');
    const seconds = stored.dashboardConfig?.settings?.refreshInterval;
    const clampedSeconds = clampRefreshIntervalSeconds(seconds);
    refreshIntervalMs = clampedSeconds * 1000;
    console.log(`[Config] 加载刷新间隔: ${refreshIntervalMs}ms (${clampedSeconds}s)`);
  } catch (err) {
    console.error('[Config] 加载刷新间隔失败:', err);
    refreshIntervalMs = 60_000;
  }
}

/** 直接写入刷新间隔（毫秒）。ESM import binding 只读，外部模块经此函数更新 live binding */
export function updateRefreshIntervalMs(ms) {
  refreshIntervalMs = ms;
}
