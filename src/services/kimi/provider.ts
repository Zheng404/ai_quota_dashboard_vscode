import { QuotaProvider, QuotaSlot } from '../types';
import { KimiServiceData, KimiBalance } from './types';
import { postJson } from '../../core/fetch';

export const KIMI_DEFAULT_ENDPOINT = 'https://www.kimi.com';

// Kimi (Moonshot AI) 平台数据提供者
// 使用 Connect 协议 (JSON over HTTP)
// 接口: POST https://www.kimi.com/apiv2/...
// 鉴权: Bearer JWT Token (网页登录态)

// ========== 原始数据接口定义 ==========

interface KimiSubscriptionGoods {
	title?: string;
	membershipLevel?: string;
}

interface KimiSubscription {
	subscriptionId?: string;
	goods?: KimiSubscriptionGoods;
	currentStartTime?: string;
	currentEndTime?: string;
	nextBillingTime?: string;
	status?: string;
	active?: boolean;
}

interface KimiSubscriptionRaw {
	subscription?: KimiSubscription;
	purchaseSubscription?: KimiSubscription;
	balances?: Array<{
		id?: string;
		feature?: string;
		type?: string;
		unit?: string;
		amountUsedRatio?: number;
		expireTime?: string;
	}>;
	capabilities?: Array<{
		feature?: string;
		constraint?: { parallelism?: number };
	}>;
	subscribed?: boolean;
	code?: string;
	message?: string;
}

interface KimiUsageDetail {
	limit?: string;
	used?: string;
	remaining?: string;
	resetTime?: string;
}

interface KimiWindowLimit {
	window?: {
		duration?: number;
		timeUnit?: string;
	};
	detail?: KimiUsageDetail;
}

interface KimiUsage {
	scope?: string;
	detail?: KimiUsageDetail;
	limits?: KimiWindowLimit[];
}

interface KimiUsagesResponse {
	usages?: KimiUsage[];
	totalQuota?: {
		limit?: string;
		remaining?: string;
	};
}

// ========== HTTP 工具 ==========

async function connectPost<T>(url: string, token: string, body: unknown, timeout = 15000): Promise<T> {
	const headers = {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
		'connect-protocol-version': '1',
		'Authorization': `Bearer ${token}`,
		'x-msh-platform': 'web',
		'x-msh-version': '1.0.0',
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
	};
	try {
		return await postJson<T>(url, headers, JSON.stringify(body), timeout);
	} catch (err) {
		if (err instanceof Error && err.message.includes('HTTP 401')) {
			throw new Error('Kimi 鉴权失败：请使用浏览器开发者工具中的 JWT Token（非 API Key）');
		}
		throw err;
	}
}

// ========== 数据解析 ==========

/** 解析窗口限制配额（频限明细） */
function parseWindowSlot(limits: KimiWindowLimit[]): QuotaSlot | undefined {
	if (!limits || limits.length === 0) return undefined;

	// 取第一个窗口限制（通常是 5h/300min 限制）
	const lim = limits[0];
	const limDetail = lim.detail;
	if (!limDetail) return undefined;

	const window = lim.window;
	const duration = window?.duration ?? 0;
	const timeUnit = window?.timeUnit ?? '';
	let windowLabel = '';

	if (timeUnit === 'TIME_UNIT_MINUTE') {
		// 分钟转小时显示，如 300min → 5hour
		const hours = Math.round(duration / 60);
		windowLabel = `${hours}hour`;
	} else if (timeUnit === 'TIME_UNIT_HOUR') {
		windowLabel = `${duration}hour`;
	} else if (timeUnit === 'TIME_UNIT_DAY') {
		windowLabel = `${duration}day`;
	}

	const limit = parseInt(limDetail.limit ?? '0', 10);
	const used = parseInt(limDetail.used ?? '0', 10);
	const percent = limit > 0 ? (used / limit) * 100 : 0;
	const resetsAt = limDetail.resetTime ? new Date(limDetail.resetTime).getTime() : undefined;

	return {
		label: `频限明细 (${windowLabel})`,
		percent: Math.min(percent, 100),
		used,
		limit,
		resetsAt,
	};
}

