// GLM Coding Plan (CN) 仪表盘卡片；保留模型/工具图表与按范围懒加载

import type { GlmServiceData, ModelUsageData, TimeRange, ToolUsageData } from '../../services/glm/types';
import { escapeHtml, fmtNum, registerServiceTemplate, renderIcon, renderQuotaSection, renderServiceHeader, renderStaleNotice, vscodeApi } from '../shared';

interface GlmCardState {
	mainTab: 'model' | 'tool';
	subTab: TimeRange;
	data: GlmServiceData | null;
}

export const glmStates: Record<string, GlmCardState> = {};
const RANGE_LABELS: Record<TimeRange, string> = { day: '当日', week: '近7天', month: '近30天' };

function getGlmState(svcId: string): GlmCardState {
	if (!glmStates[svcId]) {
		glmStates[svcId] = { mainTab: 'model', subTab: 'day', data: null };
	}
	return glmStates[svcId];
}

function renderCard(data: GlmServiceData): string {
	const state = getGlmState(data.id);
	state.data = data;
	const id = escapeHtml(data.id);
	const level = data.level?.trim();
	const badgeHtml = level ? '<span class="service-badge glm-level-badge">' + escapeHtml(level.toUpperCase()) + '</span>' : '';
	return '<article class="service-card glm-card" id="glm-card-' + id + '" data-service-card="' + id + '" aria-labelledby="service-title-' + id + '">' +
		renderServiceHeader(data, { serviceLabel: 'GLM Coding Plan (CN)', badgeHtml, renewal: data.nextRenewTime }) +
		renderStaleNotice(data) +
		renderQuotaSection(data) +
		renderGlmDetailSection(data, state) +
		'</article>';
}

// ====== 图表与汇总 ======

