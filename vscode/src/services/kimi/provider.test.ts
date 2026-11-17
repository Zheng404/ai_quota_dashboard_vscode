import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	isKimiCodeApiKey,
	parseCodeUsageSlot,
	parseCodeLimitsSlot,
	kimiProvider,
} from './provider';
import { KIMI_CODE_API_BASE, KIMI_CODE_API_BASE_GLOBAL } from './constants';
import { KimiServiceData } from './types';
import { getJson } from '../../core/fetch';

// mock HTTP 客户端，验证凭证识别后的路由行为（不发真实请求）
vi.mock('../../core/fetch', () => ({
	getJson: vi.fn(),
}));

describe('KIMI_CODE_API_BASE', () => {
	it('is the correct Code API base URL', () => {
		expect(KIMI_CODE_API_BASE).toBe('https://api.kimi.com');
	});
});

describe('isKimiCodeApiKey', () => {
	it('identifies sk- prefixed key as Code API key', () => {
		expect(isKimiCodeApiKey('sk-kimi-abc123')).toBe(true);
		expect(isKimiCodeApiKey('sk-anything')).toBe(true);
	});

	it('tolerates surrounding whitespace', () => {
		expect(isKimiCodeApiKey('  sk-kimi-abc123 ')).toBe(true);
	});

	it('rejects JWT (web) tokens', () => {
		expect(isKimiCodeApiKey('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig')).toBe(false);
	});

	it('rejects empty or non-string input', () => {
		expect(isKimiCodeApiKey('')).toBe(false);
		expect(isKimiCodeApiKey(undefined as unknown as string)).toBe(false);
	});
});

describe('parseCodeUsageSlot', () => {
	it('returns undefined for missing usage', () => {
		expect(parseCodeUsageSlot(undefined)).toBeUndefined();
	});

	it('uses usedPercent when present', () => {
		const slot = parseCodeUsageSlot({
			usedPercent: 42,
			used: 420,
			limit: 1000,
			resetAt: '2026-01-05T00:00:00Z',
		});
		expect(slot?.label).toBe('本周用量');
		expect(slot?.percent).toBe(42);
		expect(slot?.used).toBe(420);
		expect(slot?.limit).toBe(1000);
		expect(slot?.resetsAt).toBe(Date.parse('2026-01-05T00:00:00Z'));
	});

	it('falls back to used/limit when usedPercent missing', () => {
		const slot = parseCodeUsageSlot({ used: 250, limit: 1000 });
		expect(slot?.percent).toBe(25);
	});

	it('accepts string-typed used/limit', () => {
		const slot = parseCodeUsageSlot({ used: '250', limit: '500' });
		expect(slot?.percent).toBe(50);
		expect(slot?.used).toBe(250);
		expect(slot?.limit).toBe(500);
	});

	it('defaults percent to 0 when all fields missing', () => {
		const slot = parseCodeUsageSlot({});
		expect(slot?.percent).toBe(0);
		expect(slot?.used).toBeUndefined();
		expect(slot?.limit).toBeUndefined();
		expect(slot?.resetsAt).toBeUndefined();
	});

	it('does not coerce null, undefined or whitespace counters to zero', () => {
		const nullSlot = parseCodeUsageSlot({ usedPercent: 10, used: null as unknown as string, limit: undefined });
		const blankSlot = parseCodeUsageSlot({ usedPercent: 10, used: ' \n', limit: '\t' });

		expect(nullSlot?.used).toBeUndefined();
		expect(nullSlot?.limit).toBeUndefined();
		expect(blankSlot?.used).toBeUndefined();
		expect(blankSlot?.limit).toBeUndefined();
	});

	it('parses unix-seconds resetAt into milliseconds', () => {
		const slot = parseCodeUsageSlot({ usedPercent: 10, resetAt: 1767225600 });
		expect(slot?.resetsAt).toBe(1767225600 * 1000);
	});

	it('caps percent at 100', () => {
		const slot = parseCodeUsageSlot({ usedPercent: 150 });
		expect(slot?.percent).toBe(100);
	});
});

