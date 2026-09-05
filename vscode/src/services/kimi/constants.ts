/** Kimi 配额标签常量（Code API 路径产出的两个槽位） */
export const KIMI_SLOT_LABELS = {
	WINDOW: '频率限制明细',
	MAIN: '本周用量',
} as const;

/** Kimi Code API 基础地址（国内站；国际站为 https://api.kimi.ai，按账号所属站点替换） */
export const KIMI_CODE_API_BASE = 'https://api.kimi.com';

/** Kimi Code API Key 前缀（sk-kimi- 形态的静态 Key，唯一受支持的凭证形态） */
export const KIMI_CODE_KEY_PREFIX = 'sk-';
