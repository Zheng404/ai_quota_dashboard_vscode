/**
 * AI Quota Dashboard — 浏览器扩展主逻辑
 *
 * 支持 GLM / Kimi / MiMo 完整仪表盘功能
 */

import { fetchGlmQuota, fetchGlmDetail } from './api/glm.js';
import { fetchKimiQuota } from './api/kimi.js';
import { fetchMimoQuota } from './api/mimo.js';
import { renderService, switchGlmMainTab, switchGlmSubTab, mergeGlmDetailData, cleanupGlmState, fmtDateTime, escapeHtml } from './templates.js';
import { config, loadConfig, saveConfig } from './config.js';
import { getCached, setCached } from './cache.js';

// ===== 常量 =====

const TIMEOUT_MS = 20000;

const SERVICE_FETCHERS = {
	glm: fetchGlmQuota,
	kimi: fetchKimiQuota,
	mimo: fetchMimoQuota,
};

const SERVICE_LABELS = {
	glm: 'GLM Coding Plan (CN)',
	kimi: 'Kimi Membership',
	mimo: 'Xiaomi MiMo Token Plan',
};

// ===== DOM 元素 =====

const servicesEl = document.getElementById('services');
const refreshBtn = document.getElementById('btn-refresh');
const settingsBtn = document.getElementById('btn-settings');
const lastUpdateEl = document.getElementById('last-update');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const settingsServicesEl = document.getElementById('panel-services');
const settingsGlobalEl = document.getElementById('panel-global');

// ===== 状态 =====

let serviceDataMap = new Map();
let isLoading = false;
let currentTab = 'dashboard';
// config 从 config.js 导入（共享配置模块）

// 配置管理和缓存函数从 config.js / cache.js 导入

// ===== 数据加载 =====

function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error('请求超时')), ms)
		),
	]);
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
			err: `不支持的服务类型: ${kind}`,
		};
	}

	if (!force) {
		const cached = await getCached(id);
		if (cached) return cached;
	}

	try {
		const data = await withTimeout(fetcher(), TIMEOUT_MS);
		await setCached(id, data);
		return data;
	} catch (err) {
		return {
			id,
			name: SERVICE_LABELS[kind] || kind,
			kind,
			slots: [],
			updatedAt: Date.now(),
			err: err.message || '加载失败，请检查网络连接后重试',
			_isError: true,
		};
	}
}

async function loadAll(force = false) {
	if (isLoading) return;
	isLoading = true;

	refreshBtn.disabled = true;
	refreshBtn.innerHTML = '<span class="spin"></span>刷新中...';

	// 保存 GLM API Key 到 storage（让 api/glm.js 能读取）
	if (config.glmApiKey) {
		try {
			await chrome.storage.local.set({ glmApiKey: config.glmApiKey });
		} catch { /* ignore */ }
	}

	const enabledServices = config.services.filter(s => s.enabled !== false);

	if (enabledServices.length === 0) {
			servicesEl.innerHTML = `
				<div class="empty-state">
					<div class="empty-icon">📊</div>
					<p class="empty-title">暂无服务数据</p>
					<p class="empty-hint">切换到「服务」标签启用或添加服务</p>
				</div>`;
		refreshBtn.disabled = false;
		refreshBtn.innerHTML = '刷新';
		isLoading = false;
		return;
	}

	if (force || serviceDataMap.size === 0) {
		servicesEl.innerHTML = '<div class="empty-state"><p>数据加载中...</p></div>';
	}

	const tasks = enabledServices.map(svc => loadService(svc, force));
	const results = await Promise.all(tasks);

	serviceDataMap = new Map();
	for (const data of results) {
		serviceDataMap.set(data.id, data);
		// 错误数据写入缓存（使用更长 TTL，避免频繁重试）
		if (data.err && data._isError) {
			await setCached(data.id, data, true);
		}
	}

	renderDashboard();
	lastUpdateEl.textContent = `更新于 ${fmtDateTime(new Date())}`;

	refreshBtn.disabled = false;
	refreshBtn.innerHTML = '刷新';
	isLoading = false;
}

async function refreshSingleService(serviceId) {
	const svcConfig = config.services.find(s => s.id === serviceId);
	if (!svcConfig) return;

	// 找到对应卡片并显示加载状态
	const card = document.getElementById(`${svcConfig.kind}-card-${serviceId}`);
	if (card) {
		const btn = card.querySelector('.btn-refresh-svc');
		if (btn) btn.innerHTML = '<span class="spin"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></span>';
	}

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
				<p class="empty-title">暂无服务数据</p>
				<p class="empty-hint">切换到「服务」标签启用或添加服务</p>
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
		html = '<div class="empty-state"><p>数据加载中...</p></div>';
	}

	servicesEl.innerHTML = html;
}

function renderSettings() {
	renderSettingsServices();
	renderSettingsGlobal();
}

