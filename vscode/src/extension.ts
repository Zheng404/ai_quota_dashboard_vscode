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
import { DataBridgeServer } from './bridge/server';
import type { DataPayload } from './bridge/server';
import { BRIDGE_AI_KINDS, resolveBridgeTargets, selectBridgeServicesToRemove, collectBridgeSecretTargets, shouldAcceptBridgeData, summarizeRejectedPushes } from './bridge/targets';
import { BRIDGE_PORT_START } from '../../browser-common/protocol/index.js';
import { setBridgeExtensionContext, updateBridgeState } from './services/bridge/state';
import type { GlmServiceData } from './services/glm/types';

let timer: NodeJS.Timeout | undefined;

const cache = new CacheManager();
const serviceData = new Map<string, ServiceData>();
let dashboardViewProvider!: DashboardWebviewViewProvider;
const afkDetector = new AfkDetector();
let bridge: DataBridgeServer | undefined;
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
		// 过滤非有限值的 percent，避免 NaN 污染 Math.max 导致预警失效
		const validPercents = data.slots.map(s => s.percent).filter(p => Number.isFinite(p));
		if (validPercents.length === 0) { continue; }
		const maxPercent = Math.max(...validPercents);
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

/**
 * Data Bridge 推送的配额数据存储（kind → 最近推送的 serviceData）。
 * 非 TTL 缓存：数据活到下次推送；bridge 数据源的服务不再发起网络请求，
 * 仪表盘/状态栏数据均来自这里。
 */
const bridgeDataStore = new Map<string, ServiceData>();

/**
 * 校验并规整 Data Bridge 推送的单服务数据。
 * 要求 serviceData 为含 slots 数组的对象；id/name/updatedAt 由本端重写，不透传。
 * 返回 null 表示该条目非法，调用方应跳过。
 */
function normalizeBridgeServiceData(item: { kind: string; serviceData: unknown }): ServiceData | null {
	const sd = item.serviceData;
	if (!sd || typeof sd !== 'object' || Array.isArray(sd)) { return null; }
	const candidate = sd as Partial<ServiceData>;
	if (!Array.isArray(candidate.slots)) { return null; }
	return {
		...candidate,
		id: '',
		name: '',
		kind: item.kind,
		slots: candidate.slots,
		updatedAt: 0, // 由调用方以推送时间覆写
	} as ServiceData;
}

// 正在刷新中的服务 ID 集合，随 updateData 推送给前端用于显示加载指示
const refreshingIds = new Set<string>();

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
	dashboardViewProvider.update(serviceData, await getCurrentSettings(), Array.from(refreshingIds));
}

/**
 * 合并详情范围数据：把旧数据中已懒加载的 week/month（等非 day 范围）合并到新数据，
 * 避免全局刷新（只重新拉取 day）覆盖掉用户已懒加载的其它范围详情。
 * 仅对 GLM 服务（含 modelUsageByRange / toolUsageByRange）生效。
 */
function mergeDetailRanges(target: ServiceData, source: ServiceData): void {
	const t = target as GlmServiceData;
	const s = source as GlmServiceData;
	if (t.modelUsageByRange && s.modelUsageByRange) {
		t.modelUsageByRange = { ...s.modelUsageByRange, ...t.modelUsageByRange };
	}
	if (t.toolUsageByRange && s.toolUsageByRange) {
		t.toolUsageByRange = { ...s.toolUsageByRange, ...t.toolUsageByRange };
	}
}

