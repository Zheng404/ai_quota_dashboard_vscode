// ==================== 服务标识 ====================

/**
 * ServiceId 是字符串类型，用于标识 AI 服务种类（如 'glm'、'kimi'）。
 * 历史上曾尝试使用 branded type 增强编译期安全，但 VSCode 扩展中大量硬编码字符串
 * 导致维护成本过高。改为普通 string + 运行时校验（isValidServiceId）的折中方案。
 */
export type ServiceId = string;

/** 设置页用于表示「保留现有 API Key」的掩码，绝不能写入 Secret Storage。 */
export const API_KEY_MASK = '••••••••';

export interface ServiceProfile {
	id: string;
	kind: ServiceId;
	displayName: string;
	endpoint?: string;
}

// ==================== 配额数据 ====================

export interface QuotaSlot {
	label: string;
	percent: number;
	used?: number;
	limit?: number;
	resetsAt?: number;
}

export interface UsagePoint {
	at: number;
	tokens?: number;
	calls?: number;
	/**
	 * 数值语义标记：'percent' = 0-100 百分比（主槽无绝对量时，如 GLM TOKENS_LIMIT），
	 * 'tokens' = 绝对 Token 数。存量历史点无此字段（语义未知），读取时容忍、不回写迁移。
	 */
	kind?: 'percent' | 'tokens';
}

export interface ServiceData {
	id: string;
	name: string;
	kind: ServiceId;
	slots: QuotaSlot[];
	history?: UsagePoint[];
	updatedAt: number;
	err?: string;
	/** 尚未配置 API Key；此状态不进入缓存、历史或配额预警。 */
	noKey?: boolean;
	/** 保留上一次正常数据时的刷新错误；updatedAt 仍指向旧数据时间。 */
	staleError?: string;
}

/** 是否可作为新鲜配额样本写历史或触发预警；stale 卡片虽可见但不满足。 */
export function isFreshServiceData(data: ServiceData): boolean {
	return data.err === undefined && data.noKey !== true && data.staleError === undefined;
}

// ==================== 命令载荷 ====================

export interface SaveServicePayload {
	id: string;
	name: string;
	kind: ServiceId;
	/** undefined 保持原 Secret，空字符串清除，其余字符串替换。 */
	key?: string;
	/** undefined 保留原 endpoint，空字符串删除，其余字符串更新。 */
	endpoint?: string;
}

export interface AddServicePayload {
	kind: ServiceId;
}

export interface RemoveServicePayload {
	id: string;
}

export interface SaveGlobalPayload {
	refreshInterval: number;
	warnThreshold: number;
	afkThreshold: number;
}

// ==================== 颜色等级 ====================

export type ColorLevel = 'success' | 'warning' | 'danger';

export interface ColorThresholds {
	warning: number;
	danger: number;
}

const defaultThresholds: ColorThresholds = { warning: 75, danger: 90 };

export function getColorLevel(pct: number, thresholds?: Partial<ColorThresholds>): ColorLevel {
	const t = { ...defaultThresholds, ...thresholds };
	if (pct >= t.danger) return 'danger';
	if (pct >= t.warning) return 'warning';
	return 'success';
}


