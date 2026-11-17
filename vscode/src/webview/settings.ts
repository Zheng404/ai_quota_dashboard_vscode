// Webview 设置页渲染与事件绑定（元数据驱动，保留输入焦点保护）

import type { SaveServicePayload, ServiceProfile } from '../core/types';
import { GLOBAL_SETTING_RULES, validateGlobalSettings } from './compute';
import type { SaveGlobalField, SaveGlobalResultMessage, ServiceSettingsMeta, SettingsPayload } from './types';
import { escapeHtml, renderIcon, vscodeApi } from './shared';

const serviceSettingsMap: ServiceSettingsMeta[] = window.__AQD_SETTINGS_META__ ?? [];
let globalSavePending = false;

function getServiceSettings(kind: string): ServiceSettingsMeta | undefined {
	return serviceSettingsMap.find(s => s.kind === kind);
}

// ====== 设置页渲染器 ======

function renderServiceItem(p: ServiceProfile, keys: Record<string, string>): string {
	const meta = getServiceSettings(p.kind);
	const id = escapeHtml(p.id);
	const name = escapeHtml(p.displayName);
	const kindLabel = meta?.displayName ?? p.kind;
	const confirmId = 'remove-confirm-' + id;
	const removeButton = '<button type="button" class="btn btn-sm btn-danger remove-service-btn" aria-label="移除 ' + name + ' 服务" aria-expanded="false" aria-controls="' + confirmId + '">' + renderIcon('trash-2') + '移除服务</button>';
	const confirmHtml = '<div class="inline-confirm" id="' + confirmId + '" data-confirm-panel role="group" aria-labelledby="' + confirmId + '-title" hidden>' +
		'<strong class="confirm-title" id="' + confirmId + '-title">移除 ' + name + '？</strong>' +
		'<p class="confirm-copy">将删除此服务和本机 API Key。之后可以重新添加服务并再次输入密钥。</p>' +
		'<div class="confirm-actions"><button type="button" class="btn btn-sm btn-secondary confirm-cancel">取消</button><button type="button" class="btn btn-sm btn-danger confirm-remove">继续移除</button></div>' +
		'</div>';

	if (!meta) {
		return '<section class="service-item" data-id="' + id + '" aria-labelledby="service-kind-' + id + '">' +
			'<div class="svc-row-kind"><h3 class="svc-kind-label" id="service-kind-' + id + '" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + '</h3></div>' +
			'<div class="form-group"><span class="form-label">显示名称</span><div class="form-value">' + name + '</div></div>' +
			'<div class="form-group"><span class="form-label">服务类型</span><div class="form-value"><code>' + escapeHtml(p.kind) + '</code></div></div>' +
			'<div class="form-row-hint"><span class="form-hint">' + renderIcon('circle-alert') + '不支持的服务类型；仅可查看配置或移除此服务。</span></div>' +
			'<div class="svc-row-actions">' + removeButton + '</div>' + confirmHtml + '</section>';
	}

	const placeholder = meta.keyPlaceholder;
	const key = keys[p.id] ?? '';
	const hintId = 'service-key-hint-' + id;

	let hintHtml = '<div class="form-row-hint" id="' + hintId + '">';
	if (meta.keyHint) hintHtml += '<span class="form-hint">' + escapeHtml(meta.keyHint) + '</span>';
	hintHtml += '<span class="form-hint key-state-hint">保持掩码不变会保留现有密钥；清空后保存将删除密钥；输入新值后保存将替换密钥。</span>';
	if (meta.showHelpButton) {
		hintHtml += '<button type="button" class="btn btn-link svc-help-btn" data-help-cmd="' + escapeHtml(meta.helpCommand) + '" aria-label="获取 ' + escapeHtml(kindLabel) + ' 密钥帮助">' + renderIcon('circle-help') + '如何获取密钥？</button>';
	}
	hintHtml += '</div>';

	const authHtml = '<div class="form-group"><span class="form-label">认证方式</span><div class="form-value">手动 API Key <span class="form-hint">仅保存在本机 Secret Storage</span></div></div>' +
		'<div class="form-group"><label class="form-label" for="service-key-' + id + '">API Key</label>' +
		'<input type="password" class="form-input svc-key" id="service-key-' + id + '" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(key) + '" autocomplete="off" spellcheck="false" aria-describedby="' + hintId + '">' + hintHtml + '</div>';
	const endpointHintId = 'service-endpoint-hint-' + id;
	const endpointHtml = meta.endpointEditable
		? '<div class="form-group"><label class="form-label" for="service-endpoint-' + id + '">API 地址</label>' +
			'<input type="url" class="form-input svc-endpoint" id="service-endpoint-' + id + '" value="' + escapeHtml(p.endpoint ?? '') + '" placeholder="' + escapeHtml(meta.endpointPlaceholder ?? 'https://api.example.com') + '" autocomplete="off" spellcheck="false" inputmode="url" aria-describedby="' + endpointHintId + '">' +
			'<span class="form-hint" id="' + endpointHintId + '">支持对应服务的官方 API 地址；留空使用默认地址。</span></div>'
		: '';
	const actionsHtml = '<div class="svc-row-actions">' + removeButton +
		'<button type="button" class="btn btn-sm btn-primary save-service-btn" aria-label="保存 ' + name + ' 配置">' + renderIcon('save') + '保存配置</button>' +
		'</div>' + confirmHtml;
	const nameInput = '<div class="form-group"><label class="form-label" for="service-name-' + id + '">显示名称</label><input type="text" class="form-input svc-name" id="service-name-' + id + '" value="' + name + '" placeholder="显示名称" required maxlength="100"></div>';

	return '<section class="service-item" data-id="' + id + '" aria-labelledby="service-kind-' + id + '">' +
		'<div class="svc-row-kind"><h3 class="svc-kind-label" id="service-kind-' + id + '" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + '</h3></div>' +
		nameInput + authHtml + endpointHtml + actionsHtml + '</section>';
}

