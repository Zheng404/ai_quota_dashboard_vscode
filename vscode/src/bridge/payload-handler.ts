// Data Bridge 推送数据的编排处理核心 — 从 extension.ts 提取（行为等价的有界重构）
//
// 动机（P3 回归防护）：handleDataPayload 原本内嵌在 extension.ts 模块顶层副作用中，
// 无法直接测试。此处把「推送 → 状态更新 → 同步移除/去重 → 自动创建 → 分发 → 视图刷新」
// 的编排核心抽成纯函数式签名（依赖全部经 BridgeRuntime 注入），extension.ts 仅保留
// 队列接线与运行时组装。
//
// 本模块不依赖 vscode（types/targets 均为纯模块），可由 vitest 直接覆盖。

import { ServiceData, ServiceProfile, QuotaSlot } from '../core/types';
import type { DataPayload } from '../../../browser-common/protocol/index.js';
import {
	BRIDGE_AI_KINDS,
	resolveBridgeTargets,
	selectBridgeServicesToRemove,
	shouldAcceptBridgeData,
	summarizeRejectedPushes,
} from './targets';

/** Bridge 状态更新载荷（与 services/bridge/state.ts 的 Partial<BridgeState> 对齐，此处不引 vscode） */
export interface BridgeStateUpdates {
	lastPushAt?: number;
	receivedKinds?: string[];
	connected?: boolean;
	lastError?: string | undefined;
}

/**
 * 编排运行时所依赖的全部副作用（extension.ts 组装实现，测试注入 fake）。
 * 所有方法语义与 extension.ts 原内嵌实现一一对应。
 */
export interface BridgeRuntime {
	// ---- 配置读写（ConfigManager 委托） ----
	loadProfiles(): ServiceProfile[];
	addService(kind: string, displayName: string): Promise<string>;
	updateServiceDataSource(id: string, dataSource: 'manual' | 'bridge'): Promise<void>;
	updateService(id: string, updates: { displayName?: string }): Promise<void>;
	updateServiceKey(id: string, key: string): Promise<void>;
	/** 统一删除路径：profile + serviceData/bridgeDataStore 清理 + Secret 清理（单一可信源） */
	removeServiceAndCleanup(id: string): Promise<void>;

	// ---- Bridge 状态 / 服务描述符 ----
	updateBridgeState(updates: BridgeStateUpdates): Promise<void>;
	fetchBridgeStatus(endpoint?: string): Promise<ServiceData>;
	getDescriptorDisplayName(kind: string): string;

	// ---- 模块级可变状态（注入 Map/Set 引用，测试可直接断言内容） ----
	serviceData: Map<string, ServiceData>;
	bridgeDataStore: Map<string, ServiceData>;
	refreshingIds: Set<string>;
	setCache(id: string, data: ServiceData, ttlSec: number): void;

	// ---- 状态栏 / 视图 ----
	feedStatusBar(data: ServiceData): void;
	removeStatusBar(id: string): void;
	flushStatusBar(): void;
	updateView(): Promise<void>;

	// ---- 其它副作用 ----
	deleteSecret(key: string): Promise<void>;
	log(message: string): void;
	logError(message: string, err?: unknown): void;
}

/**
 * 校验并规整 Data Bridge 推送的单服务数据。
 * 要求 serviceData 为含 slots 数组的对象；id/name/updatedAt 由本端重写，不透传。
 * 返回 null 表示该条目非法，调用方应跳过。
 */
export function normalizeBridgeServiceData(item: { kind: string; serviceData: unknown }): ServiceData | null {
	const sd = item.serviceData;
	if (!sd || typeof sd !== 'object' || Array.isArray(sd)) { return null; }
	const candidate = sd as Partial<ServiceData>;
	if (!Array.isArray(candidate.slots)) { return null; }
	// 逐 slot 校验：percent 必须是有限数（字符串/NaN 置 0），label 缺失给默认值，
	// 防止脏数据污染进度条与预警阈值判断
	const slots: QuotaSlot[] = [];
	for (const raw of candidate.slots) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { continue; }
		const s = raw as Partial<QuotaSlot>;
		const percent = typeof s.percent === 'number' && Number.isFinite(s.percent) ? s.percent : 0;
		const label = typeof s.label === 'string' && s.label.length > 0 ? s.label : '配额';
		slots.push({ ...s, label, percent } as QuotaSlot);
	}
	return {
		...candidate,
		id: '',
		name: '',
		kind: item.kind,
		slots,
		updatedAt: 0, // 由调用方以推送时间覆写
	} as ServiceData;
}

/**
 * 合并详情范围数据：把旧数据中已懒加载的 week/month（等非 day 范围）合并到新数据，
 * 避免全局刷新（只重新拉取 day）覆盖掉用户已懒加载的其它范围详情。
 * 仅对 GLM 服务（含 modelUsageByRange / toolUsageByRange）生效。
 */
