/**
 * Lucide 图标本地化注册表（MV3 CSP 禁止 CDN 外链，SVG 全部内联）
 *
 * 仅收录本扩展用到的图标，stroke 风格统一：
 * fill="none" stroke="currentColor" stroke-width="2" stroke-linecap/linejoin="round"
 * 调用：icon('refresh-cw', 14) → 内联 SVG 字符串
 */

const PATHS = {
	// 品牌标识：脉搏/活动
	activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
	// 刷新
	'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
	// 加载中（旋转指示器）
	'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
	// 设置（滑杆）
	'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
	// 空状态：柱状图
	'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
	// 错误：警示三角
	'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	// Data Bridge：信号塔
	'radio-tower': '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>',
	// 添加
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	// 删除
	'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
	// 打开外部网站
	'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
	// 时钟（重置时间 / 有效期）
	clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	// 数据管理
	database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
	// 凭证缓存
	'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
	// 阈值仪表
	gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
	// 重新连接（插头+闪电）
	'plug-zap': '<path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="m2 22 3-3"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m18 3-4 4h6l-4 4"/>',
	// 保存
	check: '<path d="M20 6 9 17l-5-5"/>',
};

/**
 * 生成内联 Lucide SVG 字符串
 * @param {string} name 图标名（PATHS 键）
 * @param {number} [size] 边长 px
 * @param {string} [cls] 额外 class
 * @returns {string}
 */
export function icon(name, size = 14, cls = '') {
	const body = PATHS[name] || '';
	const clsAttr = cls ? ` ${cls}` : '';
	return `<svg class="ic${clsAttr}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** 旋转指示器：加载态图标（配合 .spin 动画） */
export function spinnerIcon(size = 14) {
	return icon('loader-circle', size);
}
