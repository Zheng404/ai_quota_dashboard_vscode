// Webview bundle 入口：卡片注册、消息路由、可访问标签页与渲染调度

import type { ExtToWebviewMessage, UpdateDataMessage } from './types';
import { computeVisibleServices, pruneStatesByProfiles, shouldSkipPanelRerender } from './compute';
import { bindTabKeyboard, renderNoConfig, renderService, vscodeApi } from './shared';
import { glmStates, registerGlmCard } from './cards/glm';
import { registerKimiCard } from './cards/kimi';
import { bindAddService, bindGlobalEvents, bindServiceEvents, handleSaveGlobalResult, renderGlobalSettings, renderServiceListSettings } from './settings';

registerGlmCard();
registerKimiCard();
bindTabKeyboard();

let lastUpdateMessage: UpdateDataMessage | undefined;
let servicesPanelHash = '';
let globalPanelHash = '';
let activeRefreshingIds = new Set<string>();

function announce(message: string): void {
	const region = document.getElementById('dashboard-announcer');
	if (region) region.textContent = message;
}

// ====== 顶级标签页 ======

function activateTopTab(button: HTMLElement): void {
	const tab = button.dataset.tab ?? 'dashboard';
	document.querySelectorAll<HTMLElement>('.tab-btn').forEach(tabButton => {
		const selected = tabButton === button;
		tabButton.classList.toggle('active', selected);
		tabButton.setAttribute('aria-selected', String(selected));
		tabButton.tabIndex = selected ? 0 : -1;
	});
	document.querySelectorAll<HTMLElement>('.tab-panel').forEach(panel => {
		const selected = panel.id === 'panel-' + tab;
		panel.classList.toggle('active', selected);
		panel.hidden = !selected;
	});
	// 设置面板在重新进入时按最新数据渲染；输入焦点保护仍由 handleUpdateData 执行。
	servicesPanelHash = '';
	globalPanelHash = '';
	if (lastUpdateMessage) handleUpdateData(lastUpdateMessage);
}

document.querySelectorAll<HTMLElement>('.tab-btn').forEach(button => {
	button.addEventListener('click', () => activateTopTab(button));
});

// ====== 刷新、空态动作与帮助（事件委托，不随 innerHTML 重渲染失效） ======

function applyRefreshingState(): void {
	document.querySelectorAll<HTMLButtonElement>('.btn-refresh-svc').forEach(button => {
		const id = button.dataset.serviceId ?? '';
		const name = button.dataset.serviceName ?? '服务';
		const refreshing = activeRefreshingIds.has(id);
		button.classList.toggle('spinning', refreshing);
		button.setAttribute('aria-disabled', String(refreshing));
		button.setAttribute('aria-busy', String(refreshing));
		button.setAttribute('aria-label', (refreshing ? '正在刷新 ' : '刷新 ') + name);
		button.title = (refreshing ? '正在刷新 ' : '刷新 ') + name;
		const card = button.closest<HTMLElement>('[data-service-card]');
		if (card) card.setAttribute('aria-busy', String(refreshing || card.classList.contains('loading-card')));
		const state = card?.querySelector<HTMLElement>('[data-refresh-state]');
		if (state) state.hidden = !refreshing;
	});
}

document.addEventListener('click', event => {
	const target = event.target;
	if (!(target instanceof Element)) return;

	const refreshButton = target.closest<HTMLButtonElement>('.btn-refresh-svc');
	if (refreshButton) {
		if (refreshButton.getAttribute('aria-disabled') === 'true') return;
		const id = refreshButton.dataset.serviceId;
		if (!id) return;
		activeRefreshingIds.add(id);
		applyRefreshingState();
		announce('正在刷新 ' + (refreshButton.dataset.serviceName ?? '服务'));
		vscodeApi.postMessage({ command: 'refreshService', data: { id } });
		return;
	}

	const switchButton = target.closest<HTMLElement>('[data-switch-tab]');
	if (switchButton) {
		const tabName = switchButton.dataset.switchTab ?? 'dashboard';
		const serviceId = switchButton.dataset.focusServiceId;
		const tab = Array.from(document.querySelectorAll<HTMLElement>('.tab-btn')).find(button => button.dataset.tab === tabName);
		if (tab) {
			tab.click();
			if (serviceId) {
				const serviceItem = Array.from(document.querySelectorAll<HTMLElement>('.service-item')).find(item => item.dataset.id === serviceId);
				serviceItem?.querySelector<HTMLInputElement>('.svc-key')?.focus();
			} else {
				document.getElementById(tabName === 'services' ? 'new-service-kind' : 'panel-' + tabName)?.focus();
			}
		}
		return;
	}

	const helpButton = target.closest<HTMLElement>('.svc-help-btn');
	if (helpButton) vscodeApi.postMessage({ command: helpButton.dataset.helpCmd ?? '' });
});