describe('parseCodeLimitsSlot', () => {
	it('returns undefined for missing or empty limits', () => {
		expect(parseCodeLimitsSlot(undefined)).toBeUndefined();
		expect(parseCodeLimitsSlot([])).toBeUndefined();
	});

	it('picks the 5h window (300 TIME_UNIT_MINUTE) among multiple windows', () => {
		const slot = parseCodeLimitsSlot([
			{ duration: 10080, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 30 },
			{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 60, used: 600, limit: 1000 },
		]);
		expect(slot?.label).toBe('频率限制明细 (5hour)');
		expect(slot?.percent).toBe(60);
		expect(slot?.used).toBe(600);
		expect(slot?.limit).toBe(1000);
	});

	it('falls back to shortest window when no 5h window present', () => {
		const slot = parseCodeLimitsSlot([
			{ duration: 7, timeUnit: 'TIME_UNIT_DAY', usedPercent: 30 }, // 10080 min
			{ duration: 60, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 15 }, // 60 min
		]);
		expect(slot?.label).toBe('频率限制明细 (1hour)');
		expect(slot?.percent).toBe(15);
	});

	it('skips an invalid 5h window and selects the shortest valid window', () => {
		const slot = parseCodeLimitsSlot([
			{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', used: 'invalid', limit: '100' },
			{ duration: 60, timeUnit: 'TIME_UNIT_MINUTE', used: '15', limit: '100' },
		]);

		expect(slot?.label).toBe('频率限制明细 (1hour)');
		expect(slot?.percent).toBe(15);
		expect(slot?.used).toBe(15);
		expect(slot?.limit).toBe(100);
	});

	it('floors a 90-minute window label to one hour', () => {
		const slot = parseCodeLimitsSlot([
			{ duration: 90, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 15 },
		]);

		expect(slot?.label).toBe('频率限制明细 (1hour)');
	});

	it('accepts bare MINUTE time unit for 5h window matching', () => {
		const slot = parseCodeLimitsSlot([
			{ duration: 300, timeUnit: 'MINUTE', usedPercent: 55 },
		]);
		expect(slot?.label).toBe('频率限制明细 (5hour)');
	});

	it('supports nested window/detail together with legacy flat windows', () => {
		const resetTime = '2026-11-15T15:19:45.835938Z';
		const slot = parseCodeLimitsSlot([
			{ duration: 10080, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 30 },
			{
				window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
				detail: { used: '56', limit: '100', resetTime },
			},
		]);

		expect(slot).toMatchObject({
			label: '频率限制明细 (5hour)',
			used: 56,
			limit: 100,
			resetsAt: Date.parse(resetTime),
		});
		expect(slot?.percent).toBeCloseTo(56);
	});
});

describe('Kimi Code usages response compatibility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function fetchSlots(response: Record<string, unknown>) {
		vi.mocked(getJson).mockResolvedValue(response);
		const data = await kimiProvider.fetch('sk-kimi-test', undefined);
		return data.slots;
	}

	it('does not fabricate zero usage from blank legacy usage and limits counters', async () => {
		const slots = await fetchSlots({
			usage: { used: ' \n', limit: '1000' },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', used: '', limit: '100' }],
			usages: {
				limit_5h: { used_ratio: 0.25 },
				limit_7d: { used_ratio: 0.5 },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([25, 50]);
		expect(slots.every(slot => slot.used === undefined && slot.limit === undefined)).toBe(true);
	});

	it('parses a legacy-only usage/limits response', async () => {
		const slots = await fetchSlots({
			usage: { usedPercent: 40, used: 400, limit: 1000 },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 55 }],
		});

		expect(slots.map(slot => slot.label)).toEqual(['频率限制明细 (5hour)', '本周用量']);
		expect(slots.map(slot => slot.percent)).toEqual([55, 40]);
	});

	it('keeps legacy counters for a real mixed response without monthly pools', async () => {
		const slots = await fetchSlots({
			usage: { usedPercent: 36.75, used: '367', limit: '1000' },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 12.5 }],
			usages: {
				limit_5h: { used_ratio: 0.75 },
				limit_7d: { used_ratio: 0.875 },
			},
		});

		expect(slots).toHaveLength(2);
		expect(slots.map(slot => slot.percent)).toEqual([12.5, 36.75]);
		expect(slots.some(slot => slot.label.includes('本月'))).toBe(false);
	});

	it('parses the real nested response and keeps legacy counters ahead of ratios', async () => {
		const usageReset = '2026-11-16T11:19:45.835938Z';
		const detailReset = '2026-11-15T15:19:45.835938Z';
		const slots = await fetchSlots({
			usage: {
				limit: '100',
				used: '38',
				remaining: '62',
				resetTime: usageReset,
			},
			limits: [{
				window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
				detail: {
					limit: '100',
					used: '56',
					remaining: '44',
					resetTime: detailReset,
				},
			}],
			usages: {
				limit_5h: { used_ratio: 0.556, reset_time: '2026-11-15T16:00:00Z' },
				limit_7d: { used_ratio: 0.3797, reset_time: '2026-11-16T12:00:00Z' },
			},
		});

		expect(slots.map(slot => slot.label)).toEqual(['频率限制明细 (5hour)', '本周用量']);
		expect(slots[0]?.percent).toBeCloseTo(56);
		expect(slots[1]?.percent).toBe(38);
		expect(slots.map(slot => slot.used)).toEqual([56, 38]);
		expect(slots.map(slot => slot.limit)).toEqual([100, 100]);
		expect(slots.map(slot => slot.resetsAt)).toEqual([
			Date.parse(detailReset),
			Date.parse(usageReset),
		]);
		expect(slots).toHaveLength(2);
		expect(slots.some(slot => slot.label.includes('本月'))).toBe(false);
	});

	it('falls back to valid ratios when old flat and nested counters are invalid', async () => {
		const reset5h = '2026-11-15T15:19:45.835938Z';
		const reset7d = '2026-11-16T11:19:45.835938Z';
		const slots = await fetchSlots({
			usage: { used: 'broken', limit: '100', resetTime: '2026-01-01T00:00:00Z' },
			limits: [{
				window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
				detail: { used: 'broken', limit: '100', resetTime: '2026-01-01T00:00:00Z' },
			}],
			usages: {
				limit_5h: { used_ratio: 0.556, reset_time: reset5h },
				limit_7d: { used_ratio: 0.3797, reset_time: reset7d },
			},
		});

		expect(slots.map(slot => slot.label)).toEqual(['频率限制明细 (5hour)', '本周用量']);
		expect(slots[0]?.percent).toBeCloseTo(55.6);
		expect(slots[1]?.percent).toBeCloseTo(37.97);
		expect(slots.map(slot => slot.resetsAt)).toEqual([
			Date.parse(reset5h),
			Date.parse(reset7d),
		]);
		expect(slots.every(slot => slot.used === undefined && slot.limit === undefined)).toBe(true);
	});

	it('uses the new 5h pool only when legacy limits are unavailable', async () => {
		const slots = await fetchSlots({
			usage: { usedPercent: 40 },
			usages: {
				limit_5h: { used_ratio: 0.125 },
				limit_7d: { used_ratio: 0.875 },
			},
		});

		expect(slots.map(slot => slot.label)).toEqual(['频率限制明细 (5hour)', '本周用量']);
		expect(slots.map(slot => slot.percent)).toEqual([12.5, 40]);
	});

	it('uses the new 7d pool only when legacy usage is unavailable', async () => {
		const slots = await fetchSlots({
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 55 }],
			usages: {
				limit_5h: { used_ratio: 0.75 },
				limit_7d: { used_ratio: 0.25 },
				limit_month_total: { used_ratio: 0.5 },
			},
		});

		expect(slots.map(slot => slot.label)).toEqual([
			'频率限制明细 (5hour)',
			'本周用量',
			'本月总额度用量',
		]);
		expect(slots.map(slot => slot.percent)).toEqual([55, 25, 50]);
	});

	it('parses all four new ratio pools in stable slot order', async () => {
		const slots = await fetchSlots({
			usages: {
				limit_month_code: { used_ratio: 0.75 },
				limit_7d: { used_ratio: 0.25 },
				limit_month_total: { used_ratio: 0.5 },
				limit_5h: { used_ratio: 0.125 },
			},
		});

		expect(slots.map(slot => slot.label)).toEqual([
			'频率限制明细 (5hour)',
			'本周用量',
			'本月总额度用量',
			'本月 Coding 用量（含于总额）',
		]);
		expect(slots.map(slot => slot.percent)).toEqual([12.5, 25, 50, 75]);
	});

	it('omits monthly slots when the new response only has 5h and 7d pools', async () => {
		const slots = await fetchSlots({
			usages: {
				limit_5h: { used_ratio: 0.25 },
				limit_7d: { used_ratio: 0.5 },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([25, 50]);
		expect(slots).toHaveLength(2);
	});

	it('accepts numeric-string ratios without guessing their unit', async () => {
		const slots = await fetchSlots({
			usages: {
				limit_5h: { used_ratio: '0.125' },
				limit_7d: { used_ratio: '0.25' },
				limit_month_total: { used_ratio: '0.5' },
				limit_month_code: { used_ratio: '0.75' },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([12.5, 25, 50, 75]);
	});

	it.each([
		{ name: 'NaN', value: Number.NaN },
		{ name: 'Infinity', value: Number.POSITIVE_INFINITY },
		{ name: 'non-numeric string', value: 'not-a-number' },
	])('skips $name ratio values instead of fabricating 0%', async ({ value }) => {
		const slots = await fetchSlots({
			usages: {
				limit_5h: { used_ratio: value },
				limit_7d: { used_ratio: 0.25 },
			},
		});

		expect(slots).toHaveLength(1);
		expect(slots[0]?.label).toBe('本周用量');
		expect(slots[0]?.percent).toBe(25);
	});

	it('skips a malformed new fallback while retaining the other legacy window', async () => {
		const slots = await fetchSlots({
			usage: { usedPercent: 40 },
			usages: {
				limit_5h: { used_ratio: 'broken' },
				limit_7d: { used_ratio: 0.875 },
				limit_month_code: { used_ratio: '' },
			},
		});

		expect(slots.map(slot => slot.label)).toEqual(['本周用量']);
		expect(slots.map(slot => slot.percent)).toEqual([40]);
	});

	it('clamps negative and greater-than-one ratios to 0 and 100', async () => {
		const slots = await fetchSlots({
			usages: {
				limit_5h: { used_ratio: -0.25 },
				limit_7d: { used_ratio: 1.25 },
				limit_month_total: { used_ratio: '-1' },
				limit_month_code: { used_ratio: '2' },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([0, 100, 0, 100]);
	});

	it('prefers both legacy primary slots over valid new ratio fallbacks', async () => {
		const slots = await fetchSlots({
			usage: { usedPercent: 20 },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 10 }],
			usages: {
				limit_5h: { used_ratio: 0.8 },
				limit_7d: { used_ratio: 0.9 },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([10, 20]);
	});

	it('retains legacy values when corresponding new fallback values are malformed', async () => {
		const slots = await fetchSlots({
			usage: { used: 250, limit: 1000 },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 15 }],
			usages: {
				limit_5h: { used_ratio: 'broken' },
				limit_7d: { used_ratio: Number.NaN },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([15, 25]);
	});

	it('reuses reset timestamp conversion for ISO reset_time values', async () => {
		const reset5h = '2026-11-15T12:00:00Z';
		const reset7d = '2026-11-22T00:00:00Z';
		const resetMonth = '2026-12-01T00:00:00Z';
		const slots = await fetchSlots({
			usages: {
				limit_5h: { used_ratio: 0.25, reset_time: reset5h },
				limit_7d: { used_ratio: 0.5, reset_time: reset7d },
				limit_month_total: { used_ratio: 0.75, reset_time: resetMonth },
				limit_month_code: { used_ratio: 0.75, reset_time: resetMonth },
			},
		});

		expect(slots.map(slot => slot.resetsAt)).toEqual([
			Date.parse(reset5h),
			Date.parse(reset7d),
			Date.parse(resetMonth),
			Date.parse(resetMonth),
		]);
	});

	it('keeps valid ratios but omits malformed reset_time values', async () => {
		const slots = await fetchSlots({
			usages: {
				limit_5h: { used_ratio: 0.25, reset_time: 'not-a-date' },
				limit_7d: { used_ratio: 0.5, reset_time: '' },
			},
		});

		expect(slots.map(slot => slot.percent)).toEqual([25, 50]);
		expect(slots.map(slot => slot.resetsAt)).toEqual([undefined, undefined]);
	});

	it('omits malformed monthly pools while retaining valid legacy windows', async () => {
		const slots = await fetchSlots({
			usage: { usedPercent: 40 },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 20 }],
			usages: {
				limit_month_total: { used_ratio: Number.POSITIVE_INFINITY },
				limit_month_code: { used_ratio: '' },
			},
		});

		expect(slots).toHaveLength(2);
		expect(slots.some(slot => slot.label.includes('本月'))).toBe(false);
	});

	it('throws a structural error when every old and new window is empty or invalid', async () => {
		vi.mocked(getJson).mockResolvedValue({
			usages: {
				limit_5h: {},
				limit_7d: { used_ratio: 'broken' },
				limit_month_total: { used_ratio: null },
				limit_month_code: {},
			},
		});

		await expect(kimiProvider.fetch('sk-kimi-test', undefined))
			.rejects.toThrow('Kimi Code 接口响应结构异常');
	});
});

describe('kimiProvider.fetch credential routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('trims surrounding whitespace from the Code API key in authorization headers', async () => {
		vi.mocked(getJson).mockResolvedValue({ usage: { usedPercent: 40 } });

		await kimiProvider.fetch(' \n\tsk-kimi-test \r\n', undefined);

		const calls = vi.mocked(getJson).mock.calls;
		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call[1]).toStrictEqual({ 'Authorization': 'Bearer sk-kimi-test' });
		}
	});

	it('routes sk- key to Code API path', async () => {
		vi.mocked(getJson).mockResolvedValue({
			usage: { usedPercent: 40, used: 400, limit: 1000 },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 55 }],
		});

		const data = await kimiProvider.fetch('sk-kimi-test', undefined) as KimiServiceData;

		expect(getJson).toHaveBeenCalledTimes(2);
		expect(getJson).toHaveBeenCalledWith(
			`${KIMI_CODE_API_BASE}/coding/v1/usages`,
			{ 'Authorization': 'Bearer sk-kimi-test' },
			15000,
			undefined,
			undefined,
		);
		expect(getJson).toHaveBeenCalledWith(
			`${KIMI_CODE_API_BASE}/coding/v1/me`,
			{ 'Authorization': 'Bearer sk-kimi-test' },
			15000,
			undefined,
			undefined,
		);
		// 仅两个槽位：5h 频限 + 本周用量，无月度权益槽
		expect(data.slots).toHaveLength(2);
		expect(data.slots[0]?.label).toBe('频率限制明细 (5hour)');
		expect(data.slots[1]?.label).toBe('本周用量');
	});

	it('uses the normalized international origin for both usages and membership requests', async () => {
		const logger = { log: vi.fn() };
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) return Promise.resolve({ user_level_name: 'Allegretto' });
			return Promise.resolve({ usage: { usedPercent: 40 } });
		});

		await kimiProvider.fetch('sk-kimi-test', `${KIMI_CODE_API_BASE_GLOBAL}/ignored/path?from=settings`, logger);

		const calls = vi.mocked(getJson).mock.calls;
		expect(calls.map(call => call[0])).toStrictEqual([
			`${KIMI_CODE_API_BASE_GLOBAL}/coding/v1/usages`,
			`${KIMI_CODE_API_BASE_GLOBAL}/coding/v1/me`,
		]);
		expect(calls.every(call => call[4] === logger)).toBe(true);
	});

	it.each([
		'not-a-valid-url',
		'http://api.kimi.ai',
		'https://api.kimi.ai.evil.example',
		'https://api.kimi.ai:8443/path',
		'https://example.com/api.kimi.ai',
	])('falls back to the default origin for invalid endpoint %s', async (endpoint) => {
		vi.mocked(getJson).mockResolvedValue({ usage: { usedPercent: 40 } });

		await kimiProvider.fetch('sk-kimi-test', endpoint);

		expect(vi.mocked(getJson).mock.calls.map(call => call[0])).toStrictEqual([
			`${KIMI_CODE_API_BASE}/coding/v1/usages`,
			`${KIMI_CODE_API_BASE}/coding/v1/me`,
		]);
	});

	it('maps a valid membership level while preserving official capitalization', async () => {
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) return Promise.resolve({ user_level_name: 'Allegretto' });
			return Promise.resolve({ usage: { usedPercent: 40 } });
		});

		const data = await kimiProvider.fetch('sk-kimi-test', undefined) as KimiServiceData;

		expect(data.level).toBe('Allegretto');
		expect(data.slots.map(slot => slot.percent)).toEqual([40]);
	});

	it('omits blank membership level names', async () => {
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) return Promise.resolve({ user_level_name: '   ' });
			return Promise.resolve({ usage: { usedPercent: 40 } });
		});

		const data = await kimiProvider.fetch('sk-kimi-test', undefined) as KimiServiceData;

		expect(data.level).toBeUndefined();
	});

	it('keeps successful quota data and logs a safe message when the membership request fails', async () => {
		const logger = { log: vi.fn() };
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) {
				return Promise.reject(Object.assign(new Error('membership unavailable'), {
					responseBody: 'membership-personal-profile',
				}));
			}
			return Promise.resolve({ usage: { usedPercent: 40, used: 400, limit: 1000 } });
		});

		const data = await kimiProvider.fetch('sk-kimi-test', undefined, logger) as KimiServiceData;

		expect(data.level).toBeUndefined();
		expect(data.slots.map(slot => slot.percent)).toEqual([40]);
		expect(data.slots[0]?.used).toBe(400);
		expect(data.slots[0]?.limit).toBe(1000);
		expect(logger.log).toHaveBeenCalledWith('[kimi] fetch membership level failed: membership unavailable');
		const messages = logger.log.mock.calls.map(call => call[0]).join('\n');
		expect(messages).not.toContain('sk-kimi-test');
		expect(messages).not.toContain('Authorization');
		expect(messages).not.toContain('membership-personal-profile');
	});

	it('keeps quota data and logs safely when the membership request returns HTTP 401', async () => {
		const apiKey = 'sk-kimi-secret';
		const responseBody = 'membership-sensitive-response-body';
		const logger = { log: vi.fn() };
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) {
				return Promise.reject(Object.assign(new Error('HTTP 401 Unauthorized'), {
					statusCode: 401,
					responseBody,
				}));
			}
			return Promise.resolve({ usage: { usedPercent: 40, used: 400, limit: 1000 } });
		});

		const data = await kimiProvider.fetch(apiKey, undefined, logger) as KimiServiceData;

		expect(data.level).toBeUndefined();
		expect(data.slots.map(slot => slot.percent)).toEqual([40]);
		expect(data.slots[0]?.used).toBe(400);
		expect(data.slots[0]?.limit).toBe(1000);
		expect(logger.log).toHaveBeenCalledWith('[kimi] fetch membership level failed: HTTP 401 Unauthorized');
		const messages = logger.log.mock.calls.map(call => call[0]).join('\n');
		expect(messages).not.toContain(apiKey);
		expect(messages).not.toContain('Authorization');
		expect(messages).not.toContain(responseBody);
	});

	it('starts the membership request before the usages request settles', async () => {
		let resolveUsages!: (value: Record<string, unknown>) => void;
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) return Promise.resolve({ user_level_name: 'Allegretto' });
			return new Promise(resolve => { resolveUsages = resolve; });
		});

		const pending = kimiProvider.fetch('sk-kimi-test', undefined);

		expect(getJson).toHaveBeenCalledTimes(2);
		expect(getJson).toHaveBeenCalledWith(
			`${KIMI_CODE_API_BASE}/coding/v1/me`,
			{ 'Authorization': 'Bearer sk-kimi-test' },
			15000,
			undefined,
			undefined,
		);
		resolveUsages({ usage: { usedPercent: 40 } });
		await expect(pending).resolves.toMatchObject({ level: 'Allegretto' });
	});

	it('does not mask usages errors with a successful membership response', async () => {
		const usagesError = new Error('usages unavailable');
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) return Promise.resolve({ user_level_name: 'Allegretto' });
			return Promise.reject(usagesError);
		});

		await expect(kimiProvider.fetch('sk-kimi-test', undefined)).rejects.toBe(usagesError);
	});

	it('maps usages HTTP 401 to a safe credential guide without exposing request details', async () => {
		const apiKey = 'sk-kimi-secret';
		const rawHttpMessage = 'HTTP 401 Unauthorized from upstream';
		const responseBody = 'usages-sensitive-response-body';
		vi.mocked(getJson).mockImplementation(url => {
			if (url.endsWith('/me')) return Promise.resolve({ user_level_name: 'Allegretto' });
			return Promise.reject(Object.assign(new Error(rawHttpMessage), {
				statusCode: 401,
				responseBody,
			}));
		});

		const error = await kimiProvider.fetch(apiKey, undefined)
			.then(() => undefined, (err: unknown) => err);

		expect(error).toBeInstanceOf(Error);
		const message = (error as Error).message;
		expect(message).toBe('Kimi Code API Key 无效：请检查 Kimi Code 控制台中的 Key 是否正确');
		expect(message).not.toContain(rawHttpMessage);
		expect(message).not.toContain(apiKey);
		expect(message).not.toContain('Authorization');
		expect(message).not.toContain(responseBody);
	});

	it('throws when Code API response has neither usage nor limits', async () => {
		vi.mocked(getJson).mockResolvedValue({});

		await expect(kimiProvider.fetch('sk-kimi-test', undefined))
			.rejects.toThrow('Kimi Code 接口响应结构异常');
	});

	it('throws guiding error for JWT (web) token without making any request', async () => {
		await expect(kimiProvider.fetch('eyJhbGciOiJIUzI1NiJ9.payload.sig', undefined))
			.rejects.toThrow('Kimi 网页登录凭证已不可用（Kimi 已废弃 kimi-auth 机制）。请粘贴 Kimi Code API Key（sk- 开头，Kimi Code 控制台获取）');
		expect(getJson).not.toHaveBeenCalled();
	});

	it('throws guiding error for arbitrary non-sk credential without making any request', async () => {
		await expect(kimiProvider.fetch('some-random-cookie-value', undefined))
			.rejects.toThrow('Kimi 网页登录凭证已不可用');
		expect(getJson).not.toHaveBeenCalled();
	});

	it('throws guiding error for whitespace-only credential without making any request', async () => {
		await expect(kimiProvider.fetch(' \n\t ', undefined))
			.rejects.toThrow('Kimi 网页登录凭证已不可用');
		expect(getJson).not.toHaveBeenCalled();
	});

	it('throws guiding error for empty credential without making any request', async () => {
		await expect(kimiProvider.fetch('', undefined))
			.rejects.toThrow('Kimi 网页登录凭证已不可用');
		expect(getJson).not.toHaveBeenCalled();
	});
});
