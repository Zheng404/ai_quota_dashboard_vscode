import { StatusBarRenderer, StatusBarSegment, TooltipMeta, TooltipQuotaLine } from '../../ui/statusBarRenderer';
import { ServiceData } from '../../core/types';

export const bridgeStatusBarRenderer: StatusBarRenderer = {
	filterSlots(_data: ServiceData): StatusBarSegment[] {
		return [];
	},

	buildTooltipMeta(data: ServiceData): TooltipMeta {
		return {
			serviceDisplayName: data.name,
			extraLines: data.err ? [data.err] : ['Cookie Bridge 状态'],
		};
	},

	buildTooltipQuotas(_data: ServiceData): TooltipQuotaLine[] {
		return [];
	},
};
