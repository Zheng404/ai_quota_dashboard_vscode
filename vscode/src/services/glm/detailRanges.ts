import { ServiceData } from '../../core/types';
import { GlmServiceData } from './types';

/** 合并 GLM 已缓存的详情范围与加载状态，新数据中的同范围内容优先。 */
export function mergeDetailRanges(target: ServiceData, source: ServiceData): void {
	const t = target as GlmServiceData;
	const s = source as GlmServiceData;
	if (t.modelUsageByRange && s.modelUsageByRange) {
		t.modelUsageByRange = { ...s.modelUsageByRange, ...t.modelUsageByRange };
	}
	if (t.toolUsageByRange && s.toolUsageByRange) {
		t.toolUsageByRange = { ...s.toolUsageByRange, ...t.toolUsageByRange };
	}
	if (t.detailStates !== undefined || s.detailStates !== undefined) {
		t.detailStates = { ...s.detailStates, ...t.detailStates };
	}
}
