/** Kimi 配额标签常量（Code API 路径的主槽位与可选月度槽位） */
export const KIMI_SLOT_LABELS = {
	WINDOW: '频率限制明细',
	MAIN: '本周用量',
	MONTH_TOTAL: '本月总额度用量',
	MONTH_CODE: '本月 Coding 用量（含于总额）',
} as const;

/** Kimi Code API 基础地址（国内站） */
export const KIMI_CODE_API_BASE = 'https://api.kimi.com';

/** Kimi Code API 国际站基础地址 */
export const KIMI_CODE_API_BASE_GLOBAL = 'https://api.kimi.ai';

/** Kimi Code API Key 前缀（sk-kimi- 形态的静态 Key，唯一受支持的凭证形态） */
export const KIMI_CODE_KEY_PREFIX = 'sk-';
