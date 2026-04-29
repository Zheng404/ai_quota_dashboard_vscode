import { describe, it, expect } from 'vitest';
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
		expect(compactCountdown(Date.now() + 2.5 * 3600000)).toMatch(/2.5h/);
	});

	it('formats days with decimal', () => {
		expect(compactCountdown(Date.now() + 2 * 86400000)).toMatch(/2.0d/);
	});
});

describe('fullCountdown', () => {
	it('returns N/A for undefined', () => {
		expect(fullCountdown(undefined)).toBe('N/A');
	});

	it('returns 已用完 for past timestamp', () => {
		expect(fullCountdown(Date.now() - 60000)).toBe('已用完');
	});

	it('formats minutes only', () => {
		const ts = Date.now() + 30 * 60000;
		expect(fullCountdown(ts)).toBe('30分');
	});

	it('formats hours and minutes', () => {
		const ts = Date.now() + 2 * 3600000 + 30 * 60000;
		expect(fullCountdown(ts)).toBe('2时30分');
	});

	it('formats days hours and minutes', () => {
		const ts = Date.now() + 86400000 + 2 * 3600000 + 30 * 60000;
		expect(fullCountdown(ts)).toBe('1天2时30分');
	});
});
