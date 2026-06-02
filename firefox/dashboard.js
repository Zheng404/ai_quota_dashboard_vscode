/**
 * AI Quota Dashboard — Browser Extension Dashboard
 * 
 * 独立仪表盘：显示 Kimi 和 MiMo 配额数据
 */

import { fetchKimiQuota } from './api/kimi.js';
import { fetchMimoQuota } from './api/mimo.js';

// ===== 服务配置 =====

const SERVICES = [
	{ name: 'Kimi Membership', id: 'kimi', fetcher: fetchKimiQuota },
	{ name: 'Xiaomi MiMo', id: 'mimo', fetcher: fetchMimoQuota },
];

const CACHE_TTL_MS = 60 * 1000;
const TIMEOUT_MS = 15000;

// ===== DOM 元素 =====

const servicesEl = document.getElementById('services');
const refreshBtn = document.getElementById('btn-refresh');
const vscodeBtn = document.getElementById('btn-vscode');
const bridgeDot = document.getElementById('bridge-dot');
const bridgeText = document.getElementById('bridge-text');
const lastUpdateEl = document.getElementById('last-update');

// ===== 安全 DOM 辅助函数 =====

function escapeHtml(str) {
	if (str == null) return '';
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function createElement(tag, attrs = {}, children = []) {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'textContent') {
			el.textContent = value;
		} else if (key === 'innerHTML') {
			el.innerHTML = value;
		} else if (key.startsWith('on') && typeof value === 'function') {
			const event = key.slice(2).toLowerCase();
			el.addEventListener(event, value);
		} else {
			el.setAttribute(key, value);
		}
	}
	for (const child of children) {
		if (child == null) continue;
		if (typeof child === 'string') {
			el.appendChild(document.createTextNode(child));
		} else if (child instanceof Node) {
			el.appendChild(child);
		}
	}
	return el;
}

// ===== 工具函数 =====

function fmtNum(n) {
	if (n == null) return '-';
	if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
	if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
	if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
	return String(n);
}

function fmtDateTime(d) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getColorClass(pct) {
	if (pct >= 90) return 'danger';
	if (pct >= 75) return 'warning';
	return 'success';
}

function getCountdown(ts) {
	if (!ts) return '';
	const diff = ts - Date.now();
	if (diff <= 0) return '已重置';
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return '<1分钟';
	const hrs = Math.floor(mins / 60);
	const rem = mins % 60;
	if (hrs > 0) return `${hrs}h ${rem}m`;
	return `${rem}m`;
}

// ===== 缓存 =====

async function getCached(serviceId) {
	try {
		const result = await chrome.storage.local.get(`quotaCache_${serviceId}`);
		const entry = result[`quotaCache_${serviceId}`];
		if (!entry) return null;
		const age = Date.now() - entry.timestamp;
		if (age > CACHE_TTL_MS) return null;
		return { data: entry.data, fromCache: true };
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
		// ignore cache write errors
	}
}

// ===== 渲染 =====

function renderSlot(slot, container) {
	const pct = Math.min(slot.percent, 100);
	const color = getColorClass(pct);
	const detail = [];
	if (slot.used != null && slot.limit != null) {
		detail.push(`${fmtNum(slot.used)} / ${fmtNum(slot.limit)}`);
	}
	const countdown = getCountdown(slot.resetsAt);
	if (countdown) detail.push(countdown);

	const slotEl = createElement('div', { class: 'slot' }, [
		createElement('div', { class: 'slot-header' }, [
			createElement('span', { class: 'slot-label', textContent: slot.label }),
			createElement('span', { class: `slot-percent ${color}`, textContent: `${pct.toFixed(0)}%` }),
		]),
		createElement('div', { class: 'progress-bar' }, [
			createElement('div', { class: `progress-fill ${color}`, style: `width:${pct}%` }),
		]),
		createElement('div', { class: 'slot-detail', textContent: detail.join(' · ') }),
	]);

	container.appendChild(slotEl);
}

function renderServiceCard(serviceName, data, container) {
	if (data.err) {
		const card = createElement('div', { class: 'service-card error-card' }, [
			createElement('div', { class: 'service-name', textContent: `⚠️ ${serviceName}` }),
			createElement('p', { textContent: data.err }),
			createElement('button', {
				class: 'btn btn-primary',
				textContent: '重试',
				onclick: () => location.reload(),
			}),
		]);
		container.appendChild(card);
		return;
	}

	const badge = data.level || data.planName || '';
	const time = data.currentEndTime || '';
	const fromCache = data._fromCache;

	const children = [];

	// Header
	const headerChildren = [
		createElement('div', { class: 'service-name' }, [
			document.createTextNode(serviceName),
			...(badge ? [createElement('span', { class: 'service-badge', textContent: badge })] : []),
		]),
	];
	if (time) {
		headerChildren.push(createElement('span', { class: 'service-time', textContent: `有效期至 ${time}` }));
	}
	if (fromCache) {
		headerChildren.push(createElement('span', { class: 'cache-badge', textContent: '(缓存)' }));
	}
	children.push(createElement('div', { class: 'service-header' }, headerChildren));

	// Slots
	if (Array.isArray(data.slots)) {
		const slotsContainer = createElement('div');
		for (const slot of data.slots) {
			renderSlot(slot, slotsContainer);
		}
		children.push(slotsContainer);
	}

	const card = createElement('div', { class: 'service-card' }, children);
	container.appendChild(card);
}

// ===== 超时包装 =====

function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error('请求超时')), ms)
		),
	]);
}

// ===== 数据加载 =====

async function loadAll() {
	refreshBtn.disabled = true;
	refreshBtn.textContent = '';
	refreshBtn.appendChild(createElement('span', { class: 'spin', textContent: '🔄' }));
	refreshBtn.appendChild(document.createTextNode(' 刷新中...'));

	servicesEl.textContent = '';
	servicesEl.appendChild(createElement('div', { class: 'empty-state' }, [
		createElement('p', { textContent: '加载中...' }),
	]));

	const fetchTasks = SERVICES.map(async (svc) => {
		const cached = await getCached(svc.id);
		if (cached) {
			return { service: svc, data: { ...cached.data, _fromCache: true } };
		}
		const data = await svc.fetcher();
		await setCached(svc.id, data);
		return { service: svc, data };
	});

	let results;
	try {
		results = await withTimeout(Promise.all(fetchTasks), TIMEOUT_MS);
	} catch (e) {
		results = [];
		for (const svc of SERVICES) {
			results.push({ service: svc, data: { err: e.message || '加载失败' } });
		}
	}

	servicesEl.textContent = '';
	for (const { service, data } of results) {
		renderServiceCard(service.name, data, servicesEl);
	}

	lastUpdateEl.textContent = `更新于 ${fmtDateTime(new Date())}`;

	refreshBtn.disabled = false;
	refreshBtn.textContent = '🔄 刷新';
}

// ===== VSCode 连接状态 =====

async function updateBridgeStatus() {
	chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
		if (chrome.runtime.lastError || !response?.connected) {
			bridgeDot.className = 'bridge-dot disconnected';
			bridgeText.textContent = 'VSCode 未连接';
		} else {
			bridgeDot.className = 'bridge-dot connected';
			bridgeText.textContent = `VSCode 已连接 (port ${response.port})`;
		}
	});
}

// ===== 事件 =====

refreshBtn.addEventListener('click', loadAll);

vscodeBtn.addEventListener('click', () => {
	// 尝试打开 VSCode URI（需要 VSCode URL handler 注册）
	window.open('vscode://extension/ai-quota-dashboard', '_blank');
});

// ===== 初始化 =====

loadAll();
updateBridgeStatus();
