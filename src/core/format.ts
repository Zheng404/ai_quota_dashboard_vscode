/** 格式化数字（用于状态栏、Tooltip 等展示） */
export function fmtNum(n?: number): string {
	if (n == null) { return '-'; }
	if (n >= 1e9) { return (n / 1e9).toFixed(2) + 'B'; }
	if (n >= 1e6) { return (n / 1e6).toFixed(1) + 'M'; }
	if (n >= 1e3) { return (n / 1e3).toFixed(1) + 'K'; }
	return String(n);
}
