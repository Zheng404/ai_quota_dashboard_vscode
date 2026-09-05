/**
 * Shared UI Module for Popup / Dashboard pages
 *
 * Extracts the near-verbatim duplicated logic between popup.js and dashboard.js; behavioral differences
 * (Bridge status card, auto-refresh toggle, empty-state copy, button text, etc.) are injected via options,
 * keeping both pages' existing behavior and DOM conventions completely unchanged.
 *
 * Page-exclusive logic stays in each page's own file:
 * - popup.js: Bridge status detection, service management (add/delete site-opening toggle), etc.
 * - dashboard.js: default service initialization, GLM quick-add, etc.
 */

import { fetchGlmQuota, fetchGlmDetail } from './api/glm.js';
import { fetchKimiQuota } from './api/kimi.js';
import { fetchMimoQuota } from './api/mimo.js';
import { renderService, switchGlmMainTab, switchGlmSubTab, mergeGlmDetailData, cleanupGlmState, fmtDateTime, escapeHtml } from './templates.js';
import { icon, spinnerIcon } from './icons.js';
import { config, loadConfig, saveConfig } from './config.js';
import { getCached, setCached } from './cache.js';
import { MSG } from './protocol/index.js';

// ===== Shared constants =====

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

/** Write a timestamped GLM API Key copy (read by api/glm.js and background, with a 24h TTL) */
async function saveGlmApiKeyCopy(value) {
	try {
		await chrome.storage.local.set({ glmApiKey: { value, capturedAt: Date.now() } });
	} catch { /* ignore */ }
}

/**
 * Create a shared UI context. Called at module top level in the page (same timing as the original top-level binding).
 *
 * @param {object} [options] Difference injection items:
 * - beforeLoad: async callback at the start of loadAll (popup uses it to detect Bridge status)
 * - beforeRefreshSingle: async callback before fetching data when refreshing a single service (popup detects Bridge status)
 * - getBridgeStateForKind: injects bridgeStatus into service data during loadService (popup-specific; when not passed, no injection)
 * - refreshingLabel: text of the refresh button while loading (default '刷新中...')
 * - refreshLabel: the restored refresh button HTML (default icon + '刷新')
 * - emptyServicesHint: secondary hint copy of the no-services empty state
 * - emptyServicesExtraHtml: additional hint line in the no-services empty state (popup's Bridge hint)
 * - renderLoadError: error empty-state rendering when loadAll fails (popup passes a handler; when not passed, the exception propagates, preserving dashboard's original behavior)
 * - notifyConfigUpdated: notification callback after saving config (popup-specific)
 * - removeConfirmText: (svc) => delete confirmation text
 * - afterRemove: async callback after deleting a service (popup re-detects Bridge status)
 * - afterSaveGlobal: callback after saving global settings (popup reschedules auto-refresh)
 * - showCredentialCacheClear: whether the "Data Management" area shows a "Clear local credential cache" button
 * - onBridgeReconnectResult: async callback after the Data Bridge manual reconnect responds (popup/dashboard refresh bridge state)
 * - onBridgeConnected: callback on BRIDGE_CONNECTED broadcast (background 端口发现建立连接时，popup/dashboard 即时刷新桥卡)
 */
