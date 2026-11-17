import { afterEach, describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { StatusBar } from './statusbar';
import { ServiceData } from '../core/types';

function mkData(id: string, name = id): ServiceData {
	return { id, name, kind: 'test', slots: [], updatedAt: Date.now() };
}


function trackStatusBarItems(): vscode.StatusBarItem[] {
	const items: vscode.StatusBarItem[] = [];
	vi.spyOn(vscode.window, 'createStatusBarItem').mockImplementation(() => {
		const item = {
			text: '',
			color: undefined,
			tooltip: undefined,
			command: undefined,
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.StatusBarItem;
		items.push(item);
		return item;
	});
	return items;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('StatusBar.remove（批次 2 新增 API）', () => {
	it('移除已 feed 且已 flush 的服务：缓存与状态栏项一并清除', () => {
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.flush();
		expect(bar.getData().has('a')).toBe(true);

		bar.remove('a');
		expect(bar.getData().has('a')).toBe(false);

		// 再次 flush 不应复活已移除的服务，也不应抛错
		bar.flush();
		expect(bar.getData().has('a')).toBe(false);
	});

	it('移除不存在的 id 静默返回', () => {
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.flush();

		expect(() => bar.remove('nope')).not.toThrow();
		expect(bar.getData().has('a')).toBe(true);
	});

	it('移除后不影响其他服务', () => {
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.feed(mkData('b'));
		bar.flush();

		bar.remove('a');
		expect(bar.getData().has('a')).toBe(false);
		expect(bar.getData().has('b')).toBe(true);
	});
});


describe('StatusBar 生命周期与命令', () => {
	it('服务改名后复用状态栏项并同步命令标题', () => {
		const items = trackStatusBarItems();
		const bar = new StatusBar();
		bar.feed(mkData('a', '旧名称'));
		bar.flush();

		bar.feed(mkData('a', '新名称'));
		bar.flush();

		expect(items).toHaveLength(1);
		expect(items[0].command).toEqual({
			title: '刷新 新名称',
			command: 'aiQuotaDashboard.refreshService',
			arguments: [{ id: 'a' }],
		});
	});

	it('dispose 复用 clear 释放服务项、空状态项与缓存', () => {
		const items = trackStatusBarItems();
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.flush();
		bar.setEmpty();
		expect(items).toHaveLength(2);

		bar.dispose();

		for (const item of items) expect(item.dispose).toHaveBeenCalledTimes(1);
		expect(bar.getData().size).toBe(0);
	});
});

describe('StatusBar staleError 提示', () => {
	function renderKimiTooltip(staleError?: string): string {
		const chunks: string[] = [];
		vi.spyOn(vscode.MarkdownString.prototype, 'appendMarkdown').mockImplementation(function (this: vscode.MarkdownString, markdown) {
			chunks.push(markdown);
			return this;
		});
		trackStatusBarItems();

		const bar = new StatusBar();
		bar.feed({
			...mkData('kimi'),
			kind: 'kimi',
			slots: [{ label: '本周配额', percent: 42 }],
			staleError,
		});
		bar.flush();
		return chunks.join('');
	}

	it('正常 renderer 显示上次成功数据与刷新失败原因', () => {
		const tooltip = renderKimiTooltip('网络请求超时');

		expect(tooltip).toContain('最近更新:');
		expect(tooltip).toContain('*数据过期 · 刷新失败*');
		expect(tooltip).toContain('*当前显示上次成功数据 · 网络请求超时*');
		expect(tooltip).toContain('**本周配额** **42%** 已使用');
		expect(tooltip).toContain('[刷新](command:aiQuotaDashboard.refreshService?');
	});

	it('转义 staleError 中的 Markdown 特殊字符', () => {
		const tooltip = renderKimiTooltip('failed *[detail](url) <b>!</b>');

		expect(tooltip).toContain('当前显示上次成功数据 · failed \\*\\[detail\\]\\(url\\) \\<b\\>\\!\\</b\\>');
		expect(tooltip).not.toContain('failed *[detail](url) <b>!</b>');
	});

	it('无 staleError 时不增加过期提示', () => {
		const tooltip = renderKimiTooltip();

		expect(tooltip).not.toContain('数据过期 · 刷新失败');
		expect(tooltip).not.toContain('当前显示上次成功数据');
	});
});
