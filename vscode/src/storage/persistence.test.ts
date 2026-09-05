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
});
