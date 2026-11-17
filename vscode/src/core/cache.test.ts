import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from './cache';
import { ServiceData } from './types';

describe('CacheManager', () => {
	let cache: CacheManager;

	beforeEach(() => {
		cache = new CacheManager();
	});

	it('stores and retrieves data', () => {
		const data: ServiceData = {
			id: 'test',
			name: 'Test Service',
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
		};
		cache.set('test', data, 60);
		expect(cache.get('test')).toEqual(data);
	});

	it('returns undefined for missing key', () => {
		expect(cache.get('nonexistent')).toBeUndefined();
	});

	it('returns undefined for expired entry', () => {
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
		};
		cache.set('test', data, -1); // 已过期
		expect(cache.get('test')).toBeUndefined();
	});

	it('clears all entries', () => {
		const data: ServiceData = {
			id: 'test',
			name: 'Test',
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
		};
		cache.set('a', data, 60);
		cache.set('b', data, 60);
		cache.clear();
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBeUndefined();
	});

	it('evicts the least recently used entry after a get promotes recency', () => {
		const lru = new CacheManager(2);
		const createData = (id: string): ServiceData => ({
			id,
			name: id,
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
		});
		const a = createData('a');
		const b = createData('b');
		const c = createData('c');

		try {
			lru.set('a', a, 60);
			lru.set('b', b, 60);
			expect(lru.get('a')).toEqual(a); // 顺序变为 b、a

			lru.set('c', c, 60); // 淘汰最久未使用的 b

			expect(lru.getStats()).toEqual({ size: 2, maxSize: 2 });
			expect(lru.get('b')).toBeUndefined();
			expect(lru.get('a')).toEqual(a);
			expect(lru.get('c')).toEqual(c);
		} finally {
			lru.dispose();
		}
	});

	it('treats set on an existing key as most recently used and updates its value', () => {
		const lru = new CacheManager(2);
		const createData = (id: string): ServiceData => ({
			id,
			name: id,
			kind: 'test',
			slots: [],
			updatedAt: Date.now(),
		});
		const originalA = createData('a-original');
		const updatedA = createData('a-updated');
		const b = createData('b');
		const c = createData('c');

		try {
			lru.set('a', originalA, 60);
			lru.set('b', b, 60);
			lru.set('a', updatedA, 60); // 顺序变为 b、a
			lru.set('c', c, 60); // 淘汰 b，而不是刚更新的 a

			expect(lru.getStats()).toEqual({ size: 2, maxSize: 2 });
			expect(lru.get('b')).toBeUndefined();
			expect(lru.get('a')).toEqual(updatedA);
			expect(lru.get('c')).toEqual(c);
		} finally {
			lru.dispose();
		}
	});

	it('disposes without error', () => {
		expect(() => cache.dispose()).not.toThrow();
	});
});
