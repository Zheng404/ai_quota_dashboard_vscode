import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { settingsStore } from '../test/mocks/vscode';
import { ConfigManager, ConfigValidationError } from './config';

/** 模拟 globalState + secrets 的 ExtensionContext（仅覆盖 ConfigManager 用到的成员） */
interface MockContextShape {
	globalState: {
		get<T>(key: string, defaultValue?: T): T | undefined;
		update(key: string, value: unknown): Promise<void>;
		keys(): string[];
	};
	secrets: {
		get(key: string): Promise<string | undefined>;
		store(key: string, value: string): Promise<void>;
		delete(key: string): Promise<void>;
	};
}

/** 创建 globalState/secrets 均基于内存存储的 mock context（模式同 persistence.test.ts） */
function createMockContext(initial: Record<string, unknown> = {}): MockContextShape {
	const storage: Record<string, unknown> = { ...initial };
	const secretsStore: Record<string, string> = {};
	return {
		globalState: {
			get: <T>(key: string, defaultValue?: T): T | undefined =>
				storage[key] !== undefined ? (storage[key] as T) : defaultValue,
			update: async (key: string, value: unknown) => {
				if (value === undefined) {
					delete storage[key];
				} else {
					storage[key] = value;
				}
			},
			keys: () => Object.keys(storage),
		},
		secrets: {
			get: async (key: string) => secretsStore[key],
			store: async (key: string, value: string) => {
				secretsStore[key] = value;
			},
			delete: async (key: string) => {
				delete secretsStore[key];
			},
		},
	};
}

/** 转换为 ConfigManager 构造函数所需的 ExtensionContext 类型（仅测试用） */
function asCtx(mock: MockContextShape): vscode.ExtensionContext {
	return mock as unknown as vscode.ExtensionContext;
}

/** 等待 fire-and-forget 的一次性迁移完成（flush 微任务 + 一轮宏任务） */
async function flushAsync(): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, 0));
}

/** 迁移标记的 globalState key（与 config.ts 内部常量对齐） */
const MIGRATED_FLAG_KEY = 'aiQuotaDashboard.configMigrated';

beforeEach(() => {
	// 每个用例使用干净的 Settings 存储
	for (const key of Object.keys(settingsStore)) {
		delete settingsStore[key];
	}
});

describe('全局设置读取（Settings 唯一可信源）', () => {
	it('Settings 有值时优先使用 Settings 值，忽略 globalState 旧值', () => {
		settingsStore['refreshInterval'] = 120;
		const mgr = new ConfigManager(asCtx(createMockContext({ refreshInterval: 999 })));

		expect(mgr.pollInterval()).toBe(120);
	});

	it('Settings 与 globalState 均无值时返回默认值 60/0.8/3600', () => {
		const mgr = new ConfigManager(asCtx(createMockContext()));

		expect(mgr.pollInterval()).toBe(60);
		expect(mgr.warnThreshold()).toBe(0.8);
		expect(mgr.afkThreshold()).toBe(3600);
	});
});

describe('一次性迁移（globalState → Settings）', () => {
	it('Settings 无值、globalState 有值时：读取回退旧值，并把旧值迁移入 Settings + 写迁移标记 + 清除旧值', async () => {
		const mock = createMockContext({ refreshInterval: 300, warnThreshold: 0.5, afkThreshold: 1200 });
		const mgr = new ConfigManager(asCtx(mock));

		// 同步读取立即回退 globalState 旧值
		expect(mgr.pollInterval()).toBe(300);
		await flushAsync();

		// 迁移后 Settings 获得旧值（新唯一可信源）
		expect(settingsStore['refreshInterval']).toBe(300);
		expect(settingsStore['warnThreshold']).toBe(0.5);
		expect(settingsStore['afkThreshold']).toBe(1200);
		// 迁移标记已写入（防重复迁移）
		expect(mock.globalState.get(MIGRATED_FLAG_KEY, false)).toBe(true);
		// globalState 旧值被清除（收敛为单一可信源）
		expect(mock.globalState.get('refreshInterval', undefined)).toBeUndefined();
	});

	it('迁移标记已存在时不再迁移（Settings 保持无值）', async () => {
		const mock = createMockContext({
			[MIGRATED_FLAG_KEY]: true,
			refreshInterval: 300,
		});
		const mgr = new ConfigManager(asCtx(mock));

		// 读取仍回退旧值（兼容），但不触发迁移
		expect(mgr.pollInterval()).toBe(300);
		await flushAsync();

		expect(settingsStore['refreshInterval']).toBeUndefined();
	});

	it('迁移不覆盖 Settings 中已有的手动配置', async () => {
		// 用户已在 Settings 手动配置 warnThreshold，globalState 残留不同旧值
		settingsStore['warnThreshold'] = 0.3;
		const mock = createMockContext({ refreshInterval: 300, warnThreshold: 0.9 });
		const mgr = new ConfigManager(asCtx(mock));

		expect(mgr.warnThreshold()).toBe(0.3);
		mgr.pollInterval(); // 触发迁移
		await flushAsync();

		// Settings 手动配置未被 globalState 旧值覆盖；未配置的项正常迁移
		expect(settingsStore['warnThreshold']).toBe(0.3);
		expect(settingsStore['refreshInterval']).toBe(300);
	});

	it('同一会话内并发多次读取只触发一次迁移', async () => {
		const mock = createMockContext({ refreshInterval: 300, warnThreshold: 0.5, afkThreshold: 1200 });
		const mgr = new ConfigManager(asCtx(mock));

		mgr.pollInterval();
		mgr.warnThreshold();
		mgr.afkThreshold();
		await flushAsync();

		// 迁移恰好执行一次：标记为 true，旧值只被清除一轮
		expect(mock.globalState.get(MIGRATED_FLAG_KEY, false)).toBe(true);
		expect(settingsStore['refreshInterval']).toBe(300);
	});
});

