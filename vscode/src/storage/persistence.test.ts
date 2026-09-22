import { describe, it, expect } from 'vitest';
import { attachHistory, saveHistory } from './persistence';
import { ServiceData, ServiceProfile, UsagePoint } from '../core/types';

function createMockContext(initial: Record<string, unknown> = {}): any {
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
	};
}

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

		const profiles: ServiceProfile[] = [{ id: 'keep-service', kind: 'test', displayName: 'Keep', dataSource: 'manual' }];

		await saveHistory(ctx, new Map([['keep-service', data]]), profiles);

		const stored = ctx.globalState.get('aiQuotaDashboard.history', {}) as Record<string, UsagePoint[]>;
		expect(Object.keys(stored)).toEqual(['keep-service']);
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
