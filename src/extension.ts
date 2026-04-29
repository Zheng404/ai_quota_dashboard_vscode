import * as vscode from 'vscode';
import * as config from './core/config';
import { StatusBar } from './ui/statusbar';
import { registerAll } from './commands';
import { loadHistory, saveHistory, attachHistory, clearAllData } from './storage/persistence';
import { ServiceData, ServiceProfile, UsagePoint, SaveServicePayload, AddServicePayload, RemoveServicePayload, SaveGlobalPayload } from './core/types';
import { DashboardWebviewViewProvider, SettingsData } from './dashboard/webviewView';
import { CacheManager } from './core/cache';
import { AfkDetector } from './core/afk';
import { resolveProvider, isValidServiceId, getDescriptor, getAllDescriptors } from './services/registry';

let timer: NodeJS.Timeout | undefined;
let refreshing = false;

const cache = new CacheManager();
const serviceData = new Map<string, ServiceData>();
let dashboardViewProvider: DashboardWebviewViewProvider;
const afkDetector = new AfkDetector();

function restartTimer(loopFn: () => Promise<void>) {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
	const interval = config.pollInterval();
	if (interval > 0) {
		timer = setInterval(loopFn, interval * 1000);
	}
}

// 收集当前设置
async function getCurrentSettings(): Promise<SettingsData> {
	const profiles = config.loadProfiles();
	const keys: Record<string, string> = {};
	for (const p of profiles) {
		keys[p.id] = (await config.getKey(p.id)) ?? '';
	}
	return {
		profiles,
		keys,
		refreshInterval: config.pollInterval(),
		warnThreshold: config.warnThreshold(),
		afkThreshold: config.afkThreshold(),
	};
}

// 更新视图
async function updateView() {
	dashboardViewProvider.update(serviceData, await getCurrentSettings());
}

// 拉取单个服务（核心逻辑，被 pullService 和 pullAll 复用）
async function fetchSingleService(
	profile: ServiceProfile,
	historyMap: Map<string, UsagePoint[]>,
	bar: StatusBar,
): Promise<boolean> {
	const key = await config.getKey(profile.id);
	if (!key) { return false; }

	try {
		const provider = resolveProvider(profile.kind);
		const data = await provider.fetch(key, profile.endpoint);
		data.id = profile.id;
		data.name = profile.displayName;

		const withHistory = attachHistory(data, historyMap);
		bar.feed(withHistory);
		serviceData.set(profile.id, withHistory);
		cache.set(profile.id, withHistory, 60);
		return true;

	} catch (err) {
		console.error(`[${profile.id}]`, err);
		const msg = err instanceof Error ? err.message : String(err);
		const errorData: ServiceData = {
			id: profile.id,
			name: profile.displayName,
			kind: profile.kind,
			slots: [],
			updatedAt: Date.now(),
			err: msg,
		};
		bar.feed(errorData);
		serviceData.set(profile.id, errorData);
		cache.set(profile.id, errorData, 30); // 错误状态短 TTL，避免频繁重试
		return true; // 错误状态也算有结果
	}
}

// 拉取单个服务数据（外部命令调用）
async function pullService(profileId: string, bar: StatusBar, ctx: vscode.ExtensionContext) {
	const profiles = config.loadProfiles();
	const profile = profiles.find(p => p.id === profileId);
	if (!profile?.enabled) { return; }

	const historyMap = loadHistory(ctx);
	await fetchSingleService(profile, historyMap, bar);
	bar.flush();
	updateView();
	await saveHistory(ctx, serviceData);
}

// 拉取所有服务数据
async function pullAll(bar: StatusBar, ctx: vscode.ExtensionContext) {
	// AFK 检测
	if (afkDetector.checkAfk(config.afkThreshold())) {
		console.log('[AI Usage Monitor] AFK 中，跳过刷新');
		return;
	}

	if (refreshing) {
		console.log('[AI Usage Monitor] 刷新进行中，跳过本次请求');
		return;
	}
	refreshing = true;
	let hasResult = false;

	// 加载历史数据（只需加载一次）
	const historyMap = loadHistory(ctx);

	try {
		for (const profile of config.loadProfiles().filter(p => p.enabled)) {
			// 先读缓存
			const cached = cache.get(profile.id);
			if (cached) {
				const withHistory = attachHistory(cached, historyMap);
				bar.feed(withHistory);
				serviceData.set(profile.id, withHistory);
				hasResult = true;
				continue;
			}

			const ok = await fetchSingleService(profile, historyMap, bar);
			if (ok) { hasResult = true; }
		}

		// 统一渲染
		if (hasResult) {
			bar.flush();
			updateView();
			await saveHistory(ctx, serviceData);
		}
	} finally {
		refreshing = false;
		if (!hasResult) {
			bar.setEmpty();
			updateView();
		}
	}
}

