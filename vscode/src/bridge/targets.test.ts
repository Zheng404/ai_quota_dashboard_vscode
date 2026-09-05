import { describe, it, expect } from 'vitest';
import {
	BRIDGE_AI_KINDS,
	resolveBridgeTargets,
	selectBridgeServicesToRemove,
	collectBridgeSecretTargets,
	shouldAcceptBridgeData,
	summarizeRejectedPushes,
} from './targets';
import { ServiceData, ServiceProfile } from '../core/types';

const glmManual: ServiceProfile = { id: 'glm-1', kind: 'glm', displayName: '我的 GLM', dataSource: 'manual' };
const kimiBridge: ServiceProfile = { id: 'kimi-1', kind: 'kimi', displayName: 'Kimi', dataSource: 'bridge' };
const kimiBridgeDup: ServiceProfile = { id: 'kimi-2', kind: 'kimi', displayName: 'Kimi 副本', dataSource: 'bridge' };
const bridgeSvc: ServiceProfile = { id: 'bridge-1', kind: 'bridge', displayName: 'Data Bridge', dataSource: 'bridge' };

describe('resolveBridgeTargets（R1：manual 服务绝不参与分发）', () => {
	it('① 已有 manual 同 kind → 返回新建而非接管（manual profile 不出现在结果中）', () => {
		const { update, create, skipped } = resolveBridgeTargets(
			[glmManual],
			[{ kind: 'glm', serviceData: { slots: [] } }],
		);

		expect(create).toEqual(['glm']);
		expect(update.size).toBe(0);
		// manual 服务绝不成为分发目标（其 Secret 因此绝无被删机会）
		for (const p of update.values()) {
			expect(p.dataSource).toBe('bridge');
		}
		expect(skipped).toEqual([]);
	});

	it('② 已有 bridge-fed 同 kind → 返回更新该服务，不新建', () => {
		const { update, create } = resolveBridgeTargets(
			[glmManual, kimiBridge],
			[{ kind: 'kimi', serviceData: { slots: [] } }],
		);

		expect(create).toEqual([]);
		expect(update.get('kimi')?.id).toBe('kimi-1');
	});

	it('③ 同 kind 多个 bridge-fed（异常态）→ 取其一，其余留给去重清理', () => {
		const { update, create } = resolveBridgeTargets(
			[kimiBridge, kimiBridgeDup],
			[{ kind: 'kimi', serviceData: { slots: [] } }],
		);

		expect(create).toEqual([]);
		expect(update.size).toBe(1);
		expect(['kimi-1', 'kimi-2']).toContain(update.get('kimi')?.id ?? '');
	});

	it('未知 kind → 跳过并记入 skipped', () => {
		const { update, create, skipped } = resolveBridgeTargets(
			[],
			[{ kind: 'unknown-ai', serviceData: { slots: [] } }],
		);

		expect(update.size).toBe(0);
		expect(create).toEqual([]);
		expect(skipped).toEqual(['unknown-ai']);
	});

	it('同一 kind 重复推送条目只处理一次；bridge 服务自身 kind 被跳过', () => {
		const { update, create, skipped } = resolveBridgeTargets(
			[bridgeSvc],
			[
				{ kind: 'mimo', serviceData: { slots: [] } },
				{ kind: 'mimo', serviceData: { slots: [] } },
				{ kind: 'bridge', serviceData: { slots: [] } },
			],
		);

		expect(create).toEqual(['mimo']);
		expect(update.size).toBe(0);
		expect(skipped).toEqual(['bridge']);
	});
});

