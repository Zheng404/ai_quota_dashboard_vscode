/**
 * Popup / Dashboard / api ↔ Background 消息 action 名 — 单一可信源
 *
 * 以 background.js 实际收发的 action 穷举；修改任何值需同步双端调用点
 * （漂移守卫测试禁止白名单外文件出现裸 action 字面量）。
 *
 * 注意：content script（kimi-content.js）只能以 classic script 注入、无法
 * ESM import，其使用的 KIMI_TOKEN_UPDATED / QUERY_KIMI_TOKEN 保持字面量
 * 自包含，由漂移守卫白名单放行。
 */

/** Popup ↔ Background 消息 action 常量 */
export const MSG = {
	/** Popup → Background：手动触发推送全部配额数据到 VSCode */
	RELAY_NOW: 'relayNow',
	/** Popup → Background：手动触发 Data Bridge 重连（重新端口发现 + 恢复重传队列 + 立即推送） */
	RECONNECT_BRIDGE: 'reconnectBridge',
	/** Popup → Background：获取 Bridge 连接状态 + 诊断信息 */
	GET_STATUS: 'getStatus',
	/** Popup → Background：配置变更通知（添加/删除/保存服务后发送） */
	CONFIG_UPDATED: 'configUpdated',
	/** Popup → Background：手动触发凭证检测 + 自动刷新 */
	CHECK_CREDENTIALS: 'checkCredentials',
	/** Background → Popup/Dashboard：Cookie 变化即时通知（含 kind，触发单服务刷新） */
	COOKIE_CHANGED: 'cookieChanged',
	/** Background → Popup/Dashboard：Data Bridge 连接建立广播（触发桥卡即时刷新，避免等下一刷新周期） */
	BRIDGE_CONNECTED: 'bridgeConnected',
	/** content script → Background：上报镜像的 Kimi localStorage 令牌 */
	KIMI_TOKEN_UPDATED: 'kimiTokenUpdated',
	/** Popup/api → Background：索取 relay 镜像的 Kimi access_token */
	GET_KIMI_TOKEN: 'getKimiToken',
	/** api → Background：relay 令牌被网页 API 401 拒绝（unauthenticated），
	 *  作废内存+storage 镜像并触发全链重续期（popup 无法直接清 background 内存镜像） */
	KIMI_TOKEN_INVALID: 'kimiTokenInvalid',
	/** Background → content script：向 kimi.com 标签页按需索取令牌 */
	QUERY_KIMI_TOKEN: 'queryKimiToken',
};

/** 全部 action 名集合（契约完整性断言与漂移守卫用） */
export const MSG_ACTIONS = Object.freeze([...new Set(Object.values(MSG))]);
