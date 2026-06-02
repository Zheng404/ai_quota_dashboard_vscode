import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compactCountdown, fullCountdown } from './statusBarRenderer';

describe('compactCountdown', () => {
	it('returns empty string for undefined', () => {
		expect(compactCountdown(undefined)).toBe('');
	});

	it('returns 0m for past timestamp', () => {
		expect(compactCountdown(Date.now() - 60000)).toBe('0m');
	});

	it('formats minutes', () => {
		expect(compactCountdown(Date.now() + 30 * 60000)).toBe('30m');
	});

	it('formats hours with decimal', () => {
		expect(compactCountdown(Date.now() + 2.5 * 3600000)).toMatch(/2\.5h/);
	});

	it('formats days with decimal', () => {
		expect(compactCountdown(Date.now() + 2 * 86400000)).toMatch(/2\.0d/);
	});
});

describe('fullCountdown', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
	});

	it('returns N/A for undefined', () => {
		expect(fullCountdown(undefined)).toBe('N/A');
	});

	it('returns 已用完 for past timestamp', () => {
		expect(fullCountdown(Date.now() - 60000)).toBe('已用完');
	});

	it('formats minutes only', () => {
		expect(fullCountdown(Date.now() + 30 * 60000)).toBe('30分');
	});

	it('formats hours and minutes', () => {
		expect(fullCountdown(Date.now() + 2 * 3600000 + 30 * 60000)).toBe('2时30分');
	});

	it('formats days hours and minutes', () => {
		expect(fullCountdown(Date.now() + 86400000 + 2 * 3600000 + 30 * 60000)).toBe('1天2时30分');
	});
});
