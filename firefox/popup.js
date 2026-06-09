/**
 * AI Quota Dashboard — 浏览器扩展主逻辑（Popup 版）
 *
 * 支持 GLM / Kimi / MiMo，需手动添加服务。
 * 添加哪个卡片就开启哪个卡片的 Cookie Bridge（凭证从浏览器自动获取并转发给 VSCode）。
 */

import { fetchGlmQuota, fetchGlmDetail } from './api/glm.js';
import { fetchKimiQuota } from './api/kimi.js';
import { fetchMimoQuota } from './api/mimo.js';
import { renderService, switchGlmMainTab, switchGlmSubTab, mergeGlmDetailData, fmtDateTime, escapeHtml } from './templates.js';

// ===== 常量 =====

const CACHE_TTL_MS = 60 * 1000;
const TIMEOUT_MS = 20000;

const SERVICE_FETCHERS = {
	glm: fetchGlmQuota,
	kimi: fetchKimiQuota,
	mimo: fetchMimoQuota,
};

const SERVICE_LABELS = {
	glm: 'GLM Coding Plan',
	kimi: 'Kimi Membership',
	mimo: 'Xiaomi MiMo',
};

/** 需要 Cookie Bridge 的服务（凭证来自浏览器） */
const BRIDGE_KINDS = new Set(['glm', 'kimi', 'mimo']);

const SERVICE_KINDS = [
	{ kind: 'glm', label: 'GLM Coding Plan', desc: 'Cookie Bridge 转发 API Key' },
	{ kind: 'kimi', label: 'Kimi Membership', desc: 'Cookie Bridge 转发凭证' },
	{ kind: 'mimo', label: 'Xiaomi MiMo', desc: 'Cookie Bridge 转发凭证' },
];

// ===== DOM 元素 =====

const servicesEl = document.getElementById('services');
const refreshBtn = document.getElementById('btn-refresh');
const settingsBtn = document.getElementById('btn-settings');
const lastUpdateEl = document.getElementById('last-update');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const subTabBtns = document.querySelectorAll('.sub-tab-btn');
const subTabPanels = document.querySelectorAll('.sub-tab-panel');
const settingsServicesEl = document.getElementById('subpanel-services');
const settingsGlobalEl = document.getElementById('subpanel-global');

// ===== 状态 =====

let serviceDataMap = new Map();
let isLoading = false;
let bridgeStatus = {
	connected: false,
	activeKinds: [],
};
let config = {
	services: [],
	glmApiKey: '',
	settings: {
		refreshInterval: 600,
		warnThreshold: 0.8,
	},
};

let currentTab = 'dashboard';
let currentSubTab = 'services';
let refreshTimer = null;

// ===== Cookie Bridge 状态检测 =====

async function checkBridgeStatus() {
	try {
		const response = await new Promise((resolve) => {
			chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
				resolve(response || { connected: false, activeKinds: [] });
			});
		});
		bridgeStatus = {
			connected: response.connected || false,
			activeKinds: response.activeKinds || [],
		};
	} catch {
		bridgeStatus = { connected: false, activeKinds: [] };
	}
}

/** 通知 background 配置已更新 */
async function notifyConfigUpdated() {
	try {
		await new Promise((resolve) => {
			chrome.runtime.sendMessage({ action: 'configUpdated' }, (response) => {
				resolve(response);
			});
		});
	} catch {
		// ignore
	}
}

// ===== 配置管理 =====

async function loadConfig() {
	try {
		const stored = await chrome.storage.local.get(['dashboardConfig', 'glmApiKey']);
		if (stored.dashboardConfig) {
			config = { ...config, ...stored.dashboardConfig };
		}
		if (stored.glmApiKey) {
			config.glmApiKey = stored.glmApiKey;
		}
		if (!Array.isArray(config.services)) {
			config.services = [];
		}
	} catch (err) {
		console.error('[Dashboard] 加载配置失败:', err);
	}
}

async function saveConfig() {
	try {
		await chrome.storage.local.set({
			dashboardConfig: config,
			glmApiKey: config.glmApiKey,
		});
	} catch (err) {
		console.error('[Dashboard] 保存配置失败:', err);
	}
}

// ===== 缓存 =====

async function getCached(serviceId) {
	try {
		const result = await chrome.storage.local.get(`quotaCache_${serviceId}`);
		const entry = result[`quotaCache_${serviceId}`];
		if (!entry) return null;
		const age = Date.now() - entry.timestamp;
		if (age > CACHE_TTL_MS) return null;
		return entry.data;
	} catch {
		return null;
	}
}

