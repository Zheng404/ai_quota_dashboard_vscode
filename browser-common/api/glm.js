/**
 * GLM API Client (Browser Extension)
 *
 * 从 chrome.storage 读取 API Key，调用 GLM 配额 API。
 *
 * ⚠️ 数据解析函数需与 VSCode 扩展保持同步：
 * vscode/src/services/glm/provider.ts 中的 parseLimits / parseSubscription / parseModelUsage / parseToolUsage
 * 当 API 响应格式变化时，两侧需同步修改。
 */

const GLM_BASE_URL = 'https://open.bigmodel.cn';

/** 凭证副本的保留上限（24h，与 background.js 的 CREDENTIAL_TTL_MS 保持一致） */
const CREDENTIAL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 从 storage 读取 GLM API Key（带 TTL 的 { value, capturedAt } 对象副本）：
 * 超 24h 或无时间戳的存量裸字符串均视为过期，清除一次并返回 null。
 */
async function getGlmApiKey() {
	try {
		const result = await chrome.storage.local.get('glmApiKey');
		const entry = result.glmApiKey;
		if (entry && typeof entry === 'object' && entry.value) {
			if (entry.capturedAt && Date.now() - entry.capturedAt <= CREDENTIAL_TTL_MS) {
				return entry.value;
			}
			await chrome.storage.local.remove('glmApiKey');
			// 副本过期：fallthrough 到下方自愈重播种
		} else if (typeof entry === 'string' && entry) {
			// 存量裸字符串（无时间戳），视为过期清除一次
			await chrome.storage.local.remove('glmApiKey');
		}
		// P2-6 自愈：TTL 副本唯一原写入方是 popup（saveGlmApiKeyCopy），background 侧 24h 无
		// popup 开盖时副本过期断供，relay 会持续推「未配置 GLM API Key」错误卡。
		// 此处从 dashboardConfig.glmApiKey 重新播种副本（popup 同款 { value, capturedAt } 结构）
		try {
			const cfg = await chrome.storage.local.get('dashboardConfig');
			const key = cfg.dashboardConfig?.glmApiKey;
			if (typeof key === 'string' && key) {
				await chrome.storage.local.set({ glmApiKey: { value: key, capturedAt: Date.now() } });
				return key;
			}
		} catch { /* ignore，返回 null */ }
		return null;
	} catch (err) {
		console.error('[GLMAPI] 读取 API Key 失败:', err);
		return null;
	}
}

/**
 * GLM GET 请求
 */
async function glmGet(path, token) {
	const res = await fetch(`${GLM_BASE_URL}${path}`, {
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		signal: AbortSignal.timeout(15000),
	});

	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('GLM 认证失败：API Key 无效，请检查密钥是否正确');
		}
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
}

/**
 * 格式化日期时间
 */
function formatDateTime(d) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 构建时间范围查询参数
 */
function buildTimeRangeQuery(days) {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0);
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
	return `?startTime=${encodeURIComponent(formatDateTime(start))}&endTime=${encodeURIComponent(formatDateTime(end))}`;
}

/**
 * 获取时间单位标签
 */
function getTimeUnitLabel(unit) {
	switch (unit) {
		case 3: return '小时';
		case 5: return '月';
		case 6: return '周';
		default: return '';
	}
}

/**
 * 获取配额标签
 */
function getGlmQuotaLabel(item) {
	if (item.type === 'TOKENS_LIMIT') {
		if (item.unit === 3 && item.number === 5) {
			return '每 5 小时额度';
		}
		if (item.unit === 6 && item.number === 1) {
			return '每周额度';
		}
		return `额度 (${item.number}${getTimeUnitLabel(item.unit)})`;
	}
	if (item.type === 'TIME_LIMIT') {
		return 'MCP 每月额度';
	}
	return '未知配额类型';
}

/**
 * 把 nextResetTime（Unix 秒/毫秒时间戳）防御性转换为毫秒时间戳。
 * GLM 接口该字段单位不稳定（历史返回秒，现为毫秒）：小于 1e12 视为秒级统一转毫秒，无效返回 null。
 */
function toResetMs(value) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
	return value < 1e12 ? value * 1000 : value;
}

/**
 * 解析用量统计限额
 */
function parseLimits(raw) {
	const limits = raw.limits ?? [];
	const slots = [];

	for (const item of limits) {
		if (item.type === 'TOKENS_LIMIT') {
			slots.push({
				label: getGlmQuotaLabel(item),
				percent: item.percentage,
				used: undefined,
				limit: undefined,
				resetsAt: toResetMs(item.nextResetTime),
			});
		} else if (item.type === 'TIME_LIMIT') {
			slots.push({
				label: getGlmQuotaLabel(item),
				percent: item.percentage,
				used: item.currentValue,
				limit: item.usage,
				resetsAt: toResetMs(item.nextResetTime),
			});
		}
	}
	return { slots, level: raw.level };
}

/**
 * 解析套餐订阅
 */
function parseSubscription(raw) {
	if (raw.code !== 200 || !raw.success || !raw.data || raw.data.length === 0) {
		return undefined;
	}
	const active = raw.data.find(item => item.inCurrentPeriod);
	const nextRenewTime = active?.nextRenewTime;
	if (!nextRenewTime || isNaN(new Date(nextRenewTime).getTime())) {
		return undefined;
	}
	return nextRenewTime;
}

/**
 * 解析模型用量
 */