describe('selectBridgeServicesToRemove（Y1：空 activeKinds = 全量移除 bridge-fed）', () => {
	it('activeKinds 为空 → 移除全部 bridge-fed；manual 与 Bridge 服务自身保留', () => {
		const toRemove = selectBridgeServicesToRemove([glmManual, kimiBridge, bridgeSvc], []);
		expect(toRemove.map(p => p.id)).toEqual(['kimi-1']);
	});

	it('kind 仍在活跃列表 → 不移除', () => {
		const toRemove = selectBridgeServicesToRemove([kimiBridge], ['kimi']);
		expect(toRemove).toEqual([]);
	});

	it('kind 不在活跃列表 → 移除对应 bridge-fed', () => {
		const toRemove = selectBridgeServicesToRemove([kimiBridge, glmManual], ['glm']);
		// glm 只有 manual 服务，不移除；kimi 已不活跃，移除
		expect(toRemove.map(p => p.id)).toEqual(['kimi-1']);
	});
});

describe('collectBridgeSecretTargets（R2：遗留凭证迁移目标）', () => {
	it('dataSource 缺失的旧 profile → 清理（dataSource 字段出现前的 bridge-fed）', () => {
		const legacy = { id: 'mimo-old', kind: 'mimo', displayName: '旧 MiMo' } as ServiceProfile;
		expect(collectBridgeSecretTargets([legacy])).toEqual(['mimo-old']);
	});

	it('dataSource=bridge → 清理', () => {
		expect(collectBridgeSecretTargets([kimiBridge])).toEqual(['kimi-1']);
	});

	it('dataSource=manual → 绝不可清理（用户手输凭证）', () => {
		expect(collectBridgeSecretTargets([glmManual])).toEqual([]);
	});

	it('非 AI kind（含 bridge 服务自身）→ 不清理', () => {
		expect(collectBridgeSecretTargets([bridgeSvc])).toEqual([]);
		expect(BRIDGE_AI_KINDS.has('bridge')).toBe(false);
	});
});

describe('shouldAcceptBridgeData（防降级：err 推送不覆盖好数据）', () => {
	const good = (id: string): ServiceData => ({ id, name: id, kind: 'kimi', slots: [], updatedAt: 1 });
	const err = (id: string): ServiceData => ({ ...good(id), err: 'Kimi 认证失败' });

	it('① 有旧好数据 + 新 err → 拒绝（保留旧数据）', () => {
		expect(shouldAcceptBridgeData(good('kimi-1'), err('kimi-1'))).toBe(false);
	});

	it('② 有旧 err + 新 err → 接受（持续失败仍可见错误）', () => {
		expect(shouldAcceptBridgeData(err('kimi-1'), err('kimi-1'))).toBe(true);
	});

	it('③ 无旧数据 + 新 err → 接受（首次失败仍可见错误）', () => {
		expect(shouldAcceptBridgeData(undefined, err('kimi-1'))).toBe(true);
	});

	it('④ 任意旧数据 + 新好数据 → 接受（正常覆盖）', () => {
		expect(shouldAcceptBridgeData(good('kimi-1'), good('kimi-1'))).toBe(true);
		expect(shouldAcceptBridgeData(err('kimi-1'), good('kimi-1'))).toBe(true);
		expect(shouldAcceptBridgeData(undefined, good('kimi-1'))).toBe(true);
	});
});

describe('summarizeRejectedPushes（Y4：拒绝项聚合为 Bridge lastError）', () => {
	it('空列表 → undefined（无拒绝，保持无错误状态）', () => {
		expect(summarizeRejectedPushes([])).toBeUndefined();
	});

	it('单项拒绝 → kind 列表 + 首个 err 摘要', () => {
		expect(summarizeRejectedPushes([{ kind: 'kimi', err: 'Kimi 认证失败' }]))
			.toBe('推送被拒（kimi）：Kimi 认证失败');
	});

	it('多项拒绝 → kind 以、连接，err 取第一项', () => {
		expect(summarizeRejectedPushes([
			{ kind: 'kimi', err: 'Kimi 认证失败' },
			{ kind: 'mimo', err: 'MiMo Cookie 失效' },
		])).toBe('推送被拒（kimi、mimo）：Kimi 认证失败');
	});

	it('超长 err 截断到 100 字符', () => {
		const long = 'x'.repeat(150);
		const summary = summarizeRejectedPushes([{ kind: 'glm', err: long }]);
		expect(summary?.length).toBe('推送被拒（glm）：'.length + 100);
	});
});
