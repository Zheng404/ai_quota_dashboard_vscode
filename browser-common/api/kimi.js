/**
 * Kimi API Client (Browser Extension)
 *
 * 双数据源模式：
 * ① 网页 token relay（唯一网页路径）：凭证为 content script 被动镜像的
 *    access_token（kimi.com 页面 localStorage，见 scripts/kimi-content.js），
 *    由 background 的 kimi-relay.js 维护（含后台页续期兜底）。
 *    注：kimi-auth Cookie 已被 Kimi 废弃（死 token），不再回退 Cookie 链。
 * ② Kimi Code API Key（兜底路径）：用户在设置页手动粘贴的 sk- 开头静态 Key，
 *    走 GET https://api.kimi.com/coding/v1/usages（纯 Bearer）。
 * 仅当网页凭证不可用时才降级到 Code API 路径。
 *
 * ⚠️ 数据解析函数需与 VSCode 扩展保持同步（两份独立实现，修改任一侧需手动同步另一侧）：
 * - 网页路径：vscode/src/services/kimi/provider.ts（旧版网页解析参考）与本文件 parseWindowSlot / parseMainSlot / parseBalanceSlot
 * - Code API 路径：vscode/src/services/kimi/provider.ts 的 fetchViaCodeApi 与本文件 parseCodeUsageSlot / parseCodeLimitsSlot 等同名函数
 * 当 API 响应格式变化时，两侧需同步修改。
 */

import { MSG } from '../protocol/index.js';

const KIMI_BASE_URL = 'https://www.kimi.com';

/** Kimi Code API 基础地址（国内站；国际站为 https://api.kimi.ai，按账号所属站点替换） */
const KIMI_CODE_API_BASE = 'https://api.kimi.com';
/** Kimi Code API Key 前缀（sk-kimi- 形态的静态 Key） */
const KIMI_CODE_KEY_PREFIX = 'sk-';

/**
 * r-timezone 请求头值（2026 年 Kimi WAF 校验需要，模块加载时求值一次）。
 * 注意：UA 与 Cookie 由浏览器 fetch 自动携带（手动设置会被禁止/覆盖），无需也无法手动设置。
 */
const R_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';

// ===== relay 镜像直读常量（判定口径与 scripts/lib/kimi-relay.js 的 readJwtExp/isFreshToken
// 保持一致：JWT 按 exp 判定、非 JWT 回退 capturedAt 陈旧阈值，popup 首屏短路用）=====
/** relay 镜像的 storage.local 键名（与 kimi-relay.js KIMI_TOKEN_STORAGE_KEY 同步） */
const KIMI_TOKEN_STORAGE_KEY = 'kimiTokenRelay';
/** 镜像新鲜阈值（与 kimi-relay.js KIMI_TOKEN_STALE_MS 同步，非 JWT 令牌的回退口径） */
const KIMI_TOKEN_STALE_MS = 10 * 60 * 1000;
/** 令牌新鲜度余量（与 kimi-relay.js TOKEN_FRESH_MARGIN_MS 同步）：exp 距现在不足 60s 视为陈旧 */
const TOKEN_FRESH_MARGIN_MS = 60_000;
/** popup 向 background 索取 token 的消息 deadline：超时就地降级，不阻塞首屏 */
const GET_TOKEN_MESSAGE_TIMEOUT_MS = 5000;

/**
 * 解析 JWT payload 的 exp（秒）。非 JWT 或解析失败返回 null。
 * 注意：本文件是 content-script 可用的独立模块，不能直接 import kimi-relay.js，
 * 此处为等价轻量实现，判定口径修改时需与 kimi-relay.js 手动同步。
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

/** 令牌按 exp 判定是否新鲜（非 JWT 回退 capturedAt 陈旧阈值，与 kimi-relay.js isFreshToken 同规则） */
function isFreshRelayToken(token, capturedAt) {
	const exp = readJwtExp(token);
	if (exp != null) return exp * 1000 - Date.now() > TOKEN_FRESH_MARGIN_MS;
	return Date.now() - (capturedAt || 0) <= KIMI_TOKEN_STALE_MS;
}

