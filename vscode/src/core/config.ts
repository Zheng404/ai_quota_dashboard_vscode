import * as vscode from 'vscode';
import { ServiceProfile, ServiceId } from './types';

/** package.json configuration 中声明的配置项（由 Settings 唯一可信源管理的键） */
const SETTINGS_KEYS = new Set(['refreshInterval', 'warnThreshold', 'afkThreshold']);

/** 配置迁移标记：写入后不再执行 globalState → Settings 的一次性迁移（防重复迁移） */
const MIGRATED_FLAG_KEY = 'aiQuotaDashboard.configMigrated';

/** 输入校验错误 */
export class ConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigValidationError';
	}
}

/** saveServiceAtomic 的目标状态参数（先计算最终态，再两次写入落盘） */
export interface SaveServiceTarget {
	displayName: string;
	kind: ServiceId;
	dataSource: 'manual' | 'bridge';
	/** manual 模式下要保存的 key；空字符串表示清除 */
	key: string;
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

	/** 读取仅存于 globalState 的数据（services 等普通键，与 Settings 无关） */
	private getState<T>(key: string, defaultValue: T): T {
		if (!this.ctx) return defaultValue;
		const val = this.ctx.globalState.get<T | undefined>(key, undefined);
		if (val !== undefined && val !== null) { return val; }
		return defaultValue;
	}

	/** 写入仅存于 globalState 的数据（services 等普通键） */
	private async setState<T>(key: string, value: T): Promise<void> {
		if (!this.ctx) return;
		await this.ctx.globalState.update(key, value);
	}

	// ==================== 全局设置读写（Settings 为唯一可信源） ====================

	/**
	 * 读取全局设置项：优先 VSCode Settings（唯一可信源）；
	 * Settings 无值时回退 globalState 旧值（历史版本双写残留），并触发一次性迁移。
	 */
	private readGlobalSetting<T>(key: string, defaultValue: T): T {
		const cfg = vscode.workspace.getConfiguration('aiQuotaDashboard');
		const settingVal = cfg.get<T | undefined>(key, undefined);
		if (settingVal !== undefined) { return settingVal; }
		if (!this.ctx) { return defaultValue; }
		const legacy = this.ctx.globalState.get<T | undefined>(key, undefined);
		if (legacy === undefined) { return defaultValue; }
		// 回退旧值的同时触发一次性迁移（异步执行，不阻塞同步读取）
		this.triggerConfigMigration();
		return legacy;
	}

	/**
	 * 写入全局设置项：只写 VSCode Settings（不再双写 globalState）。
	 * 同时清掉 globalState 中的历史残留值，避免 Settings 被外部清空时旧值"复活"造成双源漂移。
	 */
	private async writeGlobalSetting<T>(key: string, value: T): Promise<void> {
		const cfg = vscode.workspace.getConfiguration('aiQuotaDashboard');
		await cfg.update(key, value, true);
		if (this.ctx?.globalState.get(key, undefined) !== undefined) {
			await this.ctx.globalState.update(key, undefined);
		}
	}

	/** 一次性迁移的执行状态（内存级闸门：同一会话内只触发一次，失败可重试） */
	private migrationPromise: Promise<void> | undefined;

	/**
	 * 触发一次性配置迁移：把 globalState 中的旧配置值搬入 Settings，并写迁移标记。
	 * 防重复迁移的两道闸门：
	 * 1. 内存级 migrationPromise —— 同一会话内的并发读取只触发一次；
	 * 2. globalState 迁移标记（MIGRATED_FLAG_KEY）—— 跨会话持久生效，
	 *    避免旧值在用户手动清空 Settings 后反复"复活"覆盖用户意图。
	 */
	private triggerConfigMigration(): void {
		if (this.migrationPromise) { return; }
		const ctx = this.ctx;
		if (!ctx) { return; }
		this.migrationPromise = (async () => {
			if (ctx.globalState.get<boolean>(MIGRATED_FLAG_KEY, false)) { return; }
			const cfg = vscode.workspace.getConfiguration('aiQuotaDashboard');
			for (const key of SETTINGS_KEYS) {
				// 仅搬运 Settings 中尚无值的项，避免覆盖用户在 Settings 里的手动配置
				if (cfg.get<number | undefined>(key, undefined) !== undefined) { continue; }
				const legacy = ctx.globalState.get<number | undefined>(key, undefined);
				if (legacy === undefined) { continue; }
				await cfg.update(key, legacy, true);
				// 搬运成功后清除 globalState 残留，收敛为单一可信源
				await ctx.globalState.update(key, undefined);
			}
			await ctx.globalState.update(MIGRATED_FLAG_KEY, true);
		})().catch((err: unknown) => {
			// 迁移失败：清空内存级闸门，下次读取时自动重试
			this.migrationPromise = undefined;
			console.warn('[ConfigManager] 配置迁移失败，将在下次读取时重试', err);
		});
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
		return this.readGlobalSetting('refreshInterval', 60);
	}

	warnThreshold(): number {
		return this.readGlobalSetting('warnThreshold', 0.8);
	}

