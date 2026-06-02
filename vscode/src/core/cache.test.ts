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

	it('disposes without error', () => {
		expect(() => cache.dispose()).not.toThrow();
	});
});