function getModelColor(modelName: string): string {
	if (modelName === 'Token 消耗总量') return '#666';
	const colors: Record<string, string> = {
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

function getToolColor(toolCode: string): string {
	const colors: Record<string, string> = {
		'search-prime': '#4A90D9',
		'web-reader': '#E67E22',
		zread: '#2ECC71',
	};
	return colors[toolCode] || '#888';
}

type ModelChartSeries = ModelUsageData['modelSeries'][number];
type ToolChartSeries = ToolUsageData['toolSeries'][number];
type GlmChartSeries = ModelChartSeries | ToolChartSeries;

function renderGlmModelDetail(usage: ModelUsageData, range: TimeRange): string {
	let totalSeries: ModelChartSeries[] = [];
	if (usage.modelSeries && usage.modelSeries.length > 0) {
		const dataLen = usage.modelSeries[0].tokensUsage ? usage.modelSeries[0].tokensUsage.length : 0;
		const totalTokensUsage: number[] = [];
		for (let i = 0; i < dataLen; i++) {
			let sum = 0;
			for (let j = 0; j < usage.modelSeries.length; j++) {
				sum += usage.modelSeries[j].tokensUsage[i] ?? 0;
			}
			totalTokensUsage.push(sum);
		}
		totalSeries = [{ modelName: 'Token 消耗总量', tokensUsage: totalTokensUsage, totalTokens: usage.totalTokens }];
	}
	const chart = renderGlmChart(usage.modelSeries.concat(totalSeries), usage.xTime, 'tokens', range);
	const summaryItems = usage.modelSummary.map(m =>
		'<div class="glm-summary-item">' +
			'<span class="glm-summary-dot" style="background:' + getModelColor(m.modelName) + '"></span>' +
			'<span class="glm-summary-name">' + escapeHtml(m.modelName) + '</span>' +
			'<span class="glm-summary-value">' + fmtNum(m.totalTokens) + '</span>' +
		'</div>',
	).join('');
	const totalItem = '<div class="glm-summary-item">' +
		'<span class="glm-summary-dot" style="background:' + getModelColor('Token 消耗总量') + '"></span>' +
		'<span class="glm-summary-name">Token 消耗总量</span>' +
		'<span class="glm-summary-value">' + fmtNum(usage.totalTokens) + '</span>' +
		'</div>';
	return chart + '<div class="glm-summary-row">' + totalItem + summaryItems + '</div>';
}

function renderGlmToolDetail(usage: ToolUsageData, range: TimeRange): string {
	const chart = renderGlmChart(usage.toolSeries, usage.xTime, 'calls', range);
	const summaryItems = usage.toolSummary.map(t =>
		'<div class="glm-summary-item">' +
			'<span class="glm-summary-dot" style="background:' + getToolColor(t.toolCode) + '"></span>' +
			'<span class="glm-summary-name">' + escapeHtml(t.toolName.replace(/\s*MCP$/, '')) + '</span>' +
			'<span class="glm-summary-value">' + t.totalUsageCount + ' 次</span>' +
		'</div>',
	).join('');
	return chart + '<div class="glm-summary-row">' + summaryItems + '</div>';
}

function renderGlmChart(series: GlmChartSeries[], xTime: string[], valueKey: 'tokens' | 'calls', range: TimeRange): string {
	if (!series || series.length === 0 || !xTime || xTime.length === 0) {
		return '<div class="glm-detail-empty" role="status">当前范围暂无可绘制的用量数据</div>';
	}
	const dataLen = xTime.length;
	let globalMax = 0;
	series.forEach(s => {
		const arr = 'tokensUsage' in s ? s.tokensUsage : s.usageCount;
		arr?.forEach(v => {
			if (v != null && v > globalMax) globalMax = v;
		});
	});
	if (globalMax === 0) globalMax = 1;
	const width = 260;
	const height = 100;
	const padding = { top: 5, right: 5, bottom: 25, left: 5 };
	const chartW = width - padding.left - padding.right;
	const chartH = height - padding.top - padding.bottom;

	function getPoint(i: number, v: number | null): { x: number; y: number } {
		return {
			x: padding.left + (i / (dataLen - 1 || 1)) * chartW,
			y: padding.top + chartH - ((v ?? 0) / globalMax) * chartH,
		};
	}

	const lines = series.map(s => {
		const arr = 'tokensUsage' in s ? s.tokensUsage : s.usageCount;
		if (!arr || arr.length === 0) return '';
		const color = 'tokensUsage' in s ? getModelColor(s.modelName) : getToolColor(s.toolCode);
		const pts = arr.map((v, i) => getPoint(i, v));
		if (pts.length === 0) return '';
		if (pts.length === 1) {
			return '<circle cx="' + pts[0].x + '" cy="' + pts[0].y + '" r="2" fill="' + color + '"/>';
		}
		let path = 'M ' + pts[0].x + ' ' + pts[0].y;
		for (let i = 1; i < pts.length; i++) path += ' L ' + pts[i].x + ' ' + pts[i].y;
		return '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="' + path + '" opacity="0.85"/>';
	}).join('');

	let gridLines = '';
	for (let i = 0; i <= 4; i++) {
		const y = padding.top + (i / 4) * chartH;
		gridLines += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="var(--vscode-panel-border)" stroke-width="0.5" opacity="0.3"/>';
	}
	const chartLabel = (valueKey === 'tokens' ? 'Token 用量' : '工具调用次数') + '折线图，' + RANGE_LABELS[range] + '；数值见下方汇总';
	const svg = '<svg class="glm-chart" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="' + chartLabel + '" focusable="false">' + gridLines + lines + '</svg>';
	return '<div class="glm-chart-wrap">' + svg + '</div>';
}

// ====== 按时间范围取用量 ======

function getModelUsageForRange(data: GlmServiceData, range: TimeRange): ModelUsageData | undefined {
	return data.modelUsageByRange?.[range] ?? (range === 'day' ? data.modelUsage : undefined);
}

function getToolUsageForRange(data: GlmServiceData, range: TimeRange): ToolUsageData | undefined {
	return data.toolUsageByRange?.[range] ?? (range === 'day' ? data.toolUsage : undefined);
}

function getCurrentUsage(state: GlmCardState): ModelUsageData | ToolUsageData | undefined {
	if (!state.data) return undefined;
	return state.mainTab === 'model'
		? getModelUsageForRange(state.data, state.subTab)
		: getToolUsageForRange(state.data, state.subTab);
}

// ====== 详情标签与内容 ======

function getDetailLabelledBy(svcId: string, state: GlmCardState): string {
	return 'glm-main-tab-' + svcId + '-' + state.mainTab + ' glm-sub-tab-' + svcId + '-' + state.subTab;
}

function isCurrentDetailBusy(state: GlmCardState): boolean {
	const status = state.data?.detailStates?.[state.subTab]?.status;
	return status === 'loading' || (!getCurrentUsage(state) && status !== 'error' && status !== 'ok');
}

function renderGlmDetailSection(data: GlmServiceData, state: GlmCardState): string {
	const id = escapeHtml(data.id);
	const contentId = 'glm-detail-content-' + id;
	const mainTabs = (['model', 'tool'] as const).map(tab => {
		const selected = state.mainTab === tab;
		return '<button type="button" role="tab" class="glm-main-tab' + (selected ? ' active' : '') + '" id="glm-main-tab-' + id + '-' + tab + '" data-svc-id="' + id + '" data-tab="' + tab + '" data-focus-key="glm-main-' + id + '-' + tab + '" aria-selected="' + selected + '" aria-controls="' + contentId + '" tabindex="' + (selected ? '0' : '-1') + '">' + (tab === 'model' ? '模型用量' : '工具用量') + '</button>';
	}).join('');
	const subTabs = (['day', 'week', 'month'] as const).map(range => {
		const selected = state.subTab === range;
		return '<button type="button" role="tab" class="glm-sub-tab' + (selected ? ' active' : '') + '" id="glm-sub-tab-' + id + '-' + range + '" data-svc-id="' + id + '" data-range="' + range + '" data-focus-key="glm-sub-' + id + '-' + range + '" aria-selected="' + selected + '" aria-controls="' + contentId + '" tabindex="' + (selected ? '0' : '-1') + '">' + RANGE_LABELS[range] + '</button>';
	}).join('');
	return '<section class="glm-detail-section" aria-label="使用详情">' +
		'<div class="glm-main-tabs" role="tablist" aria-label="用量类型">' + mainTabs + '</div>' +
		'<div class="glm-sub-tabs" role="tablist" aria-label="时间范围">' + subTabs + '</div>' +
		'<div class="glm-detail-content" id="' + contentId + '" role="tabpanel" data-focus-key="glm-detail-' + id + '" aria-labelledby="' + getDetailLabelledBy(id, state) + '" aria-live="polite" aria-busy="' + isCurrentDetailBusy(state) + '" tabindex="0">' + renderGlmDetailContent(state) + '</div>' +
		'</section>';
}

function renderGlmDetailContent(state: GlmCardState): string {
	if (!state.data) return renderGlmLoading(state.subTab);
	const detailState = state.data.detailStates?.[state.subTab];
	const usage = getCurrentUsage(state);
	let statusHtml = '';
	if (detailState?.status === 'loading') statusHtml = renderGlmLoading(state.subTab, Boolean(usage));
	if (detailState?.status === 'error') statusHtml = renderGlmDetailError(state, detailState.message, Boolean(usage));

	let usageHtml = '';
	if (usage) {
		usageHtml = state.mainTab === 'model'
			? renderGlmModelDetail(usage as ModelUsageData, state.subTab)
			: renderGlmToolDetail(usage as ToolUsageData, state.subTab);
	} else if (detailState?.status === 'ok') {
		usageHtml = '<div class="glm-detail-empty" role="status">当前范围暂无' + (state.mainTab === 'model' ? '模型' : '工具') + '用量数据</div>';
	} else if (detailState?.status !== 'loading' && detailState?.status !== 'error') {
		statusHtml = renderGlmLoading(state.subTab);
	}
	return statusHtml + usageHtml;
}

function renderGlmLoading(range: TimeRange, compact = false): string {
	return '<div class="glm-loading' + (compact ? ' glm-detail-status' : '') + '" role="status">' + renderIcon('loader-circle') + '<span>正在加载' + RANGE_LABELS[range] + '详情…</span></div>';
}

function renderGlmDetailError(state: GlmCardState, message?: string, compact = false): string {
	const svcId = state.data ? escapeHtml(state.data.id) : '';
	return '<div class="glm-detail-error' + (compact ? ' glm-detail-status' : '') + '" role="alert">' + renderIcon('circle-alert') +
		'<div class="glm-detail-error-copy"><strong>' + RANGE_LABELS[state.subTab] + '详情加载失败</strong><p>' + escapeHtml(message ?? '请稍后重试') + '</p></div>' +
		'<button type="button" class="btn btn-sm btn-secondary glm-detail-retry" data-svc-id="' + svcId + '" data-range="' + state.subTab + '">' + renderIcon('refresh-cw') + '重试</button></div>';
}

function requestCurrentRangeIfNeeded(svcId: string, state: GlmCardState): void {
	const detailState = state.data?.detailStates?.[state.subTab];
	if (state.data && !getCurrentUsage(state) && !detailState) {
		vscodeApi.postMessage({ command: 'requestDetailRange', data: { serviceId: svcId, range: state.subTab } });
	}
}

function updateGlmDetail(svcId: string, state: GlmCardState): void {
	const contentEl = document.getElementById('glm-detail-content-' + svcId);
	if (contentEl) {
		contentEl.innerHTML = renderGlmDetailContent(state);
		contentEl.setAttribute('aria-busy', String(isCurrentDetailBusy(state)));
		contentEl.setAttribute('aria-labelledby', getDetailLabelledBy(svcId, state));
	}
}

function syncGlmTabs(svcId: string, state: GlmCardState): void {
	document.querySelectorAll<HTMLElement>('.glm-main-tab, .glm-sub-tab').forEach(el => {
		if (el.dataset.svcId !== svcId) return;
		const selected = el.classList.contains('glm-main-tab') ? el.dataset.tab === state.mainTab : el.dataset.range === state.subTab;
		el.classList.toggle('active', selected);
		el.setAttribute('aria-selected', String(selected));
		el.tabIndex = selected ? 0 : -1;
	});
}

function switchGlmMainTab(svcId: string, tab: 'model' | 'tool'): void {
	const state = getGlmState(svcId);
	state.mainTab = tab;
	updateGlmDetail(svcId, state);
	syncGlmTabs(svcId, state);
	requestCurrentRangeIfNeeded(svcId, state);
}

function switchGlmSubTab(svcId: string, range: TimeRange): void {
	const state = getGlmState(svcId);
	state.subTab = range;
	updateGlmDetail(svcId, state);
	syncGlmTabs(svcId, state);
	requestCurrentRangeIfNeeded(svcId, state);
}

export function registerGlmCard(): void {
	registerServiceTemplate<GlmServiceData>('glm', renderCard);

	document.addEventListener('click', event => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const mainTab = target.closest<HTMLElement>('.glm-main-tab');
		if (mainTab?.dataset.svcId && mainTab.dataset.tab) {
			switchGlmMainTab(mainTab.dataset.svcId, mainTab.dataset.tab as 'model' | 'tool');
			return;
		}
		const subTab = target.closest<HTMLElement>('.glm-sub-tab');
		if (subTab?.dataset.svcId && subTab.dataset.range) {
			switchGlmSubTab(subTab.dataset.svcId, subTab.dataset.range as TimeRange);
			return;
		}
		const retry = target.closest<HTMLButtonElement>('.glm-detail-retry');
		if (retry?.dataset.svcId && retry.dataset.range) {
			retry.setAttribute('aria-disabled', 'true');
			vscodeApi.postMessage({
				command: 'requestDetailRange',
				data: { serviceId: retry.dataset.svcId, range: retry.dataset.range },
			});
		}
	});
}
