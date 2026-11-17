import * as vscode from 'vscode';
import * as config from './core/config';
import { StatusBar } from './ui/statusbar';
import { registerAll } from './commands';
import { loadHistory, saveHistory, attachHistory, clearAllData } from './storage/persistence';
import { runV2CleanupMigration } from './storage/migrations';
import { API_KEY_MASK, isFreshServiceData, ServiceData, ServiceProfile, UsagePoint, SaveServicePayload, AddServicePayload, RemoveServicePayload, SaveGlobalPayload } from './core/types';
import { DashboardWebviewViewProvider, SettingsData } from './dashboard/webviewView';
import { CacheManager } from './core/cache';
import { AfkDetector } from './core/afk';
import { resolveProvider, isValidServiceId, getDescriptor, getAllDescriptors } from './services/registry';
import { mergeDetailRanges } from './services/glm/detailRanges';
import { GlmDetailState, GlmServiceData, TimeRange } from './services/glm/types';
import { SaveGlobalField, SaveGlobalResult } from './webview/types';

let timer: NodeJS.Timeout | undefined;

const cache = new CacheManager();
const serviceData = new Map<string, ServiceData>();
let dashboardViewProvider!: DashboardWebviewViewProvider;
const afkDetector = new AfkDetector();
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
		if (!isFreshServiceData(data) || data.slots.length === 0) { continue; }
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

// 正在刷新中的服务 ID 集合，随 updateData 推送给前端用于显示加载指示
const refreshingIds = new Set<string>();

// GLM 详情请求按 serviceId:range 去重，完成后无论成败均清理。
const detailRequests = new Map<string, Promise<void>>();

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
		// 设置页只接收掩码，明文 Key 永不进入 Webview 消息。
		keys[p.id] = (await config.getKey(p.id)) ? API_KEY_MASK : '';
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

// 拉取单个服务（核心逻辑，被 pullService 和 pullAll 复用）
async function fetchSingleService(
	profile: ServiceProfile,
	historyMap: Map<string, UsagePoint[]>,
	bar: StatusBar,
): Promise<boolean> {
	const key = (await config.getKey(profile.id))?.trim() ?? '';
	if (!key) {
		const noKeyData: ServiceData = {
			id: profile.id,
			name: profile.displayName,
			kind: profile.kind,
			slots: [],
			updatedAt: Date.now(),
			noKey: true,
		};
		bar.feed(noKeyData);
		serviceData.set(profile.id, noKeyData);
		// noKey 是有效视图结果，但不缓存，确保配置 Key 后能立即拉取。
		return true;
	}

	try {
		const provider = resolveProvider(profile.kind);
		const data = await provider.fetch(key, profile.endpoint, { log });
		data.id = profile.id;
		data.name = profile.displayName;
		delete data.noKey;
		delete data.staleError;

		// GLM 详情懒加载保护：全局刷新只会重新拉取 day 范围数据，
		// 若直接覆盖 modelUsageByRange/toolUsageByRange，会丢失用户已懒加载的 week/month 详情。
		// 此处把旧数据中已缓存的其它范围与加载状态合并回新数据（day 由新数据覆盖）。
		const latestData = serviceData.get(profile.id);
		if (latestData) {
			mergeDetailRanges(data, latestData);
		}

		const withHistory = attachHistory(data, historyMap);
		bar.feed(withHistory);
		serviceData.set(profile.id, withHistory);
		cache.set(profile.id, withHistory, 60);
		return true;

	} catch (err) {
		logError(`[${profile.id}] 数据获取失败`, err);
		const msg = err instanceof Error ? err.message : String(err);
		const latestData = serviceData.get(profile.id);
		if (latestData && latestData.err === undefined && latestData.noKey !== true) {
			// stale-while-error：保留最新正常配额、详情、历史与原 updatedAt，仅附加可见刷新错误。
			const staleData: ServiceData = { ...latestData, staleError: msg };
			bar.feed(staleData);
			serviceData.set(profile.id, staleData);
			cache.set(profile.id, staleData, 300);
			return true;
		}

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
		// 即使 profile 已缺失也先登记，确保 finally 能收敛前端乐观刷新状态。
		refreshingIds.add(profileId);
		try {
			const profiles = config.loadProfiles();
			const profile = profiles.find(p => p.id === profileId);
			if (profile) {
				await updateView();
				const historyMap = loadHistory(ctx);
				await fetchSingleService(profile, historyMap, bar);
			}

			// 网络等待期间可能已删除服务，按最新配置清理旧快照与历史。
			const latestProfiles = config.loadProfiles();
			const activeIds = new Set(latestProfiles.map(p => p.id));
			if (!activeIds.has(profileId)) {
				serviceData.delete(profileId);
				bar.remove(profileId);
			}
			for (const [id] of serviceData) {
				if (!activeIds.has(id)) {
					serviceData.delete(id);
					bar.remove(id);
				}
			}
			bar.flush();

			const validData = new Map<string, ServiceData>();
			for (const [id, data] of serviceData) {
				if (activeIds.has(id) && isFreshServiceData(data)) {
					validData.set(id, data);
				}
			}
			await saveHistory(ctx, validData, latestProfiles);
		} finally {
			refreshingIds.delete(profileId);
			// 尽力推送收敛状态；若已有主异常，视图异常只记录日志，不能覆盖主异常。
			try {
				await updateView();
			} catch (err) {
				logError('刷新后更新视图失败', err);
			}
		}
	});
}