export function createSharedUI(options = {}) {
	const {
		beforeLoad = null,
		beforeRefreshSingle = null,
		getBridgeStateForKind = null,
		refreshingLabel = '刷新中',
		refreshLabel = `${icon('refresh-cw', 13)}<span>刷新</span>`,
		emptyServicesHint = '切换到「服务」标签启用或添加服务',
		emptyServicesExtraHtml = '',
		renderLoadError = null,
		notifyConfigUpdated = null,
		removeConfirmText = () => '确定要删除此服务吗？',
		afterRemove = null,
		afterSaveGlobal = null,
		showCredentialCacheClear = false,
		onBridgeReconnectResult = null,
		onBridgeConnected = null,
	} = options;

	// ===== DOM elements =====

	const servicesEl = document.getElementById('services');
	const refreshBtn = document.getElementById('btn-refresh');
	const settingsBtn = document.getElementById('btn-settings');
	const lastUpdateEl = document.getElementById('last-update');
	const tabsEl = document.querySelector('.tabs');
	const tabBtns = document.querySelectorAll('.tab-btn');
	const tabPanels = document.querySelectorAll('.tab-panel');
	const settingsServicesEl = document.getElementById('panel-services');
	const settingsGlobalEl = document.getElementById('panel-global');

	// ===== State =====

	let serviceDataMap = new Map();
	let isLoading = false;
	let currentTab = 'dashboard';
	let refreshTimer = null;
	/** 上次渲染的卡片 id 序列（变化时才触发 stagger 入场动画，常规刷新不打断阅读） */
	let lastCardKey = '';

	// ===== Motion helpers（数字滚动 / stagger 入场 / Tab 指示器）=====

	/** 百分比数字滚动动画（读取 data-count / data-dec，ease-out cubic） */
	function animateNumbers(root) {
		root.querySelectorAll('[data-count]').forEach(el => {
			const target = parseFloat(el.dataset.count);
			const dec = parseInt(el.dataset.dec || '0', 10);
			if (!isFinite(target)) {
				el.textContent = el.dataset.count;
				return;
			}
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				el.textContent = target.toFixed(dec);
				return;
			}
			const dur = 750;
			const t0 = performance.now();
			const tick = (t) => {
				const p = Math.min(1, (t - t0) / dur);
				const e = 1 - Math.pow(1 - p, 3);
				el.textContent = (target * e).toFixed(dec);
				if (p < 1) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
	}

	/** 卡片集合变化时应用 stagger 入场；数量/类型不变则跳过（无缝刷新） */
	function applyCardEntrance() {
		const cards = Array.from(servicesEl.children);
		const key = cards.map(c => c.id || c.className).join('|');
		if (key === lastCardKey) return;
		lastCardKey = key;
		cards.forEach((card, i) => {
			card.classList.add('card-anim');
			card.style.setProperty('--i', String(i));
		});
	}

	/** Tab 滑动指示器定位 */
	function moveTabIndicator(tab) {
		if (!tabsEl) return;
		const idx = Array.from(tabBtns).findIndex(btn => btn.dataset.tab === tab);
		tabsEl.style.setProperty('--tab-i', String(Math.max(0, idx)));
	}

	// ===== Data loading =====

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
			// 缓存键统一为 kind（与 background relay.js 的 quotaCache_${kind} 互通）
			const cached = await getCached(kind);
			if (cached) return cached;
		}

		try {
			const data = await withTimeout(fetcher(), TIMEOUT_MS);
			// Overwrite the fetcher's hardcoded ID/name with the actual configured values
			data.id = serviceConfig.id;
			data.name = serviceConfig.name || data.name;
			// Inject Data Bridge status (only the popup passes getBridgeStateForKind)
			const bridgeState = getBridgeStateForKind ? getBridgeStateForKind(kind) : null;
			if (bridgeState) {
				data.bridgeStatus = bridgeState.isBridgeActive
					? (bridgeState.isVscodeConnected ? 'connected' : 'active')
					: 'inactive';
			}
			// fetcher 内部兜底的 err 数据（最常见失败形态）同样按错误 TTL 缓存（P2-2 口径统一）
			await setCached(kind, data, Boolean(data.err));
			return data;
		} catch (err) {
			const bridgeState = getBridgeStateForKind ? getBridgeStateForKind(kind) : null;
			const errData = {
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
				err: err.message || '加载失败，请检查网络连接后重试',
				_isError: true,  // Mark as error data, using a longer cache TTL
			};
			// 错误数据按 kind 键写缓存（5 分钟 TTL），与上方 getCached(kind) 读键一致，
			// 避免每次打开 popup 重踩失败链；回写只发生在真实失败的此处，
			// 防止上层把缓存错误反复回写导致 TTL 无限续期
			await setCached(kind, errData, true);
			return errData;
		}
	}

	/** 无服务空状态（loadAll / renderDashboard 共用） */
	function renderEmptyServices() {
		return `
			<div class="empty-state">
				<div class="empty-icon">${icon('bar-chart-3', 22)}</div>
				<p class="empty-title">暂无服务数据</p>
				<p class="empty-hint">${emptyServicesHint}</p>
				${emptyServicesExtraHtml}
			</div>`;
	}

	async function loadAll(force = false) {
		if (isLoading) return;
		isLoading = true;

		refreshBtn.disabled = true;
		refreshBtn.innerHTML = `<span class="spin">${spinnerIcon(13)}</span><span>${refreshingLabel}</span>`;

		try {
			// Save the GLM API Key copy to storage (so api/glm.js and background can read it)
			if (config.glmApiKey) {
				await saveGlmApiKeyCopy(config.glmApiKey);
			}

			if (beforeLoad) {
				await beforeLoad();
			}

			const enabledServices = config.services.filter(s => s.enabled !== false);

			if (enabledServices.length === 0) {
				servicesEl.innerHTML = renderEmptyServices();
				lastCardKey = '';  // 服务列表变化，下次渲染重新入场
				return;
			}

			// stale-while-revalidate：先把各服务 kind 缓存（含 5 分钟内的错误缓存）铺进视图，
			// 首屏不再全量阻塞等最慢的服务；无缓存的服务在拉取完成后逐卡补上
			if (!force) {
				const cachedList = await Promise.all(enabledServices.map(svc => getCached(svc.kind)));
				let anyCached = false;
				cachedList.forEach((cached, i) => {
					if (cached) {
						// 归一化（P2-3）：relay 种子的缓存 id/name 是 fetcher 硬编码值，
						// 需按当前服务配置覆写并注入 Bridge 状态，与 loadService 拉取路径口径一致
						cached.id = enabledServices[i].id;
						cached.name = enabledServices[i].name || cached.name;
						const bridgeState = getBridgeStateForKind ? getBridgeStateForKind(enabledServices[i].kind) : null;
						if (bridgeState) {
							cached.bridgeStatus = bridgeState.isBridgeActive
								? (bridgeState.isVscodeConnected ? 'connected' : 'active')
								: 'inactive';
						}
						serviceDataMap.set(enabledServices[i].id, cached);
						anyCached = true;
					}
				});
				if (anyCached) renderDashboard();
			}

			if (serviceDataMap.size === 0) {
				servicesEl.innerHTML = '<div class="empty-state"><p>数据加载中...</p></div>';
			}

			// 逐卡拉取 + 增量重渲染：每张卡完成即更新，不再等 Promise.all 的最慢者；
			// 手动刷新（force）期间旧卡保持可见，新数据到达后原位替换
			const tasks = enabledServices.map(async (svc) => {
				const data = await loadService(svc, force);
				serviceDataMap.set(data.id, data);
				renderDashboard();
			});
			await Promise.all(tasks);

			lastUpdateEl.textContent = `更新于 ${fmtDateTime(new Date())}`;
		} catch (err) {
			console.error('[Dashboard] loadAll 失败:', err);
			if (renderLoadError) {
				// The popup renders the error empty state and swallows the exception (original behavior)
				renderLoadError(err, servicesEl);
			} else {
				// No error rendering configured: keep the exception propagating (dashboard's original behavior)
				throw err;
			}
		} finally {
			refreshBtn.disabled = false;
			refreshBtn.innerHTML = refreshLabel;
			isLoading = false;
		}
	}

	async function refreshSingleService(serviceId) {
		const svcConfig = config.services.find(s => s.id === serviceId);
		if (!svcConfig) return;

		// Find the corresponding card and show a loading state
		const card = document.getElementById(`${svcConfig.kind}-card-${serviceId}`);
		if (card) {
			const btn = card.querySelector('.btn-refresh-svc');
			if (btn) btn.innerHTML = `<span class="spin">${spinnerIcon(13)}</span>`;
		}

		if (beforeRefreshSingle) {
			await beforeRefreshSingle();
		}
		const data = await loadService(svcConfig, true);
		serviceDataMap.set(data.id, data);
		renderDashboard();
	}

	// ===== Rendering (the shared part; service tab rendering stays in each page's own file) =====

	function renderDashboard() {
		const enabledServices = config.services.filter(s => s.enabled !== false);
		if (enabledServices.length === 0) {
			servicesEl.innerHTML = renderEmptyServices();
			lastCardKey = '';
			return;
		}

		let html = '';
		let index = 0;
		for (const svc of enabledServices) {
			const data = serviceDataMap.get(svc.id);
			if (data) {
				html += renderService(data, index);
				index++;
			}
		}

		if (!html) {
			html = '<div class="empty-state"><p>数据加载中...</p></div>';
		}

		servicesEl.innerHTML = html;
		applyCardEntrance();
		animateNumbers(servicesEl);
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
					<button class="btn btn-primary" id="save-global-btn">${icon('check', 13)}保存设置</button>
				</div>
			</div>
			<div class="settings-section">
				<h3>数据管理</h3>
				<button class="btn btn-danger" id="clear-cache-btn">${icon('database', 13)}清除缓存</button>
				${showCredentialCacheClear ? `<button class="btn btn-danger btn-block" id="clear-credential-cache-btn">${icon('shield-check', 13)}清除本地凭证缓存</button>` : ''}
			</div>
		`;

		document.getElementById('save-global-btn').addEventListener('click', handleSaveGlobal);
		document.getElementById('clear-cache-btn').addEventListener('click', handleClearCache);
		if (showCredentialCacheClear) {
			document.getElementById('clear-credential-cache-btn').addEventListener('click', handleClearCredentialCache);
		}
	}

	// ===== Data Bridge 状态卡（两页共用渲染，页面差异经 options 注入）=====

	/**
	 * 渲染 Data Bridge 状态卡（含「重新连接」按钮）。
	 * 状态三态：connected（薄荷）/ waiting（琥珀）/ off（灰），由页面注入的 bridgeStatus 决定。
	 * @param {{connected:boolean, activeKinds:string[], lastError:string|null}} bStatus
	 * @returns {string} HTML
	 */
	function renderBridgeCard(bStatus) {
		const bridgeServices = config.services.filter(s => s.enabled !== false);
		const isActive = (bStatus.activeKinds || []).length > 0 || bridgeServices.length > 0;
		const isConnected = !!bStatus.connected;
		const stateClass = isActive ? (isConnected ? 'is-connected' : 'is-waiting') : '';
		const stateText = isActive ? (isConnected ? '已连接 VSCode' : '等待 VSCode 连接') : '未启用';
		const reconnectBtn = `<button class="btn btn-sm btn-secondary bridge-reconnect-btn" type="button">${icon('plug-zap', 12)}重新连接</button>`;

		if (bridgeServices.length === 0) {
			return `
				<div class="bridge-card ${stateClass}">
					<span class="bridge-icon">${icon('radio-tower', 15)}</span>
					<div class="bridge-body">
						<div class="bridge-title">Data Bridge <span class="bridge-state">${stateText}</span></div>
						<div class="bridge-note">添加 Kimi 或 MiMo 卡片后自动开启</div>
						${reconnectBtn}
					</div>
				</div>`;
		}

		const bridgeLabels = bridgeServices.map(s => SERVICE_LABELS[s.kind] || s.kind);
		return `
			<div class="bridge-card ${stateClass}">
				<span class="bridge-icon">${icon('radio-tower', 15)}</span>
				<div class="bridge-body">
					<div class="bridge-title">Data Bridge <span class="bridge-state">${stateText}</span></div>
					<div class="bridge-meta">已启用：${escapeHtml(bridgeLabels.join('、'))}</div>
					${!isConnected ? `
					<div class="bridge-diag">诊断：${escapeHtml(bStatus.lastError || '无法连接到 VSCode Data Bridge，请确认 VSCode 扩展已安装并激活')}</div>` : ''}
					<div class="bridge-note">配额数据从浏览器拉取并推送，按刷新间隔检测凭证有效性（至少每 5 分钟），失效时自动刷新</div>
					${reconnectBtn}
				</div>
			</div>`;
	}

	/**
	 * 「重新连接」按钮交互：发送 MSG.RECONNECT_BRIDGE → loading 态防重复点击 →
	 * 响应后调用页面注入的 onBridgeReconnectResult 刷新状态，最后重渲染服务面板。
	 * 最坏 ~22s（11 端口串行探测），期间按钮 disabled 并显示旋转指示器。
	 */
	async function handleBridgeReconnect(e) {
		const btn = e.target.closest('.bridge-reconnect-btn');
		if (!btn || btn.disabled) return;

		btn.disabled = true;
		const originalHtml = btn.innerHTML;
		btn.innerHTML = `<span class="spin">${spinnerIcon(12)}</span>连接中`;

		try {
			const result = await new Promise((resolve) => {
				try {
					chrome.runtime.sendMessage({ action: MSG.RECONNECT_BRIDGE }, (resp) => {
						resolve(resp || { success: false, port: null });
					});
				} catch {
					resolve({ success: false, port: null });
				}
			});
			if (onBridgeReconnectResult) {
				await onBridgeReconnectResult(result);
			}
			// 用刷新后的状态重渲染服务面板（桥卡状态行 / 诊断信息同步更新）
			onRenderSettingsServices();
		} catch (err) {
			console.error('[Bridge] 重新连接失败:', err);
		} finally {
			// 回调内通常已重渲染面板（按钮随之替换）；若仍在 DOM 中则还原按钮态
			if (document.contains(btn)) {
				btn.disabled = false;
				btn.innerHTML = originalHtml;
			}
		}
	}

	// ===== Event handlers =====

	function handleTabSwitch(e) {
		const tab = e.target.dataset.tab;
		if (!tab) return;

		currentTab = tab;
		tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
		tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab}`));
		moveTabIndicator(tab);

		// Render on demand when switching to the "Services" or "Settings" panel
		// (service tab rendering is provided by the page via onRenderSettingsServices)
		if (tab === 'services') {
			onRenderSettingsServices();
		} else if (tab === 'global') {
			renderSettingsGlobal();
		}
	}

	function handleGlmMainTabClick(e) {
		if (!e.target.classList.contains('glm-main-tab')) return;
		const svcId = e.target.dataset.svcId;
		const tab = e.target.dataset.tab;
		if (svcId && tab) {
			switchGlmMainTab(svcId, tab);
		}
	}

	function handleGlmSubTabClick(e) {
		if (!e.target.classList.contains('glm-sub-tab')) return;
		const svcId = e.target.dataset.svcId;
		const range = e.target.dataset.range;
		if (svcId && range) {
			switchGlmSubTab(svcId, range, async (id, rng) => {
				// Lazily load detail data
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

		// Read and save the custom display name
		const nameInput = card.querySelector('.svc-name-input');
		if (nameInput) {
			svc.name = nameInput.value.trim() || SERVICE_LABELS[svc.kind] || svc.kind;
		}

		if (svc.kind === 'glm') {
			const keyInput = card.querySelector('.glm-key-input');
			if (keyInput) {
				config.glmApiKey = keyInput.value.trim();
				// Sync to storage so api/glm.js takes effect immediately (with-timestamp copy)
				await saveGlmApiKeyCopy(config.glmApiKey);
			}
		}

		if (svc.kind === 'kimi') {
			const keyInput = card.querySelector('.kimi-key-input');
			if (keyInput) {
				// Kimi Code API Key（兜底数据源，裸字符串永不过期）；
				// api/kimi.js 直读 dashboardConfig，由下方 saveConfig() 写入后即生效
				config.kimiApiKey = keyInput.value.trim();
			}
		}

		await saveConfig();
		if (notifyConfigUpdated) {
			await notifyConfigUpdated();
		}

		btn.innerHTML = `${icon('check', 12)}已保存`;
		setTimeout(() => btn.innerHTML = `${icon('check', 12)}保存配置`, 1500);

		// Cache needs refreshing after a name change (loadService will override the card title with the new svc.name)
		if (svc.kind !== 'glm' || config.glmApiKey) {
			await refreshSingleService(serviceId);
		}
	}

	async function handleRemoveService(e) {
		const btn = e.target;
		const serviceId = btn.dataset.serviceId;
		const svc = config.services.find(s => s.id === serviceId);
		if (!svc) return;

		if (!confirm(removeConfirmText(svc))) return;

		config.services = config.services.filter(s => s.id !== serviceId);
		if (svc.kind === 'glm') {
			config.glmApiKey = '';
			await chrome.storage.local.remove('glmApiKey');
		}
		if (svc.kind === 'kimi') {
			// kimiApiKey 存于 dashboardConfig 内，随 saveConfig() 覆盖为空即可（无独立 storage key）
			config.kimiApiKey = '';
		}
		await saveConfig();
		if (notifyConfigUpdated) {
			await notifyConfigUpdated();
		}
		serviceDataMap.delete(serviceId);
		lastCardKey = '';  // 卡片集合变化，重新入场

		// Clean up GLM state (to prevent memory leaks)
		if (svc.kind === 'glm') {
			cleanupGlmState(svc.id);
		}

		if (afterRemove) {
			await afterRemove();
		}

		onRenderSettingsServices();
		renderDashboard();
	}

	async function handleSaveGlobal() {
		const refreshInput = document.getElementById('setting-refresh');
		const warnInput = document.getElementById('setting-warn');

			config.settings.refreshInterval = (() => { const ri = parseInt(refreshInput.value, 10); return Number.isFinite(ri) ? ri : 60; })();
		config.settings.warnThreshold = parseFloat(warnInput.value) || 0.8;

		await saveConfig();
		if (afterSaveGlobal) {
			afterSaveGlobal();
		}
		const btn = document.getElementById('save-global-btn');
		btn.innerHTML = `${icon('check', 12)}已保存`;
		setTimeout(() => btn.innerHTML = `${icon('check', 12)}保存设置`, 1500);
	}

	async function handleClearCache() {
		try {
			const keys = await chrome.storage.local.get(null);
			const cacheKeys = Object.keys(keys).filter(k => k.startsWith('quotaCache_'));
			if (cacheKeys.length > 0) {
				await chrome.storage.local.remove(cacheKeys);
			}
			serviceDataMap.clear();
			lastCardKey = '';
			alert('缓存已清除');
			renderDashboard();
		} catch (err) {
			alert('清除失败: ' + err.message);
		}
	}

	/** Clear local credential copies (GLM API Key / Kimi relay mirror / MiMo credential cache) */
	async function handleClearCredentialCache() {
		try {
			await chrome.storage.local.remove(['glmApiKey', 'kimiTokenRelay', 'mimoCredentialCache']);
			alert('本地凭证缓存已清除（将在下次打开页面或推送时重新写入）');
		} catch (err) {
			alert('清除失败: ' + err.message);
		}
	}

	// ===== Event delegation =====

	servicesEl.addEventListener('click', (e) => {
		handleGlmMainTabClick(e);
		handleGlmSubTabClick(e);
		handleRefreshService(e);
	});

	// 「重新连接」按钮走事件委托（popup/dashboard 的服务面板均经 shared-ui 渲染桥卡）
	settingsServicesEl.addEventListener('click', (e) => {
		handleBridgeReconnect(e);
	});

	tabBtns.forEach(btn => btn.addEventListener('click', handleTabSwitch));
	refreshBtn.addEventListener('click', () => loadAll(true));
	settingsBtn.addEventListener('click', () => {
		// 设置按钮跳转到「服务」标签页（管理服务配置）
		currentTab = 'services';
		tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'services'));
		tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === 'panel-services'));
		moveTabIndicator('services');
		onRenderSettingsServices();
	});

	/** Service tab rendering function (provided by each page, references the page-local renderSettingsServices) */
	let onRenderSettingsServices = () => {};

	// ===== Immediate refresh on Cookie change =====

	let cookieRefreshTimeout = null;
	const pendingCookieKinds = new Set();

	// On Cookie change, collect the changed kinds and refresh in batch after debounce
	// (to avoid losing services from rapidly consecutive messages)
	chrome.runtime.onMessage.addListener((msg) => {
		if (msg.action === MSG.BRIDGE_CONNECTED) {
			// Data Bridge 连接建立广播：即时刷新桥卡（GET_STATUS 非阻塞后不再等待下一刷新周期）
			if (onBridgeConnected) onBridgeConnected(msg.port);
			return;
		}
		if (msg.action !== MSG.COOKIE_CHANGED || !msg.kind) return;

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

	// ===== Auto-refresh scheduling =====

	/** Schedule the next auto-refresh (recursive setTimeout, responsive to refresh interval changes) */
	function scheduleRefresh() {
		clearTimeout(refreshTimer);
		// 0 表示禁用自动刷新（保持语义，不得被兜底值吞掉）
		const interval = typeof config.settings.refreshInterval === 'number' ? config.settings.refreshInterval : 60;
		if (interval > 0) {
			refreshTimer = setTimeout(() => {
				if (currentTab === 'dashboard') {
					loadAll();
				}
				scheduleRefresh();
			}, interval * 1000);
		}
	}

	/** Register the service tab rendering function (the page passes in its own renderSettingsServices) */
	function registerSettingsServices(renderer) {
		onRenderSettingsServices = renderer;
	}

	return {
		loadAll,
		refreshSingleService,
		renderDashboard,
		renderSettingsGlobal,
		renderBridgeCard,
		scheduleRefresh,
		registerSettingsServices,
		handleSaveService,
		handleRemoveService,
		SERVICE_LABELS,
	};
}
