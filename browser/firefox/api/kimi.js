/**
 * Kimi API Client (Browser Extension)
 * 
 * 从浏览器 Cookie 读取凭证，调用 Kimi 配额 API，返回标准化数据。
 */

const KIMI_BASE_URL = 'https://www.kimi.com';

/**
 * 从浏览器 Cookie 获取 kimi-auth
 */
async function getKimiAuthToken() {
	try {
		const cookie = await chrome.cookies.get({
			url: 'https://www.kimi.com',
			name: 'kimi-auth',
		});
		return cookie?.value ?? null;
	} catch (err) {
		console.error('[KimiAPI] 读取 Cookie 失败:', err);
		return null;
	}
}

/**
 * Kimi Connect 协议 POST 请求
 */
async function kimiPost(path, token, body = {}) {
	const res = await fetch(`${KIMI_BASE_URL}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'connect-protocol-version': '1',
			'Authorization': `Bearer ${token}`,
			'x-msh-platform': 'web',
			'x-msh-version': '1.0.0',
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10000),
	});

	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('Kimi 鉴权失败：Cookie 已过期');
		}
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
}

/**
 * 解析窗口限制配额（频限明细）
 */
function parseWindowSlot(limits) {
	if (!limits || limits.length === 0) return null;

	const lim = limits[0];
	const detail = lim.detail;
	if (!detail) return null;

	const window = lim.window;
	const duration = window?.duration ?? 0;
	const timeUnit = window?.timeUnit ?? '';
	let windowLabel = '';

	if (timeUnit === 'TIME_UNIT_MINUTE') {
		const hours = Math.floor(duration / 60);
		windowLabel = `${hours}hour`;
	} else if (timeUnit === 'TIME_UNIT_HOUR') {
		windowLabel = `${duration}hour`;
	} else if (timeUnit === 'TIME_UNIT_DAY') {
		windowLabel = `${duration}day`;
	} else {
		windowLabel = duration > 0 ? `${duration}` : 'unknown';
	}

	const limit = parseInt(detail.limit ?? '0', 10);
	const used = parseInt(detail.used ?? '0', 10);
	const percent = limit > 0 ? (used / limit) * 100 : 0;
	const resetsAt = detail.resetTime ? new Date(detail.resetTime).getTime() : null;

	return {
		label: `频限明细 (${windowLabel})`,
		percent: Math.min(percent, 100),
		used,
		limit,
		resetsAt,
	};
}

/**
 * 解析主配额（本周用量）
 */
function parseMainSlot(detail) {
	if (!detail) return null;

	const limit = parseInt(detail.limit ?? '0', 10);
	const used = parseInt(detail.used ?? '0', 10);
	const percent = limit > 0 ? (used / limit) * 100 : 0;
	const resetsAt = detail.resetTime ? new Date(detail.resetTime).getTime() : null;

	return {
		label: '本周用量',
		percent: Math.min(percent, 100),
		used,
		limit,
		resetsAt,
	};
}

/**
 * 解析余额配额（月权益额度）
 */
function parseBalanceSlot(balances) {
	if (!balances || balances.length === 0) return null;

	const bal = balances[0];
	const ratio = bal.amountUsedRatio ?? 0;
	const percent = ratio * 100;

	return {
		label: '月权益额度',
		percent: Math.min(percent, 100),
		used: undefined,
		limit: undefined,
		resetsAt: bal.expireTime ? new Date(bal.expireTime).getTime() : null,
	};
}

/**
 * 拉取 Kimi 配额数据
 * @returns {Promise<{slots: Array, level: string, currentEndTime: string, err: string}>}
 */
export async function fetchKimiQuota() {
	const token = await getKimiAuthToken();
	if (!token) {
		return { slots: [], level: '', currentEndTime: '', err: '未找到 kimi-auth Cookie' };
	}

	try {
		// 并行拉取订阅信息和用量信息
		const [subData, usageData] = await Promise.all([
			kimiPost('/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscription', token, {}),
			kimiPost('/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages', token, { scope: ['FEATURE_CODING'] }),
		]);

		if (subData.code === 'unauthenticated') {
			return { slots: [], level: '', currentEndTime: '', err: 'Kimi Cookie 已过期' };
		}

		// 解析用量
		const usages = usageData.usages ?? [];
		const codingUsage = usages.find(u => u.scope === 'FEATURE_CODING') ?? usages[0];

		const slots = [];
		const windowSlot = codingUsage?.limits ? parseWindowSlot(codingUsage.limits) : null;
		const mainSlot = codingUsage?.detail ? parseMainSlot(codingUsage.detail) : null;
		const balanceSlot = parseBalanceSlot(subData.balances);

		if (windowSlot) slots.push(windowSlot);
		if (mainSlot) slots.push(mainSlot);
		if (balanceSlot) slots.push(balanceSlot);

		// 兜底：从 balances 构建
		if (slots.length === 0 && subData.balances) {
			for (const bal of subData.balances) {
				const ratio = bal.amountUsedRatio ?? 0;
				slots.push({
					label: bal.feature ?? 'Balance',
					percent: Math.min(ratio * 100, 100),
					used: undefined,
					limit: undefined,
					resetsAt: bal.expireTime ? new Date(bal.expireTime).getTime() : null,
				});
			}
		}

		// 提取订阅信息
		const subscription = subData.subscription ?? subData.purchaseSubscription;
		const goods = subscription?.goods;
		const level = goods?.title ?? '';

		return {
			slots,
			level,
			membershipTitle: goods?.title,
			currentEndTime: subscription?.currentEndTime
				? subscription.currentEndTime.slice(0, 10)
				: '',
			nextBillingTime: subscription?.nextBillingTime
				? subscription.nextBillingTime.slice(0, 10)
				: '',
			err: null,
		};

	} catch (err) {
		return {
			slots: [],
			level: '',
			currentEndTime: '',
			err: err.message || '请求失败',
		};
	}
}
