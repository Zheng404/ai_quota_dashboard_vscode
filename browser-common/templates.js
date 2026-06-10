/**
 * AI Quota Dashboard — 完整模板系统
 *
 * 包含共享工具函数 + GLM/Kimi/MiMo 各服务的卡片渲染模板
 */

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
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
	if (modelName === 'Token 消耗总量') return '#666';
	const colors = {
		'GLM-5.1': '#4A90D9',
		'GLM-5': '#4A90D9',
		'GLM-5-Turbo': '#9B59B6',
		'GLM-4.7': '#E67E22',
		'GLM-4': '#E67E22',
		'GLM-4.6V': '#2ECC71',
		'GLM-4.5-Air': '#1ABC9C',
		'GLM-4V': '#F39C12',
	};
	return colors[modelName] || '#888';
}

function getToolColor(toolCode) {
	const colors = {
		'search-prime': '#4A90D9',
		'web-reader': '#E67E22',
		'zread': '#2ECC71',
	};
	return colors[toolCode] || '#888';
}

function renderGlmHeader(data) {
	const level = data.level || '';
	const levelBadge = level ? `<span class="glm-level-badge">${escapeHtml(level.toUpperCase())}</span>` : '';
	const renewLine = data.nextRenewTime
		? `<div class="glm-header-row glm-header-row3"><span class="glm-renew-label">会员有效期至：</span><span class="glm-renew-time">${escapeHtml(data.nextRenewTime)}</span></div>`
		: '';
	// Cookie Bridge 状态
	const bridgeStatus = data.bridgeStatus;
	const bridgeText = bridgeStatus === 'connected' ? '已连接' : bridgeStatus === 'active' ? '等待 VSCode 连接' : '未启用';
	const bridgeColor = bridgeStatus === 'connected' ? '#22c55e' : bridgeStatus === 'active' ? '#f59e0b' : '#ef4444';
	const bridgeLine = bridgeStatus
		? `<div class="glm-header-row glm-header-row3" style="margin-top: 2px;"><span style="font-size: 10px; color: ${bridgeColor};">🍪 Cookie Bridge: ${bridgeText}</span></div>`
		: '';
	return `<div class="glm-header">`
		+ `<div class="glm-header-row">`
		+ `<div class="glm-header-left">`
		+ `<span class="glm-user-name">${escapeHtml(data.name)}</span>`
		+ levelBadge
		+ `</div>`
		+ `<button class="btn btn-icon btn-refresh-svc glm-refresh-btn" data-service-id="${data.id}" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>`
		+ `</div>`
		+ `<div class="glm-header-row glm-header-row2">`
		+ `<span class="glm-service-name">GLM 编码计划 (CN)</span>`
		+ `<span class="glm-update-time">${fmtDateTime(new Date(data.updatedAt))}</span>`
		+ `</div>`
		+ renewLine
		+ bridgeLine
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
		detailLine = `<div class="glm-quota-detail-line">已调用次数：${fmtNum(slot.used)}&nbsp;&nbsp;&nbsp;&nbsp;总量：${fmtNum(slot.limit)}</div>`;
	}
	let resetLine = '';
	if (slot.resetsAt) {
		resetLine = `<div class="glm-quota-reset">重置时间：${fmtDateTime(new Date(slot.resetsAt))}</div>`;
	}
	return `<div class="glm-quota-card">`
		+ `<div class="glm-quota-header">`
		+ `<span class="glm-quota-label">${escapeHtml(slot.label)}</span>`
		+ `<span class="glm-quota-percent">${pct.toFixed(0)}%<span class="glm-quota-used">已使用</span></span>`
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
	return '<div class="glm-loading">数据加载中...</div>';
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
		+ `<span class="glm-summary-dot" style="background:${getModelColor(m.modelName)}"></span>`
		+ `<span class="glm-summary-name">${escapeHtml(m.modelName)}</span>`
		+ `<span class="glm-summary-value">${fmtTokens(m.totalTokens)}</span>`
		+ `</div>`
	).join('');
	const totalItem = `<div class="glm-summary-item">`
		+ `<span class="glm-summary-dot" style="background:${getModelColor('Token 消耗总量')}"></span>`
		+ `<span class="glm-summary-name">Token 消耗总量</span>`
		+ `<span class="glm-summary-value">${fmtTokens(usage.totalTokens)}</span>`
		+ `</div>`;
	return chart + `<div class="glm-summary-row">${totalItem}${summaryItems}</div>`;
}

