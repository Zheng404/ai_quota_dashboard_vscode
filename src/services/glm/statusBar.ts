import {
	StatusBarRenderer,
	StatusBarSegment,
	TooltipQuotaLine,
	TooltipMeta,
	compactCountdown,
} from '../../ui/statusBarRenderer';
import { GlmServiceData } from './types';
import { GLM_SLOT_LABELS } from './constants';

export const glmStatusBarRenderer: StatusBarRenderer<GlmServiceData> = {
	filterSlots(data): StatusBarSegment[] {
		return data.slots
			.filter(s => s.label !== GLM_SLOT_LABELS.MCP_MONTHLY)
			.map(s => ({
				percentText: `${Math.round(s.percent)}%`,
				countdownText: compactCountdown(s.resetsAt),
			}));
	},

	buildTooltipMeta(data): TooltipMeta {
		return {
			serviceDisplayName: 'GLM Coding Plan (CN)',
			levelBadge: data.level?.toUpperCase(),
			membershipExpiry: data.nextRenewTime
				? `会员有效期至: ${data.nextRenewTime}`
				: undefined,
		};
	},

	buildTooltipQuotas(data): TooltipQuotaLine[] {
		const lines: TooltipQuotaLine[] = [];

		// 非 MCP 配额
		const nonMcp = data.slots.filter(s => s.label !== GLM_SLOT_LABELS.MCP_MONTHLY);
		for (const s of nonMcp) {
			lines.push({
				label: s.label,
				percent: s.percent,
				used: s.used,
				limit: s.limit,
				resetsAt: s.resetsAt,
			});
		}

		// MCP 每月额度 —— 单独分区
		const mcp = data.slots.find(s => s.label === GLM_SLOT_LABELS.MCP_MONTHLY);
		if (mcp) {
			lines.push({
				label: mcp.label,
				percent: mcp.percent,
				used: mcp.used,
				limit: mcp.limit,
				resetsAt: mcp.resetsAt,
				dividerBefore: true,
			});
		}

		return lines;
	},
};
