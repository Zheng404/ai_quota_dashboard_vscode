import {
	StatusBarRenderer,
	StatusBarSegment,
	TooltipQuotaLine,
	TooltipMeta,
	compactCountdown,
} from '../../ui/statusBarRenderer';
import { KimiServiceData } from './types';

export const kimiStatusBarRenderer: StatusBarRenderer<KimiServiceData> = {
	filterSlots(data): StatusBarSegment[] {
		return data.slots.map(s => ({
			percentText: `${Math.round(s.percent)}%`,
			countdownText: compactCountdown(s.resetsAt),
		}));
	},

	buildTooltipMeta(data): TooltipMeta {
		return {
			serviceDisplayName: 'Kimi Membership',
			levelBadge: data.level?.toUpperCase(),
			membershipExpiry: data.currentEndTime
				? `会员有效期至: ${data.currentEndTime}`
				: undefined,
		};
	},

	buildTooltipQuotas(data): TooltipQuotaLine[] {
		return data.slots.map(s => ({
			label: s.label,
			percent: s.percent,
			used: s.used,
			limit: s.limit,
			resetsAt: s.resetsAt,
		}));
	},
};
