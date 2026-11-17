import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	extractDomain,
	buildTimeRangeQuery,
	daysToRange,
	sanitizeTimestamp,
	parseLimits,
	parseSubscription,
	parseModelUsage,
	glmDetailProvider,
	glmProvider,
} from './provider';
import { getJson } from '../../core/fetch';
import { GlmServiceData } from './types';

// mock HTTP 客户端，验证四个独立请求的编排（不发真实请求）
vi.mock('../../core/fetch', () => ({
	getJson: vi.fn(),
}));

describe('sanitizeTimestamp', () => {
	it('converts seconds to milliseconds', () => {
		expect(sanitizeTimestamp(1789701300)).toBe(1789701300000);
	});

	it('keeps milliseconds as-is', () => {
		expect(sanitizeTimestamp(1789701300000)).toBe(1789701300000);
	});

	it('returns undefined for invalid values', () => {
		expect(sanitizeTimestamp(0)).toBeUndefined();
		expect(sanitizeTimestamp(-1)).toBeUndefined();
		expect(sanitizeTimestamp(NaN)).toBeUndefined();
		expect(sanitizeTimestamp(null)).toBeUndefined();
		expect(sanitizeTimestamp(undefined)).toBeUndefined();
	});
});

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

describe('parseLimits', () => {
	it('maps 5-hour, weekly and MCP limits with their counters and reset timestamps', () => {
		const result = parseLimits({
			level: 'pro',
			limits: [
				{
					type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 40,
					nextResetTime: 1789701300,
				},
				{
					type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 60,
					nextResetTime: 1789701400000,
				},
				{
					type: 'TIME_LIMIT', unit: 5, number: 1, percentage: 25,
					nextResetTime: 1789701500000, currentValue: 30, usage: 120,
				},
			],
		});

		expect(result).toStrictEqual({
			level: 'pro',
			slots: [
				{
					label: '每5小时额度', percent: 40, used: undefined, limit: undefined,
					resetsAt: 1789701300000,
				},
				{
					label: '每周额度', percent: 60, used: undefined, limit: undefined,
					resetsAt: 1789701400000,
				},
				{
					label: 'MCP 每月额度', percent: 25, used: 30, limit: 120,
					resetsAt: 1789701500000,
				},
			],
		});
	});

	it('clamps excessive, negative and non-finite percentages', () => {
		const result = parseLimits({
			limits: [
				{ type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 150, nextResetTime: 1789701300000 },
				{ type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: -5, nextResetTime: 1789701300000 },
				{ type: 'TOKENS_LIMIT', unit: 3, number: 1, percentage: NaN, nextResetTime: 1789701300000 },
				{ type: 'TOKENS_LIMIT', unit: 3, number: 2, percentage: Infinity, nextResetTime: 1789701300000 },
			],
		});

		expect(result.slots.map(slot => slot.percent)).toStrictEqual([100, 0, 0, 0]);
	});
});

describe('parseSubscription', () => {
	it('ignores subscriptions outside the current period', () => {
		const nextRenewTime = parseSubscription({
			code: 200,
			msg: 'ok',
			success: true,
			data: [
				{
					id: 'expired', productName: 'GLM Coding Plan', status: 'ACTIVE',
					inCurrentPeriod: false, nextRenewTime: '2026-11-01T00:00:00.000Z',
				},
				{
					id: 'current', productName: 'GLM Coding Plan', status: 'ACTIVE',
					inCurrentPeriod: true, nextRenewTime: '2026-12-01T00:00:00.000Z',
				},
			],
		});

		expect(nextRenewTime).toBe('2026-12-01T00:00:00.000Z');
	});
});

