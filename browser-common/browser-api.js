/**
 * 浏览器 API 兼容性层
 *
 * Firefox 使用 browser.* 命名空间，Chrome 使用 chrome.*
 * Firefox 的 browser.* 返回 Promise，Chrome 的 chrome.* 使用回调
 * 本扩展统一使用 chrome.*（Firefox 已提供兼容层）
 *
 * ⚠️ 当前所有代码直接使用 chrome.* API，此模块的导出未被任何文件引用。
 * 保留此文件作为兼容性预留，未来如需统一 API 调用可启用。
 */

// 优先使用 browser.*（Firefox），回退到 chrome.*（Chrome）
export const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * 安全地发送 runtime 消息
 */
export function sendRuntimeMessage(message) {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage(message, (response) => {
			resolve(response);
		});
	});
}
