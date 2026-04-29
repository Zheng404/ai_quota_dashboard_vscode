// ==================== 服务标识 ====================

export type ServiceId = string;

export interface ServiceProfile {
	id: string;
	kind: ServiceId;
	displayName: string;
	enabled: boolean;
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
	enabled: boolean;
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

export function getColorEmoji(level: ColorLevel): string {
	switch (level) {
		case 'danger': return '❌';
		case 'warning': return '⚠️';
		case 'success': return '✅';
	}
}

export function getColorCssClass(level: ColorLevel): string {
	return level;
}
