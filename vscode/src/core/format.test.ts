import { describe, it, expect } from 'vitest';
import { fmtNum } from './format';

describe('fmtNum', () => {
	it('returns dash for null', () => {
		expect(fmtNum(undefined)).toBe('-');
	});

	it('returns dash for undefined', () => {
		expect(fmtNum(undefined)).toBe('-');
	});

	it('formats small numbers as-is', () => {
		expect(fmtNum(42)).toBe('42');
		expect(fmtNum(999)).toBe('999');
	});

	it('formats thousands with K', () => {
		expect(fmtNum(1500)).toBe('1.5K');
		expect(fmtNum(1000)).toBe('1.0K');
	});

	it('formats millions with M', () => {
		expect(fmtNum(1500000)).toBe('1.5M');
		expect(fmtNum(1000000)).toBe('1.0M');
	});

	it('formats billions with B', () => {
		expect(fmtNum(1500000000)).toBe('1.50B');
		expect(fmtNum(1000000000)).toBe('1.00B');
	});

	it('handles zero', () => {
		expect(fmtNum(0)).toBe('0');
	});
});
