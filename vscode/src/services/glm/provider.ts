import { URL } from 'url';
import { QuotaProvider } from '../types';
import { QuotaSlot, UsagePoint } from '../../core/types';
import { getJson } from '../../core/fetch';
import { ServiceData } from '../../core/types';
import { GlmServiceData, ModelUsageData, ToolUsageData, TimeRange } from './types';

// ========== 原始数据接口定义 ==========

/** 用量统计 - 限额项 */
interface RawLimit {
	type: 'TOKENS_LIMIT' | 'TIME_LIMIT';
	unit: number;
	number: number;
	percentage: number;
	nextResetTime: number;
	// TIME_LIMIT 特有
	usage?: number;
	currentValue?: number;
	remaining?: number;
	usageDetails?: { modelCode: string; usage: number }[];
}

/** 用量统计 - 根响应 */
interface QuotaLimitResponse {
	code: number;
	msg: string;
	data?: {
		limits: RawLimit[];
		level: string;
	};
	success: boolean;
}

/** 模型用量 - 根响应 */
interface ModelUsageResponse {
	code: number;
	msg: string;
	data?: {
		x_time: string[];
		modelCallCount: (number | null)[];
		tokensUsage: (number | null)[];
		totalUsage: {
			totalModelCallCount: number;
			totalTokensUsage: number;
			modelSummaryList: { modelName: string; totalTokens: number; sortOrder: number }[];
		};
		modelDataList: {
			modelName: string;
			sortOrder: number;
			tokensUsage: (number | null)[];
			totalTokens: number;
		}[];
		granularity: string;
	};
	success: boolean;
}

/** 工具用量 - 根响应 */
interface ToolUsageResponse {
	code: number;
	msg: string;
	data?: {
		x_time: string[];
		networkSearchCount: (number | null)[];
		webReadMcpCount: (number | null)[];
		zreadMcpCount: (number | null)[];
		totalUsage: {
			totalNetworkSearchCount: number;
			totalWebReadMcpCount: number;
			totalZreadMcpCount: number;
			totalSearchMcpCount: number;
			toolDetails: { modelName: string; totalUsageCount: number }[];
			toolSummaryList: { toolCode: string; toolName: string; totalUsageCount: number; sortOrder: number }[];
		};
		toolDataList: {
			toolCode: string;
			toolName: string;
			sortOrder: number;
			usageCount: (number | null)[];
			totalUsageCount: number;
		}[];
		granularity: string;
	};
	success: boolean;
}

/** 套餐订阅 - 单项 */
interface SubscriptionItem {
	id: string;
	productName: string;
	status: string;
	inCurrentPeriod: boolean;
	nextRenewTime: string;
}

/** 套餐订阅 - 根响应 */
interface SubscriptionResponse {
	code: number;
	msg: string;
	data?: SubscriptionItem[];
	success: boolean;
}

// ========== 工具函数（导出供外部使用）==========

/** 从 URL 提取域名 */
export function extractDomain(url: string): string {
	try {
		const u = new URL(url);
		return `${u.protocol}//${u.host}`;
	} catch {
		return GLM_DEFAULT_ENDPOINT;
	}
}

function formatDateTime(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 构建时间范围查询参数 */
export function buildTimeRangeQuery(days: number): string {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0);
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
	const qs = `?startTime=${encodeURIComponent(formatDateTime(start))}&endTime=${encodeURIComponent(formatDateTime(end))}`;
	return qs;
}

/** 天数转换为 TimeRange */
export function daysToRange(days: number): TimeRange {
	if (days <= 1) { return 'day'; }
	if (days <= 7) { return 'week'; }
	return 'month';
}

// ========== 数据解析 ==========

/**
 * 解析用量统计限额
 * 根据 unit/number 字段判断配额类型，不依赖数组顺序：
 * - TOKENS_LIMIT, unit=3, number=5 → 每5小时额度
 * - TOKENS_LIMIT, unit=6, number=1 → 每周额度
 * - TIME_LIMIT, unit=5, number=1 → MCP 每月额度
 */
export const GLM_DEFAULT_ENDPOINT = 'https://open.bigmodel.cn';