/**
 * popup/dashboard 直读 relay 镜像：令牌新鲜则免消息往返直接使用，
 * 把 background 应答延迟从关键路径上移除。
 * 新鲜度判定必须与 kimi-relay.js 的供应口径一致（按 exp，60s 余量），
 * 否则已过期令牌会被直读采用、直接打出 401 拖慢首屏。
 * @returns {Promise<string|null>} 新鲜 access_token 或 null
 */
async function readFreshRelayToken() {
	try {
		const result = await chrome.storage.local.get(KIMI_TOKEN_STORAGE_KEY);
		const record = result?.[KIMI_TOKEN_STORAGE_KEY];
		if (record?.accessToken && isFreshRelayToken(record.accessToken, record.capturedAt)) {
			return record.accessToken;
		}
	} catch { /* ignore，回退消息路径 */ }
	return null;
}

/**
 * 获取 Kimi 网页凭证。
 * 优先使用调用方注入的 tokenProvider（background relay 场景直接函数调用；
 * 不能依赖 runtime.sendMessage 自发自收——Firefox MV3 background 是 event page
 * frame，sender's frame 不接收自身消息，会导致 relay 链路永远拿不到 token、
 * 静默降级到 Code API Key 路径）。
 * 无注入时（popup/dashboard 页面）向 background 索取 relay 镜像的 access_token。
 * kimi-auth Cookie 已被 Kimi 废弃（死 token），不再回退 Cookie 扫描链。
 *
 * @param {{ tokenProvider?: () => Promise<string|null> }} [deps] 调用方依赖注入
 * @returns {Promise<{token: string|null, source: 'relay'|null}>}
 *          token 为 null 时 source 也为 null（调用方降级 Code API Key）
 */
async function getKimiAuthToken(deps) {
	// background relay 场景：直接调用 kimi-relay 的函数，不走消息通道
	if (typeof deps?.tokenProvider === 'function') {
		try {
			const token = await deps.tokenProvider();
			if (token) return { token, source: 'relay' };
		} catch (err) {
			console.warn('[KimiAPI] tokenProvider 调用失败:', err?.message);
		}
		console.warn('[KimiAPI] relay 镜像无可用 token（可能无 kimi.com 标签页或页面未刷新），降级 Code API Key 路径');
		return { token: null, source: null };
	}

	// 先直读 relay 镜像：新鲜令牌免消息往返，把 background 应答延迟移出首屏关键路径
	const fresh = await readFreshRelayToken();
	if (fresh) return { token: fresh, source: 'relay' };

	try {
		const resp = await Promise.race([
			chrome.runtime.sendMessage({ action: MSG.GET_KIMI_TOKEN }),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), GET_TOKEN_MESSAGE_TIMEOUT_MS)),
		]);
		if (resp?.token) {
			return { token: resp.token, source: 'relay' };
		}
		console.warn('[KimiAPI] relay 镜像无可用 token（可能无 kimi.com 标签页或页面未刷新），降级 Code API Key 路径');
		return { token: null, source: null };
	} catch (err) {
		console.warn('[KimiAPI] 向 background 索取 relay token 失败:', err?.message);
		return { token: null, source: null };
	}
}

/**
 * relay 令牌被网页 API 拒绝（401/unauthenticated）时通知 background 作废镜像并重续期。
 * fire-and-forget：绝不阻塞当前请求路径；防止死令牌被反复当作新鲜令牌供应。
 */
function notifyRelayTokenInvalid() {
	chrome.runtime.sendMessage({ action: MSG.KIMI_TOKEN_INVALID }).catch(() => { /* background 未就绪，忽略 */ });
}

/**
 * Kimi Connect 协议 POST 请求
 * @param {string} path 请求路径
 * @param {string} token Bearer Token
 * @param {object} [body] 请求体
 * @param {'relay'|null} [source] 凭证来源，
 *        用于 401 时给出分来源的引导文案（relay 令牌过期 ≠ 用户 Cookie 过期）
 */
