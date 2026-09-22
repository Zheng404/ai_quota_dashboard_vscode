// processBridgePayload 编排集成测试 — 依赖注入 fake runtime，断言调用序列
//
// 覆盖（配合批次 2 第 2/3 项防回归）：
// - bridge-fed 服务自动创建（含 displayNames 应用）
// - 同 kind 重复 bridge 服务去重（走 removeServiceAndCleanup 统一删除路径）
// - err 推送防降级接线（shouldAcceptBridgeData 纯函数 → 编排层保留旧好数据）
// - activeKinds 收缩时级联删除走 removeServiceAndCleanup
// - Bridge 推送的显示名称变化同步更新 profile

import { describe, it, expect } from 'vitest';
import { ServiceProfile } from '../core/types';
import type { DataPayload } from '../../../browser-common/protocol/index.js';
import { processBridgePayload, BridgeRuntime, BridgeStateUpdates } from './payload-handler';

interface FakeCalls {
	addService: Array<{ kind: string; displayName: string }>;
	updateServiceDataSource: Array<{ id: string; dataSource: string }>;
	updateService: Array<{ id: string; displayName?: string }>;
	updateServiceKey: string[];
	removeServiceAndCleanup: string[];
	updateBridgeState: BridgeStateUpdates[];
	deleteSecret: string[];
}

/** 构造基于内存状态的 fake BridgeRuntime（替代 config/secrets/bar 等 vscode 副作用） */
function createFakeRuntime(initialProfiles: ServiceProfile[]) {
	const profiles: ServiceProfile[] = initialProfiles.map(p => ({ ...p }));
	const calls: FakeCalls = {
		addService: [],
		updateServiceDataSource: [],
		updateService: [],
		updateServiceKey: [],
		removeServiceAndCleanup: [],
		updateBridgeState: [],
		deleteSecret: [],
	};
	let seq = 0;

	const rt: BridgeRuntime = {
		loadProfiles: () => profiles.map(p => ({ ...p })),
		addService: async (kind, displayName) => {
			calls.addService.push({ kind, displayName });
			const id = `${kind}-fake-${seq++}`;
			profiles.push({ id, kind, displayName, dataSource: kind === 'bridge' ? 'bridge' : 'manual' });
			return id;
		},
		updateServiceDataSource: async (id, dataSource) => {
			calls.updateServiceDataSource.push({ id, dataSource });
			const p = profiles.find(x => x.id === id);
			if (p) { p.dataSource = dataSource; }
		},
		updateService: async (id, updates) => {
			calls.updateService.push({ id, displayName: updates.displayName });
			const p = profiles.find(x => x.id === id);
			if (p && updates.displayName !== undefined) { p.displayName = updates.displayName; }
		},
		updateServiceKey: async (id) => { calls.updateServiceKey.push(id); },
		removeServiceAndCleanup: async (id) => {
			calls.removeServiceAndCleanup.push(id);
			const idx = profiles.findIndex(x => x.id === id);
			if (idx >= 0) { profiles.splice(idx, 1); }
			rt.serviceData.delete(id);
			rt.bridgeDataStore.delete(id);
		},
		updateBridgeState: async (updates) => { calls.updateBridgeState.push(updates); },
		fetchBridgeStatus: async () => ({ id: '', name: '', kind: 'bridge', slots: [], updatedAt: 1 }),
		getDescriptorDisplayName: (kind) => `DN:${kind}`,
		serviceData: new Map(),
		bridgeDataStore: new Map(),
		refreshingIds: new Set(),
		setCache: () => { /* 内存缓存，测试无需断言 */ },
		feedStatusBar: () => { /* 测试无需断言状态栏内容 */ },
		removeStatusBar: () => { /* 测试无需断言状态栏内容 */ },
		flushStatusBar: () => { /* 测试无需断言状态栏内容 */ },
		updateView: async () => { /* 视图刷新副作用，测试无需断言 */ },
		deleteSecret: async (key) => { calls.deleteSecret.push(key); },
		log: () => { /* 静默 */ },
		logError: () => { /* 静默 */ },
	};

	return { rt, profiles, calls };
}

/** 构造最小合法推送 payload */
function makePayload(parts: Partial<DataPayload> & { data: DataPayload['data'] }): DataPayload {
	return {
		source: 'ai-quota-data-bridge',
		timestamp: 1714000000000,
		activeKinds: parts.data.map(d => d.kind),
		...parts,
	};
}

/** 最小合法 serviceData（含 slots 数组即可通过 normalizeBridgeServiceData） */
function svcData(overrides: Record<string, unknown> = {}) {
	return {
		slots: [{ label: '每5小时额度', percent: 42 }],
		...overrides,
	};
}

