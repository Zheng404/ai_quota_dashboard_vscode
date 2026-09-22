/**
 * Data Bridge 协议共享层 — VSCode 侧类型来源
 *
 * 运行时实现见同目录 JS（浏览器端直接消费）；VSCode 端 runtime 直 import 同目录
 * JS（esbuild 打包时内联），本声明文件为 tsc 类型检查的类型出口，
 * 由 `vscode/src/bridge/protocol.test.ts` 契约测试守卫基线值等价。
 */

/** 浏览器扩展推送的配额数据条目（serviceData 即 api/*.js fetcher 的返回值） */
export interface DataPayloadItem {
	/** 服务类型（'glm' | 'kimi' | 'mimo' | ...） */
	kind: string;
	/** 该服务的完整配额数据（ServiceData + 各服务扩展字段） */
	serviceData: Record<string, unknown>;
}

/** 浏览器扩展推送的配额数据 payload */
export interface DataPayload {
	/** 推送来源标识 */
	source: string;
	/** 推送时间戳（毫秒） */
	timestamp: number;
	/** 各活跃服务的配额数据 */
	data: DataPayloadItem[];
	/** 浏览器扩展当前活跃的服务 kind 列表，用于 VSCode 端同步移除服务 */
	activeKinds?: string[];
	/** 浏览器扩展中各 AI 服务的自定义显示名称映射（kind -> displayName） */
	displayNames?: Record<string, string>;
}

/** Bridge 监听端口范围（127.0.0.1） */
export declare const BRIDGE_PORT_START: number;
export declare const BRIDGE_PORT_END: number;
/** 预定义端口列表（浏览器端探测、VSCode 端监听共用） */
export declare const BRIDGE_PORTS: number[];
/** /health 探测请求头名 */
export declare const BRIDGE_PROBE_HEADER: string;
/** /health 探测密钥 */
export declare const BRIDGE_PROBE_SECRET: string;
/** /data 推送认证请求头名 */
export declare const BRIDGE_AUTH_HEADER: string;
/** 推送 payload 的 source 标识 */
export declare const BRIDGE_SOURCE: string;
/** HTTP 端点路径 */
export declare const BRIDGE_HEALTH_PATH: string;
export declare const BRIDGE_DATA_PATH: string;
/** 未连接 VSCode 时的快速检查间隔（毫秒） */
export declare const BRIDGE_FAST_CHECK_INTERVAL_MS: number;
/** relay 推送阈值（毫秒） */
export declare const RELAY_DEBOUNCE_MS: number;
export declare const RELAY_MIN_INTERVAL_MS: number;
/** 失败重传队列阈值 */
export declare const MAX_PENDING_PAYLOADS: number;
export declare const MAX_RETRY_ATTEMPTS: number;
export declare const RETRY_DELAY_MS: number;
/** 各类超时阈值（毫秒） */
export declare const TIMEOUTS: {
	readonly healthProbe: number;
	readonly push: number;
	readonly apiProbe: number;
	readonly credentialProbe: number;
	readonly tokenQuery: number;
	readonly tabLoad: number;
	readonly tabSettle: number;
};

/** Popup ↔ Background 消息 action 常量 */
export declare const MSG: {
	readonly RELAY_NOW: 'relayNow';
	readonly RECONNECT_BRIDGE: 'reconnectBridge';
	readonly GET_STATUS: 'getStatus';
	readonly CONFIG_UPDATED: 'configUpdated';
	readonly CHECK_CREDENTIALS: 'checkCredentials';
	readonly COOKIE_CHANGED: 'cookieChanged';
	readonly BRIDGE_CONNECTED: 'bridgeConnected';
	readonly KIMI_TOKEN_UPDATED: 'kimiTokenUpdated';
	readonly GET_KIMI_TOKEN: 'getKimiToken';
	readonly KIMI_TOKEN_INVALID: 'kimiTokenInvalid';
	readonly QUERY_KIMI_TOKEN: 'queryKimiToken';
};
/** 全部 action 名集合 */
export declare const MSG_ACTIONS: readonly string[];

/** 构造 Bridge 推送 payload 的入参 */
export interface DataPayloadParts {
	data?: DataPayloadItem[];
	activeKinds?: Iterable<string>;
	displayNames?: Record<string, string>;
	timestamp?: number;
}

/** 构造 Bridge 推送 payload（统一 source 标识与字段形状） */
export declare function createDataPayload(parts: DataPayloadParts): DataPayload;

/** 判断 payload 是否携带任一有效数据（data 数组非空） */
export declare function hasBridgeData(payload: unknown): boolean;