describe('写入收敛（只写 Settings，不再双写 globalState）', () => {
	it('写入只落 Settings，且清除 globalState 中的历史残留值', async () => {
		const mock = createMockContext({ refreshInterval: 999 }); // 旧版本双写残留
		const mgr = new ConfigManager(asCtx(mock));

		await mgr.setPollInterval(300);

		expect(settingsStore['refreshInterval']).toBe(300);
		// 残留被清除，避免 Settings 被外部清空时旧值"复活"
		expect(mock.globalState.get('refreshInterval', undefined)).toBeUndefined();
	});

	it('数值范围校验保持不变', async () => {
		const mgr = new ConfigManager(asCtx(createMockContext()));

		await expect(mgr.setPollInterval(-1)).rejects.toThrow(ConfigValidationError);
		await expect(mgr.setPollInterval(86401)).rejects.toThrow(ConfigValidationError);
		await expect(mgr.setWarnThreshold(1.5)).rejects.toThrow(ConfigValidationError);
		await expect(mgr.setWarnThreshold(-0.1)).rejects.toThrow(ConfigValidationError);
		await expect(mgr.setAfkThreshold(-5)).rejects.toThrow(ConfigValidationError);
		await expect(mgr.setAfkThreshold(86401)).rejects.toThrow(ConfigValidationError);
	});
});

