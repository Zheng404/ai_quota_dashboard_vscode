import * as vscode from 'vscode';
import { ServiceProfile, ServiceId } from './types';

/** package.json configuration 中声明的配置项 */
const SETTINGS_KEYS = new Set(['refreshInterval', 'warnThreshold', 'afkThreshold']);

/** 输入校验错误 */
export class ConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigValidationError';
	}
}

/** 配置管理器 — 封装 ExtensionContext 访问，避免模块级可变状态 */
export class ConfigManager {
	private ctx: vscode.ExtensionContext | undefined;

	constructor(context?: vscode.ExtensionContext) {
		this.ctx = context;
	}

	setContext(context: vscode.ExtensionContext) {
		this.ctx = context;
	}

	private getState<T>(key: string, defaultValue: T): T {
		if (!this.ctx) return defaultValue;
		const val = this.ctx.globalState.get<T | undefined>(key, undefined);
		if (val !== undefined) { return val; }
		const cfg = vscode.workspace.getConfiguration('aiQuotaDashboard');
		return cfg.get<T>(key, defaultValue);
	}

	private async setState<T>(key: string, value: T): Promise<void> {
		if (!this.ctx) return;
		await this.ctx.globalState.update(key, value);
		if (SETTINGS_KEYS.has(key)) {
			const cfg = vscode.workspace.getConfiguration('aiQuotaDashboard');
			await cfg.update(key, value, true);
		}
	}

	private async getSecret(key: string): Promise<string | undefined> {
		if (!this.ctx) return undefined;
		return this.ctx.secrets.get(key);
	}

	private async setSecret(key: string, value: string | undefined): Promise<void> {
		if (!this.ctx) return;
		if (value) {
			await this.ctx.secrets.store(key, value);
		} else {
			await this.ctx.secrets.delete(key);
		}
	}

	// ==================== 读取配置 ====================

	loadProfiles(): ServiceProfile[] {
		return this.getState('services', []);
	}

	async getKey(sid: string): Promise<string | undefined> {
		const val = await this.getSecret(`apiKeys.${sid}`);
		return val ?? undefined;
	}

	pollInterval(): number {
		return this.getState('refreshInterval', 600);
	}

	warnThreshold(): number {
		return this.getState('warnThreshold', 0.8);
	}

	afkThreshold(): number {
		return this.getState('afkThreshold', 3600);
	}

	// ==================== 服务列表 CRUD ====================

	private async saveProfiles(list: ServiceProfile[]) {
		await this.setState('services', list);
	}

	private async setKey(sid: string, key: string) {
		await this.setSecret(`apiKeys.${sid}`, key || undefined);
	}

	/** 校验 displayName */
	private validateDisplayName(name: string): void {
		if (!name || name.trim().length === 0) {
			throw new ConfigValidationError('displayName 不能为空');
		}
		if (name.trim().length > 100) {
			throw new ConfigValidationError('displayName 不能超过 100 个字符');
		}
	}

	/** 添加服务实例 */
	async addService(kind: ServiceId, displayName: string): Promise<string> {
		this.validateDisplayName(displayName);
		const profiles = this.loadProfiles();
		const id = `${kind}-${Date.now()}`;
		profiles.push({ id, kind, displayName: displayName.trim(), dataSource: 'manual' });
		await this.saveProfiles(profiles);
		return id;
	}

	/** 删除服务实例 */
	async removeService(id: string): Promise<void> {
		const profiles = this.loadProfiles().filter(p => p.id !== id);
		await this.saveProfiles(profiles);
		await this.setKey(id, '');
	}

	/** 更新服务实例属性 */
	async updateService(id: string, updates: Partial<Omit<ServiceProfile, 'id' | 'kind'>>): Promise<void> {
		if (updates.displayName !== undefined) {
			this.validateDisplayName(updates.displayName);
			updates.displayName = updates.displayName.trim();
		}
		const profiles = this.loadProfiles();
		const p = profiles.find(x => x.id === id);
		if (!p) { return; }
		if (updates.displayName !== undefined) { p.displayName = updates.displayName; }
		if (updates.endpoint !== undefined) { p.endpoint = updates.endpoint; }
		await this.saveProfiles(profiles);
	}

