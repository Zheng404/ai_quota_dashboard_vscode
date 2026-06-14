// ========== Cookie Bridge 扩展数据类型 ==========

/** Bridge 服务专用数据（扩展自 ServiceData） */
export interface BridgeServiceData {
	id: string;
	name: string;
	kind: 'bridge';
	slots: never[];
	updatedAt: number;
	/** 浏览器扩展最后推送时间 */
	lastPushAt?: number;
	/** 已接收到的凭证种类 */
	receivedCredentials?: string[];
	/** 连接状态 */
	connected?: boolean;
	/** 最后错误信息 */
	lastError?: string;
}