export function mergeDetailRanges(target: ServiceData, source: ServiceData): void {
	const t = target as { modelUsageByRange?: Record<string, unknown>; toolUsageByRange?: Record<string, unknown> };
	const s = source as { modelUsageByRange?: Record<string, unknown>; toolUsageByRange?: Record<string, unknown> };
	if (t.modelUsageByRange && s.modelUsageByRange) {
		t.modelUsageByRange = { ...s.modelUsageByRange, ...t.modelUsageByRange };
	}
	if (t.toolUsageByRange && s.toolUsageByRange) {
		t.toolUsageByRange = { ...s.toolUsageByRange, ...t.toolUsageByRange };
	}
}

/**
 * 对 AI 服务 profiles 按 kind 去重。
 * 仅清理同一 kind 下重复的 bridge 服务（扩展多次推送可能产生重复）。
 * manual 服务（用户手动输入凭证）永远不参与去重，避免静默删除用户数据。
 * 返回去重后的 profiles；被移除服务走统一删除路径 removeServiceAndCleanup。
 */
async function deduplicateAiProfiles(profiles: ServiceProfile[], rt: BridgeRuntime): Promise<ServiceProfile[]> {
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
		await rt.removeServiceAndCleanup(p.id);
		rt.log(`[Bridge] 移除重复的 bridge 服务: ${p.displayName} (${p.id})`);
	}

	return rt.loadProfiles().filter(p => !removeIds.has(p.id));
}

/**
 * 根据浏览器扩展推送的活跃 kind 列表同步移除 VSCode 中多余的 AI 服务。
 * 仅移除 dataSource='bridge' 的服务，避免误删用户手动添加的服务。
 * Bridge 服务自身不受影响；被移除服务走统一删除路径 removeServiceAndCleanup。
 */
async function syncRemoveBridgeServices(profiles: ServiceProfile[], activeKinds: string[], rt: BridgeRuntime): Promise<ServiceProfile[]> {
	const toRemove = selectBridgeServicesToRemove(profiles, activeKinds);

	if (toRemove.length === 0) {
		return profiles;
	}

	const removeIds = new Set(toRemove.map(p => p.id));
	for (const p of toRemove) {
		await rt.removeServiceAndCleanup(p.id);
		rt.log(`[Bridge] 浏览器已移除 ${p.kind}，同步删除 VSCode 服务: ${p.displayName} (${p.id})`);
	}

	return rt.loadProfiles().filter(p => !removeIds.has(p.id));
}

/**
 * 处理浏览器扩展推送的配额数据：更新 Bridge 状态、分发到对应 AI 服务（写入
 * bridgeDataStore）、刷新视图。空 data 的同步 payload 走「清空 receivedKinds +
 * 按 activeKinds 同步移除」路径，同样合法。
 *
 * 调用方负责串行编排（extension.ts 经 bridgeQueue 串行调用本函数）。
 */
