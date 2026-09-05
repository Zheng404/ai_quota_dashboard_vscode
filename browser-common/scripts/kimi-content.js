/**
 * Kimi Content Script — 访问令牌被动镜像
 *
 * 注入 https://www.kimi.com/*，在 ISOLATED world 读取页面 localStorage 的
 * access_token / refresh_token（localStorage 按 origin 隔离、不按 JS world 隔离，
 * 无需 MAIN world），上报给 background 做被动镜像。
 *
 * 上报时机：
 *   1. 启动时立即上报一次
 *   2. storage 事件（其他 tab 写入 access_token / refresh_token）
 *   3. 60s 轮询兜底（SPA 在同一 tab 内写入 localStorage 不触发 storage 事件）
 *   4. 响应 background 的 queryKimiToken 按需询问（popup 打开时索取）
 *
 * 注意：绝不调用 RefreshToken 端点（单消费者，接管续期会踢掉用户网页会话），
 * 仅被动镜像网页自身续期后的新令牌。refresh_token 只镜像存储、不推送远端（阶段 2 预留）。
 */

/** 读取页面 localStorage 中的 Kimi 令牌，构造上报载荷 */
function readKimiTokens() {
	let accessToken = null;
	let refreshToken = null;
	try {
		accessToken = localStorage.getItem('access_token');
		refreshToken = localStorage.getItem('refresh_token');
	} catch (err) {
		console.warn('[KimiContent] 读取 localStorage 失败:', err);
	}
	return { accessToken, refreshToken, capturedAt: Date.now() };
}

/** 上报当前令牌给 background（扩展上下文失效时静默失败） */
function reportKimiTokens() {
	const payload = readKimiTokens();
	// 只记长度不记值，避免令牌泄漏到页面控制台日志
	console.log('[KimiContent] 令牌镜像上报 access_token(%d) refresh_token(%d)',
		payload.accessToken ? payload.accessToken.length : 0,
		payload.refreshToken ? payload.refreshToken.length : 0);
	try {
		const sending = chrome.runtime.sendMessage({ action: 'kimiTokenUpdated', ...payload });
		sending?.catch(() => {
			// 无监听者（background 未就绪 / 扩展正在重载），静默
		});
	} catch {
		// 扩展上下文已失效（Extension context invalidated），静默
	}
}

// 启动即上报一次
reportKimiTokens();

// storage 事件：其他 tab 写入令牌时上报（同 tab 写入不触发，靠下方轮询兜底）
window.addEventListener('storage', (event) => {
	if (event.key === 'access_token' || event.key === 'refresh_token') {
		reportKimiTokens();
	}
});

// 60s 轮询兜底：SPA 在同一 tab 内刷新令牌不触发 storage 事件
setInterval(reportKimiTokens, 60 * 1000);

// 响应 background 的按需询问（popup 打开时经 background 转发索取）
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg.action === 'queryKimiToken') {
		// 即使 access_token 不存在也必须回应（返回 undefined 会导致 messaging
		// 通道无响应，调用方只能等超时）；附 foundKeys 供 background 区分
		// 「脚本存活但 key 名不符」与「脚本未注入」
		let foundKeys = [];
		try {
			foundKeys = Object.keys(localStorage);
		} catch {
			// localStorage 不可读时保持空数组
		}
		sendResponse({ ...readKimiTokens(), foundKeys });
	}
	// 其余消息不处理；同步 sendResponse 无需保持通道
});