export function renderServiceListSettings(settings: SettingsPayload): string {
	const items = settings.profiles.map(p => renderServiceItem(p, settings.keys)).join('');
	const options = serviceSettingsMap.map(s =>
		'<option value="' + escapeHtml(s.kind) + '">' + escapeHtml(s.displayName) + '</option>',
	).join('');
	const empty = settings.profiles.length === 0
		? '<div class="settings-empty">尚未添加服务。选择服务类型并添加，然后输入对应 API Key。</div>'
		: '';
	return '<section class="settings-section" aria-labelledby="services-settings-title">' +
		'<h2 class="settings-title" id="services-settings-title">服务连接</h2>' +
		'<p class="settings-description">配置显示名称与 API Key。密钥仅用于向对应官方 API 查询配额。</p>' +
		'<div class="section-header"><div class="add-service-row"><label class="sr-only" for="new-service-kind">服务类型</label><select class="form-input add-service-select" id="new-service-kind">' + options + '</select><button type="button" class="btn btn-sm btn-primary" id="add-service-btn">' + renderIcon('plus') + '添加服务</button></div></div>' +
		'<div id="services-list">' + items + empty + '</div></section>';
}

function renderGlobalField(field: SaveGlobalField, label: string, value: number, hint: string): string {
	const rule = GLOBAL_SETTING_RULES[field];
	return '<div class="form-group" data-global-field="' + field + '">' +
		'<label class="form-label" for="' + field + '">' + label + '</label>' +
		'<input type="number" id="' + field + '" class="form-input" value="' + escapeHtml(String(value)) + '" required min="' + rule.min + '" max="' + rule.max + '" step="' + rule.step + '" inputmode="' + (field === 'warnThreshold' ? 'decimal' : 'numeric') + '" aria-describedby="' + field + '-hint ' + field + '-error">' +
		'<span class="form-hint" id="' + field + '-hint">' + hint + '</span>' +
		'<span class="form-error" id="' + field + '-error" role="alert"></span></div>';
}

