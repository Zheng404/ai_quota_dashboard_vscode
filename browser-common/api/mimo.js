/**
 * MiMo API Client (Browser Extension)
 *
 * 从浏览器 Cookie 读取凭证，调用 MiMo 配额 API，返回与 VSCode 扩展兼容的完整数据。
 *
 * ⚠️ 数据解析函数需与 VSCode 扩展保持同步：
 * vscode/src/services/mimo/provider.ts 中的 parseItem 等解析逻辑
 * 当 API 响应格式变化时，两侧需同步修改。
 */

const MIMO_BASE_URL = 'https://platform.xiaomimimo.com';

/**
 * 检查并主动请求 MiMo Cookie 读取权限
 */
async function ensureCookiePermission() {
	if (!chrome.permissions) {
		return true;
	}
	try {
		const has = await chrome.permissions.contains({
			permissions: ['cookies'],
			origins: ['https://platform.xiaomimimo.com/*'],
		});
		if (has) {
			return true;
		}
		console.warn('[MiMoAPI] 缺少 platform.xiaomimimo.com 的 Cookie 权限，尝试请求...');
		const granted = await chrome.permissions.request({
			permissions: ['cookies'],
			origins: ['https://platform.xiaomimimo.com/*'],
		});
		console.log('[MiMoAPI] 权限请求结果:', granted);
		return granted;
	} catch (err) {
		console.error('[MiMoAPI] 检查/请求权限失败:', err);
		return false;
	}
}

/**
 * 查找单个 Cookie，先精确读取，失败则通过 domain 模糊匹配兜底
 */
async function findCookie(name) {
	const urls = [
		'https://platform.xiaomimimo.com',
		'https://platform.xiaomimimo.com/',
		'https://xiaomimimo.com',
	];

	for (const url of urls) {
		try {
			const exact = await chrome.cookies.get({ url, name });
			if (exact?.value) {
				console.log(`[MiMoAPI] 精确读取 Cookie ${name} 成功 (url=${url}, domain=${exact.domain})`);
				return exact;
			}
		} catch (err) {
			console.error(`[MiMoAPI] 精确读取 Cookie ${name} 失败 (url=${url}):`, err);
		}
	}

	// 兜底：按 url 搜索
	for (const url of urls) {
		try {
			const all = await chrome.cookies.getAll({ url });
			const match = all.find(c => c.name === name && c.value);
			if (match) {
				console.log(`[MiMoAPI] 按 url 搜索 Cookie ${name} 成功 (url=${url}, domain=${match.domain})`);
				return match;
			}
		} catch (err) {
			console.error(`[MiMoAPI] 按 url 搜索 Cookie ${name} 失败 (url=${url}):`, err);
		}
	}

	// 兜底：按 domain 搜索
	const domains = ['xiaomimimo.com', '.xiaomimimo.com', 'platform.xiaomimimo.com'];
	for (const domain of domains) {
		try {
			const all = await chrome.cookies.getAll({ domain });
			const match = all.find(c => c.name === name && c.value);
			if (match) {
				console.log(`[MiMoAPI] 按 domain 搜索 Cookie ${name} 成功 (domain=${domain}, actual=${match.domain})`);
				return match;
			}
		} catch (err) {
			console.error(`[MiMoAPI] 按 domain 搜索 Cookie ${name} 失败 (domain=${domain}):`, err);
		}
	}

	// 最后兜底：全局枚举
	try {
		const all = await chrome.cookies.getAll({});
		const match = all.find(c => c.name === name && c.value && /xiaomimimo\.com$/.test(c.domain));
		if (match) {
			console.log(`[MiMoAPI] 全局搜索 Cookie ${name} 成功 (domain=${match.domain})`);
			return match;
		}
	} catch (err) {
		console.error(`[MiMoAPI] 全局搜索 Cookie ${name} 失败:`, err);
	}

	console.warn(`[MiMoAPI] 所有策略均未找到 Cookie ${name}`);
	return null;
}

