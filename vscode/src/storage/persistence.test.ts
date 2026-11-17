import { describe, it, expect } from 'vitest';
import type * as vscode from 'vscode';
import { attachHistory, loadHistory, saveHistory } from './persistence';
import { isFreshServiceData, ServiceData, ServiceProfile, UsagePoint } from '../core/types';

function createMockContext(initial: Record<string, unknown> = {}): vscode.ExtensionContext {
	const storage: Record<string, unknown> = { ...initial };
	return {
		globalState: {
			get: <T>(key: string, defaultValue?: T): T | undefined => {
				return storage[key] !== undefined ? (storage[key] as T) : defaultValue;
			},
			update: async (key: string, value: unknown) => {
				if (value === undefined) {
					delete storage[key];
				} else {
					storage[key] = value;
				}
			},
			keys: () => Object.keys(storage),
		},
		secrets: {
			get: async () => undefined,
			store: async () => {},
			delete: async () => {},
		},
	} as unknown as vscode.ExtensionContext;
}

describe('loadHistory 损坏条目恢复', () => {
	it.each([
		{ label: 'string', value: 'broken' },
		{ label: 'number', value: 42 },
		{ label: 'null', value: null },
		{ label: 'object', value: { unexpected: true } },
	])('sid 对应 $label 时按空数组恢复且不影响其他服务', ({ value }) => {
		const validPoint: UsagePoint = { at: Date.now(), tokens: 20, calls: 1 };
		const ctx = createMockContext({
			'aiQuotaDashboard.history': { broken: value, healthy: [validPoint] },
		});

		const history = loadHistory(ctx);

		expect(history.get('broken')).toEqual([]);
		expect(history.get('healthy')).toEqual([validPoint]);
	});

	it('过滤数组内非法点并保留合法旧点的缺 kind 兼容语义', () => {
		const legacy: UsagePoint = { at: Date.now() - 1000, tokens: 50, calls: 1 };
		const ctx = createMockContext({
			'aiQuotaDashboard.history': {
				svc: [
					null,
					'broken',
					42,
					[],
					{ tokens: 10 },
					{ at: Number.NaN, tokens: 10 },
					{ at: Number.POSITIVE_INFINITY, tokens: 10 },
					{ at: '2025-01-01', tokens: 10 },
					legacy,
				],
			},
		});

		const history = loadHistory(ctx);

		expect(history.get('svc')).toEqual([legacy]);
		expect(history.get('svc')?.[0].kind).toBeUndefined();
	});
});

describe('attachHistory', () => {
	it('returns data with empty history when no saved history exists', () => {
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: Date.now(),
			history: [{ at: Date.now(), tokens: 100 }],
		};
		const historyMap = new Map<string, UsagePoint[]>();

		const result = attachHistory(data, historyMap);
		expect(result.history).toEqual(data.history);
	});

	it('merges saved history with API history', () => {
		const now = Date.now();
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
			history: [{ at: now, tokens: 100 }],
		};
		const savedHistory: UsagePoint[] = [
			{ at: now - 3600000, tokens: 50 },
		];
		const historyMap = new Map<string, UsagePoint[]>([['test', savedHistory]]);

		const result = attachHistory(data, historyMap);
		expect(result.history?.length ?? 0).toBeGreaterThan(0);
	});

	it.each([
		{ label: 'string', value: 'broken' },
		{ label: 'number', value: 42 },
		{ label: 'null', value: null },
		{ label: 'object', value: { unexpected: true } },
	])('savedHistory 为 $label 时按空数组恢复并保留 API 历史', ({ value }) => {
		const now = Date.now();
		const apiHistory: UsagePoint[] = [{ at: now, tokens: 100, calls: 1 }];
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
			history: apiHistory,
		};
		const historyMap = new Map<string, UsagePoint[]>([
			['test', value as unknown as UsagePoint[]],
		]);

		const result = attachHistory(data, historyMap);

		expect(result.history).toEqual(apiHistory);
	});

	it('savedHistory 数组内非法点被过滤且不参与日期合并与排序', () => {
		const now = Date.now();
		const legacy: UsagePoint = { at: now - 86400000, tokens: 50, calls: 1 };
		const current: UsagePoint = { at: now, tokens: 100, calls: 1 };
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
			history: [current],
		};
		const savedHistory = [
			null,
			'broken',
			42,
			{ at: Number.NaN, tokens: 1 },
			{ at: Number.NEGATIVE_INFINITY, tokens: 1 },
			legacy,
		] as unknown as UsagePoint[];
		const historyMap = new Map<string, UsagePoint[]>([['test', savedHistory]]);

		const result = attachHistory(data, historyMap);

		expect(result.history).toEqual([legacy, current]);
		expect(result.history?.[0].kind).toBeUndefined();
	});

	it('skips error data', () => {
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
			err: 'API Error',
		};
		const historyMap = new Map<string, UsagePoint[]>();

		const result = attachHistory(data, historyMap);
		expect(result.history).toBeUndefined();
	});

	it('skips data with empty slots', () => {
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
		};
		const historyMap = new Map<string, UsagePoint[]>();

		const result = attachHistory(data, historyMap);
		expect(result.history).toBeUndefined();
	});
});