// 拉取所有服务数据（实际逻辑，不经过队列）
async function doPullAll(bar: StatusBar, ctx: vscode.ExtensionContext): Promise<void> {
	let hasResult = false;
	let viewConverged = false;

	// 加载历史数据（只需加载一次）
	const historyMap = loadHistory(ctx);

	const profiles = config.loadProfiles();
	const roundRefreshingIds = new Set<string>();
	// 对需要重新拉取（未命中缓存）的服务提前标记刷新态，让前端按钮转起来
	for (const profile of profiles) {
		if (!cache.get(profile.id)) {
			refreshingIds.add(profile.id);
			roundRefreshingIds.add(profile.id);
		}
	}

	try {
		// 先推一次视图（旧数据 + 刷新标记），避免拉取期间界面无变化
		await updateView();

		for (const profile of profiles) {
			try {
				// 首轮视图等待期间可能已删除服务，不能继续使用旧 profile 拉取或复用缓存。
				if (!config.loadProfiles().some(p => p.id === profile.id)) {
					serviceData.delete(profile.id);
					bar.remove(profile.id);
					continue;
				}

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
				// 网络等待期间可能已删除服务，必须按最新配置丢弃本次旧快照。
				if (!config.loadProfiles().some(p => p.id === profile.id)) {
					serviceData.delete(profile.id);
					bar.remove(profile.id);
					continue;
				}
				if (ok) { hasResult = true; }
			} finally {
				// 单个服务无论成功或异常都清除其刷新标记。
				refreshingIds.delete(profile.id);
			}
		}

		// 按最新 profiles 差集清理内存与状态栏，避免网络等待期间删除的服务复活。
		const latestProfiles = config.loadProfiles();
		const activeIds = new Set(latestProfiles.map(p => p.id));
		for (const id of Array.from(serviceData.keys())) {
			if (!activeIds.has(id)) {
				serviceData.delete(id);
				bar.remove(id);
			}
		}
		for (const id of Array.from(refreshingIds)) {
			if (!activeIds.has(id)) {
				refreshingIds.delete(id);
			}
		}

		// 统一渲染
		if (hasResult) {
			bar.flush();
			await updateView();
		} else {
			bar.setEmpty();
			await updateView();
		}
		viewConverged = true;

		// 视图更新也会等待 Secret 读取；写历史前再次读取 profiles，收紧删除竞争窗口。
		const historyProfiles = config.loadProfiles();
		const historyActiveIds = new Set(historyProfiles.map(p => p.id));
		// 过滤错误态及已删除服务，避免错误结果或旧快照污染 30 天历史曲线。
		const validData = new Map<string, ServiceData>();
		for (const [id, data] of serviceData) {
			if (historyActiveIds.has(id) && isFreshServiceData(data)) {
				validData.set(id, data);
			}
		}
		// 即使本轮没有可用结果，也要用最新 activeIds 清理已删除服务的历史。
		await saveHistory(ctx, validData, historyProfiles);
		if (hasResult) {
			checkQuotaWarnings();
		}
	} finally {
		// 首轮 updateView 或任意服务异常时，本轮已添加的标记也不能泄漏到后续视图。
		for (const id of roundRefreshingIds) {
			refreshingIds.delete(id);
		}
		if (!viewConverged) {
			// 尽力推送收敛状态；视图二次异常只记录日志，不能覆盖原始错误。
			try {
				await updateView();
			} catch (err) {
				logError('全量刷新异常后更新视图失败', err);
			}
		}
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
		refreshingIds.clear();
		const markedIds = new Set<string>();
		let viewConverged = false;
		try {
			// 标记所有当前服务为刷新中，前端会在按钮处显示转圈（旧数据保留）。
			for (const p of config.loadProfiles()) {
				refreshingIds.add(p.id);
				markedIds.add(p.id);
			}
			// 推一次视图（旧数据 + 刷新标记）
			await updateView();
			// 刷新数据（直接调用内部逻辑，避免嵌套队列死锁）
			await doPullAll(bar, ctx);
			viewConverged = true;
			if (msg) {
				vscode.window.showInformationMessage(msg);
			}
		} finally {
			for (const id of markedIds) {
				refreshingIds.delete(id);
			}
			if (!viewConverged) {
				// 配置变更失败也要收敛前端刷新态，且不能用视图异常覆盖原始错误。
				try {
					await updateView();
				} catch (err) {
					logError('配置变更异常后更新视图失败', err);
				}
			}
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
			// 人工触发本身就是活动证据：先刷新 AFK 计时，避免用户在 webview 面板内操作
			// 不产生编辑器事件被误判「离开中」而拒绝刷新（定时轮询路径的 AFK 检查不受影响）
			afkDetector.updateActivity();
			bar.setLoading();
			cache.clear();
			// 保留旧 serviceData，失败时才能以 staleError 展示上一正常快照。
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
			const range: TimeRange = VALID_DETAIL_RANGES.includes(d.range as TimeRange)
				? (d.range as TimeRange)
				: 'day';
			if (!serviceId) { return; }

			const requestKey = `${serviceId}:${range}`;
			const pending = detailRequests.get(requestKey);
			if (pending) {
				await pending;
				return;
			}

			const task = (async () => {
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

				const storeTarget = (target: GlmServiceData): boolean => {
					// 网络等待期间服务可能已删除，任何状态都不得写回内存或缓存复活卡片。
					if (!config.loadProfiles().some(p => p.id === serviceId)) {
						serviceData.delete(serviceId);
						return false;
					}
					serviceData.set(serviceId, target);
					if (target.noKey !== true) {
						const ttl = target.err !== undefined || target.staleError !== undefined ? 300 : 60;
						cache.set(serviceId, target, ttl);
					}
					return true;
				};
				const writeDetailState = (state: GlmDetailState): boolean => {
					const latest = serviceData.get(serviceId);
					const target: GlmServiceData = latest ? { ...latest } : {
						id: serviceId,
						name: profile.displayName,
						kind: profile.kind,
						slots: [],
						updatedAt: Date.now(),
					};
					target.detailStates = { ...target.detailStates, [range]: state };
					return storeTarget(target);
				};

				try {
					if (!writeDetailState({ status: 'loading' })) { return; }
					await updateView();
					const detail = await descriptor.detailProvider.fetchDetail(range, key, profile.endpoint, { log });
					const detailRecord = detail && typeof detail === 'object'
						? detail as { modelUsage?: unknown; toolUsage?: unknown }
						: undefined;
					const hasModel = detailRecord?.modelUsage !== null && typeof detailRecord?.modelUsage === 'object';
					const hasTool = detailRecord?.toolUsage !== null && typeof detailRecord?.toolUsage === 'object';
					if (!detailRecord || (!hasModel && !hasTool)) {
						const message = '详情响应为空或未包含模型/工具用量，请稍后重试';
						logError(`[${serviceId}] ${range} 详情数据无效`, new Error(message));
						if (!writeDetailState({ status: 'error', message })) { return; }
						await updateView();
						vscode.window.showWarningMessage(`未能获取 ${profile.displayName} 的详情数据，请稍后重试`);
						return;
					}

					// 网络等待期间可能已有全局刷新写入新 slots/staleError，必须基于最新快照合并。
					const latest = serviceData.get(serviceId);
					if (!latest) { return; }
					const target: GlmServiceData = { ...latest };
					descriptor.mergeDetailData(target, detail, range);
					target.detailStates = { ...target.detailStates, [range]: { status: 'ok' } };
					if (!storeTarget(target)) { return; }
					await updateView();
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					logError('详情数据获取失败', e);
					if (!writeDetailState({ status: 'error', message })) { return; }
					await updateView();
					vscode.window.showErrorMessage(`${profile.displayName} 详情数据获取失败: ${message}`);
				}
			})();

			detailRequests.set(requestKey, task);
			try {
				await task;
			} finally {
				if (detailRequests.get(requestKey) === task) {
					detailRequests.delete(requestKey);
				}
			}
		})
	);

	// 重置所有数据
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.resetData', async (data?: unknown) => {
			const isConfirmed = typeof data === 'object' && data !== null &&
				(data as { confirmed?: unknown }).confirmed === true;
			if (!isConfirmed) {
				const confirmed = await vscode.window.showWarningMessage(
					'确定要清除所有数据吗？此操作将删除所有服务配置、API 密钥和历史记录，且不可恢复。',
					{ modal: true },
					'确认清除',
				);
				if (confirmed !== '确认清除') { return; }
			}

			await clearAllData(ctx);
			await config.initDefaults();
			bar.clear();
			cache.clear();
			serviceData.clear();
			await updateView();
			vscode.window.showInformationMessage('所有数据已重置');
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
			if (!isValidServiceId(d.kind)) {
				vscode.window.showErrorMessage('不支持的服务类型，已拒绝保存');
				return;
			}
			const kind = d.kind;
			// 缺失/非 string/掩码都表示不动 Secret；只有明确空字符串才清除。
			const key = typeof d.key === 'string' && d.key !== API_KEY_MASK ? d.key : undefined;
			const endpoint = typeof d.endpoint === 'string' ? d.endpoint : undefined;
			if (!id) { return; }
			// 原子化保存：先在内存计算最终态（profile 字段 + secret 内容），
			// 再按「先写 Secret、后写 globalState」两次写入落盘。
			let saved: boolean;
			try {
				saved = await config.saveServiceAtomic(id, { displayName: name, kind, key, endpoint });
			} catch (err) {
				if (err instanceof config.ConfigValidationError) {
					vscode.window.showErrorMessage(err.message);
					return;
				}
				throw err;
			}
			if (!saved) {
				vscode.window.showErrorMessage('服务不存在或已被删除，配置未保存');
				return;
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
			if (!isValidServiceId(d.kind)) {
				vscode.window.showErrorMessage('不支持的服务类型，无法添加服务');
				return;
			}
			const kind = d.kind;
			const name = getDescriptor(kind).defaultName;
			await config.addService(kind, name);
			await afterConfigChange(bar, ctx, `已添加 ${name} 服务`);
		})
	);

	// 删除服务
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.removeService', async (data: unknown) => {
			if (!data || typeof data !== 'object') { return; }
			const d = data as RemoveServicePayload & { confirmed?: unknown };
			const id = typeof d.id === 'string' ? d.id : '';
			if (!id) { return; }
			if (d.confirmed !== true) {
				const confirmed = await vscode.window.showWarningMessage(
					'确定要移除此服务吗？',
					{ modal: true },
					'确认删除',
				);
				if (confirmed !== '确认删除') { return; }
			}

			await removeServiceAndCleanup(id, bar, ctx);
			await afterConfigChange(bar, ctx, '服务已移除');
		})
	);
}

