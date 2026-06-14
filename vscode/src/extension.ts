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
import { CookieBridgeServer } from './bridge/server';
import type { CookiePayload } from './bridge/server';
import { setBridgeExtensionContext, updateBridgeState } from './services/bridge/state';

let timer: NodeJS.Timeout | undefined;

const cache = new CacheManager();
const serviceData = new Map<string, ServiceData>();
let dashboardViewProvider!: DashboardWebviewViewProvider;
const afkDetector = new AfkDetector();
let bridge: CookieBridgeServer | undefined;
let isLoopRunning = false;

// ===== 配额预警 =====

/** 预警通知冷却时间（30 分钟），避免每次轮询都弹通知 */
const WARNING_COOLDOWN_MS = 30 * 60 * 1000;
let lastWarningTime = 0;

/** 检查所有服务的配额使用率，超过 warnThreshold 时弹出 VSCode 警告通知 */
function checkQuotaWarnings(): void {
	const threshold = config.warnThreshold();
	if (threshold <= 0 || threshold >= 1) { return; } // 阈值无效则跳过

	const now = Date.now();
	if (now - lastWarningTime < WARNING_COOLDOWN_MS) { return; } // 冷却期内跳过

	const warnings: string[] = [];
	for (const [, data] of serviceData) {
		if (data.err || data.slots.length === 0) { continue; }
		// 前置条件：slots.length > 0，Math.max 参数非空
		const maxPercent = Math.max(...data.slots.map(s => s.percent));
		if (maxPercent >= threshold * 100) {
			warnings.push(`${data.name}: ${maxPercent.toFixed(0)}% 已使用`);
		}
	}

	if (warnings.length > 0) {
		lastWarningTime = now;
		vscode.window.showWarningMessage(
			`配额预警 (≥${(threshold * 100).toFixed(0)}%): ${warnings.join('、')}`,
		);
	}
}

/** 串行任务队列，防止 pullService / pullAll / afterConfigChange 并发 */
class AsyncQueue {
	private current: Promise<void> = Promise.resolve();

	enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const result = this.current.then(() => fn());
		this.current = result.then(() => {}, () => {});
		return result;
	}
}

const refreshQueue = new AsyncQueue();
const bridgeQueue = new AsyncQueue();

// OutputChannel 用于替代 console.log/error
const outputChannel = vscode.window.createOutputChannel('AI Quota Dashboard');

function log(message: string): void {
	outputChannel.appendLine(`[INFO] ${message}`);
}

function logError(message: string, err?: unknown): void {
	const detail = err instanceof Error ? err.message : String(err);
	outputChannel.appendLine(`[ERROR] ${message}: ${detail}`);
}

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
	// Cookie Bridge 服务的 fetch 仅读本地状态（不调用远程 API），不需要凭证，
	// 允许 key 为空时继续，确保刚添加的 Bridge 服务能立即显示状态卡片。
	if (!key && profile.kind !== 'bridge') { return false; }

	try {
		const provider = resolveProvider(profile.kind);
		// 非 Bridge 服务此处 key 必非空（上方已校验）；Bridge 服务 fetch 不读取该参数
		const data = await provider.fetch(key as string, profile.endpoint);
		data.id = profile.id;
		data.name = profile.displayName;

		const withHistory = attachHistory(data, historyMap);
		bar.feed(withHistory);
		serviceData.set(profile.id, withHistory);
		cache.set(profile.id, withHistory, 60);
		return true;

	} catch (err) {
		logError(`[${profile.id}] 数据获取失败`, err);
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
		cache.set(profile.id, errorData, 300); // 错误状态 5 分钟 TTL，避免频繁重试
		return true; // 错误状态也算有结果
	}
}