describe('attachHistory 缓存污染防护（extension.ts:229 缓存命中路径）', () => {
	it('不原地修改传入的 data 对象及其 history 数组', () => {
		const now = Date.now();
		const apiHistory: UsagePoint[] = [{ at: now, tokens: 100, calls: 1 }];
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
			history: apiHistory,
		};
		const saved: UsagePoint[] = [{ at: now - 86400000, tokens: 50, calls: 1 }];
		const historyMap = new Map<string, UsagePoint[]>([['test', saved]]);
		const dataSnapshot = JSON.stringify(data);
		const savedSnapshot = JSON.stringify(saved);

		attachHistory(data, historyMap);

		// 双方输入在调用后保持原样（无原地修改 → 缓存对象不被污染）
		expect(JSON.stringify(data)).toBe(dataSnapshot);
		expect(JSON.stringify(saved)).toBe(savedSnapshot);
	});

	it('不原地修改传入的 historyMap 中的数组', () => {
		const now = Date.now();
		const saved: UsagePoint[] = [{ at: now - 86400000, tokens: 50, calls: 1 }];
		const historyMap = new Map<string, UsagePoint[]>([['test', saved]]);
		const historyMapSnapshot = JSON.stringify(Array.from(historyMap.entries()));
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
			history: [{ at: now, tokens: 100, calls: 1 }],
		};

		attachHistory(data, historyMap);
		expect(JSON.stringify(Array.from(historyMap.entries()))).toBe(historyMapSnapshot);
	});

	it('缓存命中后重复 attach 幂等：不产生重复点、不丢点', () => {
		const day = 86400000;
		const now = Date.now();
		const historyMap = new Map<string, UsagePoint[]>([['test', [
			{ at: now - 2 * day, tokens: 10, calls: 1 },
			{ at: now - 1 * day, tokens: 20, calls: 1 },
		]]]);
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
			history: [{ at: now, tokens: 30, calls: 1 }],
		};

		// 第一次附加（fetchSingleService 路径）
		const first = attachHistory(data, historyMap);
		expect(first.history?.length).toBe(3);

		// 第二次附加（doPullAll 缓存命中路径：对同一结果对象再 attach）
		const second = attachHistory(first, historyMap);
		expect(second.history?.length).toBe(3);
		expect(JSON.stringify(second.history)).toBe(JSON.stringify([
			{ at: now - 2 * day, tokens: 10, calls: 1 },
			{ at: now - 1 * day, tokens: 20, calls: 1 },
			{ at: now, tokens: 30, calls: 1 },
		]));
	});

	it('apiHistory 为空时复用持久化数组：重复 attach 不放大数组', () => {
		const now = Date.now();
		const saved: UsagePoint[] = [{ at: now, tokens: 10, calls: 1 }];
		const historyMap = new Map<string, UsagePoint[]>([['test', saved]]);
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'T', percent: 1, used: 1, limit: 100 }],
			updatedAt: now,
			history: [],
		};

		const first = attachHistory(data, historyMap);
		expect(first.history?.length).toBe(1);

		// 缓存命中后再次 attach（apiHistory 与 savedHistory 内容一致）
		const second = attachHistory(first, historyMap);
		expect(second.history?.length).toBe(1);
		// 持久化数组本体未被污染（长度不变）
		expect(saved.length).toBe(1);
	});
});