// 拉取单个服务（核心逻辑，被 pullService 和 pullAll 复用）
async function fetchSingleService(
	profile: ServiceProfile,
	historyMap: Map<string, UsagePoint[]>,
	bar: StatusBar,
): Promise<boolean> {
	const key = await config.getKey(profile.id);
	// Data Bridge 数据源（dataSource='bridge'）的 AI 服务：数据由浏览器扩展推送，
	// 有推送数据直接返回（不走网络请求、不要求 key）；无数据返回骨架让前端显示加载卡。
	if (profile.dataSource === 'bridge' && BRIDGE_AI_KINDS.has(profile.kind)) {
		const pushed = bridgeDataStore.get(profile.id);
		const data: ServiceData = pushed
			? { ...pushed, id: profile.id, name: profile.displayName }
			: {
				id: profile.id,
				name: profile.displayName,
				kind: profile.kind,
				slots: [],
				updatedAt: Date.now(),
			};
		bar.feed(data);
		serviceData.set(profile.id, data);
		cache.set(profile.id, data, 60);
		return true;
	}
	// Data Bridge 服务（kind='bridge'）的 fetch 仅读本地状态（不调用远程 API），不需要凭证，
	// 允许 key 为空时继续，确保刚添加的 Bridge 服务能立即显示状态卡片。
	if (!key && profile.kind !== 'bridge') { return false; }

	try {
		const provider = resolveProvider(profile.kind);
		// 非 Bridge 服务此处 key 必非空（上方已校验）；Bridge 服务 fetch 不读取该参数
		const data = await provider.fetch(key as string, profile.endpoint);
		data.id = profile.id;
		data.name = profile.displayName;

		// GLM 详情懒加载保护：全局刷新只会重新拉取 day 范围数据，
		// 若直接覆盖 modelUsageByRange/toolUsageByRange，会丢失用户已懒加载的 week/month 详情。
		// 此处把旧数据中已缓存的其它范围合并回新数据（day 由新数据覆盖）。
		const oldData = serviceData.get(profile.id);
		if (oldData) {
			mergeDetailRanges(data, oldData);
		}

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

		// 标记该服务正在刷新，让前端刷新按钮转起来（旧数据保留）
		refreshingIds.add(profileId);
		await updateView();

		const historyMap = loadHistory(ctx);
		await fetchSingleService(profile, historyMap, bar);
		bar.flush();

		// 刷新完成，清除标记
		refreshingIds.delete(profileId);
		await updateView();
		await saveHistory(ctx, serviceData);
	});
}

// 拉取所有服务数据（实际逻辑，不经过队列）
async function doPullAll(bar: StatusBar, ctx: vscode.ExtensionContext): Promise<void> {
	let hasResult = false;

	// 加载历史数据（只需加载一次）
	const historyMap = loadHistory(ctx);

	const profiles = config.loadProfiles();
	// 对需要重新拉取（未命中缓存）的服务提前标记刷新态，让前端按钮转起来
	for (const profile of profiles) {
		if (!cache.get(profile.id)) {
			refreshingIds.add(profile.id);
		}
	}
	// 先推一次视图（旧数据 + 刷新标记），避免拉取期间界面无变化
	await updateView();

	for (const profile of profiles) {
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
		// 单个服务拉取完成，清除其刷新标记
		refreshingIds.delete(profile.id);
	}

	// 统一渲染
		if (hasResult) {
			bar.flush();
			await updateView();
			// 过滤掉错误态的服务数据，避免错误结果污染 30 天历史曲线
			const validData = new Map<string, ServiceData>();
			for (const [id, data] of serviceData) {
				if (!data.err) { validData.set(id, data); }
			}
			await saveHistory(ctx, validData, config.loadProfiles());
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
		// 注意：不清空 serviceData —— 保留旧数据让前端卡片不闪烁。
		// 标记所有当前服务为刷新中，前端会在按钮处显示转圈（旧数据保留）。
		refreshingIds.clear();
		for (const p of config.loadProfiles()) {
			refreshingIds.add(p.id);
		}
		// 推一次视图（旧数据 + 刷新标记）
		await updateView();
		// 刷新数据（直接调用内部逻辑，避免嵌套队列死锁）
		await doPullAll(bar, ctx);
		// 服务列表变化后，按需启动/停止 Bridge 服务器
		// （用户添加 Data Bridge 服务后启动，移除后停止）
		await syncBridgeLifecycle(bar, ctx);
		if (msg) {
			vscode.window.showInformationMessage(msg);
		}
	});
}