// 拉取单个服务数据（外部命令调用）
async function pullService(profileId: string, bar: StatusBar, ctx: vscode.ExtensionContext) {
	return refreshQueue.enqueue(async () => {
		const profiles = config.loadProfiles();
		const profile = profiles.find(p => p.id === profileId);
		if (!profile) { return; }

		const historyMap = loadHistory(ctx);
		await fetchSingleService(profile, historyMap, bar);
		bar.flush();
		await updateView();
		await saveHistory(ctx, serviceData);
	});
}

// 拉取所有服务数据（实际逻辑，不经过队列）
async function doPullAll(bar: StatusBar, ctx: vscode.ExtensionContext): Promise<void> {
	let hasResult = false;

	// 加载历史数据（只需加载一次）
	const historyMap = loadHistory(ctx);

	for (const profile of config.loadProfiles()) {
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
			await updateView();
			await saveHistory(ctx, serviceData, config.loadProfiles());
			// 配额预警检查
			checkQuotaWarnings();
		} else {
		bar.setEmpty();
		await updateView();
	}
}

// 拉取所有服务数据（带队列保护，供外部调用）
async function pullAll(bar: StatusBar, ctx: vscode.ExtensionContext) {
	// AFK 检测
	if (afkDetector.checkAfk(config.afkThreshold())) {
		log('用户离开中，跳过刷新');
		return;
	}

	return refreshQueue.enqueue(() => doPullAll(bar, ctx));
}

// 保存后触发刷新
async function afterConfigChange(bar: StatusBar, ctx: vscode.ExtensionContext, msg?: string) {
	return refreshQueue.enqueue(async () => {
		// 清空所有缓存（因为配置变了，需要重新拉取）
		bar.clear();
		cache.clear();
		serviceData.clear();
		// 更新视图（显示新配置）
		await updateView();
		// 刷新数据（直接调用内部逻辑，避免嵌套队列死锁）
		await doPullAll(bar, ctx);
		// 服务列表变化后，按需启动/停止 Bridge 服务器
		// （用户添加 Cookie Bridge 服务后启动，移除后停止）
		await syncBridgeLifecycle(bar, ctx);
		if (msg) {
			vscode.window.showInformationMessage(msg);
		}
	});
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
		vscode.commands.registerCommand('aiQuotaDashboard.refresh', async () => {
			if (afkDetector.checkAfk(config.afkThreshold())) {
				vscode.window.showInformationMessage('用户离开中，跳过刷新');
				return;
			}
			bar.setLoading();
			cache.clear();
			serviceData.clear();
			await pullAll(bar, ctx);
		})
	);

	// 刷新单个服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.refreshService', async (data: unknown) => {
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
		vscode.commands.registerCommand('aiQuotaDashboard.requestDetailRange', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as { serviceId?: string; range?: string };
			const serviceId = typeof d.serviceId === 'string' ? d.serviceId : '';
			const range = typeof d.range === 'string' ? d.range : 'day';
			if (!serviceId) { return; }

			const profiles = config.loadProfiles();
			const profile = profiles.find(p => p.id === serviceId);
			if (!profile) { return; }

			const key = await config.getKey(serviceId);
			if (!key) { return; }

			let descriptor;
			try {
				descriptor = getDescriptor(profile.kind);
			} catch (e) {
				logError(`获取服务信息失败: ${profile.kind}`, e);
				vscode.window.showErrorMessage(`获取 ${profile.displayName} 服务信息失败`);
				return;
			}
			if (!descriptor.detailProvider || !descriptor.mergeDetailData) { return; }

			try {
				const detail = await descriptor.detailProvider.fetchDetail(range, key, profile.endpoint);
				if (!detail) {
					vscode.window.showWarningMessage(`未能获取 ${profile.displayName} 的详情数据，请稍后重试`);
					return;
				}

				const existing = serviceData.get(serviceId);
				if (existing) {
					descriptor.mergeDetailData(existing, detail, range);
					serviceData.set(serviceId, existing);
					cache.set(serviceId, existing, 60);
					await updateView();
				}
			} catch (e) {
				logError('详情数据获取失败', e);
				vscode.window.showErrorMessage(`${profile.displayName} 详情数据获取失败: ${e instanceof Error ? e.message : String(e)}`);
			}
		})
	);

	// 重置所有数据
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.resetData', async () => {
			const confirmed = await vscode.window.showWarningMessage(
				'确定要清除所有数据吗？此操作将删除所有服务配置、API 密钥和历史记录，且不可恢复。',
				{ modal: true },
				'确认清除',
			);
			if (confirmed === '确认清除') {
				await clearAllData(ctx);
				await config.initDefaults();
				bar.clear();
				cache.clear();
				serviceData.clear();
				await updateView();
				vscode.window.showInformationMessage('所有数据已重置');
			}
		})
	);
}

