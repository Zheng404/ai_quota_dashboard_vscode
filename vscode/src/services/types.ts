import { ServiceData, ServiceId } from '../core/types';
import type { StatusBarRenderer } from '../ui/statusBarRenderer';

// ==================== 服务标识 ====================

export type { ServiceId };

// ==================== 提供者接口 ====================

export interface QuotaProvider {
	kind: ServiceId;
	fetch(apiKey: string, endpoint?: string): Promise<ServiceData>;
}

/** 支持按需拉取详情数据的服务 */
export interface DetailProvider {
	/** 拉取指定时间范围的详情数据 */
	fetchDetail(range: string, apiKey: string, endpoint?: string): Promise<unknown | undefined>;
}

// ==================== 服务描述符 ====================

export interface ServiceSettingsDescriptor {
	/** API Key 输入框的 placeholder，如 'API Key' 或 'kimi-auth Cookie 值' */
	keyPlaceholder: string;
	/** 输入框下方提示文字，空字符串表示无提示 */
	keyHint: string;
	/** 是否显示「如何获取？」帮助按钮 */
	showHelpButton: boolean;
}

export interface ServiceDescriptor {
	/** 服务类型标识符 */
	kind: ServiceId;
	/** 显示名称，如 'GLM Coding Plan (CN)' */
	displayName: string;
	/** 添加服务时的默认自定义名称 */
	defaultName: string;
	/** 徽章标签，如 'GLM' */
	badgeLabel: string;
	/** 徽章 CSS 类名，如 'badge-glm' */
	badgeCssClass: string;
	/** 数据提供者 */
	provider: QuotaProvider;
	/** 仪表盘卡片模板 JS 字符串 */
	templateScript: string;
	/** 服务特定 CSS */
	styles: string;
	/** 设置表单元数据 */
	settings: ServiceSettingsDescriptor;
	/** 状态栏渲染器（可选，未提供则使用默认渲染） */
	statusBarRenderer?: StatusBarRenderer;
	/** 详情数据提供者（可选） */
	detailProvider?: DetailProvider;
	/** 将详情数据合并到现有 ServiceData（需与 detailProvider 同时提供） */
	mergeDetailData?(existing: ServiceData, detail: unknown, range: string): void;
	/** 帮助命令标识（如 'showKimiHelp'），不设则无帮助按钮 */
	helpCommand?: string;
	/** 帮助提示内容 */
	helpMessage?: string;
}

// re-export 供 provider 使用
export type { QuotaSlot } from '../core/types';
