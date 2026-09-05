import { ServiceData } from '../../core/types';

// ========== Kimi 扩展数据类型 ==========

/** Kimi 服务专用数据（扩展自 ServiceData；Code API 单路径不返回订阅/会员信息，暂无扩展字段） */
export interface KimiServiceData extends ServiceData {}

/** 判断 ServiceData 是否为 KimiServiceData */
export function isKimiServiceData(data: ServiceData): data is KimiServiceData {
	return data.kind === 'kimi';
}
