/**
 * AI Quota Dashboard — 浏览器扩展主逻辑（Popup 版）
 *
 * 支持 GLM / Kimi / MiMo，以及独立的 Data Bridge 状态卡片。
 * 配额数据由浏览器扩展统一拉取并推送给 VSCode，VSCode 端直接使用。
 *
 * 通用逻辑（数据加载/全局设置/事件委托/自动刷新等）复用自 shared-ui.js，
 * 本文件仅保留 popup 专属差异：Bridge 状态检测与服务管理交互。
 */

import { escapeHtml } from './templates.js';
import { icon } from './icons.js';
import { config, loadConfig, saveConfig } from './config.js';
import { createSharedUI } from './shared-ui.js';
import { MSG } from './protocol/index.js';

// ===== 常量（popup 专属）=====

/** 所有支持的服务类型（均经 Data Bridge 推送配额数据） */
const ALL_SERVICE_KINDS = new Set(['glm', 'kimi', 'mimo']);

const SERVICE_KINDS = [
	{ kind: 'glm', label: 'GLM Coding Plan (CN)', desc: 'Data Bridge 推送配额数据' },
	{ kind: 'kimi', label: 'Kimi Membership', desc: 'Data Bridge 推送配额数据' },
	{ kind: 'mimo', label: 'Xiaomi MiMo Token Plan', desc: 'Data Bridge 推送配额数据' },
];

// ===== 状态（popup 专属）=====

let bridgeStatus = {
	connected: false,
	activeKinds: [],
	lastError: null,
};

// ===== Data Bridge 状态检测（popup 专属）=====

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

/** 通知 background 配置已更新（popup 专属） */
async function notifyConfigUpdated() {
	try {
		await new Promise((resolve) => {
			chrome.runtime.sendMessage({ action: MSG.CONFIG_UPDATED }, (response) => {
				resolve(response);
			});
		});
	} catch {
		// ignore
	}
}

/** 获取服务的 Data Bridge 状态（popup 专属，注入 loadService 数据） */
function getBridgeStateForKind(kind) {
	// Bridge 状态是全局的，不再按 kind 区分
	if (!ALL_SERVICE_KINDS.has(kind)) return null;
	return {
		isBridgeActive: true,
		isVscodeConnected: bridgeStatus.connected,
	};
}

// ===== 共享 UI 上下文（通用逻辑见 shared-ui.js）=====

const ui = createSharedUI({
	beforeLoad: checkBridgeStatus,
	beforeRefreshSingle: checkBridgeStatus,
	getBridgeStateForKind,
	refreshingLabel: '刷新中',
	refreshLabel: icon('refresh-cw', 14),
	emptyServicesHint: '切换到「服务」标签添加服务',
	emptyServicesExtraHtml: `
		<p class="empty-hint">添加 Kimi / MiMo 卡片后自动开启 Data Bridge</p>`,
	renderLoadError: (err, servicesEl) => {
		servicesEl.innerHTML = `
			<div class="empty-state">
				<div class="empty-icon">${icon('alert-triangle', 22)}</div>
				<p class="empty-title">加载失败，请检查网络连接后重试</p>
				<p class="empty-hint">${escapeHtml(err.message || '加载失败，请检查网络连接后重试')}</p>
				<p class="empty-hint">点击刷新按钮重新加载</p>
			</div>`;
	},
	notifyConfigUpdated,
	removeConfirmText: (svc) => `确定要删除 ${svc.name} 吗？`,
	afterRemove: checkBridgeStatus,
	afterSaveGlobal: () => ui.scheduleRefresh(), // 重新调度以应用新的刷新间隔
	showCredentialCacheClear: true,
	// 手动重连响应后：重新拉取 Bridge 状态 + 刷新仪表盘卡片上的 Bridge 状态行
	onBridgeReconnectResult: async () => {
		await checkBridgeStatus();
		ui.renderDashboard();
	},
	// background 端口发现建立连接广播：即时刷新桥卡与卡片状态行
	onBridgeConnected: async () => {
		await checkBridgeStatus();
		ui.renderDashboard();
	},
});

const { SERVICE_LABELS } = ui;

// ===== 服务管理渲染（popup 专属）=====