// ====== Webview 设置 ======
function setupWebview(ctx: vscode.ExtensionContext) {
	dashboardViewProvider = new DashboardWebviewViewProvider(ctx.extensionUri);
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
			// range 白名单校验，避免任意字符串污染 modelUsageByRange 状态对象
			const VALID_DETAIL_RANGES = ['day', 'week', 'month'] as const;
			const range = VALID_DETAIL_RANGES.includes(d.range as typeof VALID_DETAIL_RANGES[number])
				? (d.range as typeof VALID_DETAIL_RANGES[number])
				: 'day';
			if (!serviceId) { return; }

			const profiles = config.loadProfiles();
			const profile = profiles.find(p => p.id === serviceId);
			if (!profile) { return; }

			// Data Bridge 数据源的服务：数据由浏览器扩展推送（仅含当日详情），不支持范围懒加载
			if (profile.dataSource === 'bridge') {
				vscode.window.showInformationMessage('该服务数据由 Data Bridge 推送，仅提供当日详情');
				return;
			}

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
			// 数据来源推导：Bridge 服务恒为 'bridge'；AI 服务有 key（用户在设置页手动输入）即 'manual'，
			// 无 key 保持原 dataSource（bridge-fed 服务维持 Bridge 推送语义）
			const dataSource = (kind === 'bridge'
				? 'bridge'
				: (key ? 'manual' : (d.dataSource === 'bridge' ? 'bridge' : 'manual'))) as 'manual' | 'bridge';
			if (!id) { return; }
			// 原子化保存：先在内存计算最终态（profile 字段 + secret 内容 + dataSource 标记），
			// 再按「先写 Secret、后写 globalState」两次写入落盘，替代原先最多 5 次独立写入。
			// 旧语义（kind 变化清旧 key、manual/bridge 数据来源切换清 key）已收敛进最终态计算，
			// 取舍论证见 ConfigManager.saveServiceAtomic 注释。
			await config.saveServiceAtomic(id, { displayName: name, kind, dataSource, key });
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

			const profiles = config.loadProfiles();
			const target = profiles.find(p => p.id === id);
			await removeServiceAndCleanup(id, ctx);

			// 级联删除：移除 Data Bridge 服务时，其派生的 bridge-fed AI 服务一并清理。
			// 级联安全：这些服务纯派生（无用户凭证、数据来自浏览器推送），下次推送自动重建。
			// 须在 Bridge 服务器停止（afterConfigChange → syncBridgeLifecycle）之前执行。
			if (target?.kind === 'bridge') {
				const fedIds = selectBridgeServicesToRemove(profiles, []).map(p => p.id);
				for (const fedId of fedIds) {
					await removeServiceAndCleanup(fedId, ctx);
					log(`[Bridge] 级联移除 bridge-fed 服务: ${fedId}`);
				}
			}

			await afterConfigChange(bar, ctx, '服务已移除');
		})
	);
}

/** 单条服务移除的完整清理：profile + 推送数据 + 缓存 + Secret（removeService 命令与级联共用） */
async function removeServiceAndCleanup(id: string, ctx: vscode.ExtensionContext): Promise<void> {
	await config.removeService(id);
	serviceData.delete(id);
	bridgeDataStore.delete(id);
	// 防御孤儿凭证：removeService 内部已清 Secret，此处幂等补刀
	await ctx.secrets.delete(`apiKeys.${id}`);
}

