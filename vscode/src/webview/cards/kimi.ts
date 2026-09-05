// Kimi Membership 仪表盘卡片（bundle 内置模板）
//
// 1:1 迁移自 services/kimi/template.ts 字符串版：
// - 头部两行：[名称] [刷新] / [服务名] [更新时间]
// - 用量统计：配额卡片垂直排列（频限明细/本周用量）
// 函数逻辑与 DOM 输出逐行等价，仅增加类型注解与模块化

import type { KimiServiceData } from '../../services/kimi/types';
import type { WebviewServiceData } from '../types';
import { escapeHtml, fmtDateTime, registerServiceTemplate } from '../shared';

// ====== 头部渲染 ======

function renderKimiHeader(data: WebviewServiceData): string {
	return '<div class="kimi-header">' +
		'<div class="kimi-header-row">' +
			'<div class="kimi-header-left">' +
				'<span class="kimi-user-name">' + escapeHtml(data.name) + '</span>' +
			'</div>' +
			'<button class="btn btn-icon btn-refresh-svc kimi-refresh-btn" data-service-id="' + data.id + '" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>' +
		'</div>' +
		'<div class="kimi-header-row kimi-header-row2">' +
			'<span class="kimi-service-name">Kimi Membership</span>' +
			'<span class="kimi-update-time">' + fmtDateTime(new Date(data.updatedAt)) + '</span>' +
		'</div>' +
		'</div>';
}

// ====== 用量统计渲染 ======

function renderKimiQuota(data: KimiServiceData): string {
	const slots = data.slots || [];
	const slotsHtml = slots.map(function(s) {
		return renderKimiQuotaCard(s);
	}).join('');

	return '<div class="kimi-quota-section">' +
		'<div class="kimi-quota-cards">' + slotsHtml + '</div>' +
		'</div>';
}

function renderKimiQuotaCard(slot: { label: string; percent: number; resetsAt?: number }): string {
	const pct = Math.min(slot.percent, 100);
	const color = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success';
	let resetLine = '';
	if (slot.resetsAt) {
		resetLine = '<div class="kimi-quota-reset">重置时间：' + fmtDateTime(new Date(slot.resetsAt)) + '</div>';
	}
	return '<div class="kimi-quota-card">' +
		'<div class="kimi-quota-header">' +
			'<span class="kimi-quota-label">' + escapeHtml(slot.label) + '</span>' +
			'<span class="kimi-quota-percent">' + pct.toFixed(0) + '%<span class="kimi-quota-used">已使用</span></span>' +
		'</div>' +
		'<div class="progress-bar kimi-progress">' +
			'<div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div>' +
		'</div>' +
		resetLine +
		'</div>';
}

// ====== 模板注册 ======

/** 注册 Kimi 卡片到 bundle 内置注册表（renderService 分发） */
export function registerKimiCard(): void {
	registerServiceTemplate<KimiServiceData>('kimi', function renderCard(data) {
		return '<div class="kimi-card" id="kimi-card-' + data.id + '">' +
			renderKimiHeader(data) +
			renderKimiQuota(data) +
			'</div>';
	});
}
