import { ServiceData } from '../../core/types';

// ========== Kimi 扩展数据类型 ==========

/** Kimi 余额项 */
export interface KimiBalance {
	feature: string;
	amountUsedRatio: number;
	expireTime?: string;
}

/** Kimi 服务专用数据（扩展自 ServiceData） */
export interface KimiServiceData extends ServiceData {
	/** 会员等级，如 'LEVEL_INTERMEDIATE' */
	level?: string;
	/** 套餐名称，如 'Allegretto' */
	membershipTitle?: string;
	/** 当前周期结束时间 */
	currentEndTime?: string;
	/** 下次扣费时间 */
	nextBillingTime?: string;
	/** 订阅状态，如 'SUBSCRIPTION_STATUS_CANCEL' */
	subscriptionStatus?: string;
	/** 订阅是否激活 */
	subscriptionActive?: boolean;
	/** 余额列表 */
	balances?: KimiBalance[];
}

/** 判断 ServiceData 是否为 KimiServiceData */
export function isKimiServiceData(data: ServiceData): data is KimiServiceData {
	return data.kind === 'kimi';
}