// 保存后触发刷新
async function afterConfigChange(bar: StatusBar, ctx: vscode.ExtensionContext, msg?: string) {
	// 清空所有缓存（因为配置变了，需要重新拉取）
	bar.clear();
	cache.clear();
	serviceData.clear();
	// 更新视图（显示新配置）
	updateView();
	// 刷新数据
	await pullAll(bar, ctx);
	if (msg) {
		vscode.window.showInformationMessage(msg);
	}
}

// ====== Webview 设置 ======
function setupWebview(ctx: vscode.ExtensionContext) {
	dashboardViewProvider = new DashboardWebviewViewProvider();
	ctx.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			DashboardWebviewViewProvider.viewType,
			dashboardViewProvider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);
}

// ====== 命令注册 ======
function registerDataCommands(ctx: vscode.ExtensionContext, bar: StatusBar) {
	// 刷新命令
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.refresh', async () => {
			bar.setLoading();
			cache.clear();
			serviceData.clear();
			await pullAll(bar, ctx);
		})
	);

	// 刷新单个服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.refreshService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as { id: string };
			const id = typeof d.id === 'string' ? d.id : '';
			if (!id) { return; }
			bar.setRefreshing(id);
			await pullService(id, bar, ctx);
		})
	);

	// 请求指定时间范围的详细用量数据
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.requestDetailRange', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as { serviceId?: string; range?: string };
			const serviceId = typeof d.serviceId === 'string' ? d.serviceId : '';
			const range = typeof d.range === 'string' ? d.range : 'day';
			if (!serviceId) { return; }

			const profiles = config.loadProfiles();
			const profile = profiles.find(p => p.id === serviceId);
			if (!profile) { return; }

			const descriptor = getDescriptor(profile.kind);
			if (!descriptor.detailProvider || !descriptor.mergeDetailData) { return; }

			const key = await config.getKey(serviceId);
			if (!key) { return; }

			try {
				const detail = await descriptor.detailProvider.fetchDetail(range, key, profile.endpoint);
				if (!detail) { return; }

				const existing = serviceData.get(serviceId);
				if (existing) {
					descriptor.mergeDetailData(existing, detail, range);
					serviceData.set(serviceId, existing);
					await updateView();
				}
			} catch (e) {
				console.error('[AI Usage Monitor] 拉取详情失败:', e instanceof Error ? e.message : e);
			}
		})
	);

	// 重置所有数据
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.resetData', async () => {
			const confirmed = await vscode.window.showWarningMessage(
				'确定要清除所有数据吗？此操作将删除所有服务配置、API Key 和历史记录，且不可恢复。',
				{ modal: true },
				'确认清除',
			);
			if (confirmed === '确认清除') {
				await clearAllData(ctx);
				await config.initDefaults();
				bar.clear();
				cache.clear();
				serviceData.clear();
				updateView();
				vscode.window.showInformationMessage('数据已重置');
			}
		})
	);
}

