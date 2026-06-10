import * as vscode from 'vscode';
import { ServiceData } from '../core/types';
import { fmtNum } from '../core/format';
import { getDescriptor } from '../services/registry';
import { fullCountdown, svcColor, StatusBarRenderer } from './statusBarRenderer';

/** 状态栏 - 每个服务一个 StatusBarItem，独立着色 */
export class StatusBar {
	private items = new Map<string, vscode.StatusBarItem>();
	private cache = new Map<string, ServiceData>();
	private emptyItem?: vscode.StatusBarItem;
	private rendererCache = new Map<string, StatusBarRenderer | null>();

	/** 清除所有缓存数据和状态栏项 */
	clear() {
		this.cache.clear();
		this.rendererCache.clear();
		for (const item of this.items.values()) {
			item.dispose();
		}
		this.items.clear();
		if (this.emptyItem) {
			this.emptyItem.dispose();
			this.emptyItem = undefined;
		}
	}

	/** 设置指定服务为刷新中状态 */
	setRefreshing(id: string) {
		const item = this.items.get(id);
		if (item) {
			item.text = `刷新中...`;
			item.color = undefined;
			item.show();
		}
	}

	/** 缓存数据但不立即渲染 */
	feed(data: ServiceData) {
		this.cache.set(data.id, data);
	}

	/** 统一渲染一次 */
	flush() {
		this.render();
	}

	setLoading() {
		this.hideAll();
		if (this.emptyItem) {
			this.emptyItem.hide();
		}
	}

	setEmpty() {
		this.hideAll();
		this.showEmptyItem();
	}

	private hideAll() {
		for (const item of this.items.values()) {
			item.hide();
		}
	}

	private showEmptyItem() {
		if (!this.emptyItem) {
			this.emptyItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
			this.emptyItem.text = '未配置 AI 服务';
			this.emptyItem.tooltip = this.buildEmptyTooltip();
			this.emptyItem.command = 'aiQuotaDashboard.openSettings';
		}
		this.emptyItem.show();
	}