describe('saveHistory', () => {
	it('cleans history for removed services when profiles provided', async () => {
		const ctx = createMockContext({
			'aiQuotaDashboard.history': {
				'old-service': [{ at: Date.now(), tokens: 10, calls: 1 }],
				'keep-service': [{ at: Date.now(), tokens: 20, calls: 1 }],
			},
		});

		const data: ServiceData = {
			id: 'keep-service',
			name: 'Keep',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: Date.now(),
		};

		const profiles: ServiceProfile[] = [{ id: 'keep-service', kind: 'test', displayName: 'Keep' }];

		await saveHistory(ctx, new Map([['keep-service', data]]), profiles);

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(Object.keys(stored)).toEqual(['keep-service']);
	});

	it('profiles 已删除服务即使仍在 dataMap 中也不写入新历史', async () => {
		const now = Date.now();
		const ctx = createMockContext({
			'aiQuotaDashboard.history': {
				'old-service': [{ at: now - 1000, tokens: 10, calls: 1 }],
			},
		});
		const oldData: ServiceData = {
			id: 'old-service',
			name: 'Old',
			kind: 'test',
			slots: [{ label: 'Test', percent: 90, used: 900, limit: 1000 }],
			updatedAt: now,
		};
		const keepData: ServiceData = {
			id: 'keep-service',
			name: 'Keep',
			kind: 'test',
			slots: [{ label: 'Test', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
		};
		const profiles: ServiceProfile[] = [
			{ id: 'keep-service', kind: 'test', displayName: 'Keep' },
		];

		await saveHistory(ctx, new Map([
			['old-service', oldData],
			['keep-service', keepData],
		]), profiles);

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(Object.keys(stored)).toEqual(['keep-service']);
		expect(stored['old-service']).toBeUndefined();
		expect(stored['keep-service']).toHaveLength(1);
		expect(stored['keep-service'][0].tokens).toBe(100);
	});

	it.each([
		{ label: 'string', value: 'broken' },
		{ label: 'number', value: 42 },
		{ label: 'null', value: null },
		{ label: 'object', value: { unexpected: true } },
	])('existing 单服务历史为 $label 时按空历史保存新点并保留其他服务', async ({ value }) => {
		const now = Date.now();
		const healthyPoint: UsagePoint = { at: now - 1000, tokens: 20, calls: 1 };
		const ctx = createMockContext({
			'aiQuotaDashboard.history': { svc: value, healthy: [healthyPoint] },
		});
		const data: ServiceData = {
			id: 'svc',
			name: 'Svc',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
		};
		const profiles: ServiceProfile[] = [
			{ id: 'svc', kind: 'test', displayName: 'Svc' },
			{ id: 'healthy', kind: 'test', displayName: 'Healthy' },
		];

		await saveHistory(ctx, new Map([['svc', data]]), profiles);

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(stored['svc']).toHaveLength(1);
		expect(stored['svc'][0].tokens).toBe(100);
		expect(stored['healthy']).toEqual([healthyPoint]);
	});

	it('existing 数组内非法点被过滤，合法旧点与新点正常保留', async () => {
		const now = Date.now();
		const legacy: UsagePoint = { at: now - 1000, tokens: 50, calls: 1 };
		const healthyPoint: UsagePoint = { at: now - 2000, tokens: 20, calls: 1 };
		const ctx = createMockContext({
			'aiQuotaDashboard.history': {
				svc: [
					null,
					'broken',
					42,
					{ tokens: 10 },
					{ at: Number.NaN, tokens: 10 },
					{ at: Number.POSITIVE_INFINITY, tokens: 10 },
					legacy,
				],
				healthy: [healthyPoint],
			},
		});
		const data: ServiceData = {
			id: 'svc',
			name: 'Svc',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
		};
		const profiles: ServiceProfile[] = [
			{ id: 'svc', kind: 'test', displayName: 'Svc' },
			{ id: 'healthy', kind: 'test', displayName: 'Healthy' },
		];

		await saveHistory(ctx, new Map([['svc', data]]), profiles);

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(stored['svc']).toHaveLength(2);
		expect(stored['svc'][0]).toEqual(legacy);
		expect(stored['svc'][0].kind).toBeUndefined();
		expect(stored['svc'][1].tokens).toBe(100);
		expect(stored['healthy']).toEqual([healthyPoint]);
	});

	it.each([null, [], 'broken', 42, new Date(0)])('existing 历史结构损坏（%s）时按空历史保存新点', async existing => {
		const ctx = createMockContext({ 'aiQuotaDashboard.history': existing });
		const data: ServiceData = {
			id: 'svc',
			name: 'Svc',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: Date.now(),
		};

		await saveHistory(ctx, new Map([['svc', data]]));

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(Object.keys(stored)).toEqual(['svc']);
		expect(stored['svc']).toHaveLength(1);
		expect(stored['svc'][0].tokens).toBe(100);
	});

	it('主槽有绝对量 used 时数据点打标 tokens', async () => {
		const ctx = createMockContext();
		const data: ServiceData = {
			id: 'svc',
			name: 'Svc',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: Date.now(),
		};

		await saveHistory(ctx, new Map([['svc', data]]));
		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(stored['svc']).toHaveLength(1);
		expect(stored['svc'][0].kind).toBe('tokens');
		expect(stored['svc'][0].tokens).toBe(100);
	});

	it('主槽无 used（GLM TOKENS_LIMIT 场景）时数据点打标 percent 并记录百分比', async () => {
		const ctx = createMockContext();
		const data: ServiceData = {
			id: 'glm-1',
			name: 'GLM',
			kind: 'glm',
			slots: [{ label: '每5小时额度', percent: 87 }],
			updatedAt: Date.now(),
		};

		await saveHistory(ctx, new Map([['glm-1', data]]));
		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(stored['glm-1']).toHaveLength(1);
		expect(stored['glm-1'][0].kind).toBe('percent');
		expect(stored['glm-1'][0].tokens).toBe(87);
	});

	it('语义打标变化（tokens → percent）时即使数值相同也记录新点', async () => {
		const ctx = createMockContext();
		const base: Omit<ServiceData, 'slots'> = { id: 'svc', name: 'Svc', kind: 'test', updatedAt: Date.now() };
		await saveHistory(ctx, new Map([['svc', { ...base, slots: [{ label: 'T', percent: 50, used: 50, limit: 100 }] }]]));
		await saveHistory(ctx, new Map([['svc', { ...base, slots: [{ label: 'T', percent: 50 }] }]]));

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(stored['svc']).toHaveLength(2);
		expect(stored['svc'][0].kind).toBe('tokens');
		expect(stored['svc'][1].kind).toBe('percent');
	});

	it.each([
		{ label: 'noKey', state: { noKey: true } },
		{ label: 'staleError', state: { staleError: '刷新失败' } },
	])('$label 即使保留 slots 也不写历史，并保留既有历史', async ({ state }) => {
		const previous: UsagePoint[] = [{ at: Date.now() - 1000, tokens: 20, calls: 1, kind: 'tokens' }];
		const ctx = createMockContext({ 'aiQuotaDashboard.history': { svc: previous } });
		const data: ServiceData = {
			id: 'svc',
			name: 'Svc',
			kind: 'test',
			slots: [{ label: 'T', percent: 90, used: 900, limit: 1000 }],
			updatedAt: Date.now(),
			...state,
		};

		// checkQuotaWarnings 与 saveHistory 共用此判定，stale/noKey 均不会触发预警或写历史。
		expect(isFreshServiceData(data)).toBe(false);
		await saveHistory(ctx, new Map([['svc', data]]));

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(stored['svc']).toEqual(previous);
		expect(stored['svc']).toHaveLength(1);
		expect(stored['svc'][0].tokens).toBe(20);
	});
});

describe('attachHistory 本地日期去重', () => {
	it('本地日期不同的两点（跨本地午夜）不合并，任何时区下均成立', () => {
		// 用本地时间构造 23:45 与次日 00:15：本地日期必然不同，
		// 旧 UTC 键在部分时区会把两点归入同一 UTC 日而错误合并
		const d1 = new Date(2025, 5, 10, 23, 45).getTime();
		const d2 = new Date(2025, 5, 11, 0, 15).getTime();
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: d2,
			history: [{ at: d2, tokens: 20, calls: 1 }],
		};
		const historyMap = new Map<string, UsagePoint[]>([['test', [{ at: d1, tokens: 10, calls: 1 }]]]);

		const result = attachHistory(data, historyMap);
		expect(result.history).toHaveLength(2);
	});

	it('本地日期相同的两点（分钟级多次刷新）去重保留一个', () => {
		const d1 = new Date(2025, 5, 10, 10, 0).getTime();
		const d2 = new Date(2025, 5, 10, 10, 30).getTime();
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: d2,
			history: [{ at: d2, tokens: 20, calls: 1 }],
		};
		const historyMap = new Map<string, UsagePoint[]>([['test', [{ at: d1, tokens: 10, calls: 1 }]]]);

		const result = attachHistory(data, historyMap);
		expect(result.history).toHaveLength(1);
	});

	it('存量无 kind 字段的历史点读取容忍（不回写迁移）', () => {
		const now = Date.now();
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [{ label: 'T', percent: 50, used: 100, limit: 200 }],
			updatedAt: now,
		};
		// 模拟旧版写入的无 kind 数据点
		const legacy = [{ at: now - 86400000, tokens: 50, calls: 1 }];
		const historyMap = new Map<string, UsagePoint[]>([['test', legacy]]);

		const result = attachHistory(data, historyMap);
		expect(result.history).toHaveLength(1);
		expect(result.history?.[0].kind).toBeUndefined();
	});
});
