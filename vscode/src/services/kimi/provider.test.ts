import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	isKimiCodeApiKey,
	parseCodeUsageSlot,
	parseCodeLimitsSlot,
	kimiProvider,
} from './provider';
import { KIMI_CODE_API_BASE } from './constants';
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

	it('accepts bare MINUTE time unit for 5h window matching', () => {
		const slot = parseCodeLimitsSlot([
			{ duration: 300, timeUnit: 'MINUTE', usedPercent: 55 },
		]);
		expect(slot?.label).toBe('频率限制明细 (5hour)');
	});
});

describe('kimiProvider.fetch credential routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('routes sk- key to Code API path', async () => {
		vi.mocked(getJson).mockResolvedValue({
			usage: { usedPercent: 40, used: 400, limit: 1000 },
			limits: [{ duration: 300, timeUnit: 'TIME_UNIT_MINUTE', usedPercent: 55 }],
		});

		const data = await kimiProvider.fetch('sk-kimi-test', undefined) as KimiServiceData;

		expect(getJson).toHaveBeenCalledTimes(1);
		expect(getJson).toHaveBeenCalledWith(
			`${KIMI_CODE_API_BASE}/coding/v1/usages`,
			{ 'Authorization': 'Bearer sk-kimi-test' },
			15000,
		);
		// 仅两个槽位：5h 频限 + 本周用量，无月度权益槽
		expect(data.slots).toHaveLength(2);
		expect(data.slots[0]?.label).toBe('频率限制明细 (5hour)');
		expect(data.slots[1]?.label).toBe('本周用量');
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

	it('throws guiding error for empty credential without making any request', async () => {
		await expect(kimiProvider.fetch('', undefined))
			.rejects.toThrow('Kimi 网页登录凭证已不可用');
		expect(getJson).not.toHaveBeenCalled();
	});
});