describe('parseModelUsage', () => {
	it('skips invalid timestamps and normalizes null counters to undefined', () => {
		const firstTime = '2026-11-16T00:00:00.000Z';
		const lastTime = '2026-11-16T02:00:00.000Z';
		const result = parseModelUsage({
			x_time: [firstTime, 'not-a-date', lastTime],
			modelCallCount: [1, 2, null],
			tokensUsage: [100, 200, null],
			totalUsage: {
				totalModelCallCount: 1,
				totalTokensUsage: 100,
				modelSummaryList: [],
			},
			modelDataList: [],
			granularity: 'hour',
		});

		expect(result).toStrictEqual({
			totalTokens: 100,
			totalCalls: 1,
			modelSummary: [],
			history: [
				{ at: Date.parse(firstTime), tokens: 100, calls: 1 },
				{ at: Date.parse(lastTime), tokens: undefined, calls: undefined },
			],
			modelSeries: [],
			xTime: [firstTime, 'not-a-date', lastTime],
		});
	});
});

describe('glmProvider.fetch', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('trims surrounding whitespace from the API key before every authorized request', async () => {
		vi.mocked(getJson).mockImplementation(url => {
			if (url.includes('/quota/limit')) {
				return Promise.resolve({ code: 200, msg: 'ok', success: true, data: { limits: [], level: 'pro' } });
			}
			return Promise.reject(new Error('unavailable'));
		});

		await glmProvider.fetch(' \n\tglm-secret-key \r\n', undefined);

		const calls = vi.mocked(getJson).mock.calls;
		expect(calls).toHaveLength(4);
		for (const call of calls) {
			expect(call[1]).toStrictEqual({ 'Authorization': 'Bearer glm-secret-key' });
		}
	});

	it.each([401, 403])('returns a friendly credential error for quota HTTP %i without logging secrets', async (statusCode) => {
		const logger = { log: vi.fn() };
		const responseBody = 'quota-secret-response';
		vi.mocked(getJson).mockImplementation(url => {
			if (url.includes('/quota/limit')) {
				return Promise.reject(Object.assign(new Error(`HTTP ${statusCode}`), { statusCode, responseBody }));
			}
			return Promise.reject(new Error('unavailable'));
		});

		await expect(glmProvider.fetch('glm-secret-key', undefined, logger))
			.rejects.toThrow('GLM 配额查询失败，请检查 API Key 是否有效');
		const messages = logger.log.mock.calls.map(call => call[0]).join('\n');
		expect(messages).not.toContain(responseBody);
		expect(messages).not.toContain('glm-secret-key');
	});

	it('preserves the API business error when quotaRaw.code is not 200', async () => {
		vi.mocked(getJson).mockResolvedValue({ code: 503, msg: 'GLM 配额业务错误', success: false });

		await expect(glmProvider.fetch('glm-secret-key', undefined))
			.rejects.toThrow('GLM 配额业务错误');
	});

	it('starts quota, subscription and daily detail requests in one batch', async () => {
		function deferred<T>() {
			let resolve!: (value: T) => void;
			const promise = new Promise<T>(res => { resolve = res; });
			return { promise, resolve };
		}

		const quota = deferred<unknown>();
		const subscription = deferred<unknown>();
		const model = deferred<unknown>();
		const tool = deferred<unknown>();
		vi.mocked(getJson)
			.mockReturnValueOnce(quota.promise)
			.mockReturnValueOnce(subscription.promise)
			.mockReturnValueOnce(model.promise)
			.mockReturnValueOnce(tool.promise);

		const logger = { log: vi.fn() };
		const pending = glmProvider.fetch('test-key', undefined, logger);

		const calls = vi.mocked(getJson).mock.calls;
		expect(calls.map(call => new URL(call[0]).pathname)).toStrictEqual([
			'/api/monitor/usage/quota/limit',
			'/api/biz/subscription/list',
			'/api/monitor/usage/model-usage',
			'/api/monitor/usage/tool-usage',
		]);
		expect(calls.every(call => call[3] === undefined && call[4] === logger)).toBe(true);

		quota.resolve({ code: 200, msg: 'ok', success: true, data: { limits: [], level: 'pro' } });
		subscription.resolve({ code: 200, msg: 'ok', success: true, data: [] });
		model.resolve({
			code: 200,
			msg: 'ok',
			success: true,
			data: {
				x_time: [], modelCallCount: [], tokensUsage: [],
				totalUsage: { totalModelCallCount: 0, totalTokensUsage: 0, modelSummaryList: [] },
				modelDataList: [], granularity: 'hour',
			},
		});
		tool.resolve({
			code: 200,
			msg: 'ok',
			success: true,
			data: {
				x_time: [], networkSearchCount: [], webReadMcpCount: [], zreadMcpCount: [],
				totalUsage: {
					totalNetworkSearchCount: 0, totalWebReadMcpCount: 0, totalZreadMcpCount: 0,
					totalSearchMcpCount: 0, toolDetails: [], toolSummaryList: [],
				},
				toolDataList: [], granularity: 'hour',
			},
		});

		const result = await pending as GlmServiceData;
		expect(result.level).toBe('pro');
		expect(result.modelUsage?.history).toStrictEqual([]);
		expect(result.toolUsage?.history).toStrictEqual([]);
		expect(result.nextRenewTime).toBeUndefined();
	});

	it('logs safe messages when subscription and daily details degrade', async () => {
		const logger = { log: vi.fn() };
		vi.mocked(getJson).mockImplementation(url => {
			if (url.includes('/quota/limit')) {
				return Promise.resolve({ code: 200, msg: 'ok', success: true, data: { limits: [], level: 'pro' } });
			}
			if (url.includes('/subscription/list')) {
				return Promise.reject(Object.assign(new Error('subscription unavailable'), {
					responseBody: 'subscriber-personal-profile',
				}));
			}
			if (url.includes('/model-usage')) {
				return Promise.reject(Object.assign(new Error('model unavailable'), { responseBody: 'model-secret' }));
			}
			return Promise.reject(Object.assign(new Error('tool unavailable'), { responseBody: 'tool-secret' }));
		});

		const result = await glmProvider.fetch('glm-secret-key', undefined, logger) as GlmServiceData;

		expect(result.level).toBe('pro');
		expect(result.nextRenewTime).toBeUndefined();
		expect(result.modelUsage).toBeUndefined();
		expect(result.toolUsage).toBeUndefined();
		expect(logger.log).toHaveBeenCalledWith('[glm] fetch subscription failed: subscription unavailable');
		expect(logger.log).toHaveBeenCalledWith('[glm] fetch model usage failed: model unavailable');
		expect(logger.log).toHaveBeenCalledWith('[glm] fetch tool usage failed: tool unavailable');
		const messages = logger.log.mock.calls.map(call => call[0]).join('\n');
		expect(messages).not.toContain('glm-secret-key');
		expect(messages).not.toContain('Authorization');
		expect(messages).not.toContain('subscriber-personal-profile');
		expect(messages).not.toContain('model-secret');
		expect(messages).not.toContain('tool-secret');
	});

	it('passes the logger to lazy detail requests and preserves partial failure results', async () => {
		const logger = { log: vi.fn() };
		vi.mocked(getJson).mockImplementation(url => Promise.reject(
			new Error(url.includes('/model-usage') ? 'lazy model unavailable' : 'lazy tool unavailable'),
		));

		const result = await glmDetailProvider.fetchDetail('week', 'detail-secret-key', undefined, logger);

		expect(result).toStrictEqual({ modelUsage: undefined, toolUsage: undefined });
		expect(vi.mocked(getJson).mock.calls.every(call => call[4] === logger)).toBe(true);
		expect(logger.log).toHaveBeenCalledWith('[glm] fetch model usage failed: lazy model unavailable');
		expect(logger.log).toHaveBeenCalledWith('[glm] fetch tool usage failed: lazy tool unavailable');
	});
});