describe('processBridgePayload（编排集成）', () => {
	it('自动创建缺失的 bridge-fed 服务：应用 displayNames 并落数据', async () => {
		const { rt, profiles, calls } = createFakeRuntime([
			{ id: 'bridge-1', kind: 'bridge', displayName: 'Data Bridge', dataSource: 'bridge' },
		]);
		const payload = makePayload({
			data: [{ kind: 'glm', serviceData: svcData() }],
			displayNames: { glm: '我的 GLM' },
		});

		await processBridgePayload(payload, rt);

		// 调用序列：addService（displayNames 优先于描述符默认名）→ 标记 dataSource → 防御清 Secret
		expect(calls.addService).toEqual([{ kind: 'glm', displayName: '我的 GLM' }]);
		const createdId = profiles.find(p => p.kind === 'glm')?.id ?? '';
		expect(createdId).not.toBe('');
		expect(calls.updateServiceDataSource).toEqual([{ id: createdId, dataSource: 'bridge' }]);
		expect(calls.deleteSecret).toContain(`apiKeys.${createdId}`);

		// 数据已分发到新服务（updatedAt 覆写为推送时间，名称取 displayName）
		const stored = rt.bridgeDataStore.get(createdId);
		expect(stored?.name).toBe('我的 GLM');
		expect(stored?.updatedAt).toBe(payload.timestamp);
		expect(stored?.slots[0]?.percent).toBe(42);
		expect(rt.serviceData.get(createdId)).toBe(stored);
		// Bridge 服务自身状态刷新（connected key + 状态数据）
		expect(calls.updateServiceKey).toContain('bridge-1');
		expect(rt.serviceData.get('bridge-1')?.kind).toBe('bridge');
	});

	it('displayNames 缺失时回退描述符默认名', async () => {
		const { rt, calls } = createFakeRuntime([]);
		const payload = makePayload({ data: [{ kind: 'kimi', serviceData: svcData() }] });

		await processBridgePayload(payload, rt);

		expect(calls.addService).toEqual([{ kind: 'kimi', displayName: 'DN:kimi' }]);
	});

	it('同 kind 重复的 bridge 服务去重：多余者走 removeServiceAndCleanup，数据落到保留者', async () => {
		const { rt, calls } = createFakeRuntime([
			{ id: 'glm-keep', kind: 'glm', displayName: 'GLM-A', dataSource: 'bridge' },
			{ id: 'glm-dup', kind: 'glm', displayName: 'GLM-B', dataSource: 'bridge' },
		]);
		const payload = makePayload({ data: [{ kind: 'glm', serviceData: svcData() }] });

		await processBridgePayload(payload, rt);

		// 后出现的重复者被统一删除路径移除，manual 语义不涉入
		expect(calls.removeServiceAndCleanup).toEqual(['glm-dup']);
		expect(rt.bridgeDataStore.has('glm-dup')).toBe(false);
		expect(rt.bridgeDataStore.has('glm-keep')).toBe(true);
		expect(rt.bridgeDataStore.get('glm-keep')?.name).toBe('GLM-A');
	});

	it('err 推送防降级：已有好数据时被拒并保留旧值，诊断 lastError 更新', async () => {
		const { rt, calls } = createFakeRuntime([
			{ id: 'glm-1', kind: 'glm', displayName: 'GLM', dataSource: 'bridge' },
		]);
		const goodPayload = makePayload({ data: [{ kind: 'glm', serviceData: svcData() }] });
		await processBridgePayload(goodPayload, rt);
		const goodStored = rt.bridgeDataStore.get('glm-1');
		expect(goodStored?.err).toBeUndefined();

		calls.updateBridgeState.length = 0;
		const errPayload = makePayload({
			timestamp: 1714000060000,
			data: [{ kind: 'glm', serviceData: svcData({ err: '凭证失效' }) }],
		});
		await processBridgePayload(errPayload, rt);

		// 旧好数据原样保留（不覆盖、updatedAt 不前进）
		expect(rt.bridgeDataStore.get('glm-1')).toBe(goodStored);
		expect(rt.serviceData.get('glm-1')).toBe(goodStored);
		// 诊断信息更新：区分「凭证失效推送被拒」
		const lastErrorUpdate = calls.updateBridgeState.find(u => u.lastError !== undefined);
		expect(lastErrorUpdate?.lastError).toContain('推送被拒');
		expect(lastErrorUpdate?.lastError).toContain('凭证失效');
	});

	it('activeKinds 收缩：级联删除走 removeServiceAndCleanup，manual 服务不受影响', async () => {
		const { rt, profiles, calls } = createFakeRuntime([
			{ id: 'bridge-1', kind: 'bridge', displayName: 'Data Bridge', dataSource: 'bridge' },
			{ id: 'glm-1', kind: 'glm', displayName: 'GLM', dataSource: 'bridge' },
			{ id: 'kimi-1', kind: 'kimi', displayName: 'Kimi', dataSource: 'bridge' },
			{ id: 'mimo-manual', kind: 'mimo', displayName: 'MiMo 手动', dataSource: 'manual' },
		]);
		// 浏览器端已删除 kimi：activeKinds 仅剩 glm，data 同步收缩
		const payload = makePayload({
			data: [{ kind: 'glm', serviceData: svcData() }],
			activeKinds: ['glm'],
		});

		await processBridgePayload(payload, rt);

		expect(calls.removeServiceAndCleanup).toEqual(['kimi-1']);
		expect(profiles.some(p => p.id === 'kimi-1')).toBe(false);
		// manual 服务与 Bridge 服务自身保留
		expect(profiles.some(p => p.id === 'mimo-manual')).toBe(true);
		expect(profiles.some(p => p.id === 'bridge-1')).toBe(true);
		// 残留数据同步清理（无幽灵数据）
		expect(rt.bridgeDataStore.has('kimi-1')).toBe(false);
		expect(rt.serviceData.has('kimi-1')).toBe(false);
	});

	it('Bridge 推送的显示名称变化时同步更新 profile', async () => {
		const { rt, profiles, calls } = createFakeRuntime([
			{ id: 'glm-1', kind: 'glm', displayName: '旧名称', dataSource: 'bridge' },
		]);
		const payload = makePayload({
			data: [{ kind: 'glm', serviceData: svcData() }],
			displayNames: { glm: '新名称' },
		});

		await processBridgePayload(payload, rt);

		expect(calls.updateService).toEqual([{ id: 'glm-1', displayName: '新名称' }]);
		expect(profiles.find(p => p.id === 'glm-1')?.displayName).toBe('新名称');
		expect(rt.bridgeDataStore.get('glm-1')?.name).toBe('新名称');
	});
});