function registerServiceCommands(ctx: vscode.ExtensionContext, bar: StatusBar) {
	// 保存单个服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.saveService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as SaveServicePayload;
			const id = typeof d.id === 'string' ? d.id : '';
			const name = typeof d.name === 'string' ? d.name : '';
			const defaultKind = getAllDescriptors()[0]?.kind ?? 'glm';
			const kind = isValidServiceId(d.kind) ? d.kind : defaultKind;
			const key = typeof d.key === 'string' ? d.key : '';
			const dataSource = (kind === 'bridge' ? 'bridge' : (d.dataSource === 'bridge' ? 'bridge' : 'manual')) as 'manual' | 'bridge';
			if (!id) { return; }
			await config.updateService(id, { displayName: name });
			// 仅在 kind 真正变化时才清空并重新设置 key，避免非原子操作丢 Key
			const oldProfile = config.loadProfiles().find(p => p.id === id);
			if (oldProfile) {
				if (oldProfile.kind !== kind) {
					await config.updateServiceKind(id, kind);
				}
				// 数据来源切换时清理旧 key
				if (oldProfile.dataSource !== dataSource) {
					await config.updateServiceKey(id, '');
				}
			}
			// 更新数据来源模式
			await config.updateServiceDataSource(id, dataSource);
			// Bridge 服务不保存 key；AI 服务保存手动输入的 key
			if (dataSource === 'manual') {
				await config.updateServiceKey(id, key);
			}
			await afterConfigChange(bar, ctx, '服务配置已保存');
		})
	);

	// 添加服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.addService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as AddServicePayload;
			const descriptors = getAllDescriptors();
			if (descriptors.length === 0) {
				vscode.window.showErrorMessage('暂无可用的服务类型');
				return;
			}
			const defaultKind = descriptors[0]?.kind ?? 'glm';
			const kind = isValidServiceId(d.kind) ? d.kind : defaultKind;
			const name = getDescriptor(kind).defaultName;
			await config.addService(kind, name);
			await afterConfigChange(bar, ctx, `已添加 ${name} 服务`);
		})
	);

	// 删除服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.removeService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as RemoveServicePayload;
			const id = typeof d.id === 'string' ? d.id : '';
			if (!id) { return; }
			const confirmed = await vscode.window.showWarningMessage(
				'确定要移除此服务吗？',
				{ modal: true },
				'确认删除',
			);
			if (confirmed !== '确认删除') { return; }
			await config.removeService(id);
			serviceData.delete(id);
			await afterConfigChange(bar, ctx, '服务已移除');
		})
	);
}

function registerSettingsCommands(ctx: vscode.ExtensionContext, bar: StatusBar, loop: () => Promise<void>) {
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.saveGlobal', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as SaveGlobalPayload;
			const refreshInterval = typeof d.refreshInterval === 'number' ? d.refreshInterval : 600;
			const warnThreshold = typeof d.warnThreshold === 'number' ? d.warnThreshold : 0.8;
			const afkThreshold = typeof d.afkThreshold === 'number' ? d.afkThreshold : 3600;
			await config.setPollInterval(refreshInterval);
			await config.setWarnThreshold(warnThreshold);
			await config.setAfkThreshold(afkThreshold);
			restartTimer(loop);
			await afterConfigChange(bar, ctx, '全局配置已保存');
		})
	);
}

