import { describe, it, expect } from 'vitest';
import { KIMI_DEFAULT_ENDPOINT, parseWindowSlot, parseMainSlot, parseBalanceSlot } from './provider';

describe('KIMI_DEFAULT_ENDPOINT', () => {
	it('is the correct production URL', () => {
		expect(KIMI_DEFAULT_ENDPOINT).toBe('https://www.kimi.com');
	});
});

describe('parseWindowSlot', () => {
	it('returns undefined for empty limits', () => {
		expect(parseWindowSlot([])).toBeUndefined();
		expect(parseWindowSlot(undefined as unknown as [])).toBeUndefined();
	});

	it('parses minute window correctly', () => {
		const result = parseWindowSlot([{
			window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
			detail: { limit: '1000', used: '500', resetTime: '2024-01-01T00:00:00Z' },
		}]);
		expect(result).toBeDefined();
		expect(result?.label).toBe('频率限制明细 (5hour)');
		expect(result?.percent).toBe(50);
		expect(result?.used).toBe(500);
		expect(result?.limit).toBe(1000);
	});

	it('parses hour window correctly', () => {
		const result = parseWindowSlot([{
			window: { duration: 5, timeUnit: 'TIME_UNIT_HOUR' },
			detail: { limit: '1000', used: '200' },
		}]);
		expect(result?.label).toBe('频率限制明细 (5hour)');
		expect(result?.percent).toBe(20);
	});

	it('handles unknown timeUnit', () => {
		const result = parseWindowSlot([{
			window: { duration: 7, timeUnit: 'TIME_UNIT_WEEK' },
			detail: { limit: '1000', used: '100' },
		}]);
		expect(result?.label).toBe('频率限制明细 (7)');
	});

	it('returns undefined when detail is missing', () => {
		expect(parseWindowSlot([{ window: { duration: 5 } }])).toBeUndefined();
	});
});

describe('parseMainSlot', () => {
	it('returns undefined for empty detail', () => {
		expect(parseMainSlot(undefined as unknown as never)).toBeUndefined();
	});

	it('calculates percent correctly', () => {
		const result = parseMainSlot({ limit: '1000', used: '750' });
		expect(result?.percent).toBe(75);
		expect(result?.used).toBe(750);
		expect(result?.limit).toBe(1000);
	});

	it('caps percent at 100', () => {
		const result = parseMainSlot({ limit: '100', used: '150' });
		expect(result?.percent).toBe(100);
	});
});

describe('parseBalanceSlot', () => {
	it('returns undefined for empty balances', () => {
		expect(parseBalanceSlot([])).toBeUndefined();
		expect(parseBalanceSlot(undefined as unknown as [])).toBeUndefined();
	});

	it('calculates percent from ratio', () => {
		const result = parseBalanceSlot([{
			feature: 'FEATURE_CODING',
			amountUsedRatio: 0.35,
		}]);
		expect(result?.percent).toBe(35);
		expect(result?.used).toBeUndefined();
		expect(result?.limit).toBeUndefined();
	});

	it('caps percent at 100', () => {
		const result = parseBalanceSlot([{
			feature: 'TEST',
			amountUsedRatio: 1.5,
		}]);
		expect(result?.percent).toBe(100);
	});
});