function getGlmQuotaLabel(item: RawLimit): string {
	if (item.type === 'TOKENS_LIMIT') {
		// unit=3 表示小时，number=5 表示每5小时
		if (item.unit === 3 && item.number === 5) {
			return '每5小时额度';
		}
		// unit=6 表示周，number=1 表示每周
		if (item.unit === 6 && item.number === 1) {
			return '每周额度';
		}
		return `额度 (${item.number}${getTimeUnitLabel(item.unit)})`;
	}
	if (item.type === 'TIME_LIMIT') {
		return 'MCP 每月额度';
	}
	return '未知额度';
}

function getTimeUnitLabel(unit: number): string {
	switch (unit) {
		case 3: return '小时';
		case 5: return '月';
		case 6: return '周';
		default: return '';
	}
}

function parseLimits(raw: { limits?: RawLimit[]; level?: string }): { slots: QuotaSlot[]; level?: string } {
	const limits = raw.limits ?? [];
	const slots: QuotaSlot[] = [];

	for (const item of limits) {
		if (item.type === 'TOKENS_LIMIT') {
			slots.push({
				label: getGlmQuotaLabel(item),
				percent: item.percentage,
				used: undefined,
				limit: undefined,
				resetsAt: item.nextResetTime,
			});
		} else if (item.type === 'TIME_LIMIT') {
			slots.push({
				label: getGlmQuotaLabel(item),
				percent: item.percentage,
				used: item.currentValue,
				limit: item.usage,
				resetsAt: item.nextResetTime,
			});
		}
	}
	return { slots, level: raw.level };
}

/**
 * 解析套餐订阅信息
 * 从 data 数组中找 inCurrentPeriod === true 的项，返回 nextRenewTime
 */
function parseSubscription(raw: SubscriptionResponse): string | undefined {
	if (raw.code !== 200 || !raw.success || !raw.data || raw.data.length === 0) {
		return undefined;
	}
	const active = raw.data.find(item => item.inCurrentPeriod);
	const nextRenewTime = active?.nextRenewTime;
	if (!nextRenewTime || isNaN(new Date(nextRenewTime).getTime())) {
		return undefined;
	}
	return nextRenewTime;
}

/** 解析模型用量数据 */
function parseModelUsage(raw: NonNullable<ModelUsageResponse['data']>): ModelUsageData {
	const xs = raw.x_time || [];
	const tokens = raw.tokensUsage || [];
	const calls = raw.modelCallCount || [];

	// 构建历史数据点
	const history: UsagePoint[] = [];
	for (let i = 0; i < xs.length; i++) {
		const ts = new Date(xs[i]).getTime();
		if (isNaN(ts)) {
			continue;
		}
		history.push({
			at: ts,
			tokens: tokens[i] ?? undefined,
			calls: calls[i] ?? undefined,
		});
	}

	return {
		totalTokens: raw.totalUsage?.totalTokensUsage ?? 0,
		totalCalls: raw.totalUsage?.totalModelCallCount ?? 0,
		modelSummary: raw.totalUsage?.modelSummaryList ?? [],
		history,
		modelSeries: raw.modelDataList?.map(m => ({
			modelName: m.modelName,
			tokensUsage: m.tokensUsage,
			totalTokens: m.totalTokens,
		})) ?? [],
		xTime: xs,
	};
}

/** 解析工具用量数据 */
function parseToolUsage(raw: NonNullable<ToolUsageResponse['data']>): ToolUsageData {
	const xs = raw.x_time || [];
	const network = raw.networkSearchCount || [];
	const webRead = raw.webReadMcpCount || [];
	const zread = raw.zreadMcpCount || [];

	// 构建历史数据点 - 用 calls 字段存总工具调用次数
	const history: UsagePoint[] = [];
	for (let i = 0; i < xs.length; i++) {
		const ts = new Date(xs[i]).getTime();
		if (isNaN(ts)) {
			continue;
		}
		history.push({
			at: ts,
			calls: (network[i] ?? 0) + (webRead[i] ?? 0) + (zread[i] ?? 0),
		});
	}

	return {
		totalNetworkSearch: raw.totalUsage?.totalNetworkSearchCount ?? 0,
		totalWebRead: raw.totalUsage?.totalWebReadMcpCount ?? 0,
		totalZread: raw.totalUsage?.totalZreadMcpCount ?? 0,
		toolSummary: raw.totalUsage?.toolSummaryList ?? [],
		history,
		toolSeries: raw.toolDataList?.map(t => ({
			toolCode: t.toolCode,
			toolName: t.toolName,
			usageCount: t.usageCount,
			totalUsageCount: t.totalUsageCount,
		})) ?? [],
		xTime: xs,
	};
}