export async function processBridgePayload(payload: DataPayload, rt: BridgeRuntime): Promise<void> {
	// 防御：契约保证 data 为数组，缺失/损坏时按空同步处理
	const items = Array.isArray(payload.data) ? payload.data : [];
	// 防御：剔除 null/非对象元素（与 server.ts receivedCount 的入口过滤口径对齐），
	// 避免单条脏数据让整个 map/find 抛 TypeError、整轮处理失败
	const validItems = items.filter((d): d is NonNullable<typeof d> => !!d && typeof d === 'object');
	const activeKinds = Array.isArray(payload.activeKinds) ? payload.activeKinds : [];
	rt.log(`[Bridge] 收到数据推送 (kinds=${validItems.map(d => d.kind).filter(Boolean).join(', ') || '(none)'})`);

	// 更新 Bridge 服务状态（已接收数据的服务种类；空推送清空列表）
	await rt.updateBridgeState({
		lastPushAt: payload.timestamp,
		receivedKinds: validItems.map(d => d.kind),
		connected: true,
		lastError: undefined,
	});

	// 同步移除/去重：浏览器扩展已删除的服务在 VSCode 端同步删除；
	// 同一 kind 重复的 bridge 服务去重（manual 服务不参与，保护用户数据）
	let profiles = rt.loadProfiles();
	profiles = await deduplicateAiProfiles(profiles, rt);
	profiles = await syncRemoveBridgeServices(profiles, activeKinds, rt);

	// 解析分发目标（R1：只接管 bridge-fed 服务；manual 服务绝不修改、其 Secret 绝不删除）
	const targets = resolveBridgeTargets(rt.loadProfiles(), validItems);
	for (const kind of targets.skipped) {
		rt.log(`[Bridge] 跳过未知 kind 的数据: ${kind}`);
	}

	// 自动创建缺失的 bridge-fed 服务（与既有 manual 服务并存，互不干扰）
	for (const kind of targets.create) {
		try {
			// displayNames 优先（空串/缺失回退描述符默认名）
			const bridgeName = payload.displayNames?.[kind];
			const displayName = typeof bridgeName === 'string' && bridgeName.length > 0
				? bridgeName
				: rt.getDescriptorDisplayName(kind);
			const newId = await rt.addService(kind, displayName);
			await rt.updateServiceDataSource(newId, 'bridge');
			// 新服务无凭证可清，防御性删除（幂等）
			await rt.deleteSecret(`apiKeys.${newId}`);
			const created = rt.loadProfiles().find(x => x.id === newId);
			if (created) {
				targets.update.set(kind, created);
				rt.log(`[Bridge] 自动创建 ${displayName} 服务并接收数据 (${kind})`);
			}
		} catch (e) {
			rt.logError(`[Bridge] 自动创建 ${kind} 服务失败`, e);
		}
	}

	// 分发数据（单项 containment：单个 kind 失败不影响其余）
	const rejected: Array<{ kind: string; err: string }> = [];
	for (const [kind, target] of targets.update) {
		try {
			const item = validItems.find(d => d.kind === kind);
			if (!item) { continue; }
			const svcData = normalizeBridgeServiceData(item);
			if (!svcData) {
				rt.logError(`[Bridge] 非法的 serviceData，跳过 (${kind})`, JSON.stringify(item.serviceData)?.slice(0, 200));
				continue;
			}

			// 防降级（最优先）：本次推送带 err 且 store 中已有无 err 好数据 → 保留旧数据，
			// 不覆盖、不合并、updatedAt 保持旧值让前端感知时效；其他 kind 不受影响
			const previous = rt.bridgeDataStore.get(target.id);
			if (!shouldAcceptBridgeData(previous, svcData)) {
				rt.logError(`[Bridge] ${kind} 推送数据带 err，保留既有好数据`, svcData.err);
				rejected.push({ kind, err: svcData.err ?? '(未知错误)' });
				rt.refreshingIds.delete(target.id);
				continue;
			}

			// 清除该 bridge-fed 服务 Secret Storage 中的遗留 key
			// （Data Bridge 模式下数据由浏览器推送，本端不消费凭证；
			//   targets 只含 bridge-fed profile，manual 服务绝不会成为删除对象）
			await rt.deleteSecret(`apiKeys.${target.id}`);

			// Bridge 推送的显示名称若变化，同步更新
			let name = target.displayName;
			const bridgeName = payload.displayNames?.[kind];
			if (typeof bridgeName === 'string' && bridgeName.length > 0 && bridgeName !== target.displayName) {
				await rt.updateService(target.id, { displayName: bridgeName });
				name = bridgeName;
			}

			// 写入 bridgeDataStore（updatedAt 用推送时间），并合并旧数据中已懒加载的其它范围详情
			const stored: ServiceData = { ...svcData, id: target.id, name, updatedAt: payload.timestamp };
			const oldData = rt.bridgeDataStore.get(target.id) ?? rt.serviceData.get(target.id);
			if (oldData) {
				mergeDetailRanges(stored, oldData);
			}
			rt.bridgeDataStore.set(target.id, stored);
			rt.serviceData.set(target.id, stored);
			rt.setCache(target.id, stored, 60);
			rt.feedStatusBar(stored);
			rt.refreshingIds.delete(target.id);
			rt.log(`[Bridge] 数据已分发到 ${name} (${kind})`);
		} catch (e) {
			rt.logError(`[Bridge] 分发 ${kind} 数据失败`, e);
		}
	}

	// Y4：有防降级拒绝项时更新 Bridge 诊断信息（桥未断，connected 保持 true；
	// lastError 供服务标签页诊断区展示，区分「凭证失效推送被拒」与「数据本来就旧」）。
	// 须先于下方 Bridge 服务自身视图刷新，保证诊断信息随本轮视图生效。
	const lastError = summarizeRejectedPushes(rejected);
	if (lastError !== undefined) {
		await rt.updateBridgeState({ lastError });
	}

	// Bridge 服务自身视图：写 'connected' 标记并刷新其状态数据
	profiles = rt.loadProfiles();
	const bridgeProfile = profiles.find(p => p.kind === 'bridge');
	if (bridgeProfile) {
		await rt.updateServiceKey(bridgeProfile.id, 'connected');
		try {
			const bd = await rt.fetchBridgeStatus(bridgeProfile.endpoint);
			bd.id = bridgeProfile.id;
			bd.name = bridgeProfile.displayName;
			rt.serviceData.set(bridgeProfile.id, bd);
			rt.setCache(bridgeProfile.id, bd, 60);
			rt.feedStatusBar(bd);
		} catch (e) {
			rt.logError('[Bridge] Bridge 服务状态刷新失败', e);
		}
		rt.refreshingIds.delete(bridgeProfile.id);
	}

	// 热重载：数据已在 bridgeDataStore / serviceData 中就位，仅推视图让前端刷新
	rt.flushStatusBar();
	await rt.updateView();
}