export function renderGlobalSettings(settings: SettingsPayload): string {
	return '<section class="settings-section" aria-labelledby="global-settings-title">' +
		'<h2 class="settings-title" id="global-settings-title">全局设置</h2>' +
		'<p class="settings-description">控制自动刷新、配额预警与离开检测。</p>' +
		renderGlobalField('refreshInterval', '自动刷新间隔（秒）', settings.refreshInterval, '0 表示禁用，默认 60 秒；可设 0～86400，以 60 秒为步长。') +
		renderGlobalField('warnThreshold', '预警阈值（0–1）', settings.warnThreshold, '使用率达到此比例时发送预警，默认 0.8；以 0.05 为步长。') +
		renderGlobalField('afkThreshold', '离开检测（秒）', settings.afkThreshold, '无操作超过此时长后暂停自动刷新；0 表示禁用，默认 1 小时；最大 86400 秒。') +
		'<div class="form-actions"><button type="button" class="btn btn-primary" id="save-global-btn"' + (globalSavePending ? ' disabled aria-busy="true"' : ' aria-busy="false"') + '>' + renderIcon(globalSavePending ? 'loader-circle' : 'save') + (globalSavePending ? '保存中…' : '保存全局配置') + '</button></div>' +
		'<div class="form-status" id="save-global-status" role="status" aria-live="polite" aria-atomic="true"></div>' +
		'<div class="danger-zone" aria-labelledby="reset-data-title"><h3 class="settings-title" id="reset-data-title">重置所有数据</h3><p class="settings-description">删除全部服务、API Key 和历史记录。VSCode 设置会保留，此操作不可撤销。</p><button type="button" class="btn btn-danger" id="reset-data-btn" aria-expanded="false" aria-controls="reset-data-confirm">重置所有数据</button>' +
		'<div class="inline-confirm" id="reset-data-confirm" data-confirm-panel role="group" aria-labelledby="reset-data-confirm-title" hidden><strong class="confirm-title" id="reset-data-confirm-title">确定继续重置？</strong><p class="confirm-copy">重置后无法恢复。如果仍需这些 API Key，请取消并先自行备份。</p><div class="confirm-actions"><button type="button" class="btn btn-sm btn-secondary confirm-cancel">取消</button><button type="button" class="btn btn-sm btn-danger confirm-reset">继续重置</button></div></div>' +
		'</div></section>';
}

// ====== 设置页事件绑定 ======

function bindInlineConfirmation(
	container: HTMLElement,
	trigger: HTMLButtonElement,
	onConfirm: () => void,
	onDismiss?: () => void,
): void {
	const panel = container.querySelector<HTMLElement>('[data-confirm-panel]');
	const cancel = panel?.querySelector<HTMLButtonElement>('.confirm-cancel');
	const confirm = panel?.querySelector<HTMLButtonElement>('.confirm-remove, .confirm-reset');
	if (!panel || !cancel || !confirm) return;

	const setOpen = (open: boolean, restoreFocus = false) => {
		panel.hidden = !open;
		trigger.setAttribute('aria-expanded', String(open));
		if (open) cancel.focus();
		else if (restoreFocus) trigger.focus();
	};
	const dismiss = () => {
		setOpen(false, true);
		onDismiss?.();
	};
	trigger.addEventListener('click', () => setOpen(true));
	cancel.addEventListener('click', dismiss);
	confirm.addEventListener('click', () => {
		// 确认后先收起面板，避免后续数据更新因确认态而跳过重渲染。
		setOpen(false, true);
		onConfirm();
	});
	panel.addEventListener('keydown', event => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dismiss();
		}
	});
}

export function bindServiceEvents(onDismissConfirmation?: () => void): void {
	document.querySelectorAll<HTMLElement>('.service-item').forEach(item => {
		const save = item.querySelector<HTMLButtonElement>('.save-service-btn');
		const remove = item.querySelector<HTMLButtonElement>('.remove-service-btn');
		save?.addEventListener('click', () => {
			const kind = item.querySelector<HTMLElement>('.svc-kind-label')?.dataset.kind ?? serviceSettingsMap[0]?.kind ?? '';
			const payload: SaveServicePayload = {
				id: item.dataset.id ?? '',
				name: item.querySelector<HTMLInputElement>('.svc-name')?.value ?? '',
				kind,
				key: item.querySelector<HTMLInputElement>('.svc-key')?.value ?? '',
			};
			const meta = serviceSettingsMap.find(s => s.kind === kind);
			const endpointInput = item.querySelector<HTMLInputElement>('.svc-endpoint');
			// 只有实际渲染了 endpoint 控件才提交；缺字段在后端表示保留，避免覆盖 GLM 既有配置。
			if (meta?.endpointEditable && endpointInput) payload.endpoint = endpointInput.value.trim();
			vscodeApi.postMessage({ command: 'saveService', data: payload });
		});
		if (remove) {
			bindInlineConfirmation(item, remove, () => {
				vscodeApi.postMessage({ command: 'removeService', data: { id: item.dataset.id ?? '', confirmed: true } });
			}, onDismissConfirmation);
		}
	});
}

