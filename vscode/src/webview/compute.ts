// Webview 仪表盘数据计算：仅依赖消息数据，不接触 DOM 或 VSCode API

import type { ServiceProfile } from '../core/types';
import type { SaveGlobalField, WebviewServiceData } from './types';

export interface GlobalSettingRule {
	label: string;
	min: number;
	max: number;
	step: number;
}

export const GLOBAL_SETTING_RULES: Record<SaveGlobalField, GlobalSettingRule> = {
	refreshInterval: { label: '自动刷新间隔', min: 0, max: 86400, step: 60 },
	warnThreshold: { label: '预警阈值', min: 0, max: 1, step: 0.05 },
	afkThreshold: { label: '离开检测', min: 0, max: 86400, step: 60 },
};

export type GlobalSettingsInput = Record<SaveGlobalField, string>;
export type GlobalSettingsValidation =
	| { ok: true; values: Record<SaveGlobalField, number> }
	| { ok: false; field: SaveGlobalField; message: string };

/** 与输入属性及后端范围一致地验证完整表单；空值绝不替换为默认值。 */
export function validateGlobalSettings(input: GlobalSettingsInput): GlobalSettingsValidation {
	const values = {} as Record<SaveGlobalField, number>;
	for (const field of ['refreshInterval', 'warnThreshold', 'afkThreshold'] as const) {
		const rule = GLOBAL_SETTING_RULES[field];
		const raw = input[field].trim();
		if (!raw) return { ok: false, field, message: '请输入' + rule.label };
		const value = Number(raw);
		if (!Number.isFinite(value)) return { ok: false, field, message: rule.label + '必须是有效数字' };
		if (value < rule.min || value > rule.max) {
			return { ok: false, field, message: rule.label + '必须在 ' + rule.min + ' 到 ' + rule.max + ' 之间' };
		}
		const steps = (value - rule.min) / rule.step;
		if (Math.abs(steps - Math.round(steps)) > 1e-9) {
			return { ok: false, field, message: rule.label + '必须以 ' + rule.step + ' 为步长' };
		}
		values[field] = value;
	}
	return { ok: true, values };
}

/** 按配置顺序合并服务数据；尚无数据的服务生成加载骨架。 */
export function computeVisibleServices(
	profiles: ServiceProfile[] | undefined,
	services: WebviewServiceData[] | undefined,
): WebviewServiceData[] {
	const servicesMap = new Map<string, WebviewServiceData>();
	(services ?? []).forEach(service => servicesMap.set(service.id, service));
	return (profiles ?? []).map(profile => {
		const data = servicesMap.get(profile.id);
		if (data) return data;
		return {
			id: profile.id,
			name: profile.displayName,
			kind: profile.kind,
			slots: [],
			updatedAt: Date.now(),
			_loading: true,
		};
	});
}

/** 输入中或确认面板展开时保留当前 DOM，避免销毁编辑/确认状态。 */
export function shouldSkipPanelRerender(isEditing: boolean, hasOpenConfirmation: boolean): boolean {
	return isEditing || hasOpenConfirmation;
}

/** 按当前配置清理已删除服务的前端状态，保留现存状态对象。 */
export function pruneStatesByProfiles<T>(states: Record<string, T>, profiles: ServiceProfile[] | undefined): void {
	const activeIds = new Set((profiles ?? []).map(profile => profile.id));
	for (const id of Object.keys(states)) {
		if (!activeIds.has(id)) delete states[id];
	}
}
