/** AFK（离开键盘）检测器
 *
 * 阈值设为 0 时关闭 AFK 检测（始终返回 false）。
 */
export class AfkDetector {
	private lastActiveTime = Date.now();

	/** 记录用户活动，重置 AFK 计时器 */
	updateActivity() {
		this.lastActiveTime = Date.now();
	}

	/** 检查是否处于 AFK 状态 */
	checkAfk(thresholdSec: number): boolean {
		if (thresholdSec <= 0) { return false; }
		return Date.now() - this.lastActiveTime > thresholdSec * 1000;
	}
}
