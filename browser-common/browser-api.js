/**
 * 浏览器 API 兼容性层
 *
 * Firefox 使用 browser.* 命名空间，Chrome 使用 chrome.*
 * Firefox 的 browser.* 返回 Promise，Chrome 的 chrome.* 使用回调
 * 本扩展统一使用 chrome.*（Firefox 已提供兼容层）
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
