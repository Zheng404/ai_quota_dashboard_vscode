/**
 * 配额数据采集与推送 — background 子模块
 *
 * 职责：按活跃服务拉取配额数据（gatherAllQuotaData，复用 api/*.js fetcher）、
 * 构造 payload 推送到 VSCode（relayData）、推送最小间隔频率限制。
 *
 * 注意：activeKinds 为空时仍会发送空 data payload（轻量同步，
 * VSCode 端据此同步移除已删除服务），不得因 data 为空而跳过推送。
 *
 * 依赖：protocol、config-sync（活跃目标）、bridge-client（推送 + 重试队列）、
 * api/glm.js / api/kimi.js / api/mimo.js（各服务配额拉取入口）。
 * 凭证基础设施（credential / kimi-relay / cookie-utils）仍由 background 与
 * api/*.js 内部使用，本模块不再直接采集凭证。
 */

import {
	RELAY_MIN_INTERVAL_MS,
	createDataPayload,
} from '../../protocol/index.js';
import { activeKinds, activeDisplayNames } from './config-sync.js';
import { sendToVscode, enqueuePayload } from './bridge-client.js';
import { getKimiAccessToken } from './kimi-relay.js';
import { getCached, setCached } from '../../cache.js';
import { fetchGlmQuota } from '../../api/glm.js';
import { fetchKimiQuota } from '../../api/kimi.js';
import { fetchMimoQuota } from '../../api/mimo.js';

let relayTimeout = null;
let lastRelayTime = 0;
let isRelaying = false;
let relayDirty = false;

// ===== 配额数据采集（按活跃服务）=====

/** kind → api/*.js 配额拉取入口（返回 ServiceData + 扩展字段，单项失败由 fetcher 内部兜底为 err 数据）。
 *  kimi 注入 kimi-relay 的 getKimiAccessToken：background 内直接函数调用获取 relay 镜像 token，
 *  不走 runtime.sendMessage 自发自收（Firefox MV3 event page 下 sender's frame 不接收自身消息，
 *  会导致 relay 链路永远拿不到网页 token、静默降级到 Code API Key 路径）。 */
const QUOTA_FETCHERS = {
	glm: fetchGlmQuota,
	kimi: () => fetchKimiQuota({ tokenProvider: getKimiAccessToken }),
	mimo: fetchMimoQuota,
};

/**
 * 单项拉取失败（fetcher 返回带 err 或抛异常）时的兜底：
 * 尝试回退 cache.js 中该 kind 的近期缓存数据（TTL 由 cache 内部判定，命中即返回），
 * 缓存存在且无 err 则推缓存数据（updatedAt 保持缓存原值，让 VSCode 感知数据时效）；
 * 无可用缓存返回 null，调用方维持 err 兜底。
 */
async function tryCacheFallback(kind) {
	try {
		const cached = await getCached(kind);
		if (cached && !cached.err) {
			console.log(`[Data] ${kind}: 拉取失败，回退缓存数据（updatedAt=${new Date(cached.updatedAt || 0).toISOString()}）`);
			return cached;
		}
	} catch { /* ignore，维持 err 兜底 */ }
	return null;
}

/**
 * 采集当前活跃服务的全部配额数据。
 *
 * 各服务并行拉取（Promise.all），周期推送延迟 = 最慢单服务而非各服务之和；
 * 单项失败（拉取抛异常或返回 err）时该项优先回退本地缓存，无缓存才用
 * 空槽位 + err 兜底，绝不让单项失败中断整体推送。
 */
export async function gatherAllQuotaData() {
	const results = await Promise.all([...activeKinds].map(async (kind) => {
		const fetcher = QUOTA_FETCHERS[kind];
		if (!fetcher) {
			console.warn(`[Data] ${kind}: 无对应配额拉取入口，跳过`);
			return null;
		}

		try {
			const serviceData = await fetcher();
			if (serviceData && !serviceData.err) {
				// 成功数据顺手种子 kind 键缓存，供后续失败轮次回退（TTL 由 cache 内部判定）
				await setCached(kind, serviceData);
				return { kind, serviceData };
			}
			const fallback = await tryCacheFallback(kind);
			return { kind, serviceData: fallback || serviceData || null };
		} catch (err) {
			console.error(`[Data] ${kind}: 拉取配额数据失败:`, err.message);
			const fallback = await tryCacheFallback(kind);
			return {
				kind,
				serviceData: fallback || {
					id: kind,
					name: activeDisplayNames[kind] || kind,
					kind,
					slots: [],
					updatedAt: Date.now(),
					err: err.message || '请求失败，请稍后重试',
				},
			};
		}
	}));

	const data = results.filter(Boolean);

	const summary = data.map(d => `${d.kind}=${d.serviceData?.err ? '✗' : '✓'}`).join(', ');
	console.log(`[Data] 采集结果: ${summary || '无活跃服务'}`);
	return data;
}

// ===== 推送逻辑（按活跃服务推送配额数据）=====

export async function relayData(force = false) {
  if (isRelaying) {
    relayDirty = true;
    console.log('[Relay] 已有推送在进行中，标记 dirty');
    return;
  }

  const now = Date.now();
  if (!force && now - lastRelayTime < RELAY_MIN_INTERVAL_MS) {
    relayDirty = true;
    console.log('[Relay] 距离上次推送不足 minInterval，延迟调度');
    clearTimeout(relayTimeout);
    const remaining = RELAY_MIN_INTERVAL_MS - (now - lastRelayTime) + 100;
    relayTimeout = setTimeout(() => relayData(true), remaining);
    return;
  }

  isRelaying = true;
  relayDirty = false;

  // 采集当前活跃服务的配额数据（单项失败已兜底，不中断整体；
  // activeKinds 为空时 data 为 []，仍发送空 payload 供 VSCode 同步移除）
  const data = await gatherAllQuotaData();

  const payload = createDataPayload({
    timestamp: now,
    data,
    activeKinds,
    displayNames: activeDisplayNames,
  });

  try {
    const success = await sendToVscode(payload);
    if (success) {
      lastRelayTime = now;
    } else {
      await enqueuePayload(payload);
    }
  } finally {
    isRelaying = false;
    if (relayDirty) {
      relayDirty = false;
      setTimeout(() => relayData(true), 0);
    }
  }
}