	afkThreshold(): number {
		return this.readGlobalSetting('afkThreshold', 3600);
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
	private nextId = 0;

	async addService(kind: ServiceId, displayName: string): Promise<string> {
		this.validateDisplayName(displayName);
		const profiles = this.loadProfiles();
		const id = `${kind}-${Date.now()}-${this.nextId++}`;
		const dataSource = kind === 'bridge' ? 'bridge' : 'manual';
		profiles.push({ id, kind, displayName: displayName.trim(), dataSource });
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

	/**
	 * 原子化保存服务配置（saveService 命令专用）。
	 *
	 * 原实现按「改 profile → 清旧 key → 写新 key」最多拆成 5 次独立 globalState/secrets 写入，
	 * 中途崩溃会留下半更新状态（如 state 已指向新 kind 但 key 已被清掉）。
	 * 现改为：先在内存中计算最终态（profile 字段 + secret 内容），再按固定顺序两次写入落盘。
	 *
	 * 写入顺序取舍（先写 Secret、后写 globalState）：
	 * - Secret 写失败 → 不落 state，旧 profile + 旧 key 完整保留，服务保持可用（一致性无损）；
	 * - state 写失败 → 留下"孤立的新 Secret"（旧 profile 仍指向旧语义，拉取可能报错），
	 *   但用户输入的 key 已安全落盘、未丢失，重新保存即可恢复。
	 *   反向顺序（先 state 后 Secret）在 Secret 写失败时会丢掉用户刚输入的 key，
	 *   且用户以为已保存成功——丢 key 比留孤立 Secret 更糟，故 Secret 先行。
	 */
	async saveServiceAtomic(id: string, target: SaveServiceTarget): Promise<void> {
		this.validateDisplayName(target.displayName);
		const profiles = this.loadProfiles();
		const p = profiles.find(x => x.id === id);
		const kindChanged = !!p && p.kind !== target.kind;
		const dataSourceChanged = !!p && p.dataSource !== target.dataSource;

		// ---- 计算最终 Secret 内容（与旧多步写入的最终态等价）----
		// undefined = 不触碰现有 Secret；'' = 删除；非空 = 存储
		let finalSecret: string | undefined;
		if (target.dataSource === 'manual') {
			// manual 模式总是覆盖写入用户输入的 key（空则删除），与旧逻辑一致
			finalSecret = target.key;
		} else if (target.kind === 'bridge') {
			// Bridge 服务自身：保留 'connected' key 语义，仅在 kind/数据来源变化时清空
			finalSecret = (kindChanged || dataSourceChanged) ? '' : undefined;
		} else {
			// Data Bridge 数据源的 AI 服务：数据由浏览器扩展推送，本端不消费凭证，
			// 总是清除 Secret key（含旧版本遗留的推送凭证）
			finalSecret = '';
		}

		// ---- 第一次写入：Secret（失败则抛出，state 不落，旧配置保持可用）----
		if (finalSecret !== undefined) {
			await this.setKey(id, finalSecret);
		}

		// ---- 第二次写入：globalState（displayName/kind/dataSource 一次性落盘）----
		if (p && (kindChanged || dataSourceChanged || p.displayName !== target.displayName.trim())) {
			p.displayName = target.displayName.trim();
			p.kind = target.kind;
			p.dataSource = target.dataSource;
			await this.saveProfiles(profiles);
		}
	}

	// ==================== 全局设置 ====================

	async setPollInterval(sec: number): Promise<void> {
		if (sec < 0 || sec > 86400) {
			throw new ConfigValidationError('刷新间隔必须在 0 ~ 86400 秒之间');
		}
		await this.writeGlobalSetting('refreshInterval', sec);
	}

	async setWarnThreshold(val: number): Promise<void> {
		if (val < 0 || val > 1) {
			throw new ConfigValidationError('预警阈值必须在 0 ~ 1 之间');
		}
		await this.writeGlobalSetting('warnThreshold', val);
	}

	async setAfkThreshold(sec: number): Promise<void> {
		if (sec < 0 || sec > 86400) {
			throw new ConfigValidationError('AFK 阈值必须在 0 ~ 86400 秒之间');
		}
		await this.writeGlobalSetting('afkThreshold', sec);
	}

	// ==================== 初始化 ====================

	/** 初始化默认配置。当前版本不预置任何服务，由用户手动添加。 */
	async initDefaults() {
		// Intentionally empty — 保持向后兼容，未来可在此添加迁移逻辑
	}

	/** 设置所有 bridge 模式服务的数据来源（用于新架构下默认启用 bridge） */
	async migrateBridgeDataSource(): Promise<void> {
		const profiles = this.loadProfiles();
		let changed = false;
		for (const p of profiles) {
			// 旧数据可能没有 dataSource 字段，默认视为 manual 保持兼容
			if (!p.dataSource) {
				p.dataSource = 'manual';
				changed = true;
			}
		}
		if (changed) {
			await this.saveProfiles(profiles);
		}
	}
}

// ==================== 兼容层（单例导出，供现有代码平滑迁移） ====================

let _globalManager: ConfigManager | undefined;

function getManager(): ConfigManager {
	if (!_globalManager) {
		_globalManager = new ConfigManager();
		// 开发模式警告：ConfigManager 在 setContext() 之前使用会导致所有读取返回默认值
		if (process.env.NODE_ENV !== 'production') {
			console.warn('[ConfigManager] 在 setContext() 之前创建实例，读取操作将返回默认值');
		}
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
export async function saveServiceAtomic(id: string, target: SaveServiceTarget): Promise<void> { return getManager().saveServiceAtomic(id, target); }
export async function setPollInterval(sec: number): Promise<void> { return getManager().setPollInterval(sec); }
export async function setWarnThreshold(val: number): Promise<void> { return getManager().setWarnThreshold(val); }
export async function setAfkThreshold(sec: number): Promise<void> { return getManager().setAfkThreshold(sec); }
export async function initDefaults() { return getManager().initDefaults(); }
export async function migrateBridgeDataSource() { return getManager().migrateBridgeDataSource(); }