function registerServiceCommands(ctx: vscode.ExtensionContext, bar: StatusBar) {
	// 保存单个服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.saveService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as SaveServicePayload;
			const id = typeof d.id === 'string' ? d.id : '';
			const name = typeof d.name === 'string' ? d.name : '';
			const defaultKind = getAllDescriptors()[0]?.kind ?? 'glm';
			const kind = isValidServiceId(d.kind) ? d.kind : defaultKind;
			const key = typeof d.key === 'string' ? d.key : '';
			const enabled = typeof d.enabled === 'boolean' ? d.enabled : true;
			if (!id) { return; }
			await config.updateService(id, { displayName: name, enabled });
			await config.updateServiceKind(id, kind);
			await config.updateServiceKey(id, key);
			await afterConfigChange(bar, ctx, '服务设置已保存');
		})
	);

	// 添加服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.addService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as AddServicePayload;
			const defaultKind = getAllDescriptors()[0]?.kind ?? 'glm';
			const kind = isValidServiceId(d.kind) ? d.kind : defaultKind;
			const name = getDescriptor(kind).defaultName;
			await config.addService(kind, name);
			await afterConfigChange(bar, ctx, `已添加 ${name} 服务`);
		})
	);

	// 删除服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.removeService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as RemoveServicePayload;
			const id = typeof d.id === 'string' ? d.id : '';
			if (!id) { return; }
			const confirmed = await vscode.window.showWarningMessage(
				'确定要删除此服务吗？',
				{ modal: true },
				'确认删除',
			);
			if (confirmed !== '确认删除') { return; }
			await config.removeService(id);
			serviceData.delete(id);
			await afterConfigChange(bar, ctx, '服务已删除');
		})
	);
}

function registerSettingsCommands(ctx: vscode.ExtensionContext, bar: StatusBar, loop: () => Promise<void>) {
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.saveGlobal', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as SaveGlobalPayload;
			const refreshInterval = typeof d.refreshInterval === 'number' ? d.refreshInterval : 600;
			const warnThreshold = typeof d.warnThreshold === 'number' ? d.warnThreshold : 0.8;
			const afkThreshold = typeof d.afkThreshold === 'number' ? d.afkThreshold : 3600;
			await config.setPollInterval(refreshInterval);
			await config.setWarnThreshold(warnThreshold);
			await config.setAfkThreshold(afkThreshold);
			restartTimer(loop);
			await afterConfigChange(bar, ctx, '全局设置已保存');
		})
	);
}

function registerNavigationCommands(ctx: vscode.ExtensionContext) {
	// 打开配额面板
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.openDashboard', () => {
			vscode.commands.executeCommand('aiUsageMonitor.dashboardView.focus');
		})
	);

	// 打开服务设置（仪表盘 + 切换到设置标签）
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiUsageMonitor.openSettings', () => {
			vscode.commands.executeCommand('aiUsageMonitor.dashboardView.focus');
			if (dashboardViewProvider) {
				dashboardViewProvider.switchToSettings();
			}
		})
	);
}

// ====== AFK 检测 ======
function setupActivityListeners(ctx: vscode.ExtensionContext) {
	const activityEvents = [
		vscode.window.onDidChangeActiveTextEditor(() => afkDetector.updateActivity()),
		vscode.workspace.onDidChangeTextDocument(() => afkDetector.updateActivity()),
		vscode.window.onDidChangeWindowState(() => afkDetector.updateActivity()),
		vscode.window.onDidChangeTerminalState(() => afkDetector.updateActivity()),
		vscode.window.onDidChangeTextEditorSelection(() => afkDetector.updateActivity()),
		vscode.window.onDidChangeVisibleTextEditors(() => afkDetector.updateActivity()),
	];
	for (const d of activityEvents) {
		ctx.subscriptions.push(d);
	}
}

// ====== 轮询启动 ======
async function startPolling(loop: () => Promise<void>) {
	await loop();
	restartTimer(loop);
}

export async function activate(ctx: vscode.ExtensionContext) {
	console.log('AI Usage Monitor: activate');

	config.setContext(ctx);
	await config.initDefaults();

	const bar = new StatusBar();
	ctx.subscriptions.push(bar);

	// 注册内置命令
	for (const cmd of registerAll(ctx)) {
		ctx.subscriptions.push(cmd);
	}

	// 定义轮询函数（供命令和轮询共用）
	const loop = async () => {
		try {
			await pullAll(bar, ctx);
		} catch (err) {
			console.error('[AI Usage Monitor] 轮询异常:', err);
		}
	};

	// 设置各子系统
	setupWebview(ctx);
	registerDataCommands(ctx, bar);
	registerServiceCommands(ctx, bar);
	registerSettingsCommands(ctx, bar, loop);
	registerNavigationCommands(ctx);
	setupActivityListeners(ctx);

	// 启动轮询
	await startPolling(loop);
}

export function deactivate() {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
	cache.dispose();
}
