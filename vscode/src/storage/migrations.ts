import type * as vscode from 'vscode';
import type { ServiceProfile, UsagePoint } from '../core/types';

export const V2_CLEANUP_DONE_KEY = 'aiQuotaDashboard.v2CleanupDone';

const SERVICES_KEY = 'services';
const HISTORY_KEY = 'aiQuotaDashboard.history';
const BRIDGE_STATE_KEY = 'aiQuotaDashboard.bridgeState';
const BRIDGE_SECRETS_CLEARED_KEY = 'aiQuotaDashboard.bridgeSecretsCleared';

interface LegacyServiceProfile extends ServiceProfile {
	dataSource?: 'manual' | 'bridge';
}

type StoredHistory = Record<string, UsagePoint[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) { return false; }
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isStoredProfile(value: unknown): value is LegacyServiceProfile {
	return isPlainObject(value)
		&& typeof value.id === 'string'
		&& typeof value.kind === 'string'
		&& typeof value.displayName === 'string';
}

function isStoredHistory(value: unknown): value is StoredHistory {
	return isPlainObject(value);
}

function shouldRemoveProfile(profile: LegacyServiceProfile): boolean {
	return profile.kind === 'bridge'
		|| profile.kind === 'mimo'
		|| ((profile.kind === 'glm' || profile.kind === 'kimi') && profile.dataSource === 'bridge');
}

function stripDataSource(profile: LegacyServiceProfile): ServiceProfile {
	const cleaned = { ...profile };
	delete cleaned.dataSource;
	return cleaned;
}

/** 2.0 一次性清理：仅保留手动 GLM/Kimi 等未明确移除的配置与历史。 */
export async function runV2CleanupMigration(ctx: vscode.ExtensionContext): Promise<void> {
	if (ctx.globalState.get<boolean>(V2_CLEANUP_DONE_KEY, false)) { return; }

	// globalState 可能被外部写坏；仅对结构损坏降级，真实 Secret/写入异常仍向上抛出。
	const rawProfiles = ctx.globalState.get<unknown>(SERVICES_KEY, []);
	const profiles = Array.isArray(rawProfiles) ? rawProfiles.filter(isStoredProfile) : [];
	const keptProfiles = profiles.filter(profile => !shouldRemoveProfile(profile));
	const removedIds = profiles
		.filter(shouldRemoveProfile)
		.map(profile => profile.id);

	for (const id of removedIds) {
		await ctx.secrets.delete(`apiKeys.${id}`);
	}

	const keptIds = new Set(keptProfiles.map(profile => profile.id));
	const rawHistory = ctx.globalState.get<unknown>(HISTORY_KEY, {});
	const storedHistory = isStoredHistory(rawHistory) ? rawHistory : {};
	const history: StoredHistory = {};
	for (const [id, points] of Object.entries(storedHistory)) {
		if (keptIds.has(id)) {
			history[id] = points;
		}
	}

	await ctx.globalState.update(SERVICES_KEY, keptProfiles.map(stripDataSource));
	await ctx.globalState.update(HISTORY_KEY, history);
	await ctx.globalState.update(BRIDGE_STATE_KEY, undefined);
	await ctx.globalState.update(BRIDGE_SECRETS_CLEARED_KEY, undefined);

	// 清理标记最后写入；任一步失败都会在下次激活重新执行完整幂等清理。
	await ctx.globalState.update(V2_CLEANUP_DONE_KEY, true);
}
