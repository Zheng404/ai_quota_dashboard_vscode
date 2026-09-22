import { describe, it, expect } from 'vitest';
import { StatusBar } from './statusbar';
import { ServiceData } from '../core/types';

function mkData(id: string, name = id): ServiceData {
	return { id, name, kind: 'test', slots: [], updatedAt: Date.now() };
}

describe('StatusBar.remove（批次 2 新增 API）', () => {
	it('移除已 feed 且已 flush 的服务：缓存与状态栏项一并清除', () => {
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.flush();
		expect(bar.getData().has('a')).toBe(true);

		bar.remove('a');
		expect(bar.getData().has('a')).toBe(false);

		// 再次 flush 不应复活已移除的服务，也不应抛错
		bar.flush();
		expect(bar.getData().has('a')).toBe(false);
	});

	it('移除不存在的 id 静默返回', () => {
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.flush();

		expect(() => bar.remove('nope')).not.toThrow();
		expect(bar.getData().has('a')).toBe(true);
	});

	it('移除后不影响其他服务', () => {
		const bar = new StatusBar();
		bar.feed(mkData('a'));
		bar.feed(mkData('b'));
		bar.flush();

		bar.remove('a');
		expect(bar.getData().has('a')).toBe(false);
		expect(bar.getData().has('b')).toBe(true);
	});
});