// ====== 接收数据更新（渲染调度） ======

function isEditingInPanel(panel: HTMLElement | null): boolean {
	if (!panel) return false;
	const active = document.activeElement;
	if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) return false;
	return panel.contains(active);
}

function captureDashboardFocus(panel: HTMLElement): string | undefined {
	const active = document.activeElement;
	return active instanceof HTMLElement && panel.contains(active) ? active.dataset.focusKey : undefined;
}

function restoreDashboardFocus(panel: HTMLElement, focusKey: string | undefined): void {
	if (!focusKey) return;
	const target = Array.from(panel.querySelectorAll<HTMLElement>('[data-focus-key]')).find(el => el.dataset.focusKey === focusKey);
	target?.focus({ preventScroll: true });
}

function handleUpdateData(message: UpdateDataMessage): void {
	const settings = message.settings;
	lastUpdateMessage = message;
	pruneStatesByProfiles(glmStates, settings.profiles);
	const previousRefreshingIds = activeRefreshingIds;
	activeRefreshingIds = new Set(message.refreshingIds ?? []);

	const dashboardPanel = document.getElementById('panel-dashboard');
	if (dashboardPanel) {
		const focusKey = captureDashboardFocus(dashboardPanel);
		const visibleServices = computeVisibleServices(settings.profiles, message.services);

		dashboardPanel.innerHTML = visibleServices.length > 0
			? visibleServices.map(service => renderService(service)).join('')
			: renderNoConfig();
		applyRefreshingState();
		restoreDashboardFocus(dashboardPanel, focusKey);
	}

	for (const id of previousRefreshingIds) {
		if (!activeRefreshingIds.has(id)) {
			const profile = settings.profiles.find(item => item.id === id);
			if (profile) announce(profile.displayName + ' 刷新结束');
		}
	}

	const servicesPanel = document.getElementById('panel-services');
	if (servicesPanel) {
		const servicesHash = JSON.stringify({ profiles: settings.profiles, keys: settings.keys });
		const skipRerender = shouldSkipPanelRerender(
			isEditingInPanel(servicesPanel),
			servicesPanel.querySelector('[data-confirm-panel]:not([hidden])') !== null,
		);
		if (servicesHash !== servicesPanelHash && !skipRerender) {
			servicesPanel.innerHTML = renderServiceListSettings(settings);
			servicesPanelHash = servicesHash;
			bindServiceEvents();
			bindAddService();
		}
	}

	const globalPanel = document.getElementById('panel-global');
	if (globalPanel) {
		const globalHash = JSON.stringify(settings);
		const skipRerender = shouldSkipPanelRerender(
			isEditingInPanel(globalPanel),
			globalPanel.querySelector('[data-confirm-panel]:not([hidden])') !== null,
		);
		if (globalHash !== globalPanelHash && !skipRerender) {
			globalPanel.innerHTML = renderGlobalSettings(settings);
			globalPanelHash = globalHash;
			bindGlobalEvents();
		}
	}
}

window.addEventListener('message', event => {
	const message = event.data as ExtToWebviewMessage;
	if (message.command === 'switchToSettings') {
		const subtab = message.subtab ?? 'services';
		const targetTab = Array.from(document.querySelectorAll<HTMLElement>('.tab-btn')).find(button => button.dataset.tab === subtab);
		if (targetTab) {
			targetTab.click();
			targetTab.focus();
		}
		return;
	}
	if (message.command === 'saveGlobalResult') {
		handleSaveGlobalResult(message);
		return;
	}
	if (message.command === 'updateData') handleUpdateData(message);
});

vscodeApi.postMessage({ command: 'requestInitialData' });
