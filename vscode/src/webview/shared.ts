// Webview 共享工具、Lucide 风格图标与卡片渲染调度器

import type { QuotaSlot } from '../core/types';
import type { ServiceTemplate, VsCodeApi, WebviewServiceData } from './types';

/** VSCode API 单例（webview 生命周期内 acquireVsCodeApi 仅可调用一次，模块顶层统一持有） */
export const vscodeApi: VsCodeApi = acquireVsCodeApi();

// ====== 共享工具 ======

export function fmtNum(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return '-';
	if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
	if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
	if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
	return String(n);
}

export function fmtDateTime(d: Date): string {
	const pad = function(n: number): string { return String(n).padStart(2, '0'); };
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

export function escapeHtml(text: unknown): string {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isValidDate(date: Date): boolean {
	return !Number.isNaN(date.getTime());
}

function formatUpdatedAt(timestamp: number): { compact: string; full: string; iso: string } | undefined {
	const date = new Date(timestamp);
	if (!isValidDate(date)) return undefined;
	const now = new Date();
	const sameDay = date.getFullYear() === now.getFullYear()
		&& date.getMonth() === now.getMonth()
		&& date.getDate() === now.getDate();
	const full = fmtDateTime(date);
	return {
		compact: sameDay ? full.slice(11) : full.slice(5, 16),
		full,
		iso: date.toISOString(),
	};
}

// ====== Lucide 风格图标（统一 24px 视图框与 currentColor 描边） ======

export type IconName = 'circle-alert' | 'circle-help' | 'gauge' | 'key-round' | 'loader-circle' | 'plus' | 'refresh-cw' | 'save' | 'settings-2' | 'trash-2';

const ICON_PATHS: Record<IconName, string> = {
	'circle-alert': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
	'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
	gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
	'key-round': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
	'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	'refresh-cw': '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
	save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
	'settings-2': '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
	'trash-2': '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
};

export function renderIcon(name: IconName, className = ''): string {
	const classes = 'icon' + (className ? ' ' + className : '');
	return '<svg class="' + classes + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICON_PATHS[name] + '</svg>';
}

/** 所有标签组共用的 roving tabindex 键盘交互；动态渲染的 GLM 标签同样适用。 */
export function bindTabKeyboard(): void {
	document.addEventListener('keydown', event => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const currentTab = target.closest<HTMLElement>('[role="tab"]');
		const tabList = currentTab?.closest<HTMLElement>('[role="tablist"]');
		if (!currentTab || !tabList) return;

		const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]')).filter(tab =>
			tab.closest('[role="tablist"]') === tabList && tab.getAttribute('aria-disabled') !== 'true',
		);
		const currentIndex = tabs.indexOf(currentTab);
		if (currentIndex < 0 || tabs.length === 0) return;

		let nextIndex: number | undefined;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				nextIndex = (currentIndex + 1) % tabs.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = tabs.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		tabs[nextIndex].focus();
		tabs[nextIndex].click();
	});
}

// ====== 共享卡片结构 ======

interface ServiceHeaderOptions {
	serviceLabel: string;
	badgeHtml?: string;
	renewal?: string;
	showUpdatedAt?: boolean;
	showRefresh?: boolean;
}

function getServiceLabel(kind: string): string {
	if (kind === 'glm') return 'GLM Coding Plan (CN)';
	if (kind === 'kimi') return 'Kimi Membership';
	return kind;
}

