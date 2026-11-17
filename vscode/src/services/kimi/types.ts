import { ServiceData } from '../../core/types';

// ========== Kimi 扩展数据类型 ==========

/** Kimi 服务专用数据（扩展自 ServiceData） */
export interface KimiServiceData extends ServiceData {
	/** 会员等级名称；会员接口不可用或响应无效时省略 */
	level?: string;
}

/** 判断 ServiceData 是否为 KimiServiceData */
export function isKimiServiceData(data: ServiceData): data is KimiServiceData {
	return data.kind === 'kimi';
}