/**
 * 从浏览器 Cookie 获取完整 Cookie 字符串
 * @returns {{ cookie: string | null, error?: string, missing?: string[] }}
 */
async function getMimoCookieString() {
	const permitted = await ensureCookiePermission();
	if (!permitted) {
		return {
			cookie: null,
			error: 'MiMo Cookie 读取权限未授权，请在扩展管理中允许访问 platform.xiaomimimo.com',
		};
	}

	// api-platform_serviceToken 是调用 MiMo API 的核心凭证；userId 作为辅助，非必需
	const requiredNames = ['api-platform_serviceToken'];
	const optionalNames = ['userId'];
	const parts = [];
	const missing = [];

	for (const name of requiredNames) {
		const cookie = await findCookie(name);
		if (cookie?.value) {
			parts.push(`${cookie.name}=${cookie.value}`);
		} else {
			missing.push(name);
		}
	}

	if (missing.length > 0) {
		console.warn(`[MiMoAPI] 未找到必需 Cookie: ${missing.join(', ')}`);
		return {
			cookie: null,
			error: '未获取到 MiMo 登录凭证，请确认已登录 platform.xiaomimimo.com',
		};
	}

	for (const name of optionalNames) {
		const cookie = await findCookie(name);
		if (cookie?.value) {
			parts.push(`${cookie.name}=${cookie.value}`);
		} else {
			console.log(`[MiMoAPI] 可选 Cookie ${name} 未找到，继续`);
		}
	}

	return {
		cookie: parts.join('; '),
		missing,
	};
}

/**
 * MiMo GET 请求
 *
 * 认证策略：依赖 credentials: 'include' + host_permissions 自动携带跨域 Cookie。
 * 注意：手动设置 Cookie 请求头在浏览器 fetch 中会被静默忽略（forbidden header），
 * 但保留此设置作为防御性措施（部分浏览器版本/扩展上下文可能允许）。
 */
async function mimoGet(path, cookieString) {
	const headers = {
		'Accept': 'application/json',
	};
	// 防御性设置：Chrome extensions 的 host_permissions + credentials: 'include'
	// 是跨域 Cookie 传递的主要机制，手动 Cookie 头作为备用
	if (cookieString) {
		headers['Cookie'] = cookieString;
	}
	const res = await fetch(`${MIMO_BASE_URL}${path}`, {
		method: 'GET',
		credentials: 'include',
		headers,
		signal: AbortSignal.timeout(10000),
	});

	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('MiMo 登录凭证已过期，请重新登录 MiMo 网站');
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
	const { cookie, error: cookieError } = await getMimoCookieString();
	if (!cookie) {
		return {
			id: 'mimo',
			name: 'MiMo',
			kind: 'mimo',
			slots: [],
			updatedAt: Date.now(),
			planName: '',
			currentPeriodEnd: '',
			err: cookieError || '未获取到 MiMo 登录凭证，请确认已登录 platform.xiaomimimo.com',
		};
	}

	try {
		const [usageRes, detailRes] = await Promise.all([
			mimoGet('/api/v1/tokenPlan/usage', cookie),
			mimoGet('/api/v1/tokenPlan/detail', cookie),
		]);

		if (usageRes.code !== 0) {
			// 业务级未登录（code 非 0）通常意味着 Cookie 已失效
			const isAuthError = usageRes.code === 401 || usageRes.code === 403
				|| (usageRes.message && /登录|认证|token|auth/i.test(usageRes.message));
			return {
				id: 'mimo',
				name: 'MiMo',
				kind: 'mimo',
				slots: [],
				updatedAt: Date.now(),
				planName: '',
				currentPeriodEnd: '',
				err: isAuthError
					? 'MiMo 登录凭证已过期，请重新登录 MiMo 网站'
					: `MiMo 用量接口返回错误: ${usageRes.message || usageRes.code}`,
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
			err: err.message || '请求失败，请稍后重试',
		};
	}
}
