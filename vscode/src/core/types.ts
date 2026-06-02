// ==================== 服务标识 ====================

/**
 * ServiceId 是字符串类型，用于标识 AI 服务种类（如 'glm'、'kimi'、'mimo'）。
 * 历史上曾尝试使用 branded type 增强编译期安全，但 VSCode 扩展中大量硬编码字符串
 * 导致维护成本过高。改为普通 string + 运行时校验（isValidServiceId）的折中方案。
 */
export type ServiceId = string;

/** 从字符串创建 ServiceId（保留供未来需要时统一替换） */
export function createServiceId(id: string): ServiceId {
	return id;
}

export interface ServiceProfile {
	id: string;
	kind: ServiceId;
	displayName: string;
	endpoint?: string;
	/** 数据来源: 'manual' = 手动输入, 'bridge' = Cookie Bridge */
	dataSource: 'manual' | 'bridge';
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
}

export interface ServiceData {
	id: string;
	name: string;
	kind: ServiceId;
	slots: QuotaSlot[];
	history?: UsagePoint[];
	updatedAt: number;
	err?: string;
}

// ==================== 命令载荷 ====================

export interface SaveServicePayload {
	id: string;
	name: string;
	kind: ServiceId;
	key: string;
	dataSource: 'manual' | 'bridge';
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