function renderGlmToolDetail(usage, range) {
	const chart = renderGlmChart(usage.toolSeries, usage.xTime, 'calls', range);
	const summaryItems = usage.toolSummary.map(t =>
		`<div class="glm-summary-item">`
		+ `<span class="glm-summary-dot" style="background:${getToolColor(t.toolCode)}"></span>`
		+ `<span class="glm-summary-name">${escapeHtml(t.toolName.replace(/\s*MCP$/, ''))}</span>`
		+ `<span class="glm-summary-value">${t.totalUsageCount} 次</span>`
		+ `</div>`
	).join('');
	return chart + `<div class="glm-summary-row">${summaryItems}</div>`;
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
	const padding = { top: 5, right: 5, bottom: 25, left: 5 };
	const chartW = width - padding.left - padding.right;
	const chartH = height - padding.top - padding.bottom;

	function getPoint(i, v) {
		return {
			x: padding.left + (i / (dataLen - 1 || 1)) * chartW,
			y: padding.top + chartH - ((v || 0) / globalMax) * chartH,
		};
	}

	const lines = series.map(s => {
		const arr = valueKey === 'tokens' ? s.tokensUsage : s.usageCount;
		if (!arr || arr.length === 0) return '';
		const color = valueKey === 'tokens' ? getModelColor(s.modelName) : getToolColor(s.toolCode);
		const pts = arr.map((v, i) => getPoint(i, v));
		if (pts.length === 0) return '';
		if (pts.length === 1) {
			return `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="2" fill="${color}"/>`;
		}
		let path = 'M ' + pts[0].x + ' ' + pts[0].y;
		for (let i = 1; i < pts.length; i++) {
			path += ' L ' + pts[i].x + ' ' + pts[i].y;
		}
		return `<path fill="none" stroke="${color}" stroke-width="1.5" d="${path}" opacity="0.85"/>`;
	}).join('');

	const labels = '';
	let gridLines = '';
	for (let i = 0; i <= 4; i++) {
		const y = padding.top + (i / 4) * chartH;
		gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" opacity="0.3"/>`;
	}
	const svg = `<svg class="glm-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${gridLines}${lines}${labels}</svg>`;
	return `<div class="glm-chart-wrap">${svg}</div>`;
}

serviceTemplates.glm = {
	renderCard: function(data) {
		const state = getGlmState(data.id);
		state.data = data;
		return `<div class="glm-card" id="glm-card-${data.id}">${renderGlmHeader(data)}${renderGlmQuota(data)}${renderGlmDetailSection(data, state)}</div>`;
	}
};

// ====== Kimi 模板 ======

function renderKimiHeader(data) {
	const level = data.level || '';
	const levelBadge = level ? `<span class="kimi-level-badge">${escapeHtml(level.toUpperCase())}</span>` : '';
	const renewLine = data.currentEndTime
		? `<div class="kimi-header-row kimi-header-row3"><span class="kimi-renew-label">会员有效期至：</span><span class="kimi-renew-time">${escapeHtml(data.currentEndTime)}</span></div>`
		: '';
	// Cookie Bridge 状态
	const bridgeStatus = data.bridgeStatus;
	const bridgeText = bridgeStatus === 'connected' ? '已连接' : bridgeStatus === 'active' ? '等待 VSCode 连接' : '未启用';
	const bridgeColor = bridgeStatus === 'connected' ? '#22c55e' : bridgeStatus === 'active' ? '#f59e0b' : '#ef4444';
	const bridgeLine = bridgeStatus
		? `<div class="kimi-header-row kimi-header-row3" style="margin-top: 2px;"><span style="font-size: 10px; color: ${bridgeColor};">🍪 Cookie Bridge: ${bridgeText}</span></div>`
		: '';
	return `<div class="kimi-header">`
		+ `<div class="kimi-header-row">`
		+ `<div class="kimi-header-left">`
		+ `<span class="kimi-user-name">${escapeHtml(data.name)}</span>`
		+ levelBadge
		+ `</div>`
		+ `<button class="btn btn-icon btn-refresh-svc kimi-refresh-btn" data-service-id="${data.id}" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>`
		+ `</div>`
		+ `<div class="kimi-header-row kimi-header-row2">`
		+ `<span class="kimi-service-name">Kimi 会员</span>`
		+ `<span class="kimi-update-time">${fmtDateTime(new Date(data.updatedAt))}</span>`
		+ `</div>`
		+ renewLine
		+ bridgeLine
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
		resetLine = `<div class="kimi-quota-reset">重置时间：${fmtDateTime(new Date(slot.resetsAt))}</div>`;
	}
	return `<div class="kimi-quota-card">`
		+ `<div class="kimi-quota-header">`
		+ `<span class="kimi-quota-label">${escapeHtml(slot.label)}</span>`
		+ `<span class="kimi-quota-percent">${pct.toFixed(0)}%<span class="kimi-quota-used">已使用</span></span>`
		+ `</div>`
		+ `<div class="progress-bar kimi-progress"><div class="progress-fill ${color}" style="width:${pct.toFixed(1)}%"></div></div>`
		+ resetLine
		+ `</div>`;
}

