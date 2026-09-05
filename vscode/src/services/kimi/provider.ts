import { QuotaProvider, QuotaSlot } from '../types';
import { KimiServiceData } from './types';
import { getJson } from '../../core/fetch';
import type { HttpError } from '../../core/fetch';
import { KIMI_CODE_API_BASE, KIMI_CODE_KEY_PREFIX, KIMI_SLOT_LABELS } from './constants';

/** 非 sk- 凭证（如网页 JWT Token）统一抛出的引导错误：kimi-auth 网页鉴权已被 Kimi 废弃，不发起任何请求 */
const KIMI_WEB_CREDENTIAL_ERROR =
	'Kimi 网页登录凭证已不可用（Kimi 已废弃 kimi-auth 机制）。请粘贴 Kimi Code API Key（sk- 开头，Kimi Code 控制台获取）';

// Kimi (Moonshot AI) 平台数据提供者，仅支持 Kimi Code API Key（sk- 前缀静态 Key）一种数据源：
// - Key 来源: Kimi Code 控制台签发，永不过期
// - 接口: GET {KIMI_CODE_API_BASE}/coding/v1/usages（国内站 api.kimi.com；国际站为 https://api.kimi.ai）
// - 产出: 「频率限制明细 (5h)」+「本周用量」两个槽位（Code API 无订阅信息）
// - 其他任意凭证（如网页 JWT Token）：kimi-auth 网页鉴权已被 Kimi 废弃，直接抛引导错误

// ========== Kimi Code API 原始数据接口 ==========

/** Code API 用量窗口（usage 主窗口与 limits 子窗口共用结构，字段以实际响应为准，解析时做防御性兜底） */
interface KimiCodeUsageWindow {
	/** 窗口时长，如 300（配合 timeUnit 解释） */
	duration?: number;
	/** 时间单位，如 'TIME_UNIT_MINUTE' */
	timeUnit?: string;
	/** 已使用百分比（0-100），缺失时回退 used/limit 计算 */
	usedPercent?: number;
	used?: number | string;
	limit?: number | string;
	/** 窗口重置时间（ISO 字符串或 Unix 时间戳） */
	resetAt?: string | number;
}

/** Code API GET /coding/v1/usages 响应体 */
interface KimiCodeUsagesResponse {
	/** 每周主用量窗口 */
	usage?: KimiCodeUsageWindow;
	/** 频率限制窗口列表（含 5h/300min 窗口） */
	limits?: KimiCodeUsageWindow[];
}

// ========== 数据解析 ==========

/** 判断凭证是否为 Kimi Code API Key（sk- 前缀静态 Key，如 sk-kimi-xxx） */
export function isKimiCodeApiKey(key: string): boolean {
	return typeof key === 'string' && key.trim().startsWith(KIMI_CODE_KEY_PREFIX);
}

/** 防御性数值转换（number 直接用，字符串尝试解析，无效返回 undefined） */
function toFiniteNumber(value: number | string | undefined): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/** 把 resetAt（ISO 字符串 / Unix 时间戳，秒或毫秒）防御性转换为毫秒时间戳，无效返回 undefined */
function toResetTimestamp(value: string | number | undefined): number | undefined {
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
function calcCodePercent(win: KimiCodeUsageWindow): number {
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
function codeWindowMinutes(win: KimiCodeUsageWindow): number {
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
function formatCodeWindowLabel(win: KimiCodeUsageWindow): string {
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

/** 解析 Code API 每周主用量（body.usage）→ 「本周用量」槽位；usage 缺省返回 undefined */
export function parseCodeUsageSlot(usage: KimiCodeUsageWindow | undefined): QuotaSlot | undefined {
	if (!usage) return undefined;
	return {
		label: KIMI_SLOT_LABELS.MAIN,
		percent: calcCodePercent(usage),
		used: toFiniteNumber(usage.used),
		limit: toFiniteNumber(usage.limit),
		resetsAt: toResetTimestamp(usage.resetAt),
	};
}

/** 解析 Code API 频率限制（body.limits）：优先精确匹配 5h 窗口（300 分钟），找不到取时长最短窗口兜底 */
export function parseCodeLimitsSlot(limits: KimiCodeUsageWindow[] | undefined): QuotaSlot | undefined {
	if (!limits || limits.length === 0) return undefined;

	// 精确匹配 5h 窗口（duration=300 + 分钟单位，兼容 TIME_UNIT_MINUTE / MINUTE 两种写法）
	const fiveHour = limits.find(w =>
		w?.duration === 300 && (w.timeUnit === 'TIME_UNIT_MINUTE' || w.timeUnit === 'MINUTE'));
	// 兜底：按换算后的分钟数升序取最短窗口
	const shortest = [...limits].sort((a, b) => codeWindowMinutes(a) - codeWindowMinutes(b))[0];
	const win = fiveHour ?? shortest;
	if (!win) return undefined;

	return {
		label: `${KIMI_SLOT_LABELS.WINDOW} (${formatCodeWindowLabel(win)})`,
		percent: calcCodePercent(win),
		used: toFiniteNumber(win.used),
		limit: toFiniteNumber(win.limit),
		resetsAt: toResetTimestamp(win.resetAt),
	};
}

/**
 * Code API 路径拉取（静态 API Key，sk- 前缀）
 * 接口: GET {KIMI_CODE_API_BASE}/coding/v1/usages（国内站 api.kimi.com；国际站为 https://api.kimi.ai）
 * 鉴权: 仅 Bearer 静态 Key，Key 永不过期
 * 产出: 「频率限制明细 (5h)」+「本周用量」两个槽位（Code API 无月度权益槽）
 */
async function fetchViaCodeApi(apiKey: string): Promise<KimiServiceData> {
	let body: KimiCodeUsagesResponse;
	try {
		// getJson 自带 Accept: application/json 头，此处仅需补 Authorization
		body = await getJson<KimiCodeUsagesResponse>(
			`${KIMI_CODE_API_BASE}/coding/v1/usages`,
			{ 'Authorization': `Bearer ${apiKey}` },
			15000,
		);
	} catch (err) {
		if (err instanceof Error && (err as HttpError).statusCode === 401) {
			throw new Error('Kimi Code API Key 无效：请检查 Kimi Code 控制台中的 Key 是否正确');
		}
		throw err;
	}

	const windowSlot = parseCodeLimitsSlot(body?.limits);
	const mainSlot = parseCodeUsageSlot(body?.usage);
	const slots: QuotaSlot[] = [];
	if (windowSlot) slots.push(windowSlot);
	if (mainSlot) slots.push(mainSlot);

	// 两个窗口均缺失说明响应结构异常，抛错让 UI 显式提示而非展示空卡片
	if (slots.length === 0) {
		throw new Error('Kimi Code 接口响应结构异常：未包含 usage/limits 配额数据');
	}

	return {
		id: 'kimi',
		name: 'Kimi',
		kind: 'kimi',
		slots,
		updatedAt: Date.now(),
	};
}

// ========== Provider 实现 ==========

export const kimiProvider: QuotaProvider = {
	kind: 'kimi',
	async fetch(apiKey): Promise<KimiServiceData> {
		// 单路径路由：仅接受 Kimi Code API Key（sk- 前缀）；
		// 其他任意凭证（如网页 JWT Token）均为已废弃的 kimi-auth 网页鉴权，直接抛引导错误，不发起请求
		if (!isKimiCodeApiKey(apiKey)) {
			throw new Error(KIMI_WEB_CREDENTIAL_ERROR);
		}
		return fetchViaCodeApi(apiKey);
	},
};
