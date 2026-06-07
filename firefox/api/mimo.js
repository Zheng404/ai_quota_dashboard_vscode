/**
 * MiMo API Client (Browser Extension)
 *
 * 从浏览器 Cookie 读取凭证，调用 MiMo 配额 API，返回与 VSCode 扩展兼容的完整数据。
 */

const MIMO_BASE_URL = 'https://platform.xiaomimimo.com';

/**
 * 从浏览器 Cookie 获取完整 Cookie 字符串
 */
async function getMimoCookieString() {
	const targetNames = ['api-platform_serviceToken', 'userId'];
	const parts = [];

	for (const name of targetNames) {
		try {
			const cookie = await chrome.cookies.get({
				url: 'https://platform.xiaomimimo.com',
				name,
			});
			if (cookie?.value) {
				parts.push(`${cookie.name}=${cookie.value}`);
			}
		} catch (err) {
			console.error('[MiMoAPI] 读取 Cookie 失败:', err);
		}
	}

	return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * MiMo GET 请求
 */
async function mimoGet(path, cookie) {
	const res = await fetch(`${MIMO_BASE_URL}${path}`, {
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Cookie': cookie,
		},
		signal: AbortSignal.timeout(10000),
	});

	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('MiMo 鉴权失败：Cookie 已过期');
		}
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
}

/**
 * 解析配额项
 */
function parseItem(item) {
	if (!item || item.limit <= 0) return null;
	const percent = Math.min((item.used / item.limit) * 100, 100);
	return {
		label: item.name === 'plan_total_token' ? '当前套餐用量'
			: item.name === 'compensation_total_token' ? '补偿 Token 额度'
			: item.name,
		percent,
		used: item.used,
		limit: item.limit,
	};
}

/**
 * 拉取 MiMo 配额数据（完整格式，与 VSCode 扩展兼容）
 */
export async function fetchMimoQuota() {
	const cookie = await getMimoCookieString();
	if (!cookie) {
		return {
			id: 'mimo',
			name: 'MiMo',
			kind: 'mimo',
			slots: [],
			updatedAt: Date.now(),
			planName: '',
			currentPeriodEnd: '',
			err: '未找到 MiMo Cookie，请先登录 MiMo',
		};
	}

	try {
		const [usageRes, detailRes] = await Promise.all([
			mimoGet('/api/v1/tokenPlan/usage', cookie),
			mimoGet('/api/v1/tokenPlan/detail', cookie),
		]);

		if (usageRes.code !== 0) {
			return {
				id: 'mimo',
				name: 'MiMo',
				kind: 'mimo',
				slots: [],
				updatedAt: Date.now(),
				planName: '',
				currentPeriodEnd: '',
				err: `MiMo 用量接口错误: ${usageRes.message || usageRes.code}`,
			};
		}

		const slots = [];
		const usageCategory = usageRes.data?.usage;
		if (usageCategory?.items) {
			for (const item of usageCategory.items) {
				const slot = parseItem(item);
				if (slot) slots.push(slot);
			}
		}

		// 月度总览
		const monthUsage = usageRes.data?.monthUsage;

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
			monthTotalToken: monthUsage?.items?.find(i => i.name === 'month_total_token')?.value,
			err: null,
		};

	} catch (err) {
		return {
			id: 'mimo',
			name: 'MiMo',
			kind: 'mimo',
			slots: [],
			updatedAt: Date.now(),
			planName: '',
			currentPeriodEnd: '',
			err: err.message || '请求失败',
		};
	}
}