function registerSettingsCommands(ctx: vscode.ExtensionContext, bar: StatusBar, loop: () => Promise<void>) {
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.saveGlobal', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as SaveGlobalPayload;
			const refreshInterval = typeof d.refreshInterval === 'number' ? d.refreshInterval : 60;
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
	const toRemove = selectBridgeServicesToRemove(profiles, activeKinds);

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

// ====== Data Bridge ======

/**
 * 对 AI 服务 profiles 按 kind 去重。
 * 仅清理同一 kind 下重复的 bridge 服务（扩展多次推送可能产生重复）。
 * manual 服务（用户手动输入凭证）永远不参与去重，避免静默删除用户数据。
 * 返回去重后的 profiles，并删除被移除服务的 Secret Storage 凭证。
 */
async function deduplicateAiProfiles(profiles: ServiceProfile[]): Promise<ServiceProfile[]> {
	const keepers = new Map<string, ServiceProfile>();
	const toRemove: ServiceProfile[] = [];

	for (const p of profiles) {
		if (!BRIDGE_AI_KINDS.has(p.kind)) { continue; }
		// manual 服务永远不参与去重（保护用户手动输入的凭证不丢失）
		if (p.dataSource !== 'bridge') { continue; }

		const existing = keepers.get(p.kind);
		if (existing) {
			// 同 kind 已有一个 bridge 服务，当前是重复的 bridge，删除
			toRemove.push(p);
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
		log(`[Bridge] 移除重复的 bridge 服务: ${p.displayName} (${p.id})`);
	}

	return config.loadProfiles().filter(p => !removeIds.has(p.id));
}

/**
 * 处理浏览器扩展推送的配额数据：更新 Bridge 状态、分发到对应 AI 服务（写入
 * bridgeDataStore）、刷新视图。空 data 的同步 payload 走「清空 receivedKinds +
 * 按 activeKinds 同步移除」路径，同样合法。
 * 抽成模块级函数，供 ensureBridgeRunning 注册为 DataBridgeServer 回调。
 */
function handleDataPayload(payload: DataPayload, bar: StatusBar, ctx: vscode.ExtensionContext) {
	bridgeQueue.enqueue(async () => {
		// 防御：契约保证 data 为数组，缺失/损坏时按空同步处理
		const items = Array.isArray(payload.data) ? payload.data : [];
		const activeKinds = Array.isArray(payload.activeKinds) ? payload.activeKinds : [];
		log(`[Bridge] 收到数据推送 (kinds=${items.map(d => d?.kind).filter(Boolean).join(', ') || '(none)'})`);

		// 更新 Bridge 服务状态（已接收数据的服务种类；空推送清空列表）
		await updateBridgeState({
			lastPushAt: payload.timestamp,
			receivedKinds: items.map(d => d.kind),
			connected: true,
			lastError: undefined,
		});

		// 同步移除/去重：浏览器扩展已删除的服务在 VSCode 端同步删除；
		// 同一 kind 重复的 bridge 服务去重（manual 服务不参与，保护用户数据）
		let profiles = config.loadProfiles();
		profiles = await deduplicateAiProfiles(profiles);
		profiles = await syncRemoveBridgeServices(profiles, activeKinds);

		// 解析分发目标（R1：只接管 bridge-fed 服务；manual 服务绝不修改、其 Secret 绝不删除）
		const targets = resolveBridgeTargets(config.loadProfiles(), items);
		for (const kind of targets.skipped) {
			log(`[Bridge] 跳过未知 kind 的数据: ${kind}`);
		}

		// 自动创建缺失的 bridge-fed 服务（与既有 manual 服务并存，互不干扰）
		for (const kind of targets.create) {
			try {
				const descriptor = getDescriptor(kind);
				const displayName = payload.displayNames?.[kind] || descriptor?.displayName || kind;
				const newId = await config.addService(kind, displayName);
				await config.updateServiceDataSource(newId, 'bridge');
				// 新服务无凭证可清，防御性删除（幂等）
				await ctx.secrets.delete(`apiKeys.${newId}`);
				const created = config.loadProfiles().find(x => x.id === newId);
				if (created) {
					targets.update.set(kind, created);
					log(`[Bridge] 自动创建 ${displayName} 服务并接收数据 (${kind})`);
				}
			} catch (e) {
				logError(`[Bridge] 自动创建 ${kind} 服务失败`, e);
			}
		}

		// 分发数据（单项 containment：单个 kind 失败不影响其余）
		const rejected: Array<{ kind: string; err: string }> = [];
		for (const [kind, target] of targets.update) {
			try {
				const item = items.find(d => d.kind === kind);
				if (!item) { continue; }
				const svcData = normalizeBridgeServiceData(item);
				if (!svcData) {
					logError(`[Bridge] 非法的 serviceData，跳过 (${kind})`, JSON.stringify(item.serviceData)?.slice(0, 200));
					continue;
				}

				// 防降级（最优先）：本次推送带 err 且 store 中已有无 err 好数据 → 保留旧数据，
				// 不覆盖、不合并、updatedAt 保持旧值让前端感知时效；其他 kind 不受影响
				const previous = bridgeDataStore.get(target.id);
				if (!shouldAcceptBridgeData(previous, svcData)) {
					logError(`[Bridge] ${kind} 推送数据带 err，保留既有好数据`, svcData.err);
					rejected.push({ kind, err: svcData.err ?? '(未知错误)' });
					refreshingIds.delete(target.id);
					continue;
				}

				// 清除该 bridge-fed 服务 Secret Storage 中的遗留 key
				// （Data Bridge 模式下数据由浏览器推送，本端不消费凭证；
				//   targets 只含 bridge-fed profile，manual 服务绝不会成为删除对象）
				await ctx.secrets.delete(`apiKeys.${target.id}`);

				// Bridge 推送的显示名称若变化，同步更新
				let name = target.displayName;
				const bridgeName = payload.displayNames?.[kind];
				if (typeof bridgeName === 'string' && bridgeName.length > 0 && bridgeName !== target.displayName) {
					await config.updateService(target.id, { displayName: bridgeName });
					name = bridgeName;
				}

				// 写入 bridgeDataStore（updatedAt 用推送时间），并合并旧数据中已懒加载的其它范围详情
				const stored: ServiceData = { ...svcData, id: target.id, name, updatedAt: payload.timestamp };
				const oldData = bridgeDataStore.get(target.id) ?? serviceData.get(target.id);
				if (oldData) {
					mergeDetailRanges(stored, oldData);
				}
				bridgeDataStore.set(target.id, stored);
				serviceData.set(target.id, stored);
				cache.set(target.id, stored, 60);
				bar.feed(stored);
				refreshingIds.delete(target.id);
				log(`[Bridge] 数据已分发到 ${name} (${kind})`);
			} catch (e) {
				logError(`[Bridge] 分发 ${kind} 数据失败`, e);
			}
		}

		// Y4：有防降级拒绝项时更新 Bridge 诊断信息（桥未断，connected 保持 true；
		// lastError 供服务标签页诊断区展示，区分「凭证失效推送被拒」与「数据本来就旧」）。
		// 须先于下方 Bridge 服务自身视图刷新，保证诊断信息随本轮视图生效。
		const lastError = summarizeRejectedPushes(rejected);
		if (lastError !== undefined) {
			await updateBridgeState({ lastError });
		}

		// Bridge 服务自身视图：写 'connected' 标记并刷新其状态数据
		profiles = config.loadProfiles();
		const bridgeProfile = profiles.find(p => p.kind === 'bridge');
		if (bridgeProfile) {
			await config.updateServiceKey(bridgeProfile.id, 'connected');
			try {
				const bd = await resolveProvider('bridge').fetch('', bridgeProfile.endpoint);
				bd.id = bridgeProfile.id;
				bd.name = bridgeProfile.displayName;
				serviceData.set(bridgeProfile.id, bd);
				cache.set(bridgeProfile.id, bd, 60);
				bar.feed(bd);
			} catch (e) {
				logError('[Bridge] Bridge 服务状态刷新失败', e);
			}
			refreshingIds.delete(bridgeProfile.id);
		}

		// 热重载：数据已在 bridgeDataStore / serviceData 中就位，仅推视图让前端刷新
		bar.flush();
		await updateView();
	}).catch((err: unknown) => {
		// Y5：承接队列任务异常，消灭 unhandled rejection
		logError('[Bridge] 处理数据推送失败', err);
	});
}

/**
 * 若 Data Bridge 服务已添加但服务器未运行，则启动服务器。
 * 服务器仅在用户添加了 kind='bridge' 的服务后才会监听，符合"添加后才启用"语义。
 * 已运行则直接返回（幂等）。
 */
async function ensureBridgeRunning(bar: StatusBar, ctx: vscode.ExtensionContext) {
	if (bridge) { return; }

	// 先用局部变量持有，启动成功后才赋值给模块级 bridge，
	// 避免 start() 失败后 bridge 指向未监听的实例，导致后续 ensureBridgeRunning 永远命中 `if (bridge) return` 无法自愈
	const candidate = new DataBridgeServer(
		(payload: DataPayload) => handleDataPayload(payload, bar, ctx),
		outputChannel,
	);

	try {
		const port = await candidate.start(BRIDGE_PORT_START);
		bridge = candidate;
		ctx.subscriptions.push(bridge);
		log(`Data Bridge 已启动，监听端口: ${port}`);
	} catch (err) {
		logError('Data Bridge 启动失败', err);
		// 失败时清理候选实例（释放可能已占用的资源），不赋值给 bridge，下次可重试
		await candidate.dispose().catch(() => { /* ignore */ });
		await updateBridgeState({ connected: false, lastError: `启动失败: ${err instanceof Error ? err.message : String(err)}` });
	}
}

/**
 * 若当前不存在 kind='bridge' 的服务，则停止 Bridge 服务器（若有）。
 * 用户移除 Data Bridge 服务后，服务器随之关闭，不再监听端口、不再接收推送。
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
	log('Data Bridge 已停止（用户未添加 Data Bridge 服务）');
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

/** Data Bridge 遗留凭证清理的持久标记（写入后不再重复执行） */
const BRIDGE_SECRETS_CLEARED_KEY = 'aiQuotaDashboard.bridgeSecretsCleared';

/**
 * 一次性迁移：Data Bridge 改造后，bridge 数据源的 AI 服务不再消费 Secret Storage
 * 中的任何凭证（数据改由浏览器扩展推送）。清理目标见 collectBridgeSecretTargets
 * （条件放宽：dataSource 缺失 || 'bridge'，覆盖 dataSource 字段出现之前的旧版
 * bridge-fed 服务；显式 'manual' 的用户手输凭证绝不可清理）。
 * 幂等：标记存在即跳过。
 *
 * 执行顺序注意：必须在 migrateBridgeDataSource 之前运行——后者会把缺失的
 * dataSource 落盘为 'manual'，导致本迁移永远匹配不到旧 profile（R2 回归点）。
 */
async function migrateBridgeCredentials(ctx: vscode.ExtensionContext): Promise<void> {
	if (ctx.globalState.get<boolean>(BRIDGE_SECRETS_CLEARED_KEY, false)) { return; }
	const targets = collectBridgeSecretTargets(config.loadProfiles());
	for (const id of targets) {
		await ctx.secrets.delete(`apiKeys.${id}`);
	}
	await ctx.globalState.update(BRIDGE_SECRETS_CLEARED_KEY, true);
}

export async function activate(ctx: vscode.ExtensionContext) {
	try {
		log('activate');

		// 将 outputChannel 和 afkDetector 纳入 ctx.subscriptions，
		// 由 VSCode 统一管理生命周期（避免模块顶层创建的资源在 deactivate 未被调用时泄漏）
		ctx.subscriptions.push(outputChannel);
		ctx.subscriptions.push(afkDetector);

		// Bridge 状态模块需要 ExtensionContext，无论是否启用 Bridge 都要注入
		setBridgeExtensionContext(ctx);

	config.setContext(ctx);
	await config.initDefaults();
	// 顺序不可对调（R2）：credentials 迁移须先于 dataSource 迁移执行，
	// 否则缺失 dataSource 的旧 profile 会被落盘为 'manual' 而永远清不掉遗留凭证
	await migrateBridgeCredentials(ctx);
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

		// Data Bridge：仅在用户已添加 Data Bridge 服务时启动
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
	// outputChannel 和 afkDetector 已纳入 ctx.subscriptions，由 VSCode 统一释放
}
