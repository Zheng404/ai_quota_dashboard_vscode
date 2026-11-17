import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let shared: typeof import('./shared');

beforeAll(async () => {
	vi.stubGlobal('acquireVsCodeApi', vi.fn(() => ({ postMessage: vi.fn() })));
	shared = await import('./shared');
});

afterAll(() => {
	vi.unstubAllGlobals();
});

describe('escapeHtml', () => {
	it('转义 HTML 特殊字符并保留普通值语义', () => {
		expect(shared.escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
		expect(shared.escapeHtml(0)).toBe('0');
	});
});

describe('fmtNum', () => {
	it('空值与非有限数字统一使用占位符', () => {
		expect(shared.fmtNum(null)).toBe('-');
		expect(shared.fmtNum(undefined)).toBe('-');
		expect(shared.fmtNum(Number.NaN)).toBe('-');
		expect(shared.fmtNum(Number.POSITIVE_INFINITY)).toBe('-');
		expect(shared.fmtNum(Number.NEGATIVE_INFINITY)).toBe('-');
	});

	it('正常数字沿用既有缩写格式', () => {
		expect(shared.fmtNum(-12)).toBe('-12');
		expect(shared.fmtNum(0)).toBe('0');
		expect(shared.fmtNum(999)).toBe('999');
		expect(shared.fmtNum(1000)).toBe('1.0K');
		expect(shared.fmtNum(1_000_000)).toBe('1.0M');
		expect(shared.fmtNum(1_000_000_000)).toBe('1.00B');
	});
});

describe('renderService 未知类型防御', () => {
	it('使用既有错误卡并转义服务标识、名称和类型', () => {
		const html = shared.renderService({
			id: 'legacy"><img src=x>',
			name: '旧 <b>服务</b>',
			kind: 'legacy<script>alert(1)</script>',
			slots: [],
			updatedAt: 0,
		});

		expect(html).toContain('暂无专用仪表盘');
		expect(html).toContain('旧 &lt;b&gt;服务&lt;/b&gt;');
		expect(html).toContain('legacy&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('<b>服务</b>');
	});
});
