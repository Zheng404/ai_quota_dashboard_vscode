// Webview 设置页渲染 + 事件绑定（数据驱动，无 kind 硬编码）
//
// 1:1 迁移自 dashboard/templates/settings.ts 字符串版：
// - 服务设置元数据经 window.__AQD_SETTINGS_META__ 注入（extension 侧从注册表提取）
// - 渲染函数逻辑与 DOM 输出逐行等价，仅增加类型注解与模块化

import type { ServiceProfile } from '../core/types';
import type { BridgeStateView, ServiceSettingsMeta, SettingsPayload } from './types';
import { escapeHtml, fmtDateTime, vscodeApi } from './shared';

// 服务设置元数据（extension 侧注入；缺失时为空数组，渲染走默认值兜底）
const serviceSettingsMap: ServiceSettingsMeta[] = window.__AQD_SETTINGS_META__ ?? [];

function getServiceSettings(kind: string): ServiceSettingsMeta | undefined {
	return serviceSettingsMap.find(s => s.kind === kind) ?? serviceSettingsMap[0];
}

// ====== 设置页渲染器 ======

function renderServiceItem(p: ServiceProfile, keys: Record<string, string>, bridgeState: BridgeStateView | null): string {
	const meta = getServiceSettings(p.kind);
	const placeholder = meta ? meta.keyPlaceholder : 'API Key';
	const key = keys[p.id] || '';
	const isBridgeService = p.kind === 'bridge';

	let hintHtml = '';
	if (meta?.keyHint && !isBridgeService) {
		hintHtml = '<div class="form-row-hint"><span class="form-hint">' + escapeHtml(meta.keyHint) + '</span>';
		if (meta.showHelpButton) {
			hintHtml += '<button type="button" class="btn btn-link svc-help-btn" data-help-cmd="' + meta.helpCommand + '">如何获取密钥？</button>';
		}
		hintHtml += '</div>';
	}

	const kindLabel = meta ? meta.displayName : p.kind;

	// 认证方式：Bridge 服务 / 手动输入（bridge-fed AI 服务不在服务列表渲染，
	// 其状态整合在 Data Bridge 条目内；移除 Data Bridge 时由 extension 端级联清理）
	let authHtml = '';
	if (isBridgeService) {
		// Data Bridge 服务条目：整合展示连接状态、最后同步时间、已接收数据种类标签
		const st: Partial<BridgeStateView> = bridgeState ?? {};
		const connected = st.connected === true;
		const kindLabels: Record<string, string> = { kimi: 'Kimi', mimo: 'MiMo', glm: 'GLM' };
		const kinds = st.receivedKinds ?? [];
		const lastSync = st.lastPushAt
			? fmtDateTime(new Date(st.lastPushAt))
			: '暂无';
		let kindsHtml: string;
		if (kinds.length === 0) {
			kindsHtml = '<span class="bridge-cred-empty">浏览器扩展尚未推送任何数据</span>';
		} else {
			kindsHtml = '<div class="bridge-cred-list">' +
				kinds.map(function(k) {
					return '<span class="bridge-cred-tag">' + escapeHtml(kindLabels[k] || k) + '</span>';
				}).join('') +
				'</div>';
		}
		const errHtml = st.lastError
			? '<div class="bridge-error-row"><span class="bridge-error-label">诊断：</span><span class="bridge-error-value">' + escapeHtml(st.lastError) + '</span></div>'
			: '';
		authHtml = '<div class="svc-row-datasource"><label class="form-label">认证方式</label><div class="form-hint">Data Bridge 自动获取</div></div>' +
			'<div class="svc-bridge-status">' +
				'<span class="bridge-badge ' + (connected ? 'connected' : 'disconnected') + '">' + (connected ? '已连接浏览器扩展' : '未连接浏览器扩展') + '</span>' +
				'<div class="bridge-info-row" style="margin-top: 8px;"><span class="bridge-info-label">最后同步：</span><span class="bridge-info-value">' + escapeHtml(lastSync) + '</span></div>' +
				'<div class="bridge-info-row"><span class="bridge-info-label">已接收数据种类：</span></div>' +
				kindsHtml +
				errHtml +
			'</div>';
	} else {
		authHtml = '<div class="svc-row-datasource"><label class="form-label">认证方式</label><div class="form-hint">手动输入</div></div><input type="text" class="form-input svc-key" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(key) + '" autocomplete="off">' + hintHtml;
	}

	const actionsHtml = '<div class="svc-row-actions"><button type="button" class="btn btn-sm btn-delete remove-service-btn">移除服务</button><button type="button" class="btn btn-sm btn-primary save-service-btn">保存配置</button></div>';
	const nameInput = '<input type="text" class="form-input svc-name" value="' + escapeHtml(p.displayName) + '" placeholder="显示名称">';

	return '<div class="service-item" data-id="' + escapeHtml(p.id) + '" data-datasource="' + escapeHtml(p.dataSource || 'manual') + '"><div class="svc-row-kind"><span class="svc-kind-label" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + '</span></div><div class="svc-row-name">' + nameInput + '</div>' + authHtml + actionsHtml + '</div>';
}