function parseModelUsage(raw) {
	const xs = raw.x_time || [];
	const tokens = raw.tokensUsage || [];
	const calls = raw.modelCallCount || [];

	const history = [];
	for (let i = 0; i < xs.length; i++) {
		const ts = new Date(xs[i]).getTime();
		if (isNaN(ts)) continue;
		history.push({
			at: ts,
			tokens: tokens[i] ?? undefined,
			calls: calls[i] ?? undefined,
		});
	}

	return {
		totalTokens: raw.totalUsage?.totalTokensUsage ?? 0,
		totalCalls: raw.totalUsage?.totalModelCallCount ?? 0,
		modelSummary: raw.totalUsage?.modelSummaryList ?? [],
		history,
		modelSeries: raw.modelDataList?.map(m => ({
			modelName: m.modelName,
			tokensUsage: m.tokensUsage,
			totalTokens: m.totalTokens,
		})) ?? [],
		xTime: xs,
	};
}

/**
 * 解析工具用量
 */
function parseToolUsage(raw) {
	const xs = raw.x_time || [];
	const network = raw.networkSearchCount || [];
	const webRead = raw.webReadMcpCount || [];
	const zread = raw.zreadMcpCount || [];

	const history = [];
	for (let i = 0; i < xs.length; i++) {
		const ts = new Date(xs[i]).getTime();
		if (isNaN(ts)) continue;
		history.push({
			at: ts,
			calls: (network[i] ?? 0) + (webRead[i] ?? 0) + (zread[i] ?? 0),
		});
	}

	return {
		totalNetworkSearch: raw.totalUsage?.totalNetworkSearchCount ?? 0,
		totalWebRead: raw.totalUsage?.totalWebReadMcpCount ?? 0,
		totalZread: raw.totalUsage?.totalZreadMcpCount ?? 0,
		toolSummary: raw.totalUsage?.toolSummaryList ?? [],
		history,
		toolSeries: raw.toolDataList?.map(t => ({
			toolCode: t.toolCode,
			toolName: t.toolName,
			usageCount: t.usageCount,
			totalUsageCount: t.totalUsageCount,
		})) ?? [],
		xTime: xs,
	};
}

/**
 * 拉取模型用量
 */
async function fetchGlmModelUsage(token, days) {
	try {
		const qs = buildTimeRangeQuery(days);
		const raw = await glmGet(`/api/monitor/usage/model-usage${qs}`, token);
		if (raw.code === 200 && raw.success && raw.data) {
			return parseModelUsage(raw.data);
		}
	} catch (err) {
		console.warn('[GLMAPI] 模型用量拉取失败:', err);
	}
	return undefined;
}

/**
 * 拉取工具用量
 */
async function fetchGlmToolUsage(token, days) {
	try {
		const qs = buildTimeRangeQuery(days);
		const raw = await glmGet(`/api/monitor/usage/tool-usage${qs}`, token);
		if (raw.code === 200 && raw.success && raw.data) {
			return parseToolUsage(raw.data);
		}
	} catch (err) {
		console.warn('[GLMAPI] 工具用量拉取失败:', err);
	}
	return undefined;
}

/**
 * 拉取 GLM 配额数据（主入口）
 */
export async function fetchGlmQuota() {
	const token = await getGlmApiKey();
	if (!token) {
		return {
			id: 'glm',
			name: 'GLM',
			kind: 'glm',
			slots: [],
			updatedAt: Date.now(),
			level: '',
			err: '未配置 GLM API Key，请在设置中输入',
		};
	}

	try {
		// 4 个请求互不依赖，一次性并行（历史两阶段串行会把首屏最坏延迟从 30s 翻倍压到 15s）
		const [quotaRaw, subRaw, modelUsage, toolUsage] = await Promise.all([
			glmGet('/api/monitor/usage/quota/limit', token),
			glmGet('/api/biz/subscription/list', token).catch(() => undefined),
			fetchGlmModelUsage(token, 1),
			fetchGlmToolUsage(token, 1),
		]);

		if (quotaRaw.code !== 200 || !quotaRaw.success) {
			throw new Error(quotaRaw.msg || '配额查询失败');
		}

		const { slots, level } = parseLimits(quotaRaw.data ?? { limits: [] });
		const nextRenewTime = subRaw ? parseSubscription(subRaw) : undefined;

		return {
			id: 'glm',
			name: 'GLM',
			kind: 'glm',
			slots,
			history: modelUsage?.history,
			updatedAt: Date.now(),
			level,
			nextRenewTime,
			modelUsage,
			toolUsage,
			modelUsageByRange: modelUsage ? { day: modelUsage } : {},
			toolUsageByRange: toolUsage ? { day: toolUsage } : {},
			err: null,
		};
	} catch (err) {
		return {
			id: 'glm',
			name: 'GLM',
			kind: 'glm',
			slots: [],
			updatedAt: Date.now(),
			level: '',
			err: err.message || '请求失败，请稍后重试',
		};
	}
}

/**
 * 拉取指定范围的 GLM 详情数据（模型 + 工具用量）
 */
export async function fetchGlmDetail(range) {
	const token = await getGlmApiKey();
	if (!token) return null;

	const days = range === 'day' ? 1 : range === 'week' ? 7 : 30;
	const [modelUsage, toolUsage] = await Promise.all([
		fetchGlmModelUsage(token, days),
		fetchGlmToolUsage(token, days),
	]);

	return { modelUsage, toolUsage };
}
