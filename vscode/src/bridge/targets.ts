// Data Bridge 分发目标解析 — 纯函数集合（无 vscode 依赖，供单元测试直接覆盖）
//
// 从 extension.ts 抽出：
// - R1 修复核心：分发查找绝不接管 manual 服务（manual 的 Secret 不可被推送静默删除）
// - Y1 修复配套：空 payload 同步移除语义的选择器
// - R2 修复配套：遗留凭证清理目标的选择器

import { ServiceData, ServiceProfile } from '../core/types';

/** Bridge 可自动创建/管理的 AI 服务 kind 集合 */
export const BRIDGE_AI_KINDS: ReadonlySet<string> = new Set(['glm', 'kimi', 'mimo']);

/** 解析结果：每个推送 kind 应「更新既有 bridge-fed 服务」还是「自动新建」 */
export interface BridgeTargets {
	/** kind → 已存在的 bridge-fed 目标服务（每个 kind 至多一个） */
	update: Map<string, ServiceProfile>;
	/** 同 kind 无 bridge-fed 服务、需要自动创建的 kind 列表 */
	create: string[];
	/** 不在 BRIDGE_AI_KINDS 内、被跳过的 kind 列表（记日志用） */
	skipped: string[];
}

/**
 * 解析数据分发目标（R1：manual 服务绝不参与分发）。
 *
 * 查找优先级：同 kind 且 dataSource='bridge' 的既有服务 → 更新；
 * 否则自动新建一个 bridge-fed 服务（与 manual 服务并存）。
 * 绝不返回 manual profile，调用方因此绝无机会修改/删除 manual 服务的 Secret。
 * 异常态（同 kind 多个 bridge-fed）取第一个，其余由 deduplicateAiProfiles 清理。
 */
export function resolveBridgeTargets(
	profiles: ServiceProfile[],
	data: ReadonlyArray<{ kind: string; serviceData?: unknown }>,
): BridgeTargets {
	const update = new Map<string, ServiceProfile>();
	const create: string[] = [];
	const skipped: string[] = [];

	for (const item of data) {
		const kind = item?.kind;
		if (typeof kind !== 'string' || !kind) { continue; }
		// 同一 kind 重复条目只处理一次（先推送者生效）
		if (update.has(kind) || create.includes(kind) || skipped.includes(kind)) { continue; }
		if (!BRIDGE_AI_KINDS.has(kind)) {
			skipped.push(kind);
			continue;
		}
		// 只接管 bridge-fed 服务；manual 服务永远不匹配（R1）
		const target = profiles.find(x => x.kind === kind && x.dataSource === 'bridge');
		if (target) {
			update.set(kind, target);
		} else {
			create.push(kind);
		}
	}

	return { update, create, skipped };
}

/**
 * 选出应同步移除的 bridge-fed 服务（Y1：空 activeKinds = 浏览器端无活跃服务 → 全部移除）。
 * 仅移除 dataSource='bridge' 的 AI 服务；manual 服务与 Bridge 服务自身不受影响。
 */
export function selectBridgeServicesToRemove(profiles: ServiceProfile[], activeKinds: readonly string[]): ServiceProfile[] {
	const activeSet = new Set(activeKinds);
	return profiles.filter(p =>
		BRIDGE_AI_KINDS.has(p.kind) &&
		p.dataSource === 'bridge' &&
		!activeSet.has(p.kind)
	);
}

/**
 * 选出需要清理 Secret key 的服务 id（R2：遗留凭证迁移）。
 * 条件放宽：kind ∈ BRIDGE_AI_KINDS 且（dataSource 缺失 || dataSource='bridge'）。
 * 旧版本可能先于 dataSource 字段存在 bridge-fed 服务（缺失即历史 bridge 语义），
 * 而显式 dataSource='manual' 的是用户手输凭证，绝不可清理。
 */
export function collectBridgeSecretTargets(profiles: ServiceProfile[]): string[] {
	return profiles
		.filter(p => BRIDGE_AI_KINDS.has(p.kind) && (!p.dataSource || p.dataSource === 'bridge'))
		.map(p => p.id);
}

/**
 * 防降级判断：决定是否用本次推送数据覆盖 bridgeDataStore 中的旧数据。
 *
 * 浏览器端瞬时拉取失败时会推送带 err 的 serviceData；若无条件覆盖，会把
 * store 里的好数据变成错误卡片直到下次成功推送。语义（逐项生效）：
 * - 新数据带 err 且旧数据存在且无 err → 拒绝（保留旧数据，updatedAt 保持旧值让前端感知时效）；
 * - 新数据带 err 且（旧数据也带 err 或无旧数据）→ 接受（首次/持续失败仍可见错误）；
 * - 新数据无 err → 接受（正常覆盖）。
 */
export function shouldAcceptBridgeData(previous: ServiceData | undefined, incoming: ServiceData): boolean {
	if (!incoming.err) { return true; }
	if (!previous) { return true; }
	return !!previous.err;
}

/** 被防降级拒绝的推送项（kind + err 消息） */
export interface RejectedPush {
	kind: string;
	err: string;
}

/**
 * 聚合被拒绝的推送项为 Bridge 状态 lastError 文案。
 * 桥本身未断（connected 保持 true），lastError 仅用于服务标签页诊断区展示。
 * 无拒绝项 → undefined（保持现有「无错误」行为）。
 */
export function summarizeRejectedPushes(rejected: readonly RejectedPush[]): string | undefined {
	if (rejected.length === 0) { return undefined; }
	const kinds = rejected.map(r => r.kind).join('、');
	const firstErr = (rejected[0]?.err ?? '').slice(0, 100);
	return `推送被拒（${kinds}）：${firstErr}`;
}
