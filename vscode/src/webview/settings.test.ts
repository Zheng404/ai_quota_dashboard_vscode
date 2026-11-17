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
let bindServiceEvents: typeof import('./settings').bindServiceEvents;
let postMessage: ReturnType<typeof vi.fn>;

beforeAll(async () => {
	postMessage = vi.fn();
	vi.stubGlobal('acquireVsCodeApi', vi.fn(() => ({ postMessage })));
	vi.stubGlobal('window', { __AQD_SETTINGS_META__: [glmMeta, kimiMeta] });
	({ renderServiceListSettings, bindServiceEvents } = await import('./settings'));
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

describe('bindServiceEvents 删除确认', () => {
	const setupConfirmation = () => {
		const makeButton = () => {
			const listeners: Record<string, () => void> = {};
			return {
				addEventListener: vi.fn((event: string, listener: () => void) => { listeners[event] = listener; }),
				click: () => listeners.click?.(),
				setAttribute: vi.fn(),
				focus: vi.fn(),
			};
		};
		const remove = makeButton();
		const cancel = makeButton();
		const confirm = makeButton();
		const keydownListeners: Record<string, (event: {
			key: string;
			preventDefault: () => void;
			stopPropagation: () => void;
		}) => void> = {};
		const panel = {
			hidden: true,
			querySelector: vi.fn((selector: string) => selector === '.confirm-cancel' ? cancel : confirm),
			addEventListener: vi.fn((event: string, listener: (event: {
				key: string;
				preventDefault: () => void;
				stopPropagation: () => void;
			}) => void) => { keydownListeners[event] = listener; }),
		};
		const item = {
			dataset: { id: 'glm-1' },
			querySelector: vi.fn((selector: string) => {
				if (selector === '.remove-service-btn') return remove;
				if (selector === '[data-confirm-panel]') return panel;
				return null;
			}),
		};
		vi.stubGlobal('document', { querySelectorAll: vi.fn(() => [item]) });
		return {
			remove,
			cancel,
			confirm,
			panel,
			pressKey: (key: string) => {
				const preventDefault = vi.fn();
				const stopPropagation = vi.fn();
				keydownListeners.keydown?.({ key, preventDefault, stopPropagation });
				return { preventDefault, stopPropagation };
			},
		};
	};

	it('确认后立即收起面板，允许后续更新重渲染服务列表', () => {
		postMessage.mockClear();
		const onClosed = vi.fn();
		const { remove, confirm, panel } = setupConfirmation();

		bindServiceEvents(onClosed);
		remove.click();
		expect(panel.hidden).toBe(false);
		expect(onClosed).not.toHaveBeenCalled();
		confirm.click();

		expect(panel.hidden).toBe(true);
		expect(remove.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
		expect(onClosed).not.toHaveBeenCalled();
		expect(postMessage).toHaveBeenCalledWith({
			command: 'removeService',
			data: { id: 'glm-1', confirmed: true },
		});
	});

	it('取消关闭后通知一次，以便消费被跳过的数据更新', () => {
		const onClosed = vi.fn();
		const { remove, cancel, panel } = setupConfirmation();

		bindServiceEvents(onClosed);
		remove.click();
		cancel.click();

		expect(panel.hidden).toBe(true);
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it('Escape 关闭后通知一次并阻止事件继续传播', () => {
		const onClosed = vi.fn();
		const { remove, panel, pressKey } = setupConfirmation();

		bindServiceEvents(onClosed);
		remove.click();
		const { preventDefault, stopPropagation } = pressKey('Escape');

		expect(panel.hidden).toBe(true);
		expect(onClosed).toHaveBeenCalledTimes(1);
		expect(preventDefault).toHaveBeenCalledTimes(1);
		expect(stopPropagation).toHaveBeenCalledTimes(1);
	});
});