async function kimiPost(path, token, body = {}, source = null) {
	const res = await fetch(`${KIMI_BASE_URL}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'connect-protocol-version': '1',
			'Authorization': `Bearer ${token}`,
			'r-timezone': R_TIMEZONE,
			'x-msh-platform': 'web',
			'x-msh-version': '1.0.0',
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10000),
	});

	if (!res.ok) {
		if (res.status === 401) {
			// 尝试从响应体提取服务端给出的失败原因（debug.reason / code）
			const data = await res.json().catch(() => null);
			const reason = data?.debug?.reason || data?.code;
			if (source === 'relay') {
				// relay 镜像的 access_token 被服务端拒绝：作废镜像触发全链重续期，
				// 避免死令牌（capturedAt 新鲜但已失效）被反复供应
				notifyRelayTokenInvalid();
				throw new Error(
					reason
						? `Kimi 登录态同步失败（${reason}）：请访问 kimi.com 保持登录，浏览器扩展会自动同步`
						: 'Kimi 登录态同步失败：请访问 kimi.com 保持登录，浏览器扩展会自动同步'
				);
			}
			throw new Error(
				reason
					? `Kimi 认证失败（${reason}）：Cookie 已过期，请重新登录 Kimi`
					: 'Kimi 认证失败：Cookie 已过期，请重新登录 Kimi'
			);
		}
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
}

/**
 * 解析窗口限制配额（频限明细）
 */
function parseWindowSlot(limits) {
	if (!limits || limits.length === 0) return null;

	// 与 parseCodeLimitsSlot 同策略：优先精确匹配 5h 窗口（300 分钟），
	// 找不到取换算后最短窗口兜底（不盲取 limits[0]，避免服务端排序变化取错窗口）
	const fiveHour = limits.find(l =>
		l?.window?.duration === 300
		&& (l.window.timeUnit === 'TIME_UNIT_MINUTE' || l.window.timeUnit === 'MINUTE'));
	const shortest = [...limits].sort((a, b) => codeWindowMinutes(a.window) - codeWindowMinutes(b.window))[0];
	const lim = fiveHour ?? shortest;
	if (!lim) return null;

	const detail = lim.detail;
	if (!detail) return null;

	const window = lim.window;
	const duration = window?.duration ?? 0;
	const timeUnit = window?.timeUnit ?? '';
	let windowLabel = '';

	if (timeUnit === 'TIME_UNIT_MINUTE') {
		const hours = Math.floor(duration / 60);
		windowLabel = `${hours}hour`;
	} else if (timeUnit === 'TIME_UNIT_HOUR') {
		windowLabel = `${duration}hour`;
	} else if (timeUnit === 'TIME_UNIT_DAY') {
		windowLabel = `${duration}day`;
	} else {
		windowLabel = duration > 0 ? `${duration}` : 'unknown';
	}

	const limit = parseInt(detail.limit ?? '0', 10);
	const used = parseInt(detail.used ?? '0', 10);
	const percent = limit > 0 ? (used / limit) * 100 : 0;
	const resetsAt = toResetTimestamp(detail.resetTime) ?? null;

	return {
		label: `频率限制明细 (${windowLabel})`,
		percent: Math.min(percent, 100),
		used,
		limit,
		resetsAt,
	};
}

/**
 * 解析主配额（本周用量）
 */
function parseMainSlot(detail) {
	if (!detail) return null;

	const limit = parseInt(detail.limit ?? '0', 10);
	const used = parseInt(detail.used ?? '0', 10);
	const percent = limit > 0 ? (used / limit) * 100 : 0;
	const resetsAt = toResetTimestamp(detail.resetTime) ?? null;

	return {
		label: '本周用量',
		percent: Math.min(percent, 100),
		used,
		limit,
		resetsAt,
	};
}

/**
 * 解析余额配额（月权益额度）
 */
function parseBalanceSlot(balances) {
	if (!balances || balances.length === 0) return null;

	const bal = balances[0];
	const ratio = bal.amountUsedRatio ?? 0;
	const percent = ratio * 100;

	return {
		label: '月度权益额度',
		percent: Math.min(percent, 100),
		used: undefined,
		limit: undefined,
		resetsAt: toResetTimestamp(bal.expireTime) ?? null,
	};
}

// ===== Code API 路径（用户手动配置的 sk- Key 兜底数据源，解析逻辑与 VSCode 版保持一致）=====

/**
 * 从 storage 读取用户手动配置的 Kimi Code API Key（dashboardConfig.kimiApiKey 裸字符串）。
 * 与 glmApiKey 不同：用户手输的 Key 永不过期，不做 TTL 包装。
 */
async function getKimiApiKey() {
	try {
		const stored = await chrome.storage.local.get('dashboardConfig');
		const key = stored?.dashboardConfig?.kimiApiKey;
		return typeof key === 'string' && key.trim() ? key.trim() : '';
	} catch (err) {
		console.error('[KimiAPI] 读取 kimiApiKey 失败:', err?.message);
		return '';
	}
}

/** 判断凭证是否为 Kimi Code API Key（sk- 前缀静态 Key，如 sk-kimi-xxx） */
function isKimiCodeApiKey(key) {
	return typeof key === 'string' && key.startsWith(KIMI_CODE_KEY_PREFIX);
}

/** 防御性数值转换（number 直接用，字符串尝试解析，无效返回 undefined） */
function toFiniteNumber(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/** 把 resetAt（ISO 字符串 / Unix 时间戳，秒或毫秒）防御性转换为毫秒时间戳，无效返回 undefined */
function toResetTimestamp(value) {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'number') {
		// 小于 1e12 视为秒级时间戳，统一转换为毫秒
		return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : undefined;
	}
	if (/^\d+$/.test(value)) return toResetTimestamp(Number(value));
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

/** 计算窗口使用百分比：usedPercent 优先（0-100），缺失时回退 used/limit 计算，均无效时兜底 0 */
function calcCodePercent(win) {
	if (typeof win.usedPercent === 'number' && Number.isFinite(win.usedPercent)) {
		return Math.min(Math.max(win.usedPercent, 0), 100);
	}
	const limit = Number(win.limit);
	const used = Number(win.used);
	if (Number.isFinite(limit) && Number.isFinite(used) && limit > 0) {
		return Math.min((used / limit) * 100, 100);
	}
	return 0;
}

/** 把窗口时长统一换算为分钟（时间单位未知时返回 Infinity，排序时靠后） */
function codeWindowMinutes(win) {
	const d = typeof win.duration === 'number' && Number.isFinite(win.duration) ? win.duration : Infinity;
	if (!Number.isFinite(d)) return Infinity;
	switch (win.timeUnit) {
		case 'TIME_UNIT_MINUTE':
		case 'MINUTE':
			return d;
		case 'TIME_UNIT_HOUR':
		case 'HOUR':
			return d * 60;
		case 'TIME_UNIT_DAY':
		case 'DAY':
			return d * 60 * 24;
		default:
			return Infinity;
	}
}

/** 生成窗口标签后缀（如 300min → '5hour'），分钟转小时显示（向下取整避免误导） */
function formatCodeWindowLabel(win) {
	const duration = typeof win.duration === 'number' ? win.duration : 0;
	const timeUnit = win.timeUnit ?? '';
	if (timeUnit === 'TIME_UNIT_MINUTE' || timeUnit === 'MINUTE') {
		return `${Math.floor(duration / 60)}hour`;
	}
	if (timeUnit === 'TIME_UNIT_HOUR' || timeUnit === 'HOUR') {
		return `${duration}hour`;
	}
	if (timeUnit === 'TIME_UNIT_DAY' || timeUnit === 'DAY') {
		return `${duration}day`;
	}
	return duration > 0 ? `${duration}` : 'unknown';
}

/** 解析 Code API 每周主用量（body.usage）→ 「本周用量」槽位；usage 缺省返回 null */
function parseCodeUsageSlot(usage) {
	if (!usage) return null;
	return {
		label: '本周用量',
		percent: calcCodePercent(usage),
		used: toFiniteNumber(usage.used),
		limit: toFiniteNumber(usage.limit),
		resetsAt: toResetTimestamp(usage.resetAt),
	};
}

/** 解析 Code API 频率限制（body.limits）：优先精确匹配 5h 窗口（300 分钟），找不到取时长最短窗口兜底 */
function parseCodeLimitsSlot(limits) {
	if (!limits || limits.length === 0) return null;

	// 精确匹配 5h 窗口（duration=300 + 分钟单位，兼容 TIME_UNIT_MINUTE / MINUTE 两种写法）
	const fiveHour = limits.find(w =>
		w?.duration === 300 && (w.timeUnit === 'TIME_UNIT_MINUTE' || w.timeUnit === 'MINUTE'));
	// 兜底：按换算后的分钟数升序取最短窗口
	const shortest = [...limits].sort((a, b) => codeWindowMinutes(a) - codeWindowMinutes(b))[0];
	const win = fiveHour ?? shortest;
	if (!win) return null;

	return {
		label: `频率限制明细 (${formatCodeWindowLabel(win)})`,
		percent: calcCodePercent(win),
		used: toFiniteNumber(win.used),
		limit: toFiniteNumber(win.limit),
		resetsAt: toResetTimestamp(win.resetAt),
	};
}

/**
 * Code API 路径拉取（静态 API Key 兜底数据源）：
 * 接口 GET {KIMI_CODE_API_BASE}/coding/v1/usages，仅 Bearer 鉴权。
 * 产出「频率限制明细 (5h)」+「本周用量」两个槽位；无订阅信息，level/有效期留空。
 */
async function fetchViaCodeApi(apiKey) {
	let body;
	const res = await fetch(`${KIMI_CODE_API_BASE}/coding/v1/usages`, {
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `Bearer ${apiKey}`,
		},
		signal: AbortSignal.timeout(15000),
	});

	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('Kimi Code API Key 无效：请检查 Key 是否正确（sk- 开头，Kimi Code 控制台获取）');
		}
		throw new Error(`HTTP ${res.status}`);
	}
	body = await res.json();

	const windowSlot = parseCodeLimitsSlot(body?.limits);
	const mainSlot = parseCodeUsageSlot(body?.usage);
	const slots = [];
	if (windowSlot) slots.push(windowSlot);
	if (mainSlot) slots.push(mainSlot);

	// 两个窗口均缺失说明响应结构异常，报错让卡片显式提示而非展示空卡片
	if (slots.length === 0) {
		throw new Error('Kimi Code 接口响应结构异常：未包含 usage/limits 配额数据');
	}

	return {
		id: 'kimi',
		name: 'Kimi',
		kind: 'kimi',
		slots,
		updatedAt: Date.now(),
		// Code API 不提供订阅/会员信息，level/currentEndTime 留空
		level: '',
		currentEndTime: '',
		err: null,
	};
}

/** 构造错误形态的 Kimi 服务数据（保持与网页路径错误结构一致） */
function buildKimiError(message) {
	return {
		id: 'kimi',
		name: 'Kimi',
		kind: 'kimi',
		slots: [],
		updatedAt: Date.now(),
		level: '',
		currentEndTime: '',
		err: message,
	};
}

/**
 * 网页 token 路径拉取（主路径，3 槽全量）：GetSubscription + GetUsages 并行请求。
 */
async function fetchViaWeb(token, source = null) {
	try {
		// 并行拉取订阅信息和用量信息
		const [subData, usageData] = await Promise.all([
			kimiPost('/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscription', token, {}, source),
			kimiPost('/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages', token, { scope: ['FEATURE_CODING'] }, source),
		]);

		// usageData 同样可能单独返回 unauthenticated（200 + 错误码），对称判定避免产出 0 槽无错误卡片
		if (subData.code === 'unauthenticated' || usageData.code === 'unauthenticated') {
			// 令牌被服务端判定未认证：作废镜像触发重续期（同 kimiPost 401 分支）
			if (source === 'relay') notifyRelayTokenInvalid();
			return {
				id: 'kimi',
				name: 'Kimi',
				kind: 'kimi',
				slots: [],
				updatedAt: Date.now(),
				level: '',
				currentEndTime: '',
				err: source === 'relay'
					? 'Kimi 登录态同步失败：请访问 kimi.com 保持登录，浏览器扩展会自动同步'
					: 'Kimi 登录凭证已过期，请重新登录',
			};
		}

		// 解析用量
		const usages = usageData.usages ?? [];
		const codingUsage = usages.find(u => u.scope === 'FEATURE_CODING') ?? usages[0];

		const slots = [];
		const windowSlot = codingUsage?.limits ? parseWindowSlot(codingUsage.limits) : null;
		const mainSlot = codingUsage?.detail ? parseMainSlot(codingUsage.detail) : null;
		const balanceSlot = parseBalanceSlot(subData.balances);

		if (windowSlot) slots.push(windowSlot);
		if (mainSlot) slots.push(mainSlot);
		if (balanceSlot) slots.push(balanceSlot);

		// 兜底：从 balances 构建
		if (slots.length === 0 && subData.balances) {
			for (const bal of subData.balances) {
				const ratio = bal.amountUsedRatio ?? 0;
				slots.push({
					label: bal.feature ?? 'Balance',
					percent: Math.min(ratio * 100, 100),
					used: undefined,
					limit: undefined,
					resetsAt: toResetTimestamp(bal.expireTime) ?? null,
				});
			}
		}

		// 提取订阅信息
		const subscription = subData.subscription ?? subData.purchaseSubscription;
		const goods = subscription?.goods;
		const level = goods?.title ?? '';

		return {
			id: 'kimi',
			name: 'Kimi',
			kind: 'kimi',
			slots,
			updatedAt: Date.now(),
			level,
			membershipTitle: goods?.title,
			currentEndTime: subscription?.currentEndTime
				? subscription.currentEndTime.slice(0, 10)
				: '',
			nextBillingTime: subscription?.nextBillingTime
				? subscription.nextBillingTime.slice(0, 10)
				: '',
			subscriptionStatus: subscription?.status,
			subscriptionActive: subscription?.status === 'active',
			balances: subData.balances?.map(b => ({
				feature: b.feature,
				amountUsedRatio: b.amountUsedRatio,
				expireTime: b.expireTime,
			})),
			err: null,
		};

	} catch (err) {
		return {
			id: 'kimi',
			name: 'Kimi',
			kind: 'kimi',
			slots: [],
			updatedAt: Date.now(),
			level: '',
			currentEndTime: '',
			err: err.message || '请求失败，请稍后重试',
		};
	}
}

/**
 * 拉取 Kimi 配额数据（双模式入口，与 VSCode 扩展兼容）：
 * 1. 网页凭证可用（relay token / legacy Cookie）→ 网页路径（3 槽全量，主路径）；
 * 2. 网页凭证不可用但配置了 kimiApiKey（sk- 开头）→ Code API 路径（5h + 每周 2 槽，兜底）；
 * 3. 两者皆无 → 双引导错误。
 *
 * 网页路径请求失败（如镜像 token 过期打出 401）且已配置有效 API Key 时，
 * 同样降级到 Code API 路径兜底，保证仪表盘有数据可展示。
 *
 * @param {{ tokenProvider?: () => Promise<string|null> }} [deps]
 *        tokenProvider：background relay 场景注入 kimi-relay 的 getKimiAccessToken，
 *        避免 runtime.sendMessage 自发自收在 Firefox event page 下失效
 */
export async function fetchKimiQuota(deps) {
	const { token, source } = await getKimiAuthToken(deps);
	if (token) {
		const web = await fetchViaWeb(token, source);
		if (!web.err) return web;

		// 网页路径失败：已配置有效 Code API Key 时兜底，优先展示数据而非错误卡
		const apiKey = await getKimiApiKey();
		if (apiKey && isKimiCodeApiKey(apiKey)) {
			console.warn('[KimiAPI] 网页路径请求失败，降级 Code API Key 兜底:', web.err);
			try {
				return await fetchViaCodeApi(apiKey);
			} catch (err) {
				console.warn('[KimiAPI] Code API Key 兜底也失败，回退网页路径错误:', err.message);
			}
		}
		return web;
	}

	// 网页凭证不可用：降级到用户手动配置的 Code API Key
	const apiKey = await getKimiApiKey();
	if (apiKey) {
		if (!isKimiCodeApiKey(apiKey)) {
			return buildKimiError('kimiApiKey 配置无效：需 sk- 开头的 Kimi Code API Key（Kimi Code 控制台获取），或留空使用 kimi.com 网页登录自动同步');
		}
		try {
			return await fetchViaCodeApi(apiKey);
		} catch (err) {
			return buildKimiError(err.message || '请求失败，请稍后重试');
		}
	}

	return buildKimiError('未获取到 Kimi 凭证：访问 kimi.com 登录后自动同步，或在设置页粘贴 Kimi Code API Key（sk- 开头）');
}
