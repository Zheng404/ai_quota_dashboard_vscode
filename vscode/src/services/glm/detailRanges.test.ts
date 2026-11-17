import { describe, expect, it } from 'vitest';
import { ServiceData } from '../../core/types';
import { mergeDetailRanges } from './detailRanges';

function serviceData(extra: Record<string, unknown> = {}): ServiceData {
	return {
		id: 'glm-1',
		name: 'GLM',
		kind: 'glm',
		slots: [],
		updatedAt: 1,
		...extra,
	};
}

describe('mergeDetailRanges', () => {
	it('保留旧范围详情，并让新数据中的同范围详情优先', () => {
		const target = serviceData({
			modelUsageByRange: { day: 'new-day' },
			toolUsageByRange: { day: 'new-tools' },
		});
		const source = serviceData({
			modelUsageByRange: { day: 'old-day', week: 'old-week' },
			toolUsageByRange: { day: 'old-tools', month: 'old-month' },
		});

		mergeDetailRanges(target, source);

		expect(target).toMatchObject({
			modelUsageByRange: { day: 'new-day', week: 'old-week' },
			toolUsageByRange: { day: 'new-tools', month: 'old-month' },
		});
	});

	it('任一侧缺少范围缓存时不伪造详情', () => {
		const target = serviceData({ modelUsageByRange: { day: 'new-day' } });
		const source = serviceData({ toolUsageByRange: { week: 'old-week' } });

		mergeDetailRanges(target, source);

		expect(target).toMatchObject({ modelUsageByRange: { day: 'new-day' } });
		expect(target).not.toHaveProperty('toolUsageByRange');
	});

	it('全局刷新保留各范围详情状态，新状态优先且错误消息不丢失', () => {
		const target = serviceData({
			detailStates: { day: { status: 'ok' } },
		});
		const source = serviceData({
			detailStates: {
				day: { status: 'loading' },
				week: { status: 'error', message: '网络失败' },
				month: { status: 'ok' },
			},
		});

		mergeDetailRanges(target, source);

		expect(target).toMatchObject({
			detailStates: {
				day: { status: 'ok' },
				week: { status: 'error', message: '网络失败' },
				month: { status: 'ok' },
			},
		});
	});
});