export function renderServiceListSettings(settings: SettingsPayload, bridgeState: BridgeStateView | null): string {
	// bridge-fed AI 服务（dataSource='bridge' 且非 bridge 服务本身）不在服务列表渲染：
	// 其连接/同步/数据种类状态已在 Data Bridge 条目内整合展示，避免条目冗余；
	// 清理走级联——移除 Data Bridge 服务时 extension 端连带删除（纯派生服务，下次推送自动重建）。
	// 手动添加的服务（含手动添加的 Data Bridge、手动输入的 AI 服务）均保留显示。
	const profiles = settings.profiles.filter(p => !(p.dataSource === 'bridge' && p.kind !== 'bridge'));
	const keys = settings.keys;
	const items = profiles.map(p => renderServiceItem(p, keys, bridgeState)).join('');
	const options = serviceSettingsMap.map(s =>
		'<option value="' + escapeHtml(s.kind) + '">' + escapeHtml(s.displayName) + '</option>'
	).join('');
	return '<div class="settings-section"><div class="section-header"><div class="add-service-row"><select class="form-input add-service-select" id="new-service-kind">' + options + '</select><button type="button" class="btn btn-sm btn-primary" id="add-service-btn">+ 添加服务</button></div></div><div id="services-list">' + items + '</div></div>';
}

export function renderGlobalSettings(settings: SettingsPayload): string {
	return '<div class="settings-section"><div class="form-group"><label class="form-label" for="refreshInterval">自动刷新间隔（秒，0 表示禁用）</label><input type="number" id="refreshInterval" class="form-input" value="' + escapeHtml(String(settings.refreshInterval)) + '" min="0" step="60"></div><div class="form-group"><label class="form-label" for="warnThreshold">预警阈值（0 - 1）</label><input type="number" id="warnThreshold" class="form-input" value="' + escapeHtml(String(settings.warnThreshold)) + '" min="0" max="1" step="0.05"></div><div class="form-group"><label class="form-label" for="afkThreshold">离开检测（秒，0 表示禁用）</label><input type="number" id="afkThreshold" class="form-input" value="' + escapeHtml(String(settings.afkThreshold)) + '" min="0" step="60"><span class="form-hint">用户无操作超过此时长后暂停自动刷新，默认 1 小时</span></div><div class="form-actions"><button type="button" class="btn btn-primary" id="save-global-btn">保存全局配置</button></div><div class="form-actions" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);"><button type="button" class="btn btn-danger" id="reset-data-btn">重置所有数据</button></div></div>';
}

// ====== 设置页事件绑定 ======

export function bindServiceEvents(): void {
	document.querySelectorAll<HTMLElement>('.save-service-btn').forEach(el => {
		el.addEventListener('click', () => {
			const item = el.closest<HTMLElement>('.service-item');
			if (!item) return;
			const kind = item.querySelector<HTMLElement>('.svc-kind-label')?.dataset.kind ?? serviceSettingsMap[0]?.kind ?? '';
			// 从 DOM 读取 dataSource（Bridge 推送后可能为 'bridge'）
			const dataSource = kind === 'bridge' ? 'bridge' : (item.dataset.datasource ?? 'manual');
			vscodeApi.postMessage({
				command: 'saveService',
				data: {
					id: item.dataset.id ?? '',
					name: (item.querySelector('.svc-name') as HTMLInputElement).value,
					kind,
					key: (item.querySelector('.svc-key') as HTMLInputElement | null)?.value ?? '',
					dataSource
				}
			});
		});
	});

	// bridge-fed 服务不在服务列表渲染（见 renderServiceListSettings 注释），无需额外绑定
}

export function bindAddService(): void {
	const addBtn = document.getElementById('add-service-btn');
	if (addBtn) {
		addBtn.onclick = () => {
			const kindEl = document.getElementById('new-service-kind') as HTMLSelectElement | null;
			vscodeApi.postMessage({ command: 'addService', data: { kind: kindEl ? kindEl.value : 'glm' } });
		};
	}
}

export function bindGlobalEvents(): void {
	const saveBtn = document.getElementById('save-global-btn');
	if (saveBtn) {
		saveBtn.onclick = () => {
			const riEl = document.getElementById('refreshInterval') as HTMLInputElement;
			const wtEl = document.getElementById('warnThreshold') as HTMLInputElement;
			const atEl = document.getElementById('afkThreshold') as HTMLInputElement;
			let v = parseFloat(wtEl.value);
			if (isNaN(v)) v = 0.9;
			if (v < 0) v = 0;
			if (v > 1) v = 1;
			vscodeApi.postMessage({
				command: 'saveGlobal',
				data: {
					refreshInterval: Number.isFinite(parseInt(riEl.value, 10)) ? parseInt(riEl.value, 10) : 60,
					warnThreshold: v,
					afkThreshold: Number.isFinite(parseInt(atEl.value, 10)) ? parseInt(atEl.value, 10) : 0,
				}
			});
		};
	}
	const resetBtn = document.getElementById('reset-data-btn');
	if (resetBtn) {
		resetBtn.onclick = () => {
			vscodeApi.postMessage({ command: 'resetData' });
		};
	}
}