async function setCached(serviceId, data) {
	try {
		await chrome.storage.local.set({
			[`quotaCache_${serviceId}`]: { data, timestamp: Date.now() },
		});
	} catch {
		// ignore
	}
}

// ===== 数据加载 =====

function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error('请求超时')), ms)
		),
	]);
}

/** 获取服务的 Cookie Bridge 状态 */
function getBridgeStateForKind(kind) {
	if (!BRIDGE_KINDS.has(kind)) return null;
	return {
		isBridgeActive: bridgeStatus.activeKinds.includes(kind),
		isVscodeConnected: bridgeStatus.connected,
	};
}

async function loadService(serviceConfig, force = false) {
	const { kind, id } = serviceConfig;
	const fetcher = SERVICE_FETCHERS[kind];
	if (!fetcher) {
		return {
			id,
			name: SERVICE_LABELS[kind] || kind,
			kind,
			slots: [],
			updatedAt: Date.now(),
			err: `未知的服务类型: ${kind}`,
		};
	}

	if (!force) {
		const cached = await getCached(id);
		if (cached) return cached;
	}

	try {
		const data = await withTimeout(fetcher(), TIMEOUT_MS);
		// 覆盖 fetcher 返回的硬编码 ID/名称为实际配置值
		data.id = serviceConfig.id;
		data.name = serviceConfig.name || data.name;
		// 注入 Cookie Bridge 状态（所有服务都支持 Bridge）
		const bridgeState = getBridgeStateForKind(kind);
		if (bridgeState) {
			data.bridgeStatus = bridgeState.isBridgeActive
				? (bridgeState.isVscodeConnected ? 'connected' : 'active')
				: 'inactive';
		}
		await setCached(id, data);
		return data;
	} catch (err) {
		const bridgeState = getBridgeStateForKind(kind);
		return {
			id,
			name: serviceConfig.name || SERVICE_LABELS[kind] || kind,
			kind,
			slots: [],
			updatedAt: Date.now(),
			bridgeStatus: bridgeState
				? (bridgeState.isBridgeActive
					? (bridgeState.isVscodeConnected ? 'connected' : 'active')
					: 'inactive')
				: undefined,
			err: err.message || '加载失败',
		};
	}
}

async function loadAll(force = false) {
	if (isLoading) return;
	isLoading = true;

	refreshBtn.disabled = true;
	refreshBtn.innerHTML = '<span class="spin">🔄</span>';

	try {
		if (config.glmApiKey) {
			try {
				await chrome.storage.local.set({ glmApiKey: config.glmApiKey });
			} catch { /* ignore */ }
		}

		await checkBridgeStatus();

		const enabledServices = config.services.filter(s => s.enabled !== false);

		if (enabledServices.length === 0) {
			servicesEl.innerHTML = `
				<div class="empty-state">
					<div class="empty-icon">📊</div>
					<p class="empty-title">暂无服务</p>
					<p class="empty-hint">切换到「设置」标签添加服务</p>
					<p class="empty-hint" style="margin-top: 8px; font-size: 11px;">
						添加 Kimi / MiMo 卡片后自动开启 Cookie Bridge
					</p>
				</div>`;
			return;
		}

		if (force || serviceDataMap.size === 0) {
			servicesEl.innerHTML = '<div class="empty-state"><p>加载中...</p></div>';
		}

		const tasks = enabledServices.map(svc => loadService(svc, force));
		const results = await Promise.all(tasks);

		serviceDataMap = new Map();
		for (const data of results) {
			serviceDataMap.set(data.id, data);
		}

		renderDashboard();
		lastUpdateEl.textContent = `更新于 ${fmtDateTime(new Date())}`;
	} catch (err) {
		console.error('[Dashboard] loadAll 失败:', err);
		servicesEl.innerHTML = `
			<div class="empty-state">
				<div class="empty-icon">⚠️</div>
				<p class="empty-title">加载失败</p>
				<p class="empty-hint">${escapeHtml(err.message || '未知错误')}</p>
				<p class="empty-hint" style="margin-top: 4px; font-size: 11px;">点击刷新按钮重试</p>
			</div>`;
	} finally {
		refreshBtn.disabled = false;
		refreshBtn.innerHTML = '🔄';
		isLoading = false;
	}
}

