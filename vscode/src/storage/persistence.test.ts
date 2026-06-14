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
