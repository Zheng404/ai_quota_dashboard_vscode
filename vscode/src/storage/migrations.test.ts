import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import type { UsagePoint } from '../core/types';
import { runV2CleanupMigration, V2_CLEANUP_DONE_KEY } from './migrations';

function createContext(options: {
	profiles?: unknown;
	history?: unknown;
	cleanupDone?: boolean;
	failOnKey?: string;
	failOnSecret?: string;
} = {}) {
	const state = new Map<string, unknown>([
		['services', 'profiles' in options ? options.profiles : []],
		['aiQuotaDashboard.history', 'history' in options ? options.history : {}],
		['aiQuotaDashboard.bridgeState', { connected: true }],
		['aiQuotaDashboard.bridgeSecretsCleared', true],
	]);
	if (options.cleanupDone) { state.set(V2_CLEANUP_DONE_KEY, true); }
	const secrets = new Set(['apiKeys.glm-manual', 'apiKeys.kimi-manual', 'apiKeys.glm-bridge', 'apiKeys.mimo-1', 'apiKeys.bridge-1']);
	const writes: string[] = [];
	let failed = false;
	let secretFailed = false;
	const ctx = {
		globalState: {
			get: <T>(key: string, defaultValue: T): T => (state.has(key) ? state.get(key) : defaultValue) as T,
			update: async (key: string, value: unknown) => {
				if (key === options.failOnKey && !failed) {
					failed = true;
					throw new Error(`write failed: ${key}`);
				}
				writes.push(key);
				if (value === undefined) { state.delete(key); } else { state.set(key, value); }
			},
		},
		secrets: {
			delete: async (key: string) => {
				if (key === options.failOnSecret && !secretFailed) {
					secretFailed = true;
					throw new Error(`secret delete failed: ${key}`);
				}
				secrets.delete(key);
			},
		},
	} as unknown as vscode.ExtensionContext;
	return { ctx, state, secrets, writes };
}

const point: UsagePoint = { at: 1, tokens: 10, calls: 1 };

