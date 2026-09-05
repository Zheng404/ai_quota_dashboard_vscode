// Webview 共享工具 + 卡片渲染调度器
//
// 1:1 迁移自 dashboard/templates/shared.ts 字符串版（构建期编译替代字符串注入）：
// 函数逻辑与 DOM 输出逐行等价，仅增加类型注解与模块化

import type { QuotaSlot } from '../core/types';
import type { ServiceTemplate, VsCodeApi, WebviewServiceData } from './types';

/** VSCode API 单例（webview 生命周期内 acquireVsCodeApi 仅可调用一次，模块顶层统一持有） */
export const vscodeApi: VsCodeApi = acquireVsCodeApi();

// ====== 共享工具 ======

export function fmtNum(n: number | null | undefined): string {
	if (n == null) return '-';
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

// ====== 共享渲染器 ======

export function renderNoConfig(): string {
	return '<div class="empty-state"><div class="empty-icon">\u{1F4CA}</div><p class="empty-title">暂无服务数据</p><p class="empty-hint">切换到「服务」标签页添加服务</p></div>';
}

export function renderErrorCard(data: WebviewServiceData): string {
	return '<div class="service-card error"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span><span class="badge badge-error">错误</span></div><p class="error-message">' + escapeHtml(data.err) + '</p></div>';
}

// 轻量加载骨架卡：保留卡片框架，内容区显示旋转图标 + 文字（无缝刷新）
export function renderLoadingCard(data: WebviewServiceData): string {
	return '<div class="service-card loading-card"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span></div><div class="loading-body"><span class="loading-spinner"></span><span class="loading-text">加载中...</span></div></div>';
}

export function renderSlot(slot: QuotaSlot): string {
	const pct = Math.min(slot.percent, 100);
	const color = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success';
	let detail = '';
	if (slot.used != null && slot.limit != null) detail = fmtNum(slot.used) + ' / ' + fmtNum(slot.limit);
	if (slot.resetsAt) {
		const diff = slot.resetsAt - Date.now();
		if (diff > 0) {
			const mins = Math.floor(diff / 60000);
			const hrs = Math.floor(mins / 60);
			const rem = mins % 60;
			detail += detail ? (' \u00b7 ' + hrs + 'h ' + rem + 'm') : (hrs + 'h ' + rem + 'm');
		}
	}
	return '<div class="slot"><div class="slot-header"><span class="slot-label">' + escapeHtml(slot.label) + '</span><span class="slot-percent ' + color + '">' + pct.toFixed(1) + '%</span></div><div class="progress-bar"><div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div></div><div class="slot-detail">' + detail + '</div></div>';
}

// ====== 模板注册表 ======

// bundle 内置注册表（全部卡片经 registerServiceTemplate 注册，唯一分发通道）
const bundleTemplates: Record<string, ServiceTemplate> = {};

/** 注册卡片模板到 bundle 内置注册表（renderService 分发） */
export function registerServiceTemplate<T extends WebviewServiceData>(
	kind: string,
	renderCard: (data: T) => string,
): void {
	bundleTemplates[kind] = { renderCard: (data: WebviewServiceData) => renderCard(data as T) };
}

// 调度器 —— 每个服务必须注册专用模板，无 fallback
export function renderService(data: WebviewServiceData): string {
	if (data._loading) return renderLoadingCard(data);
	if (data.err) return renderErrorCard(data);
	const tmpl = bundleTemplates[data.kind];
	if (tmpl) {
		return tmpl.renderCard(data);
	}
	return '<div class="service-card error"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span><span class="badge badge-error">未注册</span></div><p class="error-message">服务类型 <code>' + escapeHtml(data.kind) + '</code> 暂无专用仪表盘，请在服务目录中注册模板。</p></div>';
}
