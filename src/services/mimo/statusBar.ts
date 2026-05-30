import {
	StatusBarRenderer,
	StatusBarSegment,
	TooltipQuotaLine,
	TooltipMeta,
} from '../../ui/statusBarRenderer';
import { MimoServiceData } from './types';
import { fmtNum } from '../../core/format';

export const mimoStatusBarRenderer: StatusBarRenderer<MimoServiceData> = {
	filterSlots(data): StatusBarSegment[] {
		return data.slots.map(s => ({
			percentText: `${Math.round(s.percent)}%（${fmtNum(s.used)}/${fmtNum(s.limit)}）`,
			countdownText: '',
			percent: s.percent,
		}));
	},

	buildTooltipMeta(data): TooltipMeta {
		const expiry = data.currentPeriodEnd
			? `有效期至: ${data.currentPeriodEnd}`
			: undefined;

		return {
			serviceDisplayName: 'Xiaomi MiMo Token Plan',
			levelBadge: data.planName,
			membershipExpiry: expiry,
		};
	},

	buildTooltipQuotas(data): TooltipQuotaLine[] {
		return data.slots.map(s => ({
			label: s.label,
			percent: s.percent,
			used: s.used,
			limit: s.limit,
		}));
	},
};
