import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ServiceProfile } from '../core/types';
import type { ServiceSettingsMeta, SettingsPayload } from './types';

const glmMeta: ServiceSettingsMeta = {
	kind: 'glm',
	displayName: 'GLM Coding Plan (CN)',
	keyPlaceholder: 'GLM API Key',
	keyHint: 'GLM 密钥提示',
	showHelpButton: true,
	helpCommand: 'showGlmHelp',
	endpointEditable: false,
};

const kimiMeta: ServiceSettingsMeta = {
	kind: 'kimi',
	displayName: 'Kimi Membership',
	keyPlaceholder: 'sk-...',
	keyHint: 'Kimi 密钥提示',
	showHelpButton: true,
	helpCommand: 'showKimiHelp',
	endpointEditable: true,
	endpointPlaceholder: 'https://api.kimi.com',
};

let renderServiceListSettings: typeof import('./settings').renderServiceListSettings;

beforeAll(async () => {
	vi.stubGlobal('acquireVsCodeApi', vi.fn(() => ({ postMessage: vi.fn() })));
	vi.stubGlobal('window', { __AQD_SETTINGS_META__: [glmMeta, kimiMeta] });
	({ renderServiceListSettings } = await import('./settings'));
});

afterAll(() => {
	vi.unstubAllGlobals();
});

function payload(profile: ServiceProfile, key = ''): SettingsPayload {
	return {
		profiles: [profile],
		keys: { [profile.id]: key },
		refreshInterval: 60,
		warnThreshold: 0.8,
		afkThreshold: 3600,
	};
}

describe('renderServiceListSettings 未知服务类型', () => {
	it('渲染转义后的只读状态与删除确认，不渲染编辑或保存控件', () => {
		const html = renderServiceListSettings(payload({
			id: 'legacy"><img src=x>',
			kind: 'legacy<script>alert(1)</script>',
			displayName: '旧 <b>服务</b>',
			endpoint: 'https://invalid.example.com',
		}, 'must-not-render'));

		expect(html).toContain('不支持的服务类型');
		expect(html).toContain('旧 &lt;b&gt;服务&lt;/b&gt;');
		expect(html).toContain('legacy&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('remove-service-btn');
		expect(html).toContain('data-confirm-panel');
		expect(html).toContain('confirm-remove');
		expect(html).not.toContain('save-service-btn');
		expect(html).not.toContain('svc-key');
		expect(html).not.toContain('svc-endpoint');
		expect(html).not.toContain('svc-name');
		expect(html).not.toContain('must-not-render');
		expect(html).not.toContain('https://invalid.example.com');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img');
	});
});

describe('renderServiceListSettings 已支持服务', () => {
	it('GLM 保留名称、Key 与保存表单且不开放 endpoint 控件', () => {
		const html = renderServiceListSettings(payload({
			id: 'glm-1',
			kind: 'glm',
			displayName: '我的 GLM',
		}, '••••••••'));

		expect(html).toContain('svc-name');
		expect(html).toContain('svc-key');
		expect(html).toContain('save-service-btn');
		expect(html).toContain('value="我的 GLM"');
		expect(html).toContain('value="••••••••"');
		expect(html).not.toContain('svc-endpoint');
		expect(html).not.toContain('不支持的服务类型');
	});

	it('Kimi 保留可编辑 endpoint 表单', () => {
		const html = renderServiceListSettings(payload({
			id: 'kimi-1',
			kind: 'kimi',
			displayName: '我的 Kimi',
			endpoint: 'https://api.kimi.ai',
		}));

		expect(html).toContain('svc-key');
		expect(html).toContain('save-service-btn');
		expect(html).toContain('svc-endpoint');
		expect(html).toContain('value="https://api.kimi.ai"');
		expect(html).not.toContain('不支持的服务类型');
	});
});