function renderSettingsServices() {
	const settingsServicesEl = document.getElementById('panel-services');
	let html = '<div class="settings-section">';

	// Data Bridge 总体状态：显示哪些服务已启用 Bridge（渲染逻辑共用 shared-ui.js）
	html += ui.renderBridgeCard(bridgeStatus);

	html += '<h3>已配置服务</h3>';

	if (config.services.length === 0) {
		html += '<p class="settings-empty">暂无服务配置，请从下方添加</p>';
	} else {
	for (const svc of config.services) {
		const isGlm = svc.kind === 'glm';
		const isKimi = svc.kind === 'kimi';
		const isBridge = svc.kind === 'bridge';

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
					<div class="form-group">
						<label class="form-label">${isBridge ? 'VSCode 状态' : '数据来源'}</label>
						<p class="form-hint">
							${isBridge
								? (bridgeStatus.connected ? '已连接 VSCode' : '等待 VSCode 连接')
								: (isGlm ? '配额数据自动推送至 VSCode 扩展' : (isKimi ? '优先 kimi.com 网页登录拉取数据，可配置 Code API Key 兜底' : '配额数据由浏览器扩展拉取并推送至 VSCode'))
							}
						</p>
						${svc.kind === 'kimi' || svc.kind === 'mimo' ? `
						<div class="notice">
							${svc.kind === 'kimi'
								? 'Kimi Membership 优先使用 kimi.com 网页登录凭证拉取配额数据（保持标签页打开）；浏览器无网页凭证时自动降级使用上方 Code API Key（sk- 开头，Kimi Code 控制台获取）。'
								: 'Xiaomi MiMo Token Plan 通过 serviceToken Cookie 登录认证。该凭证为会话级，浏览器关闭后可能丢失，需重新登录 platform.xiaomimimo.com 获取。'
							}
						</div>
						<div class="svc-toggle-row">
							<input type="checkbox" id="${svc.kind}-auto-refresh-${svc.id}" ${config.settings[svc.kind + 'AutoRefresh'] ? 'checked' : ''}>
							<label for="${svc.kind}-auto-refresh-${svc.id}">
								浏览器重启后自动后台访问 ${SERVICE_LABELS[svc.kind]} 刷新凭证
							</label>
						</div>
						<button class="btn btn-sm btn-secondary open-site-btn" data-service-id="${svc.id}" data-kind="${svc.kind}">${icon('external-link', 12)}打开 ${SERVICE_LABELS[svc.kind]} 网站</button>
						` : ''}
					</div>
					<div class="svc-actions">
						<button class="btn btn-sm btn-primary save-svc-btn" data-service-id="${svc.id}">${icon('check', 12)}保存配置</button>
						<button class="btn btn-sm btn-danger remove-svc-btn" data-service-id="${svc.id}">${icon('trash-2', 12)}删除服务</button>
					</div>
				</div>`;
	}
	}

	// 添加服务区域
	html += '<div class="svc-add-area">';
	html += '<h4>添加新服务</h4>';
	html += '<div class="svc-add-list">';

	const existingKinds = new Set(config.services.map(s => s.kind));
	for (const svcKind of SERVICE_KINDS) {
		if (!existingKinds.has(svcKind.kind)) {
			html += `
				<button class="btn btn-secondary add-svc-btn" data-kind="${svcKind.kind}">
					<span class="add-svc-label">${icon('plus', 13)}${escapeHtml(svcKind.label)}</span>
					<span class="add-svc-desc">${escapeHtml(svcKind.desc)}</span>
				</button>`;
		}
	}

	html += '</div></div>';
	html += '</div>';

	settingsServicesEl.innerHTML = html;

	settingsServicesEl.querySelectorAll('.save-svc-btn').forEach(btn => {
		btn.addEventListener('click', ui.handleSaveService);
	});
	settingsServicesEl.querySelectorAll('.remove-svc-btn').forEach(btn => {
		btn.addEventListener('click', ui.handleRemoveService);
	});
	settingsServicesEl.querySelectorAll('.add-svc-btn').forEach(btn => {
		btn.addEventListener('click', handleAddService);
	});
	settingsServicesEl.querySelectorAll('.open-mimo-btn').forEach(btn => {
		btn.addEventListener('click', handleOpenMimo);
	});
	settingsServicesEl.querySelectorAll('input[type="checkbox"][id^="mimo-auto-refresh-"]').forEach(checkbox => {
		checkbox.addEventListener('change', handleMimoAutoRefreshToggle);
	});
	settingsServicesEl.querySelectorAll('.open-site-btn').forEach(btn => {
		btn.addEventListener('click', handleOpenSite);
	});
	settingsServicesEl.querySelectorAll('input[type="checkbox"][id^="kimi-auto-refresh-"]').forEach(checkbox => {
		checkbox.addEventListener('change', handleKimiAutoRefreshToggle);
	});
}

// 注册给共享上下文（Tab 切换 / 设置按钮 / 删除服务后按需渲染）
ui.registerSettingsServices(renderSettingsServices);

// ===== popup 专属事件处理 =====

async function handleOpenMimo(e) {
	const btn = e.target;
	try {
		await chrome.tabs.create({ url: 'https://platform.xiaomimimo.com', active: true });
		btn.innerHTML = `${icon('external-link', 12)}已打开`;
		setTimeout(() => btn.innerHTML = `${icon('external-link', 12)}打开 MiMo 网站`, 1500);
	} catch (err) {
		console.error('[Popup] 打开 MiMo 网站失败:', err);
		btn.innerHTML = `${icon('external-link', 12)}打开失败`;
		setTimeout(() => btn.innerHTML = `${icon('external-link', 12)}打开 MiMo 网站`, 1500);
	}
}

async function handleOpenSite(e) {
	const btn = e.target;
	const kind = btn.dataset.kind;
	const url = kind === 'kimi' ? 'https://www.kimi.com' : 'https://platform.xiaomimimo.com';
	try {
		await chrome.tabs.create({ url, active: true });
		btn.innerHTML = `${icon('external-link', 12)}已打开`;
		setTimeout(() => btn.innerHTML = `${icon('external-link', 12)}打开 ${SERVICE_LABELS[kind]} 网站`, 1500);
	} catch (err) {
		console.error(`[Popup] 打开 ${kind} 网站失败:`, err);
		btn.innerHTML = `${icon('external-link', 12)}打开失败`;
		setTimeout(() => btn.innerHTML = `${icon('external-link', 12)}打开 ${SERVICE_LABELS[kind]} 网站`, 1500);
	}
}

async function handleMimoAutoRefreshToggle(e) {
	const checkbox = e.target;
	config.settings.mimoAutoRefresh = checkbox.checked;
	await saveConfig();
	await notifyConfigUpdated();
	console.log('[Popup] MiMo 自动刷新已' + (checkbox.checked ? '开启' : '关闭'));
}

async function handleKimiAutoRefreshToggle(e) {
	const checkbox = e.target;
	config.settings.kimiAutoRefresh = checkbox.checked;
	await saveConfig();
	await notifyConfigUpdated();
	console.log('[Popup] Kimi 自动刷新已' + (checkbox.checked ? '开启' : '关闭'));
}

async function handleAddService(e) {
	const btn = e.target.closest('.add-svc-btn');
	if (!btn) return;
	const kind = btn.dataset.kind;
	if (!kind) return;

	const existing = config.services.find(s => s.kind === kind);
	if (existing) {
		alert('该服务已存在');
		return;
	}

	const label = SERVICE_LABELS[kind] || kind;
	const id = `${kind}-${Date.now()}`;
	config.services.push({
		id,
		kind,
		name: label,
		enabled: true,
	});

	await saveConfig();
	await notifyConfigUpdated();

	// 重新检测 Bridge 状态后刷新设置页
	await checkBridgeStatus();
	renderSettingsServices();

	// 自动刷新仪表盘
	await ui.loadAll(true);
}

// ===== 初始化 =====

async function init() {
	try {
		await loadConfig();
		await ui.loadAll();
	} catch (err) {
		console.error('[Dashboard] 初始化失败:', err);
		const servicesEl = document.getElementById('services');
		servicesEl.innerHTML = `
			<div class="empty-state">
				<div class="empty-icon">${icon('alert-triangle', 22)}</div>
				<p class="empty-title">初始化失败</p>
				<p class="empty-hint">${escapeHtml(err.message || '加载失败，请检查网络连接后重试')}</p>
				<p class="empty-hint">请重新打开 Popup</p>
			</div>`;
	}

	ui.scheduleRefresh();
}

init();
