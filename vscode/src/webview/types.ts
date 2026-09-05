// Webview 侧类型定义：消息/payload 接口与全局声明
//
// 契约锚点：
// - Extension → Webview 消息与 dashboard/webviewView.ts 的 postMessage 调用一致
// - Webview → Extension 消息与 webviewView.ts resolveWebviewView 的 switch 分发一致
// 本模块为 webview bundle 边界内的独立定义（JSON 序列化传输，字段按防御性可选处理）

import type { ServiceData, ServiceProfile } from '../core/types';
import type { BridgeServiceData } from '../services/bridge/types';

// ==================== Webview 版服务数据 ====================

/** Webview 收到的服务数据（ServiceData JSON + 前端加载占位标记） */
export interface WebviewServiceData extends ServiceData {
	/** 加载骨架卡标记：服务存在但暂无数据（由前端渲染占位时构造） */
	_loading?: boolean;
}

/** 卡片模板（bundle 内置注册表的条目形状） */
export interface ServiceTemplate {
	renderCard(data: WebviewServiceData): string;
}

// ==================== Extension → Webview ====================

/** 全局设置数据（webviewView.SettingsData 的 JSON 形态） */
export interface SettingsPayload {
	profiles: ServiceProfile[];
	keys: Record<string, string>;
	refreshInterval: number;
	warnThreshold: number;
	afkThreshold: number;
}

/** updateData：全量更新仪表盘数据 */
export interface UpdateDataMessage {
	command: 'updateData';
	services: WebviewServiceData[];
	settings: SettingsPayload;
	/** 正在刷新的服务 ID（对应按钮转圈） */
	refreshingIds?: string[];
}

/** switchToSettings：切换到指定顶级标签 */
export interface SwitchToSettingsMessage {
	command: 'switchToSettings';
	subtab?: 'services' | 'global';
}

export type ExtToWebviewMessage = UpdateDataMessage | SwitchToSettingsMessage;

// ==================== Webview → Extension ====================

/** 出站消息（command 白名单见 webviewView.ts 消息路由；helpCommand 为动态命令名） */
export interface WebviewOutMessage {
	command: string;
	data?: unknown;
}

/** VSCode Webview API（acquireVsCodeApi 返回值，仅可调用一次） */
export interface VsCodeApi {
	postMessage(message: WebviewOutMessage): void;
}

// ==================== 设置页数据 ====================

/** 服务设置元数据（extension 侧从 ServiceDescriptor 注册表提取后注入） */
export interface ServiceSettingsMeta {
	kind: string;
	displayName: string;
	keyPlaceholder: string;
	keyHint: string;
	showHelpButton: boolean;
	helpCommand: string;
}

/** Bridge 状态视图（从 BridgeServiceData 提取，供服务列表条目展示） */
export type BridgeStateView = Pick<
	BridgeServiceData,
	'connected' | 'lastPushAt' | 'receivedKinds' | 'lastError'
>;

// ==================== 全局声明 ====================

declare global {
	/** VSCode Webview 宿主注入（整个 webview 生命周期仅可调用一次） */
	function acquireVsCodeApi(): VsCodeApi;

	interface Window {
		/** extension 侧注入的服务设置元数据（数据驱动设置页，无 kind 硬编码） */
		__AQD_SETTINGS_META__?: ServiceSettingsMeta[];
	}
}