/** 解析主配额（本周用量） */
function parseMainSlot(detail: KimiUsageDetail): QuotaSlot | undefined {
	if (!detail) return undefined;

	const limit = parseInt(detail.limit ?? '0', 10);
	const used = parseInt(detail.used ?? '0', 10);
	const percent = limit > 0 ? (used / limit) * 100 : 0;
	const resetsAt = detail.resetTime ? new Date(detail.resetTime).getTime() : undefined;

	return {
		label: '本周用量',
		percent: Math.min(percent, 100),
		used,
		limit,
		resetsAt,
	};
}

/** 解析余额配额（月权益额度） */
function parseBalanceSlot(balances: KimiSubscriptionRaw['balances']): QuotaSlot | undefined {
	if (!balances || balances.length === 0) return undefined;

	// 取第一个余额项
	const bal = balances[0];
	const ratio = bal.amountUsedRatio ?? 0;
	const percent = ratio * 100;

	return {
		label: '月权益额度',
		percent: Math.min(percent, 100),
		used: percent,
		limit: 100,
		resetsAt: bal.expireTime ? new Date(bal.expireTime).getTime() : undefined,
	};
}

/** 解析余额列表 */
function parseBalances(balances: KimiSubscriptionRaw['balances']): KimiBalance[] {
	if (!balances) return [];
	return balances.map(b => ({
		feature: b.feature ?? 'Unknown',
		amountUsedRatio: b.amountUsedRatio ?? 0,
		expireTime: b.expireTime,
	}));
}

/** 截取 ISO 日期为 YYYY-MM-DD */
function toDateOnly(isoDate?: string): string | undefined {
	if (!isoDate) return undefined;
	return isoDate.slice(0, 10);
}

// ========== Provider 实现 ==========

export const kimiProvider: QuotaProvider = {
	kind: 'kimi',
	async fetch(apiKey, endpoint): Promise<KimiServiceData> {
		const base = endpoint ?? KIMI_DEFAULT_ENDPOINT;

		// 1. 拉取订阅信息（会员等级、有效期、余额）
		const subData = await connectPost<KimiSubscriptionRaw>(
			`${base}/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscription`,
			apiKey,
			{}
		);

		if (subData.code === 'unauthenticated') {
			throw new Error('Kimi 鉴权失败：请使用浏览器开发者工具中的 JWT Token（非 API Key）');
		}
		if (subData.code) {
			throw new Error(`Kimi API 错误: ${subData.code}`);
		}

		// 2. 拉取用量统计（频限明细 + 本周用量）
		const usageData = await connectPost<KimiUsagesResponse>(
			`${base}/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages`,
			apiKey,
			{ scope: ['FEATURE_CODING'] }
		);

		// 3. 解析用量数据
		const usages = usageData.usages ?? [];
		const codingUsage = usages.find(u => u.scope === 'FEATURE_CODING') ?? usages[0];

		const windowSlot = codingUsage?.limits ? parseWindowSlot(codingUsage.limits) : undefined;
		const mainSlot = codingUsage?.detail ? parseMainSlot(codingUsage.detail) : undefined;
		const balanceSlot = parseBalanceSlot(subData.balances);

		// 4. 构建 slots 数组
		const slots: QuotaSlot[] = [];
		if (windowSlot) slots.push(windowSlot);
		if (mainSlot) slots.push(mainSlot);
		if (balanceSlot) slots.push(balanceSlot);

		// 如果没有任何配额数据，尝试从 balances 构建兜底
		if (slots.length === 0 && subData.balances) {
			for (const bal of subData.balances) {
				const ratio = bal.amountUsedRatio ?? 0;
				slots.push({
					label: bal.feature ?? 'Balance',
					percent: Math.min(ratio * 100, 100),
					used: ratio * 100,
					limit: 100,
					resetsAt: bal.expireTime ? new Date(bal.expireTime).getTime() : undefined,
				});
			}
		}

		// 5. 提取订阅信息
		const subscription = subData.subscription ?? subData.purchaseSubscription;
		const goods = subscription?.goods;
		// 会员等级取 goods.title（如 "Allegretto"）
		const level = goods?.title ?? '';

		return {
			id: 'kimi',
			name: 'Kimi',
			kind: 'kimi',
			slots,
			updatedAt: Date.now(),
			level,
			membershipTitle: goods?.title,
			currentEndTime: toDateOnly(subscription?.currentEndTime),
			nextBillingTime: toDateOnly(subscription?.nextBillingTime),
			subscriptionStatus: subscription?.status,
			subscriptionActive: subscription?.active,
			balances: parseBalances(subData.balances),
		};
	},
};
