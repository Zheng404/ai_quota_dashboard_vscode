import { describe, it, expect } from 'vitest';
import { extractDomain, buildTimeRangeQuery, daysToRange } from './provider';

describe('extractDomain', () => {
	it('extracts domain from full URL with path', () => {
		expect(extractDomain('https://open.bigmodel.cn/api/anthropic'))
			.toBe('https://open.bigmodel.cn');
	});

	it('extracts domain from URL with port', () => {
		expect(extractDomain('https://example.com:8080/path'))
			.toBe('https://example.com:8080');
	});

	it('handles URL without path', () => {
		expect(extractDomain('https://api.example.com'))
			.toBe('https://api.example.com');
	});
});

describe('daysToRange', () => {
	it('returns day for 1 day', () => {
		expect(daysToRange(1)).toBe('day');
	});

	it('returns week for 7 days', () => {
		expect(daysToRange(7)).toBe('week');
	});

	it('returns month for 30 days', () => {
		expect(daysToRange(30)).toBe('month');
	});

	it('returns day for 0 days', () => {
		expect(daysToRange(0)).toBe('day');
	});
});

describe('buildTimeRangeQuery', () => {
	it('returns query string with start and end time', () => {
		const qs = buildTimeRangeQuery(1);
		expect(qs).toMatch(/^\?startTime=/);
		expect(qs).toContain('&endTime=');
	});

	it('returns different query for different days', () => {
		const qs1 = buildTimeRangeQuery(1);
		const qs7 = buildTimeRangeQuery(7);
		expect(qs1).not.toBe(qs7);
	});
});
