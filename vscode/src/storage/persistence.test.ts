import { describe, it, expect } from 'vitest';
import { attachHistory } from './persistence';
import { ServiceData, UsagePoint } from '../core/types';

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