function registerNavigationCommands(ctx: vscode.ExtensionContext) {
	// 打开配额面板
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.openDashboard', async () => {
			await vscode.commands.executeCommand('aiQuotaDashboard.dashboardView.focus');
		})
	);

	// 打开服务设置（仪表盘 + 切换到设置标签）
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.openSettings', async () => {
			await vscode.commands.executeCommand('aiQuotaDashboard.dashboardView.focus');
			dashboardViewProvider?.switchToSettings();
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

/**
 * 根据浏览器扩展推送的活跃 kind 列表同步移除 VSCode 中多余的 AI 服务。
 * 仅移除 dataSource='bridge' 的服务，避免误删用户手动添加的服务。
 * Bridge 服务自身不受影响。
 */
async function syncRemoveBridgeServices(profiles: ServiceProfile[], activeKinds: string[]): Promise<ServiceProfile[]> {
	const activeSet = new Set(activeKinds);
	const toRemove = profiles.filter(p =>
		BRIDGE_AI_KINDS.has(p.kind) &&
		p.dataSource === 'bridge' &&
		!activeSet.has(p.kind)
	);

	if (toRemove.length === 0) {
		return profiles;
	}

	const removeIds = new Set(toRemove.map(p => p.id));
	for (const p of toRemove) {
		await config.removeService(p.id);
		log(`[Bridge] 浏览器已移除 ${p.kind}，同步删除 VSCode 服务: ${p.displayName} (${p.id})`);
	}

	return config.loadProfiles().filter(p => !removeIds.has(p.id));
}

// ====== Cookie Bridge ======

/** Bridge 自动创建的 AI 服务 kind 集合 */
const BRIDGE_AI_KINDS = new Set(['glm', 'kimi', 'mimo']);

/**
 * 对 AI 服务 profiles 按 kind 去重。
 * 如果同一 kind 存在多个服务，保留 dataSource='bridge' 的优先；否则保留第一个。
 * 返回去重后的 profiles，并删除被移除服务的 Secret Storage 凭证。
 */
async function deduplicateAiProfiles(profiles: ServiceProfile[]): Promise<ServiceProfile[]> {
	const keepers = new Map<string, ServiceProfile>();
	const toRemove: ServiceProfile[] = [];

	for (const p of profiles) {
		if (!BRIDGE_AI_KINDS.has(p.kind)) { continue; }
		const existing = keepers.get(p.kind);
		if (existing) {
			// 保留 bridge 数据源；如果都不是 bridge，保留已存在的（先来者）
			if (p.dataSource === 'bridge' && existing.dataSource !== 'bridge') {
				toRemove.push(existing);
				keepers.set(p.kind, p);
			} else {
				toRemove.push(p);
			}
		} else {
			keepers.set(p.kind, p);
		}
	}

	if (toRemove.length === 0) {
		return profiles;
	}

	const removeIds = new Set(toRemove.map(p => p.id));
	for (const p of toRemove) {
		await config.removeService(p.id);
		log(`[Bridge] 移除重复的 ${p.kind} 服务: ${p.displayName} (${p.id})`);
	}

	return config.loadProfiles().filter(p => !removeIds.has(p.id));
}

/**
 * 处理浏览器扩展推送的凭证：更新 Bridge 状态、分发到对应 AI 服务、刷新视图。
 * 抽成模块级函数，供 ensureBridgeRunning 注册为 CookieBridgeServer 回调。
 */