/** 单条服务移除的完整清理。 */
async function removeServiceAndCleanup(id: string, bar: StatusBar, ctx: vscode.ExtensionContext): Promise<void> {
	await config.removeService(id);
	serviceData.delete(id);
	// 状态栏同步摘除，避免 bar.cache 持续渲染已删服务的旧数据
	bar.remove(id);
	// 防御孤儿凭证：removeService 内部已清 Secret，此处幂等补刀
	await ctx.secrets.delete(`apiKeys.${id}`);
}

function registerSettingsCommands(ctx: vscode.ExtensionContext, bar: StatusBar, loop: () => Promise<void>) {
	ctx.subscriptions.push(
		vscode.commands.registerCommand('aiQuotaDashboard.saveGlobal', async (data: unknown): Promise<SaveGlobalResult> => {
			if (!data || typeof data !== 'object') {
				return { ok: false, message: '全局配置格式无效' };
			}
			const d = data as SaveGlobalPayload;
			const fields: { field: SaveGlobalField; value: unknown; max: number; label: string }[] = [
				{ field: 'refreshInterval', value: d.refreshInterval, max: 86400, label: '刷新间隔' },
				{ field: 'warnThreshold', value: d.warnThreshold, max: 1, label: '预警阈值' },
				{ field: 'afkThreshold', value: d.afkThreshold, max: 86400, label: 'AFK 阈值' },
			];
			// 三项全部通过后才允许写 Settings，避免静默填默认值或前两项已写、第三项才发现非法。
			for (const { field, value, max, label } of fields) {
				if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
					return { ok: false, field, message: `${label}必须是 0 ~ ${max} 之间的有限数字` };
				}
			}

			await config.setPollInterval(d.refreshInterval);
			await config.setWarnThreshold(d.warnThreshold);
			await config.setAfkThreshold(d.afkThreshold);
			restartTimer(loop);
			await afterConfigChange(bar, ctx, '全局配置已保存');
			return { ok: true };
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
function startPolling(loop: () => Promise<void>): void {
	// 首轮后台执行并显式兜底，避免网络等待阻塞激活或产生未处理 rejection。
	void loop().catch(err => logError('首轮数据刷新异常', err));
	restartTimer(loop);
}

export async function activate(ctx: vscode.ExtensionContext) {
	try {
		log('activate');

		// 将 outputChannel 和 afkDetector 纳入 ctx.subscriptions，
		// 由 VSCode 统一管理生命周期（避免模块顶层创建的资源在 deactivate 未被调用时泄漏）
		ctx.subscriptions.push(outputChannel);
		ctx.subscriptions.push(afkDetector);

		config.setContext(ctx);
		// 必须在任何 profiles 读取与轮询之前完成，避免旧 Bridge/MiMo 服务进入运行态。
		await runV2CleanupMigration(ctx);
		await config.initDefaults();

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

		// 用户直接在 VSCode Settings UI 修改本扩展配置（如轮询间隔）时，
		// 重启轮询定时器使新值生效（原仅 saveGlobal 命令路径会触发 restartTimer）
		ctx.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('aiQuotaDashboard')) {
					restartTimer(loop);
				}
			})
		);


		// 同步初始活动时间，避免启动时误判 AFK
		afkDetector.updateActivity();

		// 启动轮询：首轮后台拉取，定时器立即就绪。
		startPolling(loop);
	} catch (err) {
		logError('扩展激活失败', err);
		vscode.window.showErrorMessage(`AI Quota Dashboard 激活失败: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
}

export function deactivate(): void {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
	cache.dispose();
	// outputChannel 和 afkDetector 已纳入 ctx.subscriptions，由 VSCode 统一释放
}
