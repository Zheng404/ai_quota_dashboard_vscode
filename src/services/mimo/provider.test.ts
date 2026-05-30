import { describe, it, expect } from 'vitest';
import { MIMO_DEFAULT_ENDPOINT, parseItem, parseCategory } from './provider';

describe('MIMO_DEFAULT_ENDPOINT', () => {
	it('is the correct production URL', () => {
		expect(MIMO_DEFAULT_ENDPOINT).toBe('https://platform.xiaomimimo.com');
	});
});

describe('parseItem', () => {
	it('returns undefined for zero limit', () => {
		expect(parseItem({ name: 'test', used: 0, limit: 0, percent: 0 })).toBeUndefined();
	});

	it('handles decimal percent (0-1)', () => {
		const result = parseItem({ name: 'plan_total_token', used: 500, limit: 1000, percent: 0.5 });
		// 使用 used/limit 自行计算，忽略 API 的 percent 字段
		expect(result?.percent).toBe(50);
		expect(result?.used).toBe(500);
		expect(result?.limit).toBe(1000);
		expect(result?.label).toBe('当前套餐用量');
	});

	it('handles percentage percent (0-100)', () => {
		const result = parseItem({ name: 'plan_total_token', used: 750, limit: 1000, percent: 75 });
		// 使用 used/limit 自行计算，percent 字段被忽略
		expect(result?.percent).toBe(75);
	});

	it('handles percentage values above 1 as-is', () => {
		// 使用 used/limit 自行计算：15/1000 * 100 = 1.5
		const result = parseItem({ name: 'test', used: 15, limit: 1000, percent: 1.5 });
		expect(result?.percent).toBe(1.5);
	});

	it('caps percent at 100', () => {
		const result = parseItem({ name: 'test', used: 1000, limit: 1000, percent: 0.999 });
		// used/limit = 1000/1000 = 100%
		expect(result?.percent).toBe(100);
	});

	it('maps compensation token name', () => {
		const result = parseItem({ name: 'compensation_total_token', used: 100, limit: 1000, percent: 0.1 });
		expect(result?.label).toBe('补偿 Token 额度');
	});

	it('uses raw name for unknown items', () => {
		const result = parseItem({ name: 'custom_item', used: 100, limit: 1000, percent: 0.1 });
		expect(result?.label).toBe('custom_item');
	});
});

describe('parseCategory', () => {
	it('returns empty array for undefined', () => {
		expect(parseCategory(undefined)).toEqual([]);
	});

	it('filters out invalid items', () => {
		const result = parseCategory({
			percent: 50,
			items: [
				{ name: 'valid', used: 500, limit: 1000, percent: 0.5 },
				{ name: 'invalid', used: 0, limit: 0, percent: 0 },
			],
		});
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe('valid');
	});
});