export function renderServiceHeader(data: WebviewServiceData, options: ServiceHeaderOptions): string {
	const id = escapeHtml(data.id);
	const name = escapeHtml(data.name);
	const updated = formatUpdatedAt(data.updatedAt);
	const updatedHtml = updated && options.showUpdatedAt !== false
		? '<span class="service-subtitle-separator" aria-hidden="true">·</span><time class="update-time" datetime="' + updated.iso + '" title="完整更新时间：' + updated.full + '">更新于 ' + updated.compact + '</time>'
		: '';
	const renewalHtml = options.renewal
		? '<div class="service-renew"><span>会员有效期至</span><span class="service-renew-value">' + escapeHtml(options.renewal) + '</span></div>'
		: '';
	const refreshHtml = options.showRefresh === false ? '' :
		'<button type="button" class="icon-button btn-refresh-svc" data-service-id="' + id + '" data-service-name="' + name + '" data-focus-key="refresh-' + id + '" aria-label="刷新 ' + name + '" aria-busy="false" title="刷新 ' + name + '">' + renderIcon('refresh-cw') + '</button>';
	return '<header class="service-header">' +
		'<div class="service-heading">' +
			'<div class="service-title-row"><h2 class="service-name" id="service-title-' + id + '">' + name + '</h2>' + (options.badgeHtml ?? '') + '</div>' +
			'<div class="service-subtitle"><span>' + escapeHtml(options.serviceLabel) + '</span>' + updatedHtml + '<span class="refresh-state" data-refresh-state hidden>· 刷新中</span></div>' +
			renewalHtml +
		'</div>' + refreshHtml +
		'</header>';
}

export function renderNoConfig(): string {
	return '<div class="empty-state">' +
		'<div class="empty-icon">' + renderIcon('gauge') + '</div>' +
		'<h2 class="empty-title">还没有服务</h2>' +
		'<p class="empty-hint">添加 GLM 或 Kimi 服务后，即可在这里查看配额与重置时间。</p>' +
		'<button type="button" class="btn btn-primary" data-switch-tab="services">' + renderIcon('plus') + '添加服务</button>' +
		'</div>';
}

export function renderNoKeyCard(data: WebviewServiceData): string {
	const id = escapeHtml(data.id);
	return '<article class="service-card service-card-empty" data-service-card="' + id + '" aria-labelledby="service-title-' + id + '">' +
		renderServiceHeader(data, {
			serviceLabel: getServiceLabel(data.kind),
			badgeHtml: '<span class="service-badge badge-muted">待配置</span>',
			showUpdatedAt: false,
			showRefresh: false,
		}) +
		'<div class="service-empty-body">' + renderIcon('key-round') + '<div><h3 class="service-empty-title">尚未配置 API Key</h3><p class="service-empty-copy">添加密钥后即可查询配额；密钥仅保存在本机。</p>' +
		'<button type="button" class="btn btn-sm btn-primary" data-switch-tab="services" data-focus-service-id="' + id + '">' + renderIcon('settings-2') + '去配置</button></div></div>' +
		'</article>';
}

/** 旧数据仍可读时，用独立低强调状态说明刷新失败，不清空配额或改写更新时间。 */
export function renderStaleNotice(data: WebviewServiceData): string {
	if (!data.staleError) return '';
	const id = escapeHtml(data.id);
	const name = escapeHtml(data.name);
	return '<div class="stale-notice" role="status">' + renderIcon('circle-alert') +
		'<div class="stale-copy"><strong>数据过期 · 刷新失败</strong><span>以下仍为上次成功获取的数据。</span><span class="stale-error-detail">' + escapeHtml(data.staleError) + '</span></div>' +
		'<button type="button" class="btn btn-sm btn-secondary btn-refresh-svc stale-retry" data-service-id="' + id + '" data-service-name="' + name + '" data-focus-key="stale-retry-' + id + '" aria-label="重试刷新 ' + name + '">' + renderIcon('refresh-cw') + '重试</button>' +
		'</div>';
}

export function renderErrorCard(data: WebviewServiceData): string {
	return '<article class="service-card service-card-error" data-service-card="' + escapeHtml(data.id) + '" aria-labelledby="service-title-' + escapeHtml(data.id) + '">' +
		renderServiceHeader(data, { serviceLabel: getServiceLabel(data.kind), badgeHtml: '<span class="service-badge badge-error">数据不可用</span>' }) +
		'<div class="service-error">' + renderIcon('circle-alert') + '<div><p class="error-message">' + escapeHtml(data.err) + '</p><p class="error-recovery">检查网络或 API Key 后，使用上方刷新按钮重试。</p></div></div>' +
		'</article>';
}