	private buildEmptyTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString(undefined, true);
		md.isTrusted = true;
		md.appendMarkdown('### 未配置 AI 服务\n\n');
		md.appendMarkdown('请点击下方按钮添加服务，或打开设置页面。\n\n');
		md.appendMarkdown('---\n\n');
		md.appendMarkdown('[打开设置](command:aiQuotaDashboard.openSettings)');
		return md;
	}

	private render() {
		// 移除已删除服务的 item
		for (const id of this.items.keys()) {
			if (!this.cache.has(id)) {
				const item = this.items.get(id);
				if (item) { item.dispose(); }
				this.items.delete(id);
			}
		}

		if (this.cache.size === 0) {
			this.hideAll();
			if (this.emptyItem) {
				this.emptyItem.hide();
			}
			return;
		}

		// 有数据时隐藏 emptyItem
		if (this.emptyItem) {
			this.emptyItem.hide();
		}

		for (const d of this.cache.values()) {
			let item = this.items.get(d.id);
			if (!item) {
				item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
				item.command = {
					title: '刷新 ' + d.name,
					command: 'aiQuotaDashboard.refreshService',
					arguments: [{ id: d.id }],
				};
				this.items.set(d.id, item);
			}

			if (d.err) {
				item.text = `${d.name}: ✗`;
				item.color = new vscode.ThemeColor('errorForeground');
				item.tooltip = this.buildTooltip(d);
				item.show();
				continue;
			}

			// 通用渲染：查找注册的状态栏渲染器（每个 kind 只查一次）
			const renderer = this.resolveRenderer(d.kind);
			if (renderer) {
				this.renderWithRenderer(item, d, renderer);
			} else {
				// 无渲染器 —— 显示警告状态
				item.text = `${d.name}: ?`;
				item.color = new vscode.ThemeColor('errorForeground');
				item.tooltip = this.buildTooltip(d);
				item.show();
			}
		}
	}

	private resolveRenderer(kind: string): StatusBarRenderer | undefined {
		const cached = this.rendererCache.get(kind);
		if (cached !== undefined) {
			return cached ?? undefined;
		}
		try {
			const desc = getDescriptor(kind);
			const renderer = desc.statusBarRenderer ?? null;
			this.rendererCache.set(kind, renderer);
			return desc.statusBarRenderer;
		} catch {
			this.rendererCache.set(kind, null);
			return undefined;
		}
	}

	private renderWithRenderer(
		item: vscode.StatusBarItem,
		data: ServiceData,
		renderer: StatusBarRenderer,
	) {
		const segments = renderer.filterSlots(data);
		if (segments.length === 0) {
			item.hide();
			return;
		}

		const maxPct = Math.max(
			...segments.map(s => s.percent ?? 0),
			0,
		);

		const segs = segments.map(s =>
			s.countdownText ? `${s.percentText}/${s.countdownText}` : s.percentText,
		);

		item.text = `${data.name}：${segs.join(' | ')}`;
		item.color = svcColor(maxPct);
		item.tooltip = this.buildTooltip(data);
		item.show();
	}

	private buildTooltip(d: ServiceData): vscode.MarkdownString {
		const md = new vscode.MarkdownString(undefined, true);
		md.isTrusted = true;
		md.supportHtml = true;

		if (d.err) {
			md.appendMarkdown(`### ${d.name}（异常）\n\n`);
			md.appendMarkdown(`${d.err}\n\n`);
			md.appendMarkdown(`---\n\n`);
			md.appendMarkdown(`[刷新](command:aiQuotaDashboard.refreshService?${encodeURIComponent(JSON.stringify({ id: d.id }))})`);
			md.appendMarkdown(` | `);
			md.appendMarkdown(`[仪表盘](command:aiQuotaDashboard.openDashboard)`);
			return md;
		}

		const renderer = this.resolveRenderer(d.kind);
		if (!renderer) {
			md.appendMarkdown(`### ${d.name}（警告）\n\n`);
			md.appendMarkdown(`服务类型 \`${d.kind}\` 未注册状态栏渲染器，请在 ServiceDescriptor 中配置 statusBarRenderer。\n\n`);
			md.appendMarkdown(`[设置](command:aiQuotaDashboard.openSettings)`);
			return md;
		}

		const meta = renderer.buildTooltipMeta(d);
		const quotas = renderer.buildTooltipQuotas(d);

		// 标题
		const levelBadge = meta.levelBadge ? ` [${meta.levelBadge}]` : '';
		md.appendMarkdown(`### ${d.name}${levelBadge}\n\n`);
		md.appendMarkdown(`${meta.serviceDisplayName}\n\n`);

		if (meta.membershipExpiry) {
			md.appendMarkdown(`${meta.membershipExpiry}\n\n`);
		}

		if (meta.extraLines) {
			for (const line of meta.extraLines) {
				md.appendMarkdown(`${line}\n\n`);
			}
		}

		md.appendMarkdown(`最近更新: ${new Date(d.updatedAt).toLocaleString()}\n\n`);
		md.appendMarkdown(`---\n\n`);

		// 配额区域
		for (let i = 0; i < quotas.length; i++) {
			const q = quotas[i];
			if (q.dividerBefore ?? i > 0) {
				md.appendMarkdown(`---\n\n`);
			}

			const pct = q.percent.toFixed(0);
			md.appendMarkdown(`**${q.label}** **${pct}%** 已使用\n\n`);

		const filled = Number.isFinite(q.percent) ? Math.max(0, Math.min(20, Math.round((q.percent / 100) * 20))) : 0;
		const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
			md.appendMarkdown(`${bar}\n\n`);

			if (q.used != null && q.limit != null) {
				md.appendMarkdown(`已使用: ${fmtNum(q.used)} \u00a0\u00a0\u00a0\u00a0 总额度: ${fmtNum(q.limit)}\n\n`);
			}

			if (q.resetsAt) {
				md.appendMarkdown(`*重置时间: ${fullCountdown(q.resetsAt)}*\n\n`);
			}
		}

		// 操作按钮
		md.appendMarkdown(`---\n\n`);
		md.appendMarkdown(`[仪表盘](command:aiQuotaDashboard.openDashboard)`);
		md.appendMarkdown(` | `);
		md.appendMarkdown(`[设置](command:aiQuotaDashboard.openSettings)`);
		md.appendMarkdown(` | `);
		md.appendMarkdown(`[刷新](command:aiQuotaDashboard.refreshService?${encodeURIComponent(JSON.stringify({ id: d.id }))})`);

		return md;
	}

	getData(): Map<string, ServiceData> {
		return new Map(this.cache);
	}

	dispose() {
		for (const item of this.items.values()) {
			item.dispose();
		}
		this.items.clear();
		if (this.emptyItem) {
			this.emptyItem.dispose();
			this.emptyItem = undefined;
		}
	}
}
