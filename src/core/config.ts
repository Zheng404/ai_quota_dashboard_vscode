import * as vscode from 'vscode';
import { ServiceProfile, ServiceId } from './types';

// 全局 ExtensionContext，用于访问 globalState
let ctx: vscode.ExtensionContext;

export function setContext(context: vscode.ExtensionContext) {
	ctx = context;
}

function getState<T>(key: string, defaultValue: T): T {
	if (!ctx) return defaultValue;
	return ctx.globalState.get<T>(key, defaultValue);
}

async function setState<T>(key: string, value: T): Promise<void> {
	if (!ctx) return;
	await ctx.globalState.update(key, value);
}

// Secret Storage for sensitive data (API Keys)
async function getSecret(key: string): Promise<string | undefined> {
	if (!ctx) return undefined;
	return ctx.secrets.get(key);
}

async function setSecret(key: string, value: string | undefined): Promise<void> {
	if (!ctx) return;
	if (value) {
		await ctx.secrets.store(key, value);
	} else {
		await ctx.secrets.delete(key);
	}
}

// ==================== 读取配置 ====================

export function loadProfiles(): ServiceProfile[] {
	return getState('services', []);
}

export async function getKey(sid: string): Promise<string | undefined> {
	const val = await getSecret(`apiKeys.${sid}`);
	return val ?? undefined;
}

export function pollInterval(): number {
	return getState('refreshInterval', 600);
}

export function warnThreshold(): number {
	return getState('warnThreshold', 0.8);
}

export function afkThreshold(): number {
	return getState('afkThreshold', 3600);
}

// ==================== 服务列表 CRUD ====================

async function saveProfiles(list: ServiceProfile[]) {
	await setState('services', list);
}

async function setKey(sid: string, key: string) {
	await setSecret(`apiKeys.${sid}`, key || undefined);
}

/** 添加服务实例 */
export async function addService(kind: ServiceId, displayName: string): Promise<string> {
	const profiles = loadProfiles();
	const id = `${kind}-${Date.now()}`;
	profiles.push({ id, kind, displayName, enabled: true });
	await saveProfiles(profiles);
	return id;
}

/** 删除服务实例 */
export async function removeService(id: string): Promise<void> {
	const profiles = loadProfiles().filter(p => p.id !== id);
	await saveProfiles(profiles);
	// 同时删除对应的 API Key
	await setKey(id, '');
}

/** 更新服务实例属性 */
export async function updateService(id: string, updates: Partial<Omit<ServiceProfile, 'id' | 'kind'>>): Promise<void> {
	const profiles = loadProfiles();
	const p = profiles.find(x => x.id === id);
	if (!p) { return; }
	if (updates.displayName !== undefined) { p.displayName = updates.displayName; }
	if (updates.enabled !== undefined) { p.enabled = updates.enabled; }
	if (updates.endpoint !== undefined) { p.endpoint = updates.endpoint; }
	await saveProfiles(profiles);
}

/** 更新服务 API Key */
export async function updateServiceKey(id: string, key: string): Promise<void> {
	await setKey(id, key);
}

/** 更新服务类型（同时清空 key） */
export async function updateServiceKind(id: string, kind: ServiceId): Promise<void> {
	const profiles = loadProfiles();
	const p = profiles.find(x => x.id === id);
	if (!p) { return; }
	p.kind = kind;
	await saveProfiles(profiles);
	// 清空 key（不同类型 key 不兼容）
	await setKey(id, '');
}

// ==================== 全局设置 ====================

export async function setPollInterval(sec: number): Promise<void> {
	await setState('refreshInterval', Math.max(0, sec));
}

export async function setWarnThreshold(val: number): Promise<void> {
	await setState('warnThreshold', Math.min(1, Math.max(0, val)));
}

export async function setAfkThreshold(sec: number): Promise<void> {
	await setState('afkThreshold', Math.max(0, sec));
}

// ==================== 初始化 ====================

export async function initDefaults() {
	// 默认不添加任何服务，用户需手动添加
}