	/** 更新服务 API Key */
	async updateServiceKey(id: string, key: string): Promise<void> {
		await this.setKey(id, key);
	}

	/** 更新服务数据来源 */
	async updateServiceDataSource(id: string, dataSource: 'manual' | 'bridge'): Promise<void> {
		const profiles = this.loadProfiles();
		const p = profiles.find(x => x.id === id);
		if (!p) { return; }
		p.dataSource = dataSource;
		await this.saveProfiles(profiles);
	}

	/** 更新服务类型（同时清空 key） */
	async updateServiceKind(id: string, kind: ServiceId): Promise<void> {
		const profiles = this.loadProfiles();
		const p = profiles.find(x => x.id === id);
		if (!p) { return; }
		p.kind = kind;
		await this.saveProfiles(profiles);
		await this.setKey(id, '');
	}

	// ==================== 全局设置 ====================

	async setPollInterval(sec: number): Promise<void> {
		if (sec < 0 || sec > 86400) {
			throw new ConfigValidationError('刷新间隔必须在 0 ~ 86400 秒之间');
		}
		await this.setState('refreshInterval', sec);
	}

	async setWarnThreshold(val: number): Promise<void> {
		if (val < 0 || val > 1) {
			throw new ConfigValidationError('预警阈值必须在 0 ~ 1 之间');
		}
		await this.setState('warnThreshold', val);
	}

	async setAfkThreshold(sec: number): Promise<void> {
		if (sec < 0 || sec > 86400) {
			throw new ConfigValidationError('AFK 阈值必须在 0 ~ 86400 秒之间');
		}
		await this.setState('afkThreshold', sec);
	}

	// ==================== 初始化 ====================

	/** 初始化默认配置。当前版本不预置任何服务，由用户手动添加。 */
	async initDefaults() {
		// Intentionally empty — 保持向后兼容，未来可在此添加迁移逻辑
	}
}

// ==================== 兼容层（单例导出，供现有代码平滑迁移） ====================

let _globalManager: ConfigManager | undefined;

function getManager(): ConfigManager {
	if (!_globalManager) {
		_globalManager = new ConfigManager();
	}
	return _globalManager;
}

export function setContext(context: vscode.ExtensionContext) {
	getManager().setContext(context);
}

// 以下函数委托给全局 ConfigManager 实例，保持 API 兼容
export function loadProfiles(): ServiceProfile[] { return getManager().loadProfiles(); }
export async function getKey(sid: string): Promise<string | undefined> { return getManager().getKey(sid); }
export function pollInterval(): number { return getManager().pollInterval(); }
export function warnThreshold(): number { return getManager().warnThreshold(); }
export function afkThreshold(): number { return getManager().afkThreshold(); }
export async function addService(kind: ServiceId, displayName: string): Promise<string> { return getManager().addService(kind, displayName); }
export async function removeService(id: string): Promise<void> { return getManager().removeService(id); }
export async function updateService(id: string, updates: Partial<Omit<ServiceProfile, 'id' | 'kind'>>): Promise<void> { return getManager().updateService(id, updates); }
export async function updateServiceKey(id: string, key: string): Promise<void> { return getManager().updateServiceKey(id, key); }
export async function updateServiceDataSource(id: string, dataSource: 'manual' | 'bridge'): Promise<void> { return getManager().updateServiceDataSource(id, dataSource); }
export async function updateServiceKind(id: string, kind: ServiceId): Promise<void> { return getManager().updateServiceKind(id, kind); }
export async function setPollInterval(sec: number): Promise<void> { return getManager().setPollInterval(sec); }
export async function setWarnThreshold(val: number): Promise<void> { return getManager().setWarnThreshold(val); }
export async function setAfkThreshold(sec: number): Promise<void> { return getManager().setAfkThreshold(sec); }
export async function initDefaults() { return getManager().initDefaults(); }