async function refreshSingleService(serviceId) {
	const svcConfig = config.services.find(s => s.id === serviceId);
	if (!svcConfig) return;

	const card = document.getElementById(`${svcConfig.kind}-card-${serviceId}`);
	if (card) {
		const btn = card.querySelector('.btn-refresh-svc');
		if (btn) btn.innerHTML = '<span class="spin"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></span>';
	}

	await checkBridgeStatus();
	const data = await loadService(svcConfig, true);
	serviceDataMap.set(data.id, data);
	renderDashboard();
}

// ===== 渲染 =====

function renderDashboard() {
	const enabledServices = config.services.filter(s => s.enabled !== false);
	if (enabledServices.length === 0) {
		servicesEl.innerHTML = `
			<div class="empty-state">
				<div class="empty-icon">📊</div>
				<p class="empty-title">暂无服务</p>
				<p class="empty-hint">切换到「设置」标签添加服务</p>
				<p class="empty-hint" style="margin-top: 8px; font-size: 11px;">
					添加 Kimi / MiMo 卡片后自动开启 Cookie Bridge
				</p>
			</div>`;
		return;
	}

	let html = '';
	for (const svc of enabledServices) {
		const data = serviceDataMap.get(svc.id);
		if (data) {
			html += renderService(data);
		}
	}

	if (!html) {
		html = '<div class="empty-state"><p>加载中...</p></div>';
	}

	servicesEl.innerHTML = html;
}

function renderSettings() {
	renderSettingsServices();
	renderSettingsGlobal();
}

function renderSettingsServices() {
	let html = '<div class="settings-section">';

	// Cookie Bridge 总体状态：显示哪些服务已启用 Bridge
	const bridgeServices = config.services.filter(s => s.enabled !== false);
	if (bridgeServices.length > 0) {
		const bridgeLabels = bridgeServices.map(s => SERVICE_LABELS[s.kind] || s.kind);
		const isActive = bridgeStatus.activeKinds.length > 0;
		const isConnected = bridgeStatus.connected;

		html += `
			<div style="margin-bottom: 16px; padding: 10px; background: ${isActive ? (isConnected ? '#dcfce7' : '#fef9c3') : '#f3f4f6'}; border-radius: 6px;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<span style="font-size: 16px;">🍪</span>
					<div>
						<div style="font-weight: 600; font-size: 12px; color: ${isActive ? (isConnected ? '#166534' : '#854d0e') : '#6b7280'};">
							Cookie Bridge ${isActive ? (isConnected ? '— 已连接 VSCode' : '— 等待 VSCode 连接') : ''}
						</div>
						<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
							已启用：${escapeHtml(bridgeLabels.join('、'))}
						</div>
						<div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">
							凭证从浏览器自动获取，每 30 分钟检测有效性，失效时自动刷新
						</div>
					</div>
				</div>
			</div>`;
	} else {
		html += `
			<div style="margin-bottom: 16px; padding: 10px; background: #f3f4f6; border-radius: 6px;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<span style="font-size: 16px;">🍪</span>
					<div>
						<div style="font-weight: 600; font-size: 12px; color: #6b7280;">Cookie Bridge — 未启用</div>
						<div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
							添加 Kimi 或 MiMo 卡片后自动开启
						</div>
					</div>
				</div>
			</div>`;
	}

	html += '<h3>已添加服务</h3>';

	if (config.services.length === 0) {
		html += '<p style="color: #9ca3af; font-size: 12px; text-align: center; padding: 20px;">暂无服务，请从下方添加</p>';
	} else {
		for (const svc of config.services) {
			const isGlm = svc.kind === 'glm';
			const bridgeActive = bridgeStatus.activeKinds.includes(svc.kind);

			html += `
				<div class="service-item-card" data-service-id="${svc.id}">
					<div class="svc-row">
						<span class="svc-name">${escapeHtml(svc.name)}</span>
						<span class="svc-kind">${escapeHtml(SERVICE_LABELS[svc.kind] || svc.kind)}</span>
					</div>
					${isGlm ? `
					<div class="form-group">
						<label class="form-label">API Key</label>
						<input type="password" class="form-input glm-key-input" data-service-id="${svc.id}" value="${escapeHtml(config.glmApiKey || '')}" placeholder="输入 GLM API Key">
					</div>
					` : ''}
					<div class="form-group">
						<label class="form-label">凭证来源</label>
						<p class="form-hint">
							${isGlm ? 'API Key 通过 Cookie Bridge 转发给 VSCode' : '从浏览器自动获取 Cookie'}
							${bridgeActive
								? (bridgeStatus.connected ? ' — ✅ 已转发给 VSCode' : ' — ⏳ 等待 VSCode 连接')
								: ' — 🔧 Bridge 未激活'}
						</p>
					</div>
					<div class="svc-actions">
						<button class="btn btn-sm btn-primary save-svc-btn" data-service-id="${svc.id}">保存</button>
						<button class="btn btn-sm btn-danger remove-svc-btn" data-service-id="${svc.id}">删除</button>
					</div>
				</div>`;
		}
	}

	// 添加服务区域
	html += '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">';
	html += '<h4 style="font-size: 13px; margin-bottom: 10px;">添加服务</h4>';
	html += '<div style="display: flex; flex-direction: column; gap: 8px;">';

	const existingKinds = new Set(config.services.map(s => s.kind));
	for (const svcKind of SERVICE_KINDS) {
		if (!existingKinds.has(svcKind.kind)) {
			html += `
				<button class="btn btn-secondary add-svc-btn" data-kind="${svcKind.kind}" style="justify-content: flex-start; text-align: left;">
					<span style="font-weight: 600;">+ ${escapeHtml(svcKind.label)}</span>
					<span style="color: #9ca3af; font-size: 11px; margin-left: auto;">${escapeHtml(svcKind.desc)}</span>
				</button>`;
		}
	}

	html += '</div></div>';
	html += '</div>';

	settingsServicesEl.innerHTML = html;

	settingsServicesEl.querySelectorAll('.save-svc-btn').forEach(btn => {
		btn.addEventListener('click', handleSaveService);
	});
	settingsServicesEl.querySelectorAll('.remove-svc-btn').forEach(btn => {
		btn.addEventListener('click', handleRemoveService);
	});
	settingsServicesEl.querySelectorAll('.add-svc-btn').forEach(btn => {
		btn.addEventListener('click', handleAddService);
	});
}

