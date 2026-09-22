/**
 * Data Bridge 协议常量 — 双端（浏览器扩展 / VSCode 扩展）单一可信源
 *
 * 浏览器端直接 import 本模块；VSCode 端同样 runtime 直 import（esbuild 打包时
 * 内联 JS 实现，tsc 类型检查走同目录 index.d.ts 类型出口），双端单一可信源，
 * 由契约测试 `vscode/src/bridge/protocol.test.ts` 守卫（基线值锁定 + 漂移扫描）。
 *
 * 修改任何值时契约测试会失败，两侧天然一致，无需手动同步镜像。
 */

/** Bridge 监听端口范围起点（127.0.0.1） */
export const BRIDGE_PORT_START = 37100;

/** Bridge 监听端口范围终点（127.0.0.1） */
export const BRIDGE_PORT_END = 37110;

/** 预定义端口列表（浏览器端探测、VSCode 端监听共用，双端对齐） */
export const BRIDGE_PORTS = Array.from(
	{ length: BRIDGE_PORT_END - BRIDGE_PORT_START + 1 },
	(_, i) => BRIDGE_PORT_START + i,
);

/** /health 探测请求头名（浏览器扩展携带，VSCode 端校验） */
export const BRIDGE_PROBE_HEADER = 'X-Bridge-Probe';

/**
 * /health 探测密钥（随扩展公开发布）。
 * 本地其它进程不知道此密钥，无法获取 authToken 来伪造推送；
 * 防御边界是恶意网页与其它浏览器扩展，不防御本地恶意进程。
 */
export const BRIDGE_PROBE_SECRET = 'aqd-bridge-probe-7f3c9e1a4b2d';

/** /cookies 推送认证请求头名（值为 /health 返回的会话 authToken） */
export const BRIDGE_AUTH_HEADER = 'X-Auth-Token';

/** 推送 payload 的 source 标识（标识来自本扩展的推送） */
export const BRIDGE_SOURCE = 'ai-quota-data-bridge';

/** HTTP 端点：健康检查（端口发现 + 探测密钥换取 authToken） */
export const BRIDGE_HEALTH_PATH = '/health';

/** HTTP 端点：配额数据推送 */
export const BRIDGE_DATA_PATH = '/data';

/** 未连接 VSCode 时的快速检查间隔（毫秒） */
export const BRIDGE_FAST_CHECK_INTERVAL_MS = 10_000;

/** 推送防抖间隔（毫秒） */
export const RELAY_DEBOUNCE_MS = 1500;

/** 两次推送的最小间隔（毫秒，防止数据抖动导致高频推送） */
export const RELAY_MIN_INTERVAL_MS = 10_000;

/** 失败重传队列长度上限（超出后丢弃最旧数据包） */
export const MAX_PENDING_PAYLOADS = 50;

/** 单个数据包的最大重试次数（耗尽即丢弃） */
export const MAX_RETRY_ATTEMPTS = 3;

/** 重传队列的重试等待间隔（毫秒） */
export const RETRY_DELAY_MS = 3000;

/** 各类超时阈值（毫秒） */
export const TIMEOUTS = {
	/** /health 端口探测请求 */
	healthProbe: 2000,
	/** /data 配额数据推送请求 */
	push: 5000,
	/** 凭证有效性 API 探测（GLM/Kimi/MiMo 轻量接口） */
	apiProbe: 5000,
	/** 本地缓存凭证的 API 探测 */
	credentialProbe: 8000,
	/** 向标签页索取 Kimi relay 令牌的单请求超时 */
	tokenQuery: 2000,
	/** 后台标签页等待页面加载完成 */
	tabLoad: 15_000,
	/** 后台标签页加载完成后等待 JS 写入 cookie */
	tabSettle: 3000,
};
