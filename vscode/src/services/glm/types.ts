import { ServiceData, UsagePoint } from '../../core/types';

// ========== GLM 扩展数据类型 ==========

/** 时间范围标识 */
export type TimeRange = 'day' | 'week' | 'month';

/** GLM 服务专用数据（扩展自 ServiceData） */
export interface GlmServiceData extends ServiceData {
	/** 套餐等级，如 'pro' */
	level?: string;
	/** 下次续费时间，如 '2026-06-28' */
	nextRenewTime?: string;
	/** 模型用量数据（默认当日，兼容旧数据） */
	modelUsage?: ModelUsageData;
	/** 工具用量数据（默认当日，兼容旧数据） */
	toolUsage?: ToolUsageData;
	/** 按时间范围缓存的模型用量数据 */
	modelUsageByRange?: Partial<Record<TimeRange, ModelUsageData>>;
	/** 按时间范围缓存的工具用量数据 */
	toolUsageByRange?: Partial<Record<TimeRange, ToolUsageData>>;
}

/** 模型用量汇总 */
export interface ModelUsageData {
	/** 总 Token 消耗 */
	totalTokens: number;
	/** 总调用次数 */
	totalCalls: number;
	/** 各模型汇总 */
	modelSummary: { modelName: string; totalTokens: number; sortOrder: number }[];
	/** 分时历史数据 */
	history: UsagePoint[];
	/** 各模型分时序列 */
	modelSeries: { modelName: string; tokensUsage: (number | null)[]; totalTokens: number }[];
	/** 时间标签列表（x轴） */
	xTime: string[];
}

/** 工具用量汇总 */
export interface ToolUsageData {
	/** 联网搜索总次数 */
	totalNetworkSearch: number;
	/** 网页读取总次数 */
	totalWebRead: number;
	/** zread 总次数 */
	totalZread: number;
	/** 各工具汇总 */
	toolSummary: { toolCode: string; toolName: string; totalUsageCount: number; sortOrder: number }[];
	/** 分时历史数据 */
	history: UsagePoint[];
	/** 各工具分时序列 */
	toolSeries: { toolCode: string; toolName: string; usageCount: (number | null)[]; totalUsageCount: number }[];
	/** 时间标签列表（x轴） */
	xTime: string[];
}

/** 判断 ServiceData 是否为 GlmServiceData */
export function isGlmServiceData(data: ServiceData): data is GlmServiceData {
	return data.kind === 'glm';
}