describe('saveServiceAtomic（原子化保存）', () => {
	it('manual 模式：profile 与 secret 均达到最终态', async () => {
		const mock = createMockContext({
			services: [{ id: 'glm-1', kind: 'glm', displayName: 'Old', dataSource: 'manual' }],
		});
		const mgr = new ConfigManager(asCtx(mock));

		await mgr.saveServiceAtomic('glm-1', { displayName: 'New', kind: 'glm', dataSource: 'manual', key: 'k-new' });

		const profiles = mgr.loadProfiles();
		expect(profiles[0]?.displayName).toBe('New');
		expect(profiles[0]?.dataSource).toBe('manual');
		await expect(mgr.getKey('glm-1')).resolves.toBe('k-new');
	});

	it('kind 变化：旧 key 被清空，manual 模式写入新 key', async () => {
		const mock = createMockContext({
			services: [{ id: 'svc-1', kind: 'glm', displayName: 'A', dataSource: 'manual' }],
		});
		const secretsStore: Record<string, string> = {};
		mock.secrets.store = async (k, v) => { secretsStore[k] = v; };
		mock.secrets.get = async (k) => secretsStore[k];
		mock.secrets.delete = async (k) => { delete secretsStore[k]; };
		const mgr = new ConfigManager(asCtx(mock));
		await mgr.saveServiceAtomic('svc-1', { displayName: 'A', kind: 'glm', dataSource: 'manual', key: 'old-key' });

		// kind 切换为 kimi：旧 key 清空、新 key 落盘
		await mgr.saveServiceAtomic('svc-1', { displayName: 'A', kind: 'kimi', dataSource: 'manual', key: 'new-key' });

		expect(mgr.loadProfiles()[0]?.kind).toBe('kimi');
		await expect(mgr.getKey('svc-1')).resolves.toBe('new-key');
	});

	it('dataSource 切换到 bridge：旧 key 被清空且不再写入', async () => {
		const mock = createMockContext({
			services: [{ id: 'svc-1', kind: 'glm', displayName: 'A', dataSource: 'manual' }],
		});
		const secretsStore: Record<string, string> = {};
		mock.secrets.store = async (k, v) => { secretsStore[k] = v; };
		mock.secrets.get = async (k) => secretsStore[k];
		mock.secrets.delete = async (k) => { delete secretsStore[k]; };
		const mgr = new ConfigManager(asCtx(mock));
		await mgr.saveServiceAtomic('svc-1', { displayName: 'A', kind: 'glm', dataSource: 'manual', key: 'manual-key' });

		// 切换到 bridge：key 清空（Data Bridge 数据源不消费凭证），dataSource 落 state
		await mgr.saveServiceAtomic('svc-1', { displayName: 'A', kind: 'glm', dataSource: 'bridge', key: '' });

		expect(mgr.loadProfiles()[0]?.dataSource).toBe('bridge');
		await expect(mgr.getKey('svc-1')).resolves.toBeUndefined();
	});

	it('bridge 模式无变化：AI 服务总是清除 secret key（Data Bridge 不消费凭证）', async () => {
		const mock = createMockContext({
			services: [{ id: 'svc-1', kind: 'kimi', displayName: 'A', dataSource: 'bridge' }],
		});
		let storeCalls = 0;
		let deleteCalls = 0;
		mock.secrets.store = async () => { storeCalls++; };
		mock.secrets.delete = async () => { deleteCalls++; };
		mock.secrets.get = async () => 'legacy-key';
		const mgr = new ConfigManager(asCtx(mock));

		await mgr.saveServiceAtomic('svc-1', { displayName: 'A', kind: 'kimi', dataSource: 'bridge', key: '' });

		// 清除遗留 key，幂等可重复执行
		expect(storeCalls).toBe(0);
		expect(deleteCalls).toBe(1);
	});

	it('bridge 模式无变化：Bridge 服务自身保留 connected key 语义（不触碰 secret）', async () => {
		const mock = createMockContext({
			services: [{ id: 'bridge-1', kind: 'bridge', displayName: 'Data Bridge', dataSource: 'bridge' }],
		});
		let storeCalls = 0;
		let deleteCalls = 0;
		mock.secrets.store = async () => { storeCalls++; };
		mock.secrets.delete = async () => { deleteCalls++; };
		mock.secrets.get = async () => 'connected';
		const mgr = new ConfigManager(asCtx(mock));

		await mgr.saveServiceAtomic('bridge-1', { displayName: 'Data Bridge', kind: 'bridge', dataSource: 'bridge', key: '' });

		expect(storeCalls).toBe(0);
		expect(deleteCalls).toBe(0);
	});

	it('secret 写入失败时不落 globalState（旧 profile 保持可用）', async () => {
		const mock = createMockContext({
			services: [{ id: 'svc-1', kind: 'glm', displayName: 'Old', dataSource: 'manual' }],
		});
		// 让 secrets 写入直接失败，模拟第一次写入（Secret）崩溃
		const failure = new Error('secret storage unavailable');
		mock.secrets.store = async () => { throw failure; };
		mock.secrets.delete = async () => { throw failure; };
		const mgr = new ConfigManager(asCtx(mock));

		await expect(
			mgr.saveServiceAtomic('svc-1', { displayName: 'New', kind: 'kimi', dataSource: 'manual', key: 'k' })
		).rejects.toThrow('secret storage unavailable');

		// state 未被触碰：旧 profile 完整保留
		const p = mgr.loadProfiles()[0];
		expect(p?.displayName).toBe('Old');
		expect(p?.kind).toBe('glm');
		expect(p?.dataSource).toBe('manual');
	});

	it('displayName 校验失败时抛出且不产生任何写入', async () => {
		const mock = createMockContext({
			services: [{ id: 'svc-1', kind: 'glm', displayName: 'A', dataSource: 'manual' }],
		});
		let stateWrites = 0;
		const origUpdate = mock.globalState.update.bind(mock.globalState);
		mock.globalState.update = async (key: string, value: unknown) => {
			stateWrites++;
			return origUpdate(key, value);
		};
		const mgr = new ConfigManager(asCtx(mock));

		await expect(
			mgr.saveServiceAtomic('svc-1', { displayName: '   ', kind: 'glm', dataSource: 'manual', key: 'k' })
		).rejects.toThrow(ConfigValidationError);
		expect(stateWrites).toBe(0);
	});
});