// ========== 独立拉取函数（供 extension.ts 按需调用）==========

/** 拉取指定时间范围的模型用量 */
export async function fetchGlmModelUsage(
	base: string,
	headers: Record<string, string>,
	days: number,
): Promise<ModelUsageData | undefined> {
	try {
		const qs = buildTimeRangeQuery(days);
		const raw = await getJson<ModelUsageResponse>(
			`${base}/api/monitor/usage/model-usage${qs}`, headers, 15000
		);
		if (raw.code === 200 && raw.success && raw.data) {
			return parseModelUsage(raw.data);
		}
	} catch (err) {
		console.warn(`[glm] fetch model usage failed: ${err}`);
	}
	return undefined;
}

/** 拉取指定时间范围的工具用量 */
export async function fetchGlmToolUsage(
	base: string,
	headers: Record<string, string>,
	days: number,
): Promise<ToolUsageData | undefined> {
	try {
		const qs = buildTimeRangeQuery(days);
		const raw = await getJson<ToolUsageResponse>(
			`${base}/api/monitor/usage/tool-usage${qs}`, headers, 15000
		);
		if (raw.code === 200 && raw.success && raw.data) {
			return parseToolUsage(raw.data);
		}
	} catch (err) {
		console.warn(`[glm] fetch tool usage failed: ${err}`);
	}
	return undefined;
}

// ========== DetailProvider 实现 ==========

import { DetailProvider } from '../types';

export const glmDetailProvider: DetailProvider = {
	async fetchDetail(range, apiKey, endpoint) {
		const days = range === 'day' ? 1 : range === 'week' ? 7 : 30;
		const base = extractDomain(endpoint ?? GLM_DEFAULT_ENDPOINT);
		const headers = { 'Authorization': `Bearer ${apiKey}` };

		const [modelUsage, toolUsage] = await Promise.all([
			fetchGlmModelUsage(base, headers, days),
			fetchGlmToolUsage(base, headers, days),
		]);

		return { modelUsage, toolUsage };
	},
};

export function mergeGlmDetailData(existing: ServiceData, detail: unknown, range: string): void {
	if (!detail || typeof detail !== 'object') { return; }
	const d = detail as Record<string, unknown>;
	const glm = existing as GlmServiceData;
	if (d.modelUsage && typeof d.modelUsage === 'object') {
		glm.modelUsageByRange = { ...glm.modelUsageByRange, [range]: d.modelUsage as ModelUsageData };
	}
	if (d.toolUsage && typeof d.toolUsage === 'object') {
		glm.toolUsageByRange = { ...glm.toolUsageByRange, [range]: d.toolUsage as ToolUsageData };
	}
}

// ========== Provider 实现 ==========

export const glmProvider: QuotaProvider = {
	kind: 'glm',
	async fetch(apiKey, endpoint): Promise<GlmServiceData> {
		const base = extractDomain(endpoint ?? GLM_DEFAULT_ENDPOINT);
		const headers = { 'Authorization': `Bearer ${apiKey}` };

		// 1. 用量统计（配额限额）+ 套餐订阅（并行）
		const [quotaRaw, subRaw] = await Promise.all([
			getJson<QuotaLimitResponse>(`${base}/api/monitor/usage/quota/limit`, headers, 15000),
			getJson<SubscriptionResponse>(`${base}/api/biz/subscription/list`, headers, 15000).catch(() => undefined),
		]);

		if (quotaRaw.code !== 200 || !quotaRaw.success) {
			throw new Error(quotaRaw.msg || '配额查询失败');
		}

		const { slots, level } = parseLimits(quotaRaw.data ?? { limits: [] });
		const nextRenewTime = subRaw ? parseSubscription(subRaw) : undefined;

		// 2. 模型用量（当日）
		const modelUsage = await fetchGlmModelUsage(base, headers, 1);

		// 3. 工具用量（当日）
		const toolUsage = await fetchGlmToolUsage(base, headers, 1);

		return {
			id: 'glm',
			name: 'GLM',
			kind: 'glm',
			slots,
			history: modelUsage?.history,
			updatedAt: Date.now(),
			level,
			nextRenewTime,
			modelUsage,
			toolUsage,
			modelUsageByRange: modelUsage ? { day: modelUsage } : {},
			toolUsageByRange: toolUsage ? { day: toolUsage } : {},
		};
	},
};