function handleCookiePayload(payload: CookiePayload, bar: StatusBar, ctx: vscode.ExtensionContext) {
	bridgeQueue.enqueue(async () => {
		log(`[Bridge] 收到凭证推送 (cookies=${payload.cookies?.length ?? 0}, kimi=${!!payload.kimiAuthToken}, mimo=${!!payload.mimoCookie}, glm=${!!payload.glmApiKey})`);

		// 收集已接收的凭证种类
		const receivedCredentials: string[] = [];
		if (payload.kimiAuthToken) { receivedCredentials.push('kimi'); }
		if (payload.mimoCookie) { receivedCredentials.push('mimo'); }
		if (payload.glmApiKey) { receivedCredentials.push('glm'); }

		// 更新 Bridge 服务状态
		await updateBridgeState({
			lastPushAt: payload.timestamp,
			receivedCredentials,
			connected: true,
			lastError: undefined,
		});

		// 分发凭证到对应的 AI 服务（自动写入 Secret Storage 并标记 dataSource='bridge'）
		// 如果对应的 AI 服务不存在，自动创建
		let profiles = config.loadProfiles();
		// 先去重：同一 kind 的 AI 服务只保留一个，避免 Bridge 多次推送后产生重复服务
		profiles = await deduplicateAiProfiles(profiles);
		// 同步移除：浏览器扩展已删除的服务，在 VSCode 端也删除
		profiles = await syncRemoveBridgeServices(profiles, payload.activeKinds ?? []);

		const credentialMap: Array<{ kind: string; value: string | undefined }> = [
			{ kind: 'kimi', value: payload.kimiAuthToken },
			{ kind: 'mimo', value: payload.mimoCookie },
			{ kind: 'glm', value: payload.glmApiKey },
		];
		let distributed = false;
		for (const { kind, value } of credentialMap) {
			if (!value) { continue; }
			// 每次循环重新加载，确保看到最新状态
			profiles = config.loadProfiles();
			const existing = profiles.find(x => x.kind === kind);
			if (existing) {
				// 已有对应服务，更新凭证
				await config.updateServiceKey(existing.id, value);
				await config.updateServiceDataSource(existing.id, 'bridge');
				log(`[Bridge] 凭证已分发到 ${existing.displayName} (${kind})`);
			} else {
				// 自动创建对应 AI 服务；创建前双重检查，防止并发/队列间隙产生重复
				try {
					const doubleCheck = config.loadProfiles().find(x => x.kind === kind);
					if (doubleCheck) {
						await config.updateServiceKey(doubleCheck.id, value);
						await config.updateServiceDataSource(doubleCheck.id, 'bridge');
						log(`[Bridge] 凭证已分发到 ${doubleCheck.displayName} (${kind})`);
					} else {
						const descriptor = getDescriptor(kind);
						const displayName = descriptor?.displayName ?? kind;
						const newId = await config.addService(kind, displayName);
						await config.updateServiceKey(newId, value);
						await config.updateServiceDataSource(newId, 'bridge');
						log(`[Bridge] 自动创建 ${displayName} 服务并分发凭证 (${kind})`);
					}
				} catch (e) {
					logError(`[Bridge] 自动创建 ${kind} 服务失败`, e);
				}
			}
			distributed = true;
		}

		// 更新 Bridge 服务自身视图
		profiles = config.loadProfiles();
		const bridgeProfile = profiles.find(p => p.kind === 'bridge');
		if (bridgeProfile) {
			await config.updateServiceKey(bridgeProfile.id, 'connected');
		}

		// 清除缓存并刷新所有服务（Bridge 推送的新凭证需要生效）
		if (distributed || bridgeProfile) {
			cache.clear();
			// 服务列表可能已变化，清空旧 serviceData 并立即更新视图，避免残留/缺失卡片
			serviceData.clear();
			bar.clear();
			await updateView();
			try {
				await pullAll(bar, ctx);
			} catch (err) {
				logError('[Bridge] pullAll 刷新失败，已更新视图', err);
				// 即使拉取失败，也确保视图与当前 profiles 保持一致
				await updateView();
			}
		}
	});
}

/**
 * 若 Cookie Bridge 服务已添加但服务器未运行，则启动服务器。
 * 服务器仅在用户添加了 kind='bridge' 的服务后才会监听，符合"添加后才启用"语义。
 * 已运行则直接返回（幂等）。
 */
