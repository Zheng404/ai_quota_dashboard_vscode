import { ServiceData } from './types';

/** 带 TTL 的内存缓存 */
export class CacheManager {
	private cache = new Map<string, { data: ServiceData; expires: number }>();
	private cleanupTimer: NodeJS.Timeout | undefined;

	constructor(cleanupIntervalMs = 5 * 60 * 1000) {
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			for (const [key, entry] of this.cache) {
				if (now > entry.expires) {
					this.cache.delete(key);
				}
			}
		}, cleanupIntervalMs);
	}

	get(id: string): ServiceData | undefined {
		const entry = this.cache.get(id);
		if (!entry) { return undefined; }
		if (Date.now() > entry.expires) {
			this.cache.delete(id);
			return undefined;
		}
		return entry.data;
	}

	set(id: string, data: ServiceData, ttlSec: number) {
		this.cache.set(id, { data, expires: Date.now() + ttlSec * 1000 });
	}

	clear() {
		this.cache.clear();
	}

	dispose() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}
}
