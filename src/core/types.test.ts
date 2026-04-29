import { describe, it, expect } from 'vitest';
import { getColorLevel, getColorEmoji, getColorCssClass } from './types';

describe('getColorLevel', () => {
	it('returns success for low usage', () => {
		expect(getColorLevel(0)).toBe('success');
		expect(getColorLevel(74)).toBe('success');
	});

	it('returns warning at threshold', () => {
		expect(getColorLevel(75)).toBe('warning');
		expect(getColorLevel(89)).toBe('warning');
	});

	it('returns danger at threshold', () => {
		expect(getColorLevel(90)).toBe('danger');
		expect(getColorLevel(100)).toBe('danger');
	});

	it('respects custom thresholds', () => {
		expect(getColorLevel(50, { warning: 40, danger: 80 })).toBe('warning');
		expect(getColorLevel(85, { warning: 40, danger: 80 })).toBe('danger');
	});
});

describe('getColorEmoji', () => {
	it('returns correct emojis', () => {
		expect(getColorEmoji('success')).toBe('✅');
		expect(getColorEmoji('warning')).toBe('⚠️');
		expect(getColorEmoji('danger')).toBe('❌');
	});
});

describe('getColorCssClass', () => {
	it('returns level as class name', () => {
		expect(getColorCssClass('success')).toBe('success');
		expect(getColorCssClass('warning')).toBe('warning');
		expect(getColorCssClass('danger')).toBe('danger');
	});
});