describe('runV2CleanupMigration', () => {
	it('清除 Bridge/MiMo 与 bridge-fed 数据，保留 manual GLM/Kimi 并剥离 dataSource', async () => {
		const { ctx, state, secrets } = createContext({
			profiles: [
				{ id: 'glm-manual', kind: 'glm', displayName: 'GLM', dataSource: 'manual' },
				{ id: 'kimi-manual', kind: 'kimi', displayName: 'Kimi' },
				{ id: 'glm-bridge', kind: 'glm', displayName: 'GLM Bridge', dataSource: 'bridge' },
				{ id: 'mimo-1', kind: 'mimo', displayName: 'MiMo', dataSource: 'manual' },
				{ id: 'bridge-1', kind: 'bridge', displayName: 'Bridge', dataSource: 'bridge' },
				{ id: 'custom-1', kind: 'custom', displayName: 'Custom', dataSource: 'manual' },
			],
			history: {
				'glm-manual': [point],
				'kimi-manual': [point],
				'glm-bridge': [point],
				'mimo-1': [point],
				'bridge-1': [point],
				'custom-1': [point],
				'orphan-1': [point],
			},
		});

		await runV2CleanupMigration(ctx);

		expect(state.get('services')).toEqual([
			{ id: 'glm-manual', kind: 'glm', displayName: 'GLM' },
			{ id: 'kimi-manual', kind: 'kimi', displayName: 'Kimi' },
			{ id: 'custom-1', kind: 'custom', displayName: 'Custom' },
		]);
		expect(state.get('aiQuotaDashboard.history')).toEqual({
			'glm-manual': [point],
			'kimi-manual': [point],
			'custom-1': [point],
		});
		expect(secrets).toEqual(new Set(['apiKeys.glm-manual', 'apiKeys.kimi-manual']));
		expect(state.has('aiQuotaDashboard.bridgeState')).toBe(false);
		expect(state.has('aiQuotaDashboard.bridgeSecretsCleared')).toBe(false);
		expect(state.get(V2_CLEANUP_DONE_KEY)).toBe(true);
	});

	it.each([null, { broken: true }, 'broken'])('services 结构损坏（%s）时按空列表降级并完成迁移', async profiles => {
		const { ctx, state } = createContext({ profiles, history: { orphan: [point] } });

		await runV2CleanupMigration(ctx);

		expect(state.get('services')).toEqual([]);
		expect(state.get('aiQuotaDashboard.history')).toEqual({});
		expect(state.get(V2_CLEANUP_DONE_KEY)).toBe(true);
	});

	it.each([null, [], 'broken', new Date(0)])('history 结构损坏（%s）时按空历史降级并保留有效 manual 配置', async history => {
		const { ctx, state } = createContext({
			profiles: [{ id: 'glm-manual', kind: 'glm', displayName: 'GLM', dataSource: 'manual' }],
			history,
		});

		await runV2CleanupMigration(ctx);

		expect(state.get('services')).toEqual([{ id: 'glm-manual', kind: 'glm', displayName: 'GLM' }]);
		expect(state.get('aiQuotaDashboard.history')).toEqual({});
		expect(state.get(V2_CLEANUP_DONE_KEY)).toBe(true);
	});

	it('profiles 数组中的 null 与非法元素被忽略，不影响有效 manual 配置', async () => {
		const { ctx, state } = createContext({
			profiles: [
				null,
				42,
				'broken',
				[],
				{ id: 'missing-name', kind: 'kimi' },
				{ id: 'kimi-manual', kind: 'kimi', displayName: 'Kimi', dataSource: 'manual' },
			],
			history: { 'kimi-manual': [point] },
		});

		await runV2CleanupMigration(ctx);

		expect(state.get('services')).toEqual([{ id: 'kimi-manual', kind: 'kimi', displayName: 'Kimi' }]);
		expect(state.get('aiQuotaDashboard.history')).toEqual({ 'kimi-manual': [point] });
		expect(state.get(V2_CLEANUP_DONE_KEY)).toBe(true);
	});

	it('flag 已写入时直接返回且不改动数据', async () => {
		const { ctx, state, writes } = createContext({ cleanupDone: true });

		await runV2CleanupMigration(ctx);

		expect(writes).toEqual([]);
		expect(state.get('aiQuotaDashboard.bridgeState')).toEqual({ connected: true });
	});

	it('重复执行幂等，且清理标记最后写入', async () => {
		const { ctx, writes } = createContext({
			profiles: [{ id: 'bridge-1', kind: 'bridge', displayName: 'Bridge', dataSource: 'bridge' }],
		});

		await runV2CleanupMigration(ctx);
		await runV2CleanupMigration(ctx);

		expect(writes.at(-1)).toBe(V2_CLEANUP_DONE_KEY);
		expect(writes.filter(key => key === V2_CLEANUP_DONE_KEY)).toHaveLength(1);
	});

	it('中途失败不写完成标记，下次激活可重试完成', async () => {
		const { ctx, state } = createContext({
			profiles: [
				{ id: 'kimi-manual', kind: 'kimi', displayName: 'Kimi', dataSource: 'manual' },
				{ id: 'glm-bridge', kind: 'glm', displayName: 'GLM Bridge', dataSource: 'bridge' },
			],
			history: { 'kimi-manual': [point], 'glm-bridge': [point], orphan: [point] },
			failOnKey: 'aiQuotaDashboard.bridgeState',
		});

		await expect(runV2CleanupMigration(ctx)).rejects.toThrow('write failed');
		expect(state.has(V2_CLEANUP_DONE_KEY)).toBe(false);

		await runV2CleanupMigration(ctx);
		expect(state.get(V2_CLEANUP_DONE_KEY)).toBe(true);
		expect(state.get('services')).toEqual([{ id: 'kimi-manual', kind: 'kimi', displayName: 'Kimi' }]);
		expect(state.get('aiQuotaDashboard.history')).toEqual({ 'kimi-manual': [point] });
	});

	it('Secret 删除失败仍抛出且不写完成标记，下次激活可重试', async () => {
		const { ctx, state, secrets } = createContext({
			profiles: [
				{ id: 'glm-manual', kind: 'glm', displayName: 'GLM', dataSource: 'manual' },
				{ id: 'glm-bridge', kind: 'glm', displayName: 'GLM Bridge', dataSource: 'bridge' },
			],
			failOnSecret: 'apiKeys.glm-bridge',
		});

		await expect(runV2CleanupMigration(ctx)).rejects.toThrow('secret delete failed');
		expect(state.has(V2_CLEANUP_DONE_KEY)).toBe(false);
		expect(secrets.has('apiKeys.glm-bridge')).toBe(true);

		await runV2CleanupMigration(ctx);
		expect(state.get(V2_CLEANUP_DONE_KEY)).toBe(true);
		expect(secrets.has('apiKeys.glm-bridge')).toBe(false);
	});
});
