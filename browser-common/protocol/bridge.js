/**
 * Data Bridge 推送 payload 构造与校验 — 单一可信源
 *
 * 浏览器端直接 import；VSCode 端 server.ts 消费镜像函数
 * `vscode/src/bridge/constants.ts` 的 `hasBridgeData`（由
 * `vscode/src/bridge/protocol.test.ts` 契约测试锁定行为一致）。
 */

import { BRIDGE_SOURCE } from './constants.js';

/**
 * 浏览器扩展推送的配额数据条目（serviceData 即 api/*.js fetcher 的返回值）。
 *
 * @typedef {object} DataPayloadItem
 * @property {string} kind        服务类型（'glm' | 'kimi' | 'mimo' | ...）
 * @property {object} serviceData 该服务的完整配额数据（ServiceData + 各服务扩展字段）
 */

/**
 * 浏览器扩展推送的配额数据 payload。
 *
 * @typedef {object} DataPayload
 * @property {string} source                     推送来源标识（BRIDGE_SOURCE）
 * @property {number} timestamp                  推送时间戳（毫秒）
 * @property {DataPayloadItem[]} data            各活跃服务的配额数据
 * @property {string[]} activeKinds              浏览器扩展当前活跃的服务 kind 列表（VSCode 据此同步移除服务）
 * @property {Record<string, string>} displayNames 各 AI 服务自定义显示名称映射（kind -> displayName）
 */

/**
 * 构造 Bridge 推送 payload（统一 source 标识与字段形状）。
 *
 * @param {object} parts 采集完成的配额数据各字段
 * @param {Array<{kind: string, serviceData: object}>} [parts.data] 各服务配额数据
 * @param {Iterable<string>} [parts.activeKinds] 活跃服务 kind 集合（Set 或数组）
 * @param {Record<string, string>} [parts.displayNames] 显示名称映射
 * @param {number} [parts.timestamp] 推送时间戳（默认 Date.now()）
 * @returns {DataPayload}
 */
export function createDataPayload(parts) {
	return {
		source: BRIDGE_SOURCE,
		timestamp: parts.timestamp ?? Date.now(),
		data: parts.data ?? [],
		activeKinds: [...(parts.activeKinds ?? [])],
		displayNames: { ...(parts.displayNames ?? {}) },
	};
}

/**
 * 判断 payload 是否携带任一有效数据（data 数组非空）。VSCode 端据此决定
 * 是否触发回调分发，空 payload 只回 200 确认、不更新 Bridge 状态。
 *
 * @param {DataPayload} payload 待校验的推送 payload
 * @returns {boolean}
 */
export function hasBridgeData(payload) {
	return Boolean(payload && Array.isArray(payload.data) && payload.data.length > 0);
}
