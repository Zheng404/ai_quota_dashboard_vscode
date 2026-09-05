/**
 * AI Quota Dashboard — 浏览器扩展主逻辑（独立仪表盘页）
 *
 * 支持 GLM / Kimi / MiMo 完整仪表盘功能。
 *
 * 通用逻辑（数据加载/全局设置/事件委托/自动刷新等）复用自 shared-ui.js，
 * 本文件仅保留独立页专属差异：默认服务初始化与 GLM 快速添加。
 */

import { escapeHtml } from './templates.js';
import { icon } from './icons.js';
import { config, loadConfig, saveConfig } from './config.js';
import { createSharedUI } from './shared-ui.js';
import { MSG } from './protocol/index.js';

// ===== Data Bridge 状态（独立页：服务标签页状态卡 + 重连刷新）=====

let bridgeStatus = {
	connected: false,
	activeKinds: [],
	lastError: null,
};

async function checkBridgeStatus() {
	try {
		const response = await new Promise((resolve) => {
			chrome.runtime.sendMessage({ action: MSG.GET_STATUS }, (response) => {
				resolve(response || { connected: false, activeKinds: [], lastError: null });
			});
		});
		bridgeStatus = {
			connected: response.connected || false,
			activeKinds: response.activeKinds || [],
			lastError: response.lastError || null,
		};
	} catch {
		bridgeStatus = { connected: false, activeKinds: [], lastError: '无法与后台脚本通信' };
	}
}

// ===== 共享 UI 上下文（通用逻辑见 shared-ui.js）=====

const ui = createSharedUI({
	beforeLoad: checkBridgeStatus,
	// 手动重连响应后：重新拉取 Bridge 状态（面板由 shared-ui 重渲染）
	onBridgeReconnectResult: checkBridgeStatus,
	// background 端口发现建立连接广播：即时刷新桥卡
	onBridgeConnected: checkBridgeStatus,
});

const { SERVICE_LABELS } = ui;

// ===== 服务管理渲染（独立页专属：精简版）=====

function renderSettingsServices() {
	const settingsServicesEl = document.getElementById('panel-services');
	let html = '<div class="settings-section">';
	html += ui.renderBridgeCard(bridgeStatus);
	html += '<h3>服务管理</h3>';

	if (config.services.length === 0) {
		html += '<p class="settings-empty">暂无服务配置</p>';
	}

	for (const svc of config.services) {
		const isGlm = svc.kind === 'glm';
		const isKimi = svc.kind === 'kimi';
		html += `
			<div class="service-item-card" data-service-id="${svc.id}">
				<div class="svc-row">
					<input type="text" class="svc-name-input" data-service-id="${svc.id}" value="${escapeHtml(svc.name)}" placeholder="显示名称">
					<span class="svc-kind">${escapeHtml(SERVICE_LABELS[svc.kind] || svc.kind)}</span>
				</div>
				${isGlm ? `
				<div class="form-group">
					<label class="form-label">API Key</label>
					<input type="password" class="form-input glm-key-input" data-service-id="${svc.id}" value="${escapeHtml(config.glmApiKey || '')}" placeholder="输入 GLM API Key">
				</div>
				` : ''}
				${isKimi ? `
				<div class="form-group">
					<label class="form-label">Code API Key（可选，无网页登录时兜底）</label>
					<input type="password" class="form-input kimi-key-input" data-service-id="${svc.id}" value="${escapeHtml(config.kimiApiKey || '')}" placeholder="输入 Kimi Code API Key（sk- 开头）">
				</div>
				` : ''}
				${!isGlm && !isKimi ? `
				<div class="form-group">
					<label class="form-label">状态</label>
					<p class="form-hint">从浏览器 Cookie 自动获取凭证</p>
				</div>
				` : ''}
				<div class="svc-actions">
					<button class="btn btn-sm btn-primary save-svc-btn" data-service-id="${svc.id}">${icon('check', 12)}保存配置</button>
					${isGlm ? `<button class="btn btn-sm btn-danger remove-svc-btn" data-service-id="${svc.id}">${icon('trash-2', 12)}删除服务</button>
					` : ''}
				</div>
			</div>`;
	}

	// 添加 GLM 按钮（如果没有 GLM 服务）
	const hasGlm = config.services.some(s => s.kind === 'glm');
	if (!hasGlm) {
		html += `
			<div class="form-actions">
				<button class="btn btn-primary" id="add-glm-btn">${icon('plus', 13)}添加 GLM 服务</button>
			</div>`;
	}

	html += '</div>';
	settingsServicesEl.innerHTML = html;

	// 绑定服务卡片事件
	settingsServicesEl.querySelectorAll('.save-svc-btn').forEach(btn => {
		btn.addEventListener('click', ui.handleSaveService);
	});
	settingsServicesEl.querySelectorAll('.remove-svc-btn').forEach(btn => {
		btn.addEventListener('click', ui.handleRemoveService);
	});
	const addGlmBtn = document.getElementById('add-glm-btn');
	if (addGlmBtn) {
		addGlmBtn.addEventListener('click', handleAddGlm);
	}
}

// 注册给共享上下文（Tab 切换 / 设置按钮 / 删除服务后按需渲染）
ui.registerSettingsServices(renderSettingsServices);

// ===== 独立页专属事件处理 =====

async function handleAddGlm() {
	const hasGlm = config.services.some(s => s.kind === 'glm');
	if (hasGlm) return;

	config.services.push({
		id: `glm-${Date.now()}`,
		kind: 'glm',
		name: 'GLM',
		enabled: true,
	});
	await saveConfig();
	renderSettingsServices();
}

// ===== 初始化 =====

async function init() {
	await loadConfig();
	// 独立仪表盘默认包含 kimi + mimo（仅在无已配置服务时）
	if (config.services.length === 0) {
		config.services = [
			{ id: 'kimi', kind: 'kimi', name: 'Kimi', enabled: true },
			{ id: 'mimo', kind: 'mimo', name: 'MiMo', enabled: true },
		];
	}
	// 确保 GLM 服务项存在（当有 API Key 时自动添加）
	const hasGlm = config.services.some(s => s.kind === 'glm');
	if (!hasGlm && config.glmApiKey) {
		config.services.push({ id: 'glm', kind: 'glm', name: 'GLM', enabled: true });
	}
	await ui.loadAll();
	ui.scheduleRefresh();
}

init();