serviceTemplates.kimi = {
	renderCard: function(data) {
		return `<div class="kimi-card" id="kimi-card-${data.id}">${renderKimiHeader(data)}${renderKimiQuota(data)}</div>`;
	}
};

// ====== MiMo 模板 ======

function renderMimoHeader(data) {
	const planName = data.planName || '';
	const planBadge = planName ? `<span class="mimo-plan-badge">${escapeHtml(planName)}</span>` : '';
	const expiryLine = data.currentPeriodEnd
		? `<div class="mimo-header-row mimo-header-row3"><span class="mimo-expiry-label">有效期至：</span><span class="mimo-expiry-time">${escapeHtml(data.currentPeriodEnd)}</span></div>`
		: '';
	// Cookie Bridge 状态
	const bridgeStatus = data.bridgeStatus;
	const bridgeText = bridgeStatus === 'connected' ? '已连接' : bridgeStatus === 'active' ? '等待 VSCode 连接' : '未启用';
	const bridgeColor = bridgeStatus === 'connected' ? '#22c55e' : bridgeStatus === 'active' ? '#f59e0b' : '#ef4444';
	const bridgeLine = bridgeStatus
		? `<div class="mimo-header-row mimo-header-row3" style="margin-top: 2px;"><span style="font-size: 10px; color: ${bridgeColor};">🍪 Cookie Bridge: ${bridgeText}</span></div>`
		: '';
	return `<div class="mimo-header">`
		+ `<div class="mimo-header-row">`
		+ `<div class="mimo-header-left">`
		+ `<span class="mimo-user-name">${escapeHtml(data.name)}</span>`
		+ planBadge
		+ `</div>`
		+ `<button class="btn btn-icon btn-refresh-svc mimo-refresh-btn" data-service-id="${data.id}" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>`
		+ `</div>`
		+ `<div class="mimo-header-row mimo-header-row2">`
		+ `<span class="mimo-service-name">小米 MiMo Token 计划</span>`
		+ `<span class="mimo-update-time">${fmtDateTime(new Date(data.updatedAt))}</span>`
		+ `</div>`
		+ expiryLine
		+ bridgeLine
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
		+ `<span class="mimo-quota-percent">${pct.toFixed(1)}%<span class="mimo-quota-used">已使用</span></span>`
		+ `</div>`
		+ `<div class="progress-bar mimo-progress"><div class="progress-fill ${color}" style="width:${pct.toFixed(1)}%"></div></div>`
		+ `<div class="mimo-quota-detail">已使用：${usedText}&nbsp;&nbsp;总额度：${limitText}</div>`
		+ `</div>`;
}

serviceTemplates.mimo = {
	renderCard: function(data) {
		return `<div class="mimo-card" id="mimo-card-${data.id}">${renderMimoHeader(data)}${renderMimoQuota(data)}</div>`;
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

export function renderService(data) {
	if (data.err) return renderErrorCard(data);
	const tmpl = serviceTemplates[data.kind];
	if (tmpl) {
		return tmpl.renderCard(data);
	}
	return `<div class="service-card error"><div class="service-header"><span class="service-name">${escapeHtml(data.name)}</span><span class="badge badge-error">未注册</span></div><p class="error-message">服务类型 <code>${escapeHtml(data.kind)}</code> 暂无专用仪表盘</p></div>`;
}

// ====== GLM Tab 切换处理（供 dashboard.js 调用）=======

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
