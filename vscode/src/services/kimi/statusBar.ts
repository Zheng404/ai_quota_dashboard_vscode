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
			percent: s.percent,
		}));
	},

	buildTooltipMeta(_data): TooltipMeta {
		return {
			serviceDisplayName: 'Kimi Membership',
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
