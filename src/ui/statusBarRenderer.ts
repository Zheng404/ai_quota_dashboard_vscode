import * as vscode from 'vscode';
import { ServiceData, getColorLevel, ColorLevel } from '../core/types';

// ==================== 共享工具函数 ====================

export function compactCountdown(ts?: number): string {
	if (!ts) return '';
	const diff = ts - Date.now();
	if (diff <= 0) return '0m';
	const mins = Math.floor(diff / 60000);
	const hrs = mins / 60;
	const days = hrs / 24;
	if (days >= 1) return `${days.toFixed(1)}d`;
	if (hrs >= 1) return `${hrs.toFixed(1)}h`;
	return `${mins}m`;
}

export function fullCountdown(ts?: number): string {
	if (!ts) return 'N/A';
	const diff = ts - Date.now();
	if (diff <= 0) return '已用完';
	const mins = Math.floor(diff / 60000);
	const hrs = Math.floor(mins / 60);
	const remMins = mins % 60;
	const days = Math.floor(hrs / 24);
	const remHrs = hrs % 24;
	if (days > 0) return `${days}天${remHrs}时${remMins}分`;
	if (hrs > 0) return `${hrs}时${remMins}分`;
	return `${remMins}分`;
}

const levelColors: Record<ColorLevel, vscode.ThemeColor> = {
	danger: new vscode.ThemeColor('errorForeground'),
	warning: new vscode.ThemeColor('editorWarning.foreground'),
	success: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
};

export function svcColor(pct: number): vscode.ThemeColor {
	return levelColors[getColorLevel(pct)];
}

// ==================== 渲染器接口 ====================

/** 状态栏文本片段 */
export interface StatusBarSegment {
	/** 百分比文本，如 "87%" */
	percentText: string;
	/** 倒计时文本，如 "2.3h"，空字符串表示无倒计时 */
	countdownText: string;
}

/** Tooltip 配额行 */
export interface TooltipQuotaLine {
	label: string;
	percent: number;
	used?: number;
	limit?: number;
	resetsAt?: number;
	/** 是否用分割线与前一项分隔 */
	dividerBefore?: boolean;
}

/** Tooltip 元信息 */
export interface TooltipMeta {
	/** 服务显示名称，如 'GLM Coding Plan (CN)' */
	serviceDisplayName: string;
	/** 等级徽章文本，如 "PRO" */
	levelBadge?: string;
	/** 会员有效期文本 */
	membershipExpiry?: string;
	/** 额外自定义行（在有效期和刷新时间之间） */
	extraLines?: string[];
}

/** 状态栏渲染器接口 —— 各服务实现此接口提供专属渲染逻辑 */
export interface StatusBarRenderer<T extends ServiceData = ServiceData> {
	/** 筛选参与状态栏显示的配额槽位 */
	filterSlots(data: T): StatusBarSegment[];

	/** 构建 tooltip 元信息 */
	buildTooltipMeta(data: T): TooltipMeta;

	/** 构建 tooltip 配额行列表 */
	buildTooltipQuotas(data: T): TooltipQuotaLine[];
}