async function ensureBridgeRunning(bar: StatusBar, ctx: vscode.ExtensionContext) {
	if (bridge) { return; }

	bridge = new CookieBridgeServer(
		(payload: CookiePayload) => handleCookiePayload(payload, bar, ctx),
		outputChannel,
	);

	try {
		const port = await bridge.start(37100);
		log(`Cookie Bridge 已启动，监听端口: ${port}`);
	} catch (err) {
		logError('Cookie Bridge 启动失败', err);
		await updateBridgeState({ connected: false, lastError: `启动失败: ${err instanceof Error ? err.message : String(err)}` });
	}

	ctx.subscriptions.push(bridge);
}

/**
 * 若当前不存在 kind='bridge' 的服务，则停止 Bridge 服务器（若有）。
 * 用户移除 Cookie Bridge 服务后，服务器随之关闭，不再监听端口、不再接收推送。
 */
async function stopBridgeIfIdle(ctx: vscode.ExtensionContext) {
	const hasBridge = config.loadProfiles().some(p => p.kind === 'bridge');
	if (hasBridge) { return; }
	if (!bridge) { return; }

	await bridge.dispose();
	// 从 subscriptions 中移除已 dispose 的引用，避免 deactivate 时重复关闭
	const idx = ctx.subscriptions.indexOf(bridge);
	if (idx >= 0) { ctx.subscriptions.splice(idx, 1); }
	bridge = undefined;
	await updateBridgeState({ connected: false });
	log('Cookie Bridge 已停止（用户未添加 Cookie Bridge 服务）');
}

/**
 * 根据当前服务列表同步 Bridge 服务器生命周期：有 bridge 服务则启动，无则停止。
 * 在 add/remove/save 命令后通过 afterConfigChange 调用。
 */
async function syncBridgeLifecycle(bar: StatusBar, ctx: vscode.ExtensionContext) {
	if (config.loadProfiles().some(p => p.kind === 'bridge')) {
		await ensureBridgeRunning(bar, ctx);
	} else {
		await stopBridgeIfIdle(ctx);
	}
}

export async function activate(ctx: vscode.ExtensionContext) {
	try {
		log('activate');

		// Bridge 状态模块需要 ExtensionContext，无论是否启用 Bridge 都要注入
		setBridgeExtensionContext(ctx);

	config.setContext(ctx);
	await config.initDefaults();
	await config.migrateBridgeDataSource();

		const bar = new StatusBar();
		ctx.subscriptions.push(bar);

		// 注册内置命令
		for (const cmd of registerAll(ctx)) {
			ctx.subscriptions.push(cmd);
		}

		// 定义轮询函数（供命令和轮询共用）
		const loop = async () => {
			if (isLoopRunning) {
				log('上轮数据刷新尚未完成，跳过本次刷新');
				return;
			}
			isLoopRunning = true;
			try {
				await pullAll(bar, ctx);
			} catch (err) {
				logError('数据刷新异常', err);
			} finally {
				isLoopRunning = false;
			}
		};

		// 设置各子系统
		setupWebview(ctx);
		registerDataCommands(ctx, bar);
		registerServiceCommands(ctx, bar);
		registerSettingsCommands(ctx, bar, loop);
		registerNavigationCommands(ctx);
		setupActivityListeners(ctx);

		// Cookie Bridge：仅在用户已添加 Cookie Bridge 服务时启动
		// 用户通过设置页添加/移除该服务后，afterConfigChange 会同步生命周期
		await syncBridgeLifecycle(bar, ctx);

		// 同步初始活动时间，避免启动时误判 AFK
		afkDetector.updateActivity();

		// 启动轮询
		await startPolling(loop);
	} catch (err) {
		logError('扩展激活失败', err);
		vscode.window.showErrorMessage(`AI Quota Dashboard 激活失败: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
}

export async function deactivate(): Promise<void> {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
	cache.dispose();
	await bridge?.dispose();
	outputChannel.dispose();
}
