import { ServiceData } from '../../core/types';

// ========== Xiaomi MiMo 扩展数据类型 ==========

/** MiMo 服务专用数据（扩展自 ServiceData） */
export interface MimoServiceData extends ServiceData {
	/** 套餐代码，如 'standard' */
	planCode?: string;
	/** 套餐名称，如 'Standard' */
	planName?: string;
	/** 当前周期结束时间，如 '2026-05-29 23:59:59' */
	currentPeriodEnd?: string;
	/** 套餐是否已过期 */
	expired?: boolean;
	/** 是否启用自动续费 */
	enableAutoRenew?: boolean;
}

/** 判断 ServiceData 是否为 MimoServiceData */
export function isMimoServiceData(data: ServiceData): data is MimoServiceData {
	return data.kind === 'mimo';
}
