import * as vscode from 'vscode';
import { ServiceData, UsagePoint, ServiceProfile } from '../core/types';

const STORAGE_KEY = 'aiUsageMonitor.history';
const MAX_DAYS = 30; // 最多保留30天的历史数据

interface StoredHistory {
	[serviceId: string]: UsagePoint[];
}

/**
 * 从 globalState 读取历史数据
 */
export function loadHistory(ctx: vscode.ExtensionContext): Map<string, UsagePoint[]> {
	const raw = ctx.globalState.get<StoredHistory>(STORAGE_KEY, {});
	const map = new Map<string, UsagePoint[]>();
	for (const [sid, pts] of Object.entries(raw)) {
		map.set(sid, pts);
	}
	return map;
}

/**
 * 保存历史数据到 globalState
 */
export async function saveHistory(
	ctx: vscode.ExtensionContext,
	dataMap: Map<string, ServiceData>
): Promise<void> {
	const existing = ctx.globalState.get<StoredHistory>(STORAGE_KEY, {});
	const now = Date.now();
	const cutoff = now - MAX_DAYS * 24 * 60 * 60 * 1000;

	const merged: StoredHistory = {};

	for (const [sid, data] of dataMap) {
		if (data.err || data.slots.length === 0) { continue; }

		const pts: UsagePoint[] = existing[sid] ?? [];

		// 计算当前用量（取第一个 slot 的 used）
		const mainSlot = data.slots[0];
		const used = mainSlot?.used ?? 0;

		// 添加新的数据点（如果和上一个不同）
		const last = pts[pts.length - 1];
		if (!last || last.tokens !== used) {
			pts.push({
				at: now,
				tokens: used,
				calls: 1,
			});
		}

		// 过滤过期数据
		merged[sid] = pts.filter(p => p.at >= cutoff);
	}

	// 保留未更新的服务的历史数据
	for (const [sid, pts] of Object.entries(existing)) {
		if (!merged[sid]) {
			merged[sid] = pts.filter(p => p.at >= cutoff);
		}
	}

	await ctx.globalState.update(STORAGE_KEY, merged);
}

/**
 * 为 ServiceData 附加历史数据
 * 合并 API 返回的趋势数据 + globalState 持久化数据，按日期去重
 */
export function attachHistory(
	data: ServiceData,
	historyMap: Map<string, UsagePoint[]>
): ServiceData {
	const apiHistory = data.history ?? [];
	const savedHistory = historyMap.get(data.id) ?? [];

	if (savedHistory.length === 0) {
		// 没有持久化历史，保留 API 返回的
		return data;
	}

	if (apiHistory.length === 0) {
		// 没有 API 历史，用持久化的
		return { ...data, history: savedHistory };
	}

	// 合并：按日期去重，优先保留信息更完整的数据点
	const merged = new Map<string, UsagePoint>();
	for (const p of savedHistory) {
		const dk = new Date(p.at).toISOString().slice(0, 10);
		merged.set(dk, p);
	}
	for (const p of apiHistory) {
		const dk = new Date(p.at).toISOString().slice(0, 10);
		const existing = merged.get(dk);
		// 如果已有数据且信息更完整（有 tokens 和 calls），保留已有的
		if (existing?.tokens != null && existing.calls != null && (p.tokens == null || p.calls == null)) {
			continue;
		}
		merged.set(dk, p);
	}

	const result = Array.from(merged.values()).sort((a, b) => a.at - b.at);
	return { ...data, history: result };
}

/**
 * 清除所有历史数据
 */
export async function clearHistory(ctx: vscode.ExtensionContext): Promise<void> {
	await ctx.globalState.update(STORAGE_KEY, {});
}

/**
 * 清除所有数据（包括配置、API Key、历史）
 * @warning 此操作不可逆，将删除所有服务配置和 API Key
 */
export async function clearAllData(ctx: vscode.ExtensionContext): Promise<void> {
	// 先读取 profiles 列表（必须在清除 globalState 之前）
	const profiles = ctx.globalState.get<ServiceProfile[]>('services', []);

	// 清除所有 API Keys（从 secrets 中）
	for (const p of profiles) {
		await ctx.secrets.delete(`apiKeys.${p.id}`);
	}

	// 然后清除 globalState 中的所有数据
	const keys = ['services', 'refreshInterval', 'warnThreshold', 'afkThreshold', STORAGE_KEY];
	for (const key of keys) {
		await ctx.globalState.update(key, undefined);
	}
}
