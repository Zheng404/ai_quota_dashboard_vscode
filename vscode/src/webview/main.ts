// Webview bundle 入口：卡片注册 + 消息路由 + 渲染调度 + 事件绑定
//
// 1:1 迁移自 dashboard/templates/{settings.ts 字符串尾部执行段}：
// 原 inline IIFE 的执行顺序保持不变（卡片注册 → Tab 切换绑定 → 点击委托 →
// 消息监听 → 请求初始数据），仅增加类型注解与模块化

import type { BridgeServiceData } from '../services/bridge/types';
import type { BridgeStateView, ExtToWebviewMessage, UpdateDataMessage, WebviewServiceData } from './types';
import { renderNoConfig, renderService, vscodeApi } from './shared';
import { registerGlmCard } from './cards/glm';
import { registerKimiCard } from './cards/kimi';
import { registerMimoCard } from './cards/mimo';
import { bindAddService, bindGlobalEvents, bindServiceEvents, renderGlobalSettings, renderServiceListSettings } from './settings';

// ====== 卡片注册（bundle 内置注册表唯一分发，全部卡片均已 TS 化） ======

registerGlmCard();
registerKimiCard();
registerMimoCard();

// ====== 仪表盘卡片刷新按钮绑定（updateData 渲染后调用） ======

function bindRefreshButtons(): void {
	// 单服务刷新按钮
	document.querySelectorAll<HTMLElement>('.btn-refresh-svc').forEach(el => {
		el.addEventListener('click', () => {
			el.classList.add('spinning');
			vscodeApi.postMessage({ command: 'refreshService', data: { id: el.dataset.serviceId } });
		});
	});
}

// ====== Tab 切换 ======
// 三个顶级 tab：仪表盘 / 服务 / 设置，通过 data-tab 切换对应 panel

document.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
		document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
		btn.classList.add('active');
		document.getElementById('panel-' + (btn.dataset.tab ?? ''))?.classList.add('active');
	});
});

// 帮助按钮 + 删除按钮（委托，不受 innerHTML 替换影响）
document.addEventListener('click', (e) => {
	const target = e.target as HTMLElement;
	if (target?.classList?.contains('svc-help-btn')) {
		vscodeApi.postMessage({ command: target.dataset.helpCmd ?? '' });
	}
	if (target?.classList?.contains('remove-service-btn')) {
		const item = target.closest<HTMLElement>('.service-item');
		if (item) {
			vscodeApi.postMessage({ command: 'removeService', data: { id: item.dataset.id } });
		}
	}
});

// ====== 接收数据更新（渲染调度） ======

/** updateData 消息处理：仪表盘 / 服务 / 设置三个 panel 的全量重渲染 */
function handleUpdateData(message: UpdateDataMessage): void {
	const services = message.services;
	const settings = message.settings;

	const dashboardPanel = document.getElementById('panel-dashboard');
	if (dashboardPanel) {
		// 后端权威驱动的刷新状态：哪些服务正在刷新（按钮转圈）
		const refreshingSet = new Set(message.refreshingIds ?? []);

		// 基于 profiles 渲染卡片框架，保证服务列表变化即时反映；
		// 用 services 填充实际数据。无缝刷新：有数据用真实数据，无数据用加载骨架卡。
		// Data Bridge 卡片不在仪表盘显示，其状态展示在「服务」标签页顶部。
		const profiles = (settings.profiles ?? []).filter(p => p.kind !== 'bridge');
		const servicesMap = new Map<string, WebviewServiceData>();
		(services || []).forEach(s => servicesMap.set(s.id, s));

		const visibleServices: WebviewServiceData[] = profiles.map(p => {
			const data = servicesMap.get(p.id);
			if (data) return data;
			// 占位：服务存在但暂无数据 —— 显示轻量加载骨架卡（保留卡片框架，非错误卡）
			return {
				id: p.id,
				name: p.displayName,
				kind: p.kind,
				slots: [],
				updatedAt: Date.now(),
				_loading: true,
			};
		});

		const hasConfig = visibleServices.length > 0;
		dashboardPanel.innerHTML = hasConfig ? visibleServices.map(s => renderService(s)).join('') : renderNoConfig();
		bindRefreshButtons();

		// 按后端 refreshingIds 标记正在刷新的服务按钮（转圈）
		refreshingSet.forEach(id => {
			const btn = document.querySelector('.btn-refresh-svc[data-service-id="' + id + '"]');
			if (btn) btn.classList.add('spinning');
		});
	}

	const servicesPanel = document.getElementById('panel-services');
	if (servicesPanel) {
		// 提取 Bridge 状态数据（连接状态、最后同步、已接收数据种类），传给服务列表
		// 用于在 Data Bridge 服务条目内整合展示，而非独立卡片。
		let bridgeState: BridgeStateView | null = null;
		const bridgeProfile = (settings.profiles ?? []).find(p => p.kind === 'bridge');
		if (bridgeProfile) {
			const servicesMap = new Map<string, WebviewServiceData>();
			(services || []).forEach(s => servicesMap.set(s.id, s));
			const bd = servicesMap.get(bridgeProfile.id) as BridgeServiceData | undefined;
			bridgeState = bd ? {
				connected: bd.connected,
				lastPushAt: bd.lastPushAt,
				receivedKinds: bd.receivedKinds ?? [],
				lastError: bd.lastError,
			} : { connected: false, receivedKinds: [] };
		}
		servicesPanel.innerHTML = renderServiceListSettings(settings, bridgeState);
		bindServiceEvents();
		bindAddService();
	}

	const globalPanel = document.getElementById('panel-global');
	if (globalPanel) {
		globalPanel.innerHTML = renderGlobalSettings(settings);
		bindGlobalEvents();
	}
}

window.addEventListener('message', (event) => {
	const message = event.data as ExtToWebviewMessage;

	if (message.command === 'switchToSettings') {
		// tab 已扁平化：subtab 取值为 'services' / 'global'，直接对应顶级 tab
		const targetTab = document.querySelector('.tab-btn[data-tab="' + (message.subtab ?? 'services') + '"]');
		if (targetTab) (targetTab as HTMLElement).click();
		return;
	}

	if (message.command !== 'updateData') return;

	handleUpdateData(message);
});

// ====== 请求初始数据 ======
vscodeApi.postMessage({ command: 'requestInitialData' });
