import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeVisibleServices, pruneStatesByProfiles, shouldSkipPanelRerender, validateGlobalSettings } from './compute';
import type { ServiceProfile } from '../core/types';
import type { WebviewServiceData } from './types';

const profiles: ServiceProfile[] = [
	{ id: 'glm-1', kind: 'glm', displayName: 'GLM' },
	{ id: 'kimi-1', kind: 'kimi', displayName: 'Kimi' },
];

afterEach(() => {
	vi.restoreAllMocks();
});

describe('computeVisibleServices', () => {
	it('已有数据时按配置顺序返回原服务对象', () => {
		const kimi: WebviewServiceData = {
			id: 'kimi-1',
			name: 'Kimi API',
			kind: 'kimi',
			slots: [{ label: '本周', percent: 25 }],
			updatedAt: 123,
		};
		const glm: WebviewServiceData = {
			id: 'glm-1',
			name: 'GLM API',
			kind: 'glm',
			slots: [{ label: '今日', percent: 50 }],
			updatedAt: 456,
		};

		const result = computeVisibleServices(profiles, [kimi, glm]);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe(glm);
		expect(result[1]).toBe(kimi);
	});

	it('缺少数据时生成加载骨架并为每个骨架读取当前时间', () => {
		const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

		const result = computeVisibleServices(profiles, []);

		expect(result).toEqual([
			{
				id: 'glm-1',
				name: 'GLM',
				kind: 'glm',
				slots: [],
				updatedAt: 1_700_000_000_000,
				_loading: true,
			},
			{
				id: 'kimi-1',
				name: 'Kimi',
				kind: 'kimi',
				slots: [],
				updatedAt: 1_700_000_000_000,
				_loading: true,
			},
		]);
		expect(now).toHaveBeenCalledTimes(2);
	});

	it('配置为空时返回空数组', () => {
		const service: WebviewServiceData = {
			id: 'glm-1',
			name: 'GLM API',
			kind: 'glm',
			slots: [],
			updatedAt: 123,
		};

		expect(computeVisibleServices([], [service])).toEqual([]);
	});
});

describe('validateGlobalSettings', () => {
	it('接受 0 与上限值，不用默认值替换合法输入', () => {
		expect(validateGlobalSettings({ refreshInterval: '0', warnThreshold: '0', afkThreshold: '86400' })).toEqual({
			ok: true,
			values: { refreshInterval: 0, warnThreshold: 0, afkThreshold: 86400 },
		});
	});

	it('空值返回对应字段错误', () => {
		expect(validateGlobalSettings({ refreshInterval: '60', warnThreshold: '', afkThreshold: '3600' })).toEqual({
			ok: false,
			field: 'warnThreshold',
			message: '请输入预警阈值',
		});
	});

	it('拒绝非数字和超出上限的值', () => {
		expect(validateGlobalSettings({ refreshInterval: 'abc', warnThreshold: '0.8', afkThreshold: '3600' })).toMatchObject({
			ok: false,
			field: 'refreshInterval',
		});
		expect(validateGlobalSettings({ refreshInterval: '60', warnThreshold: '0.8', afkThreshold: '86401' })).toMatchObject({
			ok: false,
			field: 'afkThreshold',
		});
	});

	it('字段级检查输入步长', () => {
		expect(validateGlobalSettings({ refreshInterval: '30', warnThreshold: '0.8', afkThreshold: '3600' })).toMatchObject({
			ok: false,
			field: 'refreshInterval',
		});
		expect(validateGlobalSettings({ refreshInterval: '60', warnThreshold: '0.83', afkThreshold: '3600' })).toMatchObject({
			ok: false,
			field: 'warnThreshold',
		});
	});
});


describe('shouldSkipPanelRerender', () => {
	it('确认面板展开时即使焦点在按钮上也跳过重渲染', () => {
		expect(shouldSkipPanelRerender(false, true)).toBe(true);
	});

	it('输入编辑中仍跳过重渲染', () => {
		expect(shouldSkipPanelRerender(true, false)).toBe(true);
	});

	it('确认关闭且未编辑时允许后续数据更新', () => {
		expect(shouldSkipPanelRerender(false, false)).toBe(false);
	});
});

describe('pruneStatesByProfiles', () => {
	it('删除已移除服务并保留现存服务的状态对象', () => {
		const retained = { tab: 'model', range: 'week', data: { tokens: 10 } };
		const states: Record<string, { tab: string; range: string; data: unknown }> = {
			'glm-1': retained,
			'removed-glm': { tab: 'tool', range: 'day', data: null },
		};

		pruneStatesByProfiles(states, [profiles[0]]);

		expect(Object.keys(states)).toEqual(['glm-1']);
		expect(states['glm-1']).toBe(retained);
		expect(states['glm-1'].range).toBe('week');
	});

	it('配置为空时清空全部状态', () => {
		const states = { 'glm-1': { tab: 'model' } };
		pruneStatesByProfiles(states, []);
		expect(states).toEqual({});
	});
});