export function renderLoadingCard(data: WebviewServiceData): string {
	return '<article class="service-card loading-card" data-service-card="' + escapeHtml(data.id) + '" aria-labelledby="service-title-' + escapeHtml(data.id) + '" aria-busy="true">' +
		renderServiceHeader(data, { serviceLabel: getServiceLabel(data.kind), showUpdatedAt: false }) +
		'<div class="loading-body" role="status"><span class="loading-spinner">' + renderIcon('loader-circle') + '</span><span>正在获取配额…</span></div>' +
		'</article>';
}

function getQuotaLevel(percent: number): 'success' | 'warning' | 'danger' {
	return percent >= 90 ? 'danger' : percent >= 75 ? 'warning' : 'success';
}

function normalizePercent(percent: number): number {
	if (!Number.isFinite(percent)) return 0;
	return Math.min(100, Math.max(0, percent));
}

function formatPercent(percent: number): string {
	return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function renderQuotaCard(slot: QuotaSlot, serviceId: string, index: number): string {
	const percent = normalizePercent(slot.percent);
	const percentText = formatPercent(percent);
	const level = getQuotaLevel(percent);
	const id = 'quota-' + escapeHtml(serviceId) + '-' + index;
	const includedInTotal = slot.label.includes('含于总额');
	const label = includedInTotal ? slot.label.replace(/\s*[（(]含于总额[）)]/g, '') : slot.label;
	const details: string[] = [];
	if (slot.used != null && slot.limit != null) {
		details.push('<span>已用 ' + fmtNum(slot.used) + ' / 限额 ' + fmtNum(slot.limit) + '</span>');
	}
	if (slot.resetsAt) {
		const resetDate = new Date(slot.resetsAt);
		if (isValidDate(resetDate)) details.push('<span>重置于 ' + fmtDateTime(resetDate) + '</span>');
	}
	const note = includedInTotal ? '<div class="quota-note">含于本月总额，不重复累计</div>' : '';
	return '<div class="quota-item">' +
		'<div class="quota-header"><span class="quota-label" id="' + id + '-label">' + escapeHtml(label) + '</span><span class="quota-percent ' + level + '">' + percentText + '%<span class="quota-used">已用</span></span></div>' +
		'<div class="progress-track" role="progressbar" aria-labelledby="' + id + '-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percentText + '" aria-valuetext="已使用 ' + percentText + '%"><div class="progress-fill ' + level + '" style="width:' + percentText + '%" aria-hidden="true"></div></div>' +
		(details.length ? '<div class="quota-meta">' + details.join('') + '</div>' : '') +
		note +
		'</div>';
}

/** GLM/Kimi 共用配额区；API 未返回的可选槽位保持缺席，不渲染为 0%。 */
export function renderQuotaSection(data: WebviewServiceData): string {
	const slots = data.slots ?? [];
	const content = slots.length > 0
		? '<div class="quota-list">' + slots.map((slot, index) => renderQuotaCard(slot, data.id, index)).join('') + '</div>'
		: '<div class="inline-empty" role="status">暂未收到配额数据</div>';
	return '<section class="quota-section" aria-label="' + escapeHtml(data.name) + '配额用量">' + content + '</section>';
}

// ====== 模板注册表 ======

const bundleTemplates: Record<string, ServiceTemplate> = {};

export function registerServiceTemplate<T extends WebviewServiceData>(
	kind: string,
	renderCard: (data: T) => string,
): void {
	bundleTemplates[kind] = { renderCard: (data: WebviewServiceData) => renderCard(data as T) };
}

export function renderService(data: WebviewServiceData): string {
	if (data._loading) return renderLoadingCard(data);
	if (data.noKey) return renderNoKeyCard(data);
	if (data.err) return renderErrorCard(data);
	const tmpl = bundleTemplates[data.kind];
	if (tmpl) return tmpl.renderCard(data);
	return '<article class="service-card service-card-error" data-service-card="' + escapeHtml(data.id) + '">' +
		renderServiceHeader(data, { serviceLabel: getServiceLabel(data.kind), badgeHtml: '<span class="service-badge badge-error">未注册</span>' }) +
		'<div class="service-error">' + renderIcon('circle-alert') + '<p class="error-message">服务类型 <code>' + escapeHtml(data.kind) + '</code> 暂无专用仪表盘，请在服务目录中注册模板。</p></div>' +
		'</article>';
}