function renderSettingsServices() {
	let html = '<div class="settings-section"><h3>服务管理</h3>';

	for (const svc of config.services) {
		const isGlm = svc.kind === 'glm';
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
				` : `
				<div class="form-group">
					<label class="form-label">状态</label>
					<p class="form-hint">从浏览器 Cookie 自动获取凭证</p>
				</div>
				`}
				<div class="svc-actions">
					<button class="btn btn-sm btn-primary save-svc-btn" data-service-id="${svc.id}">保存配置</button>
					${isGlm ? `<button class="btn btn-sm btn-danger remove-svc-btn" data-service-id="${svc.id}">删除服务</button>
					` : ''}
				</div>
			</div>`;
	}

	// 添加 GLM 按钮（如果没有 GLM 服务）
	const hasGlm = config.services.some(s => s.kind === 'glm');
	if (!hasGlm) {
		html += `
			<div class="form-actions">
				<button class="btn btn-primary" id="add-glm-btn">+ 添加 GLM 服务</button>
			</div>`;
	}

	html += '</div>';
	settingsServicesEl.innerHTML = html;

	// 绑定服务卡片事件
	settingsServicesEl.querySelectorAll('.save-svc-btn').forEach(btn => {
		btn.addEventListener('click', handleSaveService);
	});
	settingsServicesEl.querySelectorAll('.remove-svc-btn').forEach(btn => {
		btn.addEventListener('click', handleRemoveService);
	});
	const addGlmBtn = document.getElementById('add-glm-btn');
	if (addGlmBtn) {
		addGlmBtn.addEventListener('click', handleAddGlm);
	}
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

	// 切换到「服务」或「设置」面板时按需渲染
	if (tab === 'services') {
		renderSettingsServices();
	} else if (tab === 'global') {
		renderSettingsGlobal();
	}
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
			// 懒加载详情数据
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
			// 同步到 storage，让 api/glm.js 立即生效
			await chrome.storage.local.set({ glmApiKey: config.glmApiKey });
		}
	}

	await saveConfig();
	btn.textContent = '已保存';
	setTimeout(() => btn.textContent = '保存配置', 1500);

	// 如果保存的是 GLM 且有 API Key，尝试刷新
	if (svc.kind === 'glm' && config.glmApiKey) {
		await refreshSingleService(serviceId);
	}
}

async function handleRemoveService(e) {
	const btn = e.target;
	const serviceId = btn.dataset.serviceId;
	const svc = config.services.find(s => s.id === serviceId);
	if (!confirm('确定要删除此服务吗？')) return;

	config.services = config.services.filter(s => s.id !== serviceId);
	if (svc && svc.kind === 'glm') {
		config.glmApiKey = '';
		await chrome.storage.local.remove('glmApiKey');
	}
	await saveConfig();
	serviceDataMap.delete(serviceId);

	// 清理 GLM 状态（防止内存泄漏）
	if (svc && svc.kind === 'glm') {
		cleanupGlmState(serviceId);
	}

	renderSettingsServices();
	renderDashboard();
}

async function handleAddGlm() {
	const hasGlm = config.services.some(s => s.kind === 'glm');
	if (hasGlm) return;

	config.services.push({
		id: 'glm',
		kind: 'glm',
		name: 'GLM',
		enabled: true,
	});
	await saveConfig();
	renderSettingsServices();
}

async function handleSaveGlobal() {
	const refreshInput = document.getElementById('setting-refresh');
	const warnInput = document.getElementById('setting-warn');

	config.settings.refreshInterval = parseInt(refreshInput.value, 10) || 600;
	config.settings.warnThreshold = parseFloat(warnInput.value) || 0.8;

	await saveConfig();
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
refreshBtn.addEventListener('click', () => loadAll(true));
settingsBtn.addEventListener('click', () => {
	// 设置按钮跳转到「服务」标签页（管理服务配置）
	currentTab = 'services';
	tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'services'));
	tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === 'panel-services'));
	renderSettingsServices();
});

// ===== Cookie 变化即时刷新 =====

let cookieRefreshTimeout = null;
const pendingCookieKinds = new Set();

chrome.runtime.onMessage.addListener((msg) => {
	if (msg.action !== 'cookieChanged' || !msg.kind) return;

	// 收集变化的 kinds，防抖结束后批量刷新（避免快速连续消息丢失服务）
	pendingCookieKinds.add(msg.kind);
	clearTimeout(cookieRefreshTimeout);
	cookieRefreshTimeout = setTimeout(() => {
		const kinds = [...pendingCookieKinds];
		pendingCookieKinds.clear();
		for (const kind of kinds) {
			const svc = config.services.find(s => s.kind === kind && s.enabled !== false);
			if (svc) {
				refreshSingleService(svc.id);
			}
		}
	}, 2000);
});

// ===== 初始化 =====

let refreshTimer = null;

/** 调度下一次自动刷新（使用 setTimeout 递归，能响应刷新间隔变化） */
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
	await loadAll();
	scheduleRefresh();
}

init();
