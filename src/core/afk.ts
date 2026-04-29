/** AFK（离开键盘）检测器 */
export class AfkDetector {
	private lastActiveTime = Date.now();
	private afk = false;

	updateActivity() {
		this.lastActiveTime = Date.now();
		if (this.afk) {
			this.afk = false;
			console.log('[AI Usage Monitor] 用户已恢复活动');
		}
	}

	checkAfk(thresholdSec: number): boolean {
		if (thresholdSec <= 0) { return false; }
		const isAfk = Date.now() - this.lastActiveTime > thresholdSec * 1000;
		if (isAfk && !this.afk) {
			this.afk = true;
			console.log('[AI Usage Monitor] 用户已进入 AFK 状态');
		}
		return isAfk;
	}
}
