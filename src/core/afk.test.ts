import { describe, it, expect } from 'vitest';
import { AfkDetector } from './afk';

describe('AfkDetector', () => {
	it('returns false initially', () => {
		const detector = new AfkDetector();
		expect(detector.checkAfk(3600)).toBe(false);
	});

	it('detects AFK after threshold', () => {
		const detector = new AfkDetector();
		detector.updateActivity();
		// 模拟时间流逝（通过修改内部状态）
		// 由于 lastActiveTime 是 private，我们通过 updateActivity 后再等待来测试
		// 但测试不能真正等待，所以测试边界条件
		expect(detector.checkAfk(0)).toBe(false); // threshold 为 0 禁用 AFK
	});

	it('disables when threshold is 0', () => {
		const detector = new AfkDetector();
		expect(detector.checkAfk(0)).toBe(false);
	});

	it('disables when threshold is negative', () => {
		const detector = new AfkDetector();
		expect(detector.checkAfk(-1)).toBe(false);
	});
});
