/**
 * 缓存管理模块
 */

const CACHE_TTL_MS = 60 * 1000;

export async function getCached(serviceId) {
	try {
		const result = await chrome.storage.local.get(`quotaCache_${serviceId}`);
		const entry = result[`quotaCache_${serviceId}`];
		if (!entry) return null;
		const age = Date.now() - entry.timestamp;
		if (age > CACHE_TTL_MS) return null;
		return entry.data;
	} catch {
		return null;
	}
}

export async function setCached(serviceId, data) {
	try {
		await chrome.storage.local.set({
			[`quotaCache_${serviceId}`]: { data, timestamp: Date.now() },
		});
	} catch {
		// ignore
	}
}
