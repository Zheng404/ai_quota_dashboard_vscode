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

	function renderServiceItem(p, keys, bridgeState) {
		const meta = getServiceSettings(p.kind);
		const placeholder = meta ? meta.keyPlaceholder : 'API Key';
		const key = keys[p.id] || '';
		const isBridgeService = p.kind === 'bridge';
		const isBridgePushed = !isBridgeService && p.dataSource === 'bridge';

		let hintHtml = '';
		if (meta && meta.keyHint && !isBridgeService && !isBridgePushed) {
			hintHtml = '<div class="form-row-hint"><span class="form-hint">' + escapeHtml(meta.keyHint) + '</span>';
			if (meta.showHelpButton) {
				hintHtml += '<button type="button" class="btn btn-link svc-help-btn" data-help-cmd="' + meta.helpCommand + '">如何获取密钥？</button>';
			}
			hintHtml += '</div>';
		}

		const kindLabel = meta ? meta.displayName : p.kind;

		// 认证方式：Bridge 服务 / AI 服务（Bridge 推送 / 手动输入）
		let authHtml = '';
		if (isBridgeService) {
			// Cookie Bridge 服务条目：整合展示连接状态、最后同步时间、已连接服务标签
			const st = bridgeState || {};
			const connected = st.connected === true;
			const credLabels = { kimi: 'Kimi', mimo: 'MiMo', glm: 'GLM' };
			const creds = st.receivedCredentials || [];
			const lastSync = st.lastPushAt
				? fmtDateTime(new Date(st.lastPushAt))
				: '暂无';
			let credsHtml;
			if (creds.length === 0) {
				credsHtml = '<span class="bridge-cred-empty">浏览器扩展尚未推送任何凭证</span>';
			} else {
				credsHtml = '<div class="bridge-cred-list">' +
					creds.map(function(c) {
						return '<span class="bridge-cred-tag">' + escapeHtml(credLabels[c] || c) + '</span>';
					}).join('') +
					'</div>';
			}
			const errHtml = st.lastError
				? '<div class="bridge-error-row"><span class="bridge-error-label">诊断：</span><span class="bridge-error-value">' + escapeHtml(st.lastError) + '</span></div>'
				: '';
			authHtml = '<div class="svc-row-datasource"><label class="form-label">认证方式</label><div class="form-hint">Cookie Bridge 自动获取</div></div>' +
				'<div class="svc-bridge-status">' +
					'<span class="bridge-badge ' + (connected ? 'connected' : 'disconnected') + '">' + (connected ? '已连接浏览器扩展' : '未连接浏览器扩展') + '</span>' +
					'<div class="bridge-info-row" style="margin-top: 8px;"><span class="bridge-info-label">最后同步：</span><span class="bridge-info-value">' + escapeHtml(lastSync) + '</span></div>' +
					'<div class="bridge-info-row"><span class="bridge-info-label">已连接服务：</span></div>' +
					credsHtml +
					errHtml +
				'</div>';
		} else if (isBridgePushed) {
			authHtml = '<div class="svc-row-datasource"><label class="form-label">认证方式</label><div class="form-hint">Cookie Bridge 自动推送</div></div><div class="svc-bridge-status"><span class="bridge-badge connected">已通过浏览器扩展获取</span> <button type="button" class="btn btn-link svc-switch-manual-btn">切换为手动输入</button></div>';
		} else {
			authHtml = '<div class="svc-row-datasource"><label class="form-label">认证方式</label><div class="form-hint">手动输入</div></div><input type="text" class="form-input svc-key" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(key) + '" autocomplete="off">' + hintHtml;
		}

		return '<div class="service-item" data-id="' + escapeHtml(p.id) + '" data-datasource="' + escapeHtml(p.dataSource || 'manual') + '"><div class="svc-row-kind"><span class="svc-kind-label" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + '</span></div><div class="svc-row-name"><input type="text" class="form-input svc-name" value="' + escapeHtml(p.displayName) + '" placeholder="显示名称"></div>' + authHtml + '<div class="svc-row-actions"><button type="button" class="btn btn-sm btn-delete remove-service-btn">移除服务</button><button type="button" class="btn btn-sm btn-primary save-service-btn">保存配置</button></div></div>';
	}

	function renderServiceListSettings(settings, bridgeState) {
		// 隐藏由 Cookie Bridge 隐式创建/管理的 AI 服务（dataSource='bridge' 且非 bridge 服务本身），
		// 避免用户误删/误改其凭证；这些服务仍会在仪表盘显示配额卡片，并由 Bridge 自动管理。
		// 手动添加的服务（含手动添加的 Cookie Bridge、手动输入的 AI 服务）均保留显示。
		const profiles = settings.profiles.filter(p => !(p.dataSource === 'bridge' && p.kind !== 'bridge'));
		const keys = settings.keys;
		const items = profiles.map(p => renderServiceItem(p, keys, bridgeState)).join('');
		const options = serviceSettingsMap.map(s =>
			'<option value="' + escapeHtml(s.kind) + '">' + escapeHtml(s.displayName) + '</option>'
		).join('');
		return '<div class="settings-section"><div class="section-header"><div class="add-service-row"><select class="form-input add-service-select" id="new-service-kind">' + options + '</select><button type="button" class="btn btn-sm btn-primary" id="add-service-btn">+ 添加服务</button></div></div><div id="services-list">' + items + '</div></div>';
	}

	function renderGlobalSettings(settings) {
		return '<div class="settings-section"><div class="form-group"><label class="form-label" for="refreshInterval">自动刷新间隔（秒，0 表示禁用）</label><input type="number" id="refreshInterval" class="form-input" value="' + escapeHtml(String(settings.refreshInterval)) + '" min="0" step="60"></div><div class="form-group"><label class="form-label" for="warnThreshold">预警阈值（0 - 1）</label><input type="number" id="warnThreshold" class="form-input" value="' + escapeHtml(String(settings.warnThreshold)) + '" min="0" max="1" step="0.05"></div><div class="form-group"><label class="form-label" for="afkThreshold">离开检测（秒，0 表示禁用）</label><input type="number" id="afkThreshold" class="form-input" value="' + escapeHtml(String(settings.afkThreshold)) + '" min="0" step="60"><span class="form-hint">用户无操作超过此时长后暂停自动刷新，默认 1 小时</span></div><div class="form-actions"><button type="button" class="btn btn-primary" id="save-global-btn">保存全局配置</button></div><div class="form-actions" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);"><button type="button" class="btn btn-danger" id="reset-data-btn">重置所有数据</button></div></div>';
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
				const kind = item.querySelector('.svc-kind-label')?.dataset.kind || serviceSettingsMap[0]?.kind || '';
				// 从 DOM 读取 dataSource（Bridge 推送后可能为 'bridge'）
				const dataSource = kind === 'bridge' ? 'bridge' : (item.dataset.datasource || 'manual');
				vscode.postMessage({
					command: 'saveService',
					data: {
						id: item.dataset.id,
						name: item.querySelector('.svc-name').value,
						kind,
						key: item.querySelector('.svc-key')?.value || '',
						dataSource
					}
				});
			});
		});

		// "切换为手动输入"：将 dataSource 改回 manual 并清空 key
		document.querySelectorAll('.svc-switch-manual-btn').forEach(el => {
			el.addEventListener('click', () => {
				const item = el.closest('.service-item');
				if (!item) return;
				const kind = item.querySelector('.svc-kind-label')?.dataset.kind || serviceSettingsMap[0]?.kind || '';
				vscode.postMessage({
					command: 'saveService',
					data: {
						id: item.dataset.id,
						name: item.querySelector('.svc-name').value,
						kind,
						key: '',
						dataSource: 'manual'
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
	// 三个顶级 tab：仪表盘 / 服务 / 设置，通过 data-tab 切换对应 panel

	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
			btn.classList.add('active');
			document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
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
			// tab 已扁平化：subtab 取值为 'services' / 'global'，直接对应顶级 tab
			const targetTab = document.querySelector('.tab-btn[data-tab="' + (message.subtab || 'services') + '"]');
			if (targetTab) targetTab.click();
			return;
		}

		if (message.command !== 'updateData') return;

		const services = message.services;
		const settings = message.settings;

		const dashboardPanel = document.getElementById('panel-dashboard');
		if (dashboardPanel) {
			// 在替换 innerHTML 前记录正在刷新的服务 ID，替换后恢复 spinning 状态
			const spinningIds = new Set();
			document.querySelectorAll('.btn-refresh-svc.spinning').forEach(el => {
				if (el.dataset.serviceId) spinningIds.add(el.dataset.serviceId);
			});

			// 基于 profiles 渲染卡片框架，保证服务列表变化即时反映；
			// 用 services 填充实际数据，未拉取到数据的服务显示 loading/错误占位。
			// Cookie Bridge 卡片不在仪表盘显示，其状态展示在「服务」标签页顶部。
			const profiles = (settings.profiles || []).filter(p => p.kind !== 'bridge');
			const servicesMap = new Map();
			(services || []).forEach(s => servicesMap.set(s.id, s));

			const visibleServices = profiles.map(p => {
				const data = servicesMap.get(p.id);
				if (data) return data;
				// 占位：服务存在但暂无数据
				return {
					id: p.id,
					name: p.displayName,
					kind: p.kind,
					slots: [],
					updatedAt: Date.now(),
					err: '数据加载中，请稍后...',
				};
			});

			const hasConfig = visibleServices.length > 0;
			dashboardPanel.innerHTML = hasConfig ? visibleServices.map(s => renderService(s)).join('') : renderNoConfig();
			bindRefreshButtons();

			// 恢复 spinning 状态
			spinningIds.forEach(id => {
				const btn = document.querySelector('.btn-refresh-svc[data-service-id="' + id + '"]');
				if (btn) btn.classList.add('spinning');
			});
		}

		const servicesPanel = document.getElementById('panel-services');
		if (servicesPanel) {
			// 提取 Bridge 状态数据（连接状态、最后同步、已连接服务），传给服务列表
			// 用于在 Cookie Bridge 服务条目内整合展示，而非独立卡片。
			let bridgeState = null;
			const bridgeProfile = (settings.profiles || []).find(p => p.kind === 'bridge');
			if (bridgeProfile) {
				const servicesMap = new Map();
				(services || []).forEach(s => servicesMap.set(s.id, s));
				const bd = servicesMap.get(bridgeProfile.id);
				bridgeState = bd ? {
					connected: bd.connected,
					lastPushAt: bd.lastPushAt,
					receivedCredentials: bd.receivedCredentials || [],
					lastError: bd.lastError,
				} : { connected: false, receivedCredentials: [] };
			}
			servicesPanel.innerHTML = renderServiceListSettings(settings, bridgeState);
			bindServiceEvents();
			bindAddService();
		}

		const globalPanel = document.getElementById('panel-global');
		if (globalPanel) {
			globalPanel.innerHTML = renderGlobalSettings(settings);
			bindGlobalEvents();
		}
	});

	// ====== 请求初始数据 ======
	vscode.postMessage({ command: 'requestInitialData' });
	`;
}