function renderSettingsGlobal() {
	settingsGlobalEl.innerHTML = `
		<div class="settings-section">
			<h3>全局设置</h3>
			<div class="form-group">
				<label class="form-label">自动刷新间隔（秒）</label>
				<input type="number" class="form-input" id="setting-refresh" value="${config.settings.refreshInterval}" min="0" step="60">
				<span class="form-hint">设为 0 禁用自动刷新</span>
			</div>
			<div class="form-group">
				<label class="form-label">预警阈值（0-1）</label>
				<input type="number" class="form-input" id="setting-warn" value="${config.settings.warnThreshold}" min="0" max="1" step="0.1">
				<span class="form-hint">配额使用率超过此值时显示警告</span>
			</div>
			<div class="form-actions">
				<button class="btn btn-primary" id="save-global-btn">保存设置</button>
			</div>
		</div>
		<div class="settings-section">
			<h3>数据管理</h3>
			<button class="btn btn-danger" id="clear-cache-btn">清除缓存</button>
		</div>
	`;

	document.getElementById('save-global-btn').addEventListener('click', handleSaveGlobal);
	document.getElementById('clear-cache-btn').addEventListener('click', handleClearCache);
}

// ===== 事件处理 =====

function handleTabSwitch(e) {
	const tab = e.target.dataset.tab;
	if (!tab) return;

	currentTab = tab;
	tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
	tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab}`));

	if (tab === 'settings') {
		renderSettings();
	}
}

function handleSubTabSwitch(e) {
	const subtab = e.target.dataset.subtab;
	if (!subtab) return;

	currentSubTab = subtab;
	subTabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.subtab === subtab));
	subTabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `subpanel-${subtab}`));
}

async function handleGlmMainTabClick(e) {
	if (!e.target.classList.contains('glm-main-tab')) return;
	const svcId = e.target.dataset.svcId;
	const tab = e.target.dataset.tab;
	if (svcId && tab) {
		switchGlmMainTab(svcId, tab);
	}
}

async function handleGlmSubTabClick(e) {
	if (!e.target.classList.contains('glm-sub-tab')) return;
	const svcId = e.target.dataset.svcId;
	const range = e.target.dataset.range;
	if (svcId && range) {
		switchGlmSubTab(svcId, range, async (id, rng) => {
			const detail = await fetchGlmDetail(rng);
			if (detail) {
				mergeGlmDetailData(id, detail);
			}
		});
	}
}

async function handleRefreshService(e) {
	const btn = e.target.closest('.btn-refresh-svc');
	if (!btn) return;
	const serviceId = btn.dataset.serviceId;
	if (serviceId) {
		await refreshSingleService(serviceId);
	}
}

async function handleSaveService(e) {
	const btn = e.target;
	const serviceId = btn.dataset.serviceId;
	const card = btn.closest('.service-item-card');
	const svc = config.services.find(s => s.id === serviceId);
	if (!svc) return;

	if (svc.kind === 'glm') {
		const keyInput = card.querySelector('.glm-key-input');
		if (keyInput) {
			config.glmApiKey = keyInput.value.trim();
			await chrome.storage.local.set({ glmApiKey: config.glmApiKey });
		}
	}

	await saveConfig();
	await notifyConfigUpdated();

	btn.textContent = '已保存';
	setTimeout(() => btn.textContent = '保存', 1500);

	if (svc.kind === 'glm' && config.glmApiKey) {
		await refreshSingleService(serviceId);
	}
}

async function handleRemoveService(e) {
	const btn = e.target;
	const serviceId = btn.dataset.serviceId;
	const svc = config.services.find(s => s.id === serviceId);
	if (!svc) return;

	if (!confirm(`确定要删除 ${svc.name} 吗？`)) return;

	config.services = config.services.filter(s => s.id !== serviceId);
	if (svc.kind === 'glm') {
		config.glmApiKey = '';
		await chrome.storage.local.remove('glmApiKey');
	}
	await saveConfig();
	await notifyConfigUpdated();
	serviceDataMap.delete(serviceId);

	// 重新检测 Bridge 状态后刷新 UI
	await checkBridgeStatus();
	renderSettingsServices();
	renderDashboard();
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
	await loadAll(true);
}

async function handleSaveGlobal() {
	const refreshInput = document.getElementById('setting-refresh');
	const warnInput = document.getElementById('setting-warn');

	config.settings.refreshInterval = parseInt(refreshInput.value, 10) || 600;
	config.settings.warnThreshold = parseFloat(warnInput.value) || 0.8;

	await saveConfig();
	scheduleRefresh(); // 重新调度以应用新的刷新间隔
	const btn = document.getElementById('save-global-btn');
	btn.textContent = '已保存';
	setTimeout(() => btn.textContent = '保存设置', 1500);
}

async function handleClearCache() {
	try {
		const keys = await chrome.storage.local.get(null);
		const cacheKeys = Object.keys(keys).filter(k => k.startsWith('quotaCache_'));
		if (cacheKeys.length > 0) {
			await chrome.storage.local.remove(cacheKeys);
		}
		serviceDataMap.clear();
		alert('缓存已清除');
		renderDashboard();
	} catch (err) {
		alert('清除失败: ' + err.message);
	}
}

// ===== 事件委托 =====

servicesEl.addEventListener('click', (e) => {
	handleGlmMainTabClick(e);
	handleGlmSubTabClick(e);
	handleRefreshService(e);
});

tabBtns.forEach(btn => btn.addEventListener('click', handleTabSwitch));
subTabBtns.forEach(btn => btn.addEventListener('click', handleSubTabSwitch));
refreshBtn.addEventListener('click', () => loadAll(true));
settingsBtn.addEventListener('click', () => {
	currentTab = 'settings';
	tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'settings'));
	tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === 'panel-settings'));
	renderSettings();
});

/** 调度下一次自动刷新 */
function scheduleRefresh() {
	clearTimeout(refreshTimer);
	const interval = config.settings.refreshInterval || 600;
	if (interval > 0) {
		refreshTimer = setTimeout(() => {
			if (currentTab === 'dashboard') {
				loadAll();
			}
			scheduleRefresh();
		}, interval * 1000);
	}
}

// ===== 初始化 =====

async function init() {
	try {
		await loadConfig();
		await loadAll();
	} catch (err) {
		console.error('[Dashboard] 初始化失败:', err);
		servicesEl.innerHTML = `
			<div class="empty-state">
				<div class="empty-icon">⚠️</div>
				<p class="empty-title">初始化失败</p>
				<p class="empty-hint">${escapeHtml(err.message || '未知错误')}</p>
				<p class="empty-hint" style="margin-top: 4px; font-size: 11px;">请重新打开 Popup</p>
			</div>`;
	}

	scheduleRefresh();
}

init();
