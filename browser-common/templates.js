/**
 * AI Quota Dashboard — 模板系统（观测台视觉）
 *
 * 共享工具函数 + GLM/Kimi/MiMo 各服务的卡片渲染模板。
 * 图表：Catmull-Rom → 三次贝塞尔平滑曲线 + 总量面积渐变 + pathLength 描绘动画。
 */

import { icon } from './icons.js';

// ====== 共享工具函数 ======

export function fmtNum(n) {
	if (n == null) return '-';
	if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
	if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
	if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
	return String(n);
}

export function fmtDateTime(d) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function escapeHtml(text) {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getColorClass(pct) {
	if (pct >= 90) return 'danger';
	if (pct >= 75) return 'warning';
	return 'success';
}

function fmtTokens(n) {
	if (n == null) return '-';
	if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M';
	if (n >= 1e3) return (n / 1e3).toFixed(2) + ' K';
	return String(n);
}

// ====== 模板注册表 ======

const serviceTemplates = {};

// 图表渐变 id 计数器（避免 SVG defs id 冲突）
let chartGradientSeq = 0;

// ====== GLM 模板 ======

const glmStates = {};

function getGlmState(svcId) {
	if (!glmStates[svcId]) {
		glmStates[svcId] = { mainTab: 'model', subTab: 'day', data: null };
	}
	return glmStates[svcId];
}

export function cleanupGlmState(svcId) {
	delete glmStates[svcId];
}

function getModelUsageForRange(data, range) {
	if (data.modelUsageByRange && data.modelUsageByRange[range]) {
		return data.modelUsageByRange[range];
	}
	if (range === 'day' && data.modelUsage) {
		return data.modelUsage;
	}
	return undefined;
}

function getToolUsageForRange(data, range) {
	if (data.toolUsageByRange && data.toolUsageByRange[range]) {
		return data.toolUsageByRange[range];
	}
	if (range === 'day' && data.toolUsage) {
		return data.toolUsage;
	}
	return undefined;
}

function getModelColor(modelName) {
	if (modelName === 'Token 消耗总量') return '#6cb8ff';
	const colors = {
		'GLM-5.1': '#6cb8ff',
		'GLM-5': '#6cb8ff',
		'GLM-5-Turbo': '#b48cf2',
		'GLM-4.7': '#e8835a',
		'GLM-4': '#e8835a',
		'GLM-4.6V': '#7ef0c9',
		'GLM-4.5-Air': '#5ad8c4',
		'GLM-4V': '#f2b84b',
	};
	return colors[modelName] || '#8a94a6';
}

function getToolColor(toolCode) {
	const colors = {
		'search-prime': '#6cb8ff',
		'web-reader': '#e8835a',
		'zread': '#7ef0c9',
	};
	return colors[toolCode] || '#8a94a6';
}

/** Data Bridge 状态行（GLM / Kimi / MiMo 头部共用结构） */
function renderBridgeLine(prefix, bridgeStatus) {
	if (!bridgeStatus) return '';
	const stateClass = bridgeStatus === 'connected' ? 'is-connected' : bridgeStatus === 'active' ? 'is-waiting' : 'is-off';
	const bridgeText = bridgeStatus === 'connected' ? '已连接' : bridgeStatus === 'active' ? '等待 VSCode 连接' : '未启用';
	return `<div class="${prefix}-header-row ${prefix}-header-row3">`
		+ `<span class="bridge-line ${stateClass}">${icon('radio-tower', 11)}Data Bridge · ${bridgeText}</span>`
		+ `</div>`;
}

function renderGlmHeader(data, index) {
	const level = data.level || '';
	const levelBadge = level ? `<span class="glm-level-badge">${escapeHtml(level.toUpperCase())}</span>` : '';
	const renewLine = data.nextRenewTime
		? `<div class="glm-header-row glm-header-row3"><span class="glm-renew-label">会员有效期至</span><span class="glm-renew-time">${escapeHtml(data.nextRenewTime)}</span></div>`
		: '';
	return `<div class="glm-header">`
		+ `<div class="glm-header-row">`
		+ `<div class="glm-header-left">`
		+ `<span class="svc-index">№ ${String(index + 1).padStart(2, '0')}</span>`
		+ `<span class="glm-user-name">${escapeHtml(data.name)}</span>`
		+ levelBadge
		+ `</div>`
		+ `<button class="btn btn-icon btn-refresh-svc glm-refresh-btn" data-service-id="${data.id}" title="刷新">${icon('refresh-cw', 13)}</button>`
		+ `</div>`
		+ `<div class="glm-header-row glm-header-row2">`
		+ `<span class="glm-service-name">GLM Coding Plan (CN)</span>`
		+ `<span class="glm-update-time">${fmtDateTime(new Date(data.updatedAt))}</span>`
		+ `</div>`
		+ renewLine
		+ renderBridgeLine('glm', data.bridgeStatus)
		+ `</div>`;
}

function renderGlmQuota(data) {
	const slotsHtml = data.slots.map(s => renderGlmQuotaCard(s)).join('');
	return `<div class="glm-quota-section"><div class="glm-quota-cards">${slotsHtml}</div></div>`;
}

function renderGlmQuotaCard(slot) {
	const pct = Math.min(slot.percent, 100);
	const color = getColorClass(pct);
	let detailLine = '';
	if (slot.label === 'MCP 每月额度' && slot.used != null && slot.limit != null) {
		detailLine = `<div class="glm-quota-detail-line">已调用 ${fmtNum(slot.used)} / 总量 ${fmtNum(slot.limit)}</div>`;
	}
	let resetLine = '';
	if (slot.resetsAt) {
		resetLine = `<div class="glm-quota-reset">${icon('clock', 10)}重置 ${fmtDateTime(new Date(slot.resetsAt))}</div>`;
	}
	return `<div class="glm-quota-card">`
		+ `<div class="glm-quota-header">`
		+ `<span class="glm-quota-label">${escapeHtml(slot.label)}</span>`
		+ `<span class="glm-quota-percent"><span class="num" data-count="${pct.toFixed(0)}">0</span>%<span class="glm-quota-used">已使用</span></span>`
		+ `</div>`
		+ `<div class="progress-bar glm-progress"><div class="progress-fill ${color}" style="width:${pct.toFixed(1)}%"></div></div>`
		+ detailLine
		+ resetLine
		+ `</div>`;
}

function renderGlmDetailSection(data, state) {
	const mainTabs = `<div class="glm-main-tabs">`
		+ `<button class="glm-main-tab${state.mainTab === 'model' ? ' active' : ''}" data-svc-id="${data.id}" data-tab="model">模型用量</button>`
		+ `<button class="glm-main-tab${state.mainTab === 'tool' ? ' active' : ''}" data-svc-id="${data.id}" data-tab="tool">工具用量</button>`
		+ `</div>`;
	const subTabs = `<div class="glm-sub-tabs">`
		+ `<button class="glm-sub-tab${state.subTab === 'day' ? ' active' : ''}" data-svc-id="${data.id}" data-range="day">当日</button>`
		+ `<button class="glm-sub-tab${state.subTab === 'week' ? ' active' : ''}" data-svc-id="${data.id}" data-range="week">近7天</button>`
		+ `<button class="glm-sub-tab${state.subTab === 'month' ? ' active' : ''}" data-svc-id="${data.id}" data-range="month">近30天</button>`
		+ `</div>`;
	const content = renderGlmDetailContent(data, state);
	return `<div class="glm-detail-section">${mainTabs}${subTabs}<div class="glm-detail-content" id="glm-detail-content-${data.id}">${content}</div></div>`;
}

function renderGlmDetailContent(data, state) {
	const range = state.subTab;
	if (state.mainTab === 'model') {
		const usage = getModelUsageForRange(data, range);
		if (usage) return renderGlmModelDetail(usage, range);
		return renderGlmLoading();
	}
	if (state.mainTab === 'tool') {
		const usage = getToolUsageForRange(data, range);
		if (usage) return renderGlmToolDetail(usage, range);
		return renderGlmLoading();
	}
	return renderGlmLoading();
}

function renderGlmLoading() {
	return `<div class="glm-loading"><span class="spin"></span>数据加载中...</div>`;
}

function renderGlmModelDetail(usage, range) {
	let totalSeries = [];
	if (usage.modelSeries && usage.modelSeries.length > 0) {
		const dataLen = usage.modelSeries[0].tokensUsage ? usage.modelSeries[0].tokensUsage.length : 0;
		const totalTokensUsage = [];
		for (let i = 0; i < dataLen; i++) {
			let sum = 0;
			for (let j = 0; j < usage.modelSeries.length; j++) {
				sum += (usage.modelSeries[j].tokensUsage[i] || 0);
			}
			totalTokensUsage.push(sum);
		}
		totalSeries = [{
			modelName: 'Token 消耗总量',
			tokensUsage: totalTokensUsage,
			totalTokens: usage.totalTokens,
		}];
	}
	const chart = renderGlmChart(usage.modelSeries.concat(totalSeries), usage.xTime, 'tokens', range);
	const summaryItems = usage.modelSummary.map(m =>
		`<div class="glm-summary-item">`
		+ `<span class="glm-summary-dot" style="background:${getModelColor(m.modelName)};color:${getModelColor(m.modelName)}"></span>`
		+ `<span class="glm-summary-name">${escapeHtml(m.modelName)}</span>`
		+ `<span class="glm-summary-value">${fmtTokens(m.totalTokens)}</span>`
		+ `</div>`
	).join('');
	const totalItem = `<div class="glm-summary-item">`
		+ `<span class="glm-summary-dot" style="background:${getModelColor('Token 消耗总量')};color:${getModelColor('Token 消耗总量')}"></span>`
		+ `<span class="glm-summary-name">Token 消耗总量</span>`
		+ `<span class="glm-summary-value">${fmtTokens(usage.totalTokens)}</span>`
		+ `</div>`;
	return chart + `<div class="glm-summary-row">${totalItem}${summaryItems}</div>`;
}

function renderGlmToolDetail(usage, range) {
	const chart = renderGlmChart(usage.toolSeries, usage.xTime, 'calls', range);
	const summaryItems = usage.toolSummary.map(t =>
		`<div class="glm-summary-item">`
		+ `<span class="glm-summary-dot" style="background:${getToolColor(t.toolCode)};color:${getToolColor(t.toolCode)}"></span>`
		+ `<span class="glm-summary-name">${escapeHtml(t.toolName.replace(/\s*MCP$/, ''))}</span>`
		+ `<span class="glm-summary-value">${t.totalUsageCount} 次</span>`
		+ `</div>`
	).join('');
	return chart + `<div class="glm-summary-row">${summaryItems}</div>`;
}

/**
 * Catmull-Rom 样条 → 三次贝塞尔平滑路径
 * @param {{x:number,y:number}[]} pts 数据点
 * @returns {string} SVG path d
 */
function smoothPath(pts) {
	if (pts.length === 0) return '';
	if (pts.length < 3) {
		return 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L ');
	}
	let d = `M ${pts[0].x} ${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const c1x = p1.x + (p2.x - p0.x) / 6;
		const c1y = p1.y + (p2.y - p0.y) / 6;
		const c2x = p2.x - (p3.x - p1.x) / 6;
		const c2y = p2.y - (p3.y - p1.y) / 6;
		d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
	}
	return d;
}

function renderGlmChart(series, xTime, valueKey, range) {
	if (!series || series.length === 0 || !xTime || xTime.length === 0) {
		return '';
	}
	const dataLen = xTime.length;
	let globalMax = 0;
	series.forEach(s => {
		const arr = valueKey === 'tokens' ? s.tokensUsage : s.usageCount;
		if (arr) {
			arr.forEach(v => {
				if (v != null && v > globalMax) globalMax = v;
			});
		}
	});
	if (globalMax === 0) globalMax = 1;
	const width = 260;
	const height = 100;
	const padding = { top: 6, right: 6, bottom: 8, left: 6 };
	const chartW = width - padding.left - padding.right;
	const chartH = height - padding.top - padding.bottom;

	function getPoint(i, v) {
		return {
			x: padding.left + (i / (dataLen - 1 || 1)) * chartW,
			y: padding.top + chartH - ((v || 0) / globalMax) * chartH,
		};
	}

	const gradientId = `aqd-area-${++chartGradientSeq}`;

	const parts = series.map(s => {
		const arr = valueKey === 'tokens' ? s.tokensUsage : s.usageCount;
		if (!arr || arr.length === 0) return '';
		const color = valueKey === 'tokens' ? getModelColor(s.modelName) : getToolColor(s.toolCode);
		const pts = arr.map((v, i) => getPoint(i, v));
		if (pts.length === 0) return '';
		if (pts.length === 1) {
			return `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="2" fill="${color}"/>`;
		}
		const d = smoothPath(pts);
		// 总量序列追加面积渐变（置于底层）
		let area = '';
		if (valueKey === 'tokens' && s.modelName === 'Token 消耗总量') {
			const areaD = `${d} L ${pts[pts.length - 1].x} ${padding.top + chartH} L ${pts[0].x} ${padding.top + chartH} Z`;
			area = `<path class="area" fill="url(#${gradientId})" d="${areaD}"/>`;
		}
		return `${area}<path class="line" fill="none" stroke="${color}" stroke-width="1.6" d="${d}" opacity="0.9" pathLength="1"/>`;
	}).join('');

	const defs = `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">`
		+ `<stop offset="0%" stop-color="#6cb8ff" stop-opacity="0.28"/>`
		+ `<stop offset="100%" stop-color="#6cb8ff" stop-opacity="0"/>`
		+ `</linearGradient></defs>`;

	let gridLines = '';
	for (let i = 0; i <= 3; i++) {
		const y = padding.top + (i / 3) * chartH;
		gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1d2531" stroke-width="0.5"/>`;
	}
	const svg = `<svg class="glm-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${defs}${gridLines}${parts}</svg>`;
	return `<div class="glm-chart-wrap">${svg}</div>`;
}

serviceTemplates.glm = {
	renderCard: function(data, index = 0) {
		const state = getGlmState(data.id);
		state.data = data;
		return `<div class="glm-card svc-glm" id="glm-card-${data.id}">${renderGlmHeader(data, index)}${renderGlmQuota(data)}${renderGlmDetailSection(data, state)}</div>`;
	}
};

// ====== Kimi 模板 ======

function renderKimiHeader(data, index) {
	const level = data.level || '';
	const levelBadge = level ? `<span class="kimi-level-badge">${escapeHtml(level.toUpperCase())}</span>` : '';
	const renewLine = data.currentEndTime
		? `<div class="kimi-header-row kimi-header-row3"><span class="kimi-renew-label">会员有效期至</span><span class="kimi-renew-time">${escapeHtml(data.currentEndTime)}</span></div>`
		: '';
	return `<div class="kimi-header">`
		+ `<div class="kimi-header-row">`
		+ `<div class="kimi-header-left">`
		+ `<span class="svc-index">№ ${String(index + 1).padStart(2, '0')}</span>`
		+ `<span class="kimi-user-name">${escapeHtml(data.name)}</span>`
		+ levelBadge
		+ `</div>`
		+ `<button class="btn btn-icon btn-refresh-svc kimi-refresh-btn" data-service-id="${data.id}" title="刷新">${icon('refresh-cw', 13)}</button>`
		+ `</div>`
		+ `<div class="kimi-header-row kimi-header-row2">`
		+ `<span class="kimi-service-name">Kimi Membership</span>`
		+ `<span class="kimi-update-time">${fmtDateTime(new Date(data.updatedAt))}</span>`
		+ `</div>`
		+ renewLine
		+ renderBridgeLine('kimi', data.bridgeStatus)
		+ `</div>`;
}

function renderKimiQuota(data) {
	const slots = data.slots || [];
	const slotsHtml = slots.map(s => renderKimiQuotaCard(s)).join('');
	return `<div class="kimi-quota-section"><div class="kimi-quota-cards">${slotsHtml}</div></div>`;
}

function renderKimiQuotaCard(slot) {
	const pct = Math.min(slot.percent, 100);
	const color = getColorClass(pct);
	let resetLine = '';
	if (slot.resetsAt) {
		resetLine = `<div class="kimi-quota-reset">${icon('clock', 10)}重置 ${fmtDateTime(new Date(slot.resetsAt))}</div>`;
	}
	return `<div class="kimi-quota-card">`
		+ `<div class="kimi-quota-header">`
		+ `<span class="kimi-quota-label">${escapeHtml(slot.label)}</span>`
		+ `<span class="kimi-quota-percent"><span class="num" data-count="${pct.toFixed(0)}">0</span>%<span class="kimi-quota-used">已使用</span></span>`
		+ `</div>`
		+ `<div class="progress-bar kimi-progress"><div class="progress-fill ${color}" style="width:${pct.toFixed(1)}%"></div></div>`
		+ resetLine
		+ `</div>`;
}

serviceTemplates.kimi = {
	renderCard: function(data, index = 0) {
		return `<div class="kimi-card svc-kimi" id="kimi-card-${data.id}">${renderKimiHeader(data, index)}${renderKimiQuota(data)}</div>`;
	}
};

// ====== MiMo 模板 ======

function renderMimoHeader(data, index) {
	const planName = data.planName || '';
	const planBadge = planName ? `<span class="mimo-plan-badge">${escapeHtml(planName)}</span>` : '';
	const expiryLine = data.currentPeriodEnd
		? `<div class="mimo-header-row mimo-header-row3"><span class="mimo-expiry-label">有效期至</span><span class="mimo-expiry-time">${escapeHtml(data.currentPeriodEnd)}</span></div>`
		: '';
	return `<div class="mimo-header">`
		+ `<div class="mimo-header-row">`
		+ `<div class="mimo-header-left">`
		+ `<span class="svc-index">№ ${String(index + 1).padStart(2, '0')}</span>`
		+ `<span class="mimo-user-name">${escapeHtml(data.name)}</span>`
		+ planBadge
		+ `</div>`
		+ `<button class="btn btn-icon btn-refresh-svc mimo-refresh-btn" data-service-id="${data.id}" title="刷新">${icon('refresh-cw', 13)}</button>`
		+ `</div>`
		+ `<div class="mimo-header-row mimo-header-row2">`
		+ `<span class="mimo-service-name">Xiaomi MiMo Token Plan</span>`
		+ `<span class="mimo-update-time">${fmtDateTime(new Date(data.updatedAt))}</span>`
		+ `</div>`
		+ expiryLine
		+ renderBridgeLine('mimo', data.bridgeStatus)
		+ `</div>`;
}

function renderMimoQuota(data) {
	const slots = data.slots || [];
	const slotsHtml = slots.map(s => renderMimoQuotaCard(s)).join('');
	return `<div class="mimo-quota-section"><div class="mimo-quota-cards">${slotsHtml}</div></div>`;
}

function renderMimoQuotaCard(slot) {
	const pct = Math.min(slot.percent, 100);
	const color = getColorClass(pct);
	const usedText = slot.used != null ? fmtNum(slot.used) : '-';
	const limitText = slot.limit != null ? fmtNum(slot.limit) : '-';
	return `<div class="mimo-quota-card">`
		+ `<div class="mimo-quota-header">`
		+ `<span class="mimo-quota-label">${escapeHtml(slot.label)}</span>`
		+ `<span class="mimo-quota-percent"><span class="num" data-count="${pct.toFixed(1)}" data-dec="1">0</span>%<span class="mimo-quota-used">已使用</span></span>`
		+ `</div>`
		+ `<div class="progress-bar mimo-progress"><div class="progress-fill ${color}" style="width:${pct.toFixed(1)}%"></div></div>`
		+ `<div class="mimo-quota-detail">已使用 ${usedText} / 总额度 ${limitText}</div>`
		+ `</div>`;
}

serviceTemplates.mimo = {
	renderCard: function(data, index = 0) {
		return `<div class="mimo-card svc-mimo" id="mimo-card-${data.id}">${renderMimoHeader(data, index)}${renderMimoQuota(data)}</div>`;
	}
};

// ====== 错误/空状态模板 ======

function renderErrorCard(data) {
	return `<div class="service-card error"><div class="service-header"><span class="service-name">${escapeHtml(data.name)}</span><span class="badge badge-error">错误</span></div><p class="error-message">${escapeHtml(data.err)}</p></div>`;
}

function renderNoConfig(kind) {
	return `<div class="service-card error"><div class="service-header"><span class="service-name">${escapeHtml(kind)}</span><span class="badge badge-error">未配置</span></div><p class="error-message">请在设置中配置此服务</p></div>`;
}

// ====== 调度器 ======

export function renderService(data, index = 0) {
	if (data.err) return renderErrorCard(data);
	const tmpl = serviceTemplates[data.kind];
	if (tmpl) {
		return tmpl.renderCard(data, index);
	}
	return `<div class="service-card error"><div class="service-header"><span class="service-name">${escapeHtml(data.name)}</span><span class="badge badge-error">未注册</span></div><p class="error-message">服务类型 <code>${escapeHtml(data.kind)}</code> 暂无专用仪表盘</p></div>`;
}

// ====== GLM Tab 切换处理（供 dashboard.js / shared-ui.js 调用）=======

export function switchGlmMainTab(svcId, tab) {
	const state = getGlmState(svcId);
	state.mainTab = tab;
	const contentEl = document.getElementById(`glm-detail-content-${svcId}`);
	if (contentEl && state.data) {
		contentEl.innerHTML = renderGlmDetailContent(state.data, state);
	}
	document.querySelectorAll(`.glm-main-tab[data-svc-id="${svcId}"]`).forEach(el => {
		el.classList.toggle('active', el.dataset.tab === tab);
	});
}

export function switchGlmSubTab(svcId, range, onNeedFetch) {
	const state = getGlmState(svcId);
	state.subTab = range;
	const hasData = state.data && (
		(state.mainTab === 'model' && getModelUsageForRange(state.data, range)) ||
		(state.mainTab === 'tool' && getToolUsageForRange(state.data, range))
	);
	if (hasData) {
		const contentEl = document.getElementById(`glm-detail-content-${svcId}`);
		if (contentEl && state.data) {
			contentEl.innerHTML = renderGlmDetailContent(state.data, state);
		}
	} else {
		const contentEl = document.getElementById(`glm-detail-content-${svcId}`);
		if (contentEl) {
			contentEl.innerHTML = renderGlmLoading();
		}
		if (onNeedFetch) {
			onNeedFetch(svcId, range);
		}
	}
	document.querySelectorAll(`.glm-sub-tab[data-svc-id="${svcId}"]`).forEach(el => {
		el.classList.toggle('active', el.dataset.range === range);
	});
}

export function mergeGlmDetailData(serviceId, detail) {
	const state = getGlmState(serviceId);
	if (!state.data || !detail) return;
	const range = state.subTab;
	if (detail.modelUsage) {
		state.data.modelUsageByRange = { ...state.data.modelUsageByRange, [range]: detail.modelUsage };
	}
	if (detail.toolUsage) {
		state.data.toolUsageByRange = { ...state.data.toolUsageByRange, [range]: detail.toolUsage };
	}
	// 重新渲染当前内容
	const contentEl = document.getElementById(`glm-detail-content-${serviceId}`);
	if (contentEl) {
		contentEl.innerHTML = renderGlmDetailContent(state.data, state);
	}
}