export function bindAddService(): void {
	const addBtn = document.getElementById('add-service-btn');
	if (addBtn) {
		addBtn.onclick = () => {
			const kindEl = document.getElementById('new-service-kind') as HTMLSelectElement | null;
			vscodeApi.postMessage({ command: 'addService', data: { kind: kindEl?.value ?? 'glm' } });
		};
	}
}

function setGlobalStatus(message: string, kind: 'success' | 'error' | '' = ''): void {
	const status = document.getElementById('save-global-status');
	if (!status) return;
	status.textContent = message;
	status.className = 'form-status' + (kind ? ' ' + kind : '');
}

function clearGlobalFieldError(field: SaveGlobalField): void {
	const input = document.getElementById(field);
	const error = document.getElementById(field + '-error');
	input?.removeAttribute('aria-invalid');
	if (error) error.textContent = '';
}

function setGlobalFieldError(field: SaveGlobalField, message: string): void {
	const input = document.getElementById(field);
	const error = document.getElementById(field + '-error');
	input?.setAttribute('aria-invalid', 'true');
	if (error) error.textContent = message;
}

function setGlobalSavePending(pending: boolean): void {
	globalSavePending = pending;
	const button = document.getElementById('save-global-btn');
	if (!(button instanceof HTMLButtonElement)) return;
	button.disabled = pending;
	button.setAttribute('aria-busy', String(pending));
	button.innerHTML = renderIcon(pending ? 'loader-circle' : 'save') + (pending ? '保存中…' : '保存全局配置');
}

export function handleSaveGlobalResult(result: SaveGlobalResultMessage): void {
	setGlobalSavePending(false);
	if (result.ok) {
		for (const field of Object.keys(GLOBAL_SETTING_RULES) as SaveGlobalField[]) clearGlobalFieldError(field);
		setGlobalStatus(result.message ?? '全局配置已保存', 'success');
		return;
	}
	const message = result.message ?? '全局配置保存失败，请重试';
	if (result.field) {
		setGlobalFieldError(result.field, message);
		setGlobalStatus('请修正标记的字段后再保存。', 'error');
		document.getElementById(result.field)?.focus();
		return;
	}
	setGlobalStatus(message, 'error');
}

export function bindGlobalEvents(onDismissConfirmation?: () => void): void {
	const saveBtn = document.getElementById('save-global-btn');
	if (saveBtn) {
		saveBtn.onclick = () => {
			if (globalSavePending) return;
			const fields = Object.keys(GLOBAL_SETTING_RULES) as SaveGlobalField[];
			for (const field of fields) clearGlobalFieldError(field);
			setGlobalStatus('');
			const values = {
				refreshInterval: (document.getElementById('refreshInterval') as HTMLInputElement | null)?.value ?? '',
				warnThreshold: (document.getElementById('warnThreshold') as HTMLInputElement | null)?.value ?? '',
				afkThreshold: (document.getElementById('afkThreshold') as HTMLInputElement | null)?.value ?? '',
			};
			const result = validateGlobalSettings(values);
			if (!result.ok) {
				setGlobalFieldError(result.field, result.message);
				setGlobalStatus('请修正标记的字段后再保存。', 'error');
				document.getElementById(result.field)?.focus();
				return;
			}
			setGlobalSavePending(true);
			vscodeApi.postMessage({ command: 'saveGlobal', data: result.values });
		};
	}
	for (const field of Object.keys(GLOBAL_SETTING_RULES) as SaveGlobalField[]) {
		document.getElementById(field)?.addEventListener('input', () => {
			clearGlobalFieldError(field);
			setGlobalStatus('');
		});
	}
	const resetBtn = document.getElementById('reset-data-btn') as HTMLButtonElement | null;
	const globalPanel = document.getElementById('panel-global');
	if (resetBtn && globalPanel) {
		bindInlineConfirmation(globalPanel, resetBtn, () => {
			vscodeApi.postMessage({ command: 'resetData', data: { confirmed: true } });
		}, onDismissConfirmation);
	}
}
