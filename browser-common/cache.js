/**
 * 缓存管理模块
 */

const CACHE_TTL_MS = 60 * 1000;
const CACHE_ERROR_TTL_MS = 5 * 60 * 1000;  // 错误数据缓存 5 分钟，避免频繁重试

export async function getCached(serviceId) {
	try {
		const result = await chrome.storage.local.get(`quotaCache_${serviceId}`);
		const entry = result[`quotaCache_${serviceId}`];
		if (!entry) return null;
		const age = Date.now() - entry.timestamp;
		if (age > entry.ttl) return null;
		return entry.data;
	} catch {
		return null;
	}
}

/**
 * 写入缓存
 * @param {string} serviceId - 服务 ID
 * @param {object} data - 缓存数据
 * @param {boolean} isError - 是否为错误数据（错误数据使用更长 TTL）
 */
export async function setCached(serviceId, data, isError = false) {
	try {
		await chrome.storage.local.set({
			[`quotaCache_${serviceId}`]: {
				data,
				timestamp: Date.now(),
				ttl: isError ? CACHE_ERROR_TTL_MS : CACHE_TTL_MS,
			},
		});
	} catch {
		// ignore
	}
}
