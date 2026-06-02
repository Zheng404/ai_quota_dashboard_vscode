import { ServiceData } from './types';

interface CacheEntry {
	data: ServiceData;
	expires: number;
}

/** 默认最大缓存条目数 */
const DEFAULT_MAX_SIZE = 100;

/** 默认清理间隔 (ms) */
const DEFAULT_CLEANUP_INTERVAL = 5 * 60 * 1000;

/** 带 TTL + LRU 淘汰的内存缓存 */
export class CacheManager {
	/** 使用 Map 保持插入顺序（最近访问的在末尾） */
	private cache = new Map<string, CacheEntry>();
	private cleanupTimer: NodeJS.Timeout | undefined;

	constructor(
		private readonly maxSize: number = DEFAULT_MAX_SIZE,
		cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL,
	) {
		if (maxSize <= 0) {
			throw new RangeError(`maxSize must be > 0, got ${maxSize}`);
		}
		this.cleanupTimer = setInterval(() => this.removeExpired(), cleanupIntervalMs);
	}

	get(id: string): ServiceData | undefined {
		const entry = this.cache.get(id);
		if (!entry) { return undefined; }
		if (Date.now() >= entry.expires) {
			this.cache.delete(id);
			return undefined;
		}
		// LRU: 移动到末尾（最新访问）
		this.cache.delete(id);
		this.cache.set(id, entry);
		return entry.data;
	}

	set(id: string, data: ServiceData, ttlSec: number) {
		if (ttlSec <= 0 || Number.isNaN(ttlSec)) {
			// 非法 TTL 直接跳过缓存
			return;
		}
		// 如果已存在，先删除以更新顺序
		if (this.cache.has(id)) {
			this.cache.delete(id);
		}
		// LRU 淘汰
		while (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			} else {
				break;
			}
		}
		this.cache.set(id, { data, expires: Date.now() + ttlSec * 1000 });
	}

	clear() {
		this.cache.clear();
	}

	/** 获取当前缓存统计 */
	getStats(): { size: number; maxSize: number } {
		return { size: this.cache.size, maxSize: this.maxSize };
	}

	dispose() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}

	private removeExpired() {
		const now = Date.now();
		for (const [key, entry] of this.cache) {
			if (now >= entry.expires) {
				this.cache.delete(key);
			}
		}
	}
}
