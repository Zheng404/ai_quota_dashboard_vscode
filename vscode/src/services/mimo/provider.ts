import { QuotaProvider, QuotaSlot } from '../types';
import { MimoServiceData } from './types';
import { getJson } from '../../core/fetch';

export const MIMO_DEFAULT_ENDPOINT = 'https://platform.xiaomimimo.com';

// Xiaomi MiMo Token Plan 数据提供者
// 接口: GET /api/v1/tokenPlan/usage  和  GET /api/v1/tokenPlan/detail
// 鉴权: Cookie（浏览器登录态）

// ========== 原始数据接口定义 ==========

interface MimoUsageItem {
	name: string;
	used: number;
	limit: number;
	percent: number;
}

interface MimoUsageCategory {
	percent: number;
	items: MimoUsageItem[];
}

interface MimoUsageResponse {
	code: number;
	message: string;
	data?: {
		monthUsage?: MimoUsageCategory;
		usage?: MimoUsageCategory;
	};
}

interface MimoDetailResponse {
	code: number;
	message: string;
	data?: {
		planCode: string;
		planName: string;
		currentPeriodEnd: string;
		expired: boolean;
		enableAutoRenew: boolean;
		autoRenewDiscount?: string;
		hasAutoRenewSubscribed?: boolean;
	};
}

// ========== HTTP 工具 ==========

async function mimoGet<T>(url: string, cookie: string, timeout = 15000): Promise<T> {
	const headers = {
		'Cookie': cookie,
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
	};
	try {
		return await getJson<T>(url, headers, timeout);
	} catch (err) {
		if (err instanceof Error && (err.message.includes('HTTP 401') || err.message.includes('Unauthorized'))) {
			throw new Error('MiMo 认证失败：请使用浏览器开发者工具获取 Cookie 值');
		}
		throw err;
	}
}

// ========== 数据解析 ==========

/** 配额项名称映射 */
const ITEM_LABEL_MAP: Record<string, string> = {
	plan_total_token: '当前套餐用量',
	compensation_total_token: '补偿 Token 额度',
};

/** 解析单个配额项为 QuotaSlot */
export function parseItem(item: MimoUsageItem): QuotaSlot | undefined {
	if (!item || typeof item.limit !== 'number' || !isFinite(item.limit) || item.limit <= 0) {
		return undefined;
	}
	if (typeof item.used !== 'number' || !isFinite(item.used)) {
		return undefined;
	}

	// 优先用 used/limit 自行计算百分比，避免 API 返回的 percent 字段格式歧义
	const percent = Math.min((item.used / item.limit) * 100, 100);

	return {
		label: ITEM_LABEL_MAP[item.name] ?? item.name,
		percent,
		used: item.used,
		limit: item.limit,
	};
}

/** 解析用量分类下的所有配额项 */
export function parseCategory(category: MimoUsageCategory | undefined): QuotaSlot[] {
	if (!category?.items) return [];
	const slots: QuotaSlot[] = [];
	for (const item of category.items) {
		const slot = parseItem(item);
		if (slot) slots.push(slot);
	}
	return slots;
}

// ========== Provider 实现 ==========

export const mimoProvider: QuotaProvider = {
	kind: 'mimo',
	async fetch(apiKey, endpoint): Promise<MimoServiceData> {
		const base = endpoint ?? MIMO_DEFAULT_ENDPOINT;

		// 并行拉取用量数据和套餐详情
		const [usageRes, detailRes] = await Promise.all([
			mimoGet<MimoUsageResponse>(`${base}/api/v1/tokenPlan/usage`, apiKey),
			mimoGet<MimoDetailResponse>(`${base}/api/v1/tokenPlan/detail`, apiKey),
		]);

		// 检查用量接口错误
		if (usageRes.code !== 0) {
			throw new Error(`MiMo 用量接口返回错误: ${usageRes.message || usageRes.code}`);
		}
		if (!usageRes.data) {
			throw new Error('MiMo 用量接口未返回数据');
		}
		// 检查详情接口错误
		if (detailRes.code !== 0) {
			throw new Error(`MiMo 套餐接口返回错误: ${detailRes.message || detailRes.code}`);
		}
		if (!detailRes.data) {
			throw new Error('MiMo 套餐接口未返回数据');
		}

		// 解析配额槽位：显示套餐用量 + 补偿 Token（当 limit > 0 时自动展示）
		const slots: QuotaSlot[] = [];
		slots.push(...parseCategory(usageRes.data?.usage));

		// 从套餐详情中提取周期结束时间并设置到每个 slot
		const periodEndRaw = detailRes.data?.currentPeriodEnd;
		const periodEndTs = periodEndRaw ? new Date(periodEndRaw).getTime() : undefined;
		const resetsAt = periodEndTs !== undefined && !isNaN(periodEndTs) ? periodEndTs : undefined;
		if (resetsAt !== undefined) {
			for (const slot of slots) {
				slot.resetsAt = resetsAt;
			}
		}

		// 提取套餐详情
		const detail = detailRes.data;

		return {
			id: 'mimo',
			name: 'MiMo',
			kind: 'mimo',
			slots,
			updatedAt: Date.now(),
			planCode: detail?.planCode,
			planName: detail?.planName,
			currentPeriodEnd: detail?.currentPeriodEnd,
			expired: detail?.expired,
			enableAutoRenew: detail?.enableAutoRenew,
		};
	},
};
