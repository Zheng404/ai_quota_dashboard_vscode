// 设置页渲染 + 事件绑定 + 消息监听（数据驱动，无 kind 硬编码）

import { ServiceDescriptor } from '../../services/types';

export function getSettingsScript(descriptors: ServiceDescriptor[]): string {
	// 将服务元数据注入为 JSON，供 webview JS 查询
	const settingsMap = descriptors.map(d => ({
		kind: d.kind,
		displayName: d.displayName,
		keyPlaceholder: d.settings.keyPlaceholder,
		keyHint: d.settings.keyHint,
		showHelpButton: d.settings.showHelpButton,
		helpCommand: d.helpCommand ?? '',
	}));

	return `
	// 服务设置元数据（从注册表注入）
	const serviceSettingsMap = ${JSON.stringify(settingsMap)};

	function getServiceSettings(kind) {
		return serviceSettingsMap.find(s => s.kind === kind) || serviceSettingsMap[0];
	}

	// ====== 设置页渲染器 ======

	function renderServiceItem(p, keys) {
		const meta = getServiceSettings(p.kind);
		const placeholder = meta ? meta.keyPlaceholder : 'API Key';
		const key = keys[p.id] || '';
		let hintHtml = '';
		if (meta && meta.keyHint) {
			hintHtml = '<div class="form-row-hint"><span class="form-hint">' + escapeHtml(meta.keyHint) + '</span>';
			if (meta.showHelpButton) {
				hintHtml += '<button type="button" class="btn btn-link svc-help-btn" data-help-cmd="' + meta.helpCommand + '">如何获取？</button>';
			}
			hintHtml += '</div>';
		}
		const kindLabel = meta ? meta.displayName : p.kind;
		return '<div class="service-item" data-id="' + escapeHtml(p.id) + '"><div class="svc-row-kind"><span class="svc-kind-label" data-kind="' + p.kind + '">' + escapeHtml(kindLabel) + '</span><label class="toggle" title="启用"><input type="checkbox" class="svc-enabled" ' + (p.enabled?'checked':'') + '><span class="toggle-slider"></span></label></div><div class="svc-row-name"><input type="text" class="form-input svc-name" value="' + escapeHtml(p.displayName) + '" placeholder="显示名称"></div><input type="text" class="form-input svc-key" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(key) + '" autocomplete="off">' + hintHtml + '<div class="svc-row-actions"><button type="button" class="btn btn-sm btn-delete remove-service-btn">删除</button><button type="button" class="btn btn-sm btn-primary save-service-btn">保存</button></div></div>';
	}

	function renderServiceListSettings(settings) {
		const profiles = settings.profiles;
		const keys = settings.keys;
		const items = profiles.map(p => renderServiceItem(p, keys)).join('');
		const options = serviceSettingsMap.map(s =>
			'<option value="' + s.kind + '">' + escapeHtml(s.displayName) + '</option>'
		).join('');
		return '<div class="settings-section"><div class="section-header"><div class="add-service-row"><select class="form-input add-service-select" id="new-service-kind">' + options + '</select><button type="button" class="btn btn-sm btn-primary" id="add-service-btn">+ 添加</button></div></div><div id="services-list">' + items + '</div></div>';
	}

	function renderGlobalSettings(settings) {
		return '<div class="settings-section"><div class="form-group"><label class="form-label" for="refreshInterval">自动刷新间隔（秒，0 禁用）</label><input type="number" id="refreshInterval" class="form-input" value="' + settings.refreshInterval + '" min="0" step="60"></div><div class="form-group"><label class="form-label" for="warnThreshold">预警阈值（0-1）</label><input type="number" id="warnThreshold" class="form-input" value="' + settings.warnThreshold + '" min="0" max="1" step="0.05"></div><div class="form-group"><label class="form-label" for="afkThreshold">AFK 检测（秒，0 禁用）</label><input type="number" id="afkThreshold" class="form-input" value="' + settings.afkThreshold + '" min="0" step="60"><span class="form-hint">用户无操作超过此时长后暂停刷新，默认 1 小时</span></div><div class="form-actions"><button type="button" class="btn btn-primary" id="save-global-btn">保存全局设置</button></div><div class="form-actions" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);"><button type="button" class="btn btn-danger" id="reset-data-btn">重置所有数据</button></div></div>';
	}

	// ====== 事件绑定 ======

	function bindRefreshButtons() {
		// 单服务刷新按钮
		document.querySelectorAll('.btn-refresh-svc').forEach(el => {
			el.addEventListener('click', () => {
				el.classList.add('spinning');
				vscode.postMessage({ command: 'refreshService', data: { id: el.dataset.serviceId } });
			});
		});
	}

	function bindServiceEvents() {
		document.querySelectorAll('.save-service-btn').forEach(el => {
			el.addEventListener('click', () => {
				const item = el.closest('.service-item');
				if (!item) return;
				vscode.postMessage({
					command: 'saveService',
					data: {
						id: item.dataset.id,
						name: item.querySelector('.svc-name').value,
						kind: item.querySelector('.svc-kind-label')?.dataset.kind || serviceSettingsMap[0]?.kind || '',
						key: item.querySelector('.svc-key').value,
						enabled: item.querySelector('.svc-enabled').checked
					}
				});
			});
		});
	}

	function bindAddService() {
		const addBtn = document.getElementById('add-service-btn');
		if (addBtn) {
			addBtn.onclick = () => {
				const kindEl = document.getElementById('new-service-kind');
				vscode.postMessage({ command: 'addService', data: { kind: kindEl ? kindEl.value : 'glm' } });
			};
		}
	}

	function bindGlobalEvents() {
		const saveBtn = document.getElementById('save-global-btn');
		if (saveBtn) {
			saveBtn.onclick = () => {
				const riEl = document.getElementById('refreshInterval');
				const wtEl = document.getElementById('warnThreshold');
				const atEl = document.getElementById('afkThreshold');
				let v = parseFloat(wtEl.value);
				if (isNaN(v)) v = 0.9;
				if (v < 0) v = 0;
				if (v > 1) v = 1;
				vscode.postMessage({
					command: 'saveGlobal',
					data: {
						refreshInterval: Number.isFinite(parseInt(riEl.value, 10)) ? parseInt(riEl.value, 10) : 600,
						warnThreshold: v,
						afkThreshold: Number.isFinite(parseInt(atEl.value, 10)) ? parseInt(atEl.value, 10) : 0,
					}
				});
			};
		}
		const resetBtn = document.getElementById('reset-data-btn');
		if (resetBtn) {
			resetBtn.onclick = () => {
				vscode.postMessage({ command: 'resetData' });
			};
		}
	}

	// ====== Tab 切换 ======

	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
			btn.classList.add('active');
			document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
		});
	});

	document.querySelectorAll('.sub-tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.sub-tab-panel').forEach(p => p.classList.remove('active'));
			btn.classList.add('active');
			document.getElementById('subpanel-' + btn.dataset.subtab).classList.add('active');
		});
	});

	// 帮助按钮 + 删除按钮（委托，不受 innerHTML 替换影响）
	document.addEventListener('click', (e) => {
		if (e.target && e.target.classList && e.target.classList.contains('svc-help-btn')) {
			vscode.postMessage({ command: e.target.dataset.helpCmd });
		}
		if (e.target && e.target.classList && e.target.classList.contains('remove-service-btn')) {
			const item = e.target.closest('.service-item');
			if (item) {
				vscode.postMessage({ command: 'removeService', data: { id: item.dataset.id } });
			}
		}
	});

	// ====== 接收数据更新 ======

	window.addEventListener('message', (event) => {
		const message = event.data;

		if (message.command === 'switchToSettings') {
			const settingsTab = document.querySelector('.tab-btn[data-tab="settings"]');
			if (settingsTab) settingsTab.click();
			if (message.subtab) {
				const subTab = document.querySelector('.sub-tab-btn[data-subtab="' + message.subtab + '"]');
				if (subTab) subTab.click();
			}
			return;
		}

		if (message.command !== 'updateData') return;

		const services = message.services;
		const settings = message.settings;

		const dashboardPanel = document.getElementById('panel-dashboard');
		if (dashboardPanel) {
			const hasConfig = services.length > 0;
			dashboardPanel.innerHTML = hasConfig ? services.map(s => renderService(s)).join('') : renderNoConfig();
			bindRefreshButtons();
		}
		// 移除所有刷新按钮的旋转动画
		document.querySelectorAll('.btn-refresh-svc.spinning').forEach(el => el.classList.remove('spinning'));

		const servicesPanel = document.getElementById('subpanel-services');
		if (servicesPanel) {
			servicesPanel.innerHTML = renderServiceListSettings(settings);
			bindServiceEvents();
			bindAddService();
		}

		const globalPanel = document.getElementById('subpanel-global');
		if (globalPanel) {
			globalPanel.innerHTML = renderGlobalSettings(settings);
			bindGlobalEvents();
		}
	});

	// ====== 请求初始数据 ======
	vscode.postMessage({ command: 'requestInitialData' });
	`;
}
