/**
 * 配置管理模块
 */

export let config = {
	services: [],
	glmApiKey: '',
	/** Kimi Code API Key（sk- 开头，用户手动输入的兜底数据源；裸字符串，永不过期） */
	kimiApiKey: '',
	settings: {
		refreshInterval: 60,
		warnThreshold: 0.8,
		/** 是否开启 MiMo 后台自动刷新 session cookie */
		mimoAutoRefresh: false,
		/** 是否开启 Kimi 后台自动刷新 session cookie */
		kimiAutoRefresh: false,
	},
};

export async function loadConfig() {
	try {
		const stored = await chrome.storage.local.get(['dashboardConfig']);
		if (stored.dashboardConfig) {
			config = { ...config, ...stored.dashboardConfig };
		}
		// 注意：GLM API Key 的 TTL 副本（顶层 glmApiKey = {value, capturedAt}，
		// 由 shared-ui.js saveGlmApiKeyCopy 写入、api/glm.js 与 background 读取）
		// 不得在此覆写；popup 输入框值统一取 dashboardConfig.glmApiKey
		if (!Array.isArray(config.services)) {
			config.services = [];
		}
		// 确保新设置项有默认值
		if (!config.settings) {
			config.settings = { refreshInterval: 60, warnThreshold: 0.8, mimoAutoRefresh: false, kimiAutoRefresh: false };
		}
		// 一次性迁移：旧默认刷新间隔 600s → 60s（Data Bridge 传递及时性）。
		// flag 独立于 dashboardConfig 存储，只执行一次；用户若主动改回过 600 不会被再次翻转。
		// 注意：曾主动设置过 600 的用户无法与吃旧默认的用户区分，会被一并迁移（见提示文案）
		if (config.settings.refreshInterval === 600) {
			const flag = await chrome.storage.local.get('legacyIntervalMigrated');
			if (!flag.legacyIntervalMigrated) {
				config.settings.refreshInterval = 60;
				// 先写配置后置 flag：flag 写失败时下次 load 仍见 600 会重试迁移；
				// 反之（saveConfig 内部吞异常失败）flag 后置也不会卡死迁移
				await saveConfig();
				await chrome.storage.local.set({ legacyIntervalMigrated: true });
				console.log('[Dashboard] 刷新间隔已从旧默认 600s 迁移为 60s；若您曾手动设置 600s，请在设置页重新设置');
			}
		}
		if (config.settings.mimoAutoRefresh === undefined) {
			config.settings.mimoAutoRefresh = false;
		}
		if (config.settings.kimiAutoRefresh === undefined) {
			config.settings.kimiAutoRefresh = false;
		}
	} catch (err) {
		console.error('[Dashboard] 加载配置失败:', err);
	}
}

export async function saveConfig() {
	try {
		// 只写 dashboardConfig：顶层 glmApiKey 是 TTL 副本（{value, capturedAt}），
		// 由 saveGlmApiKeyCopy 单独维护，此处裸写会覆写破坏 TTL 语义
		await chrome.storage.local.set({
			dashboardConfig: config,
		});
	} catch (err) {
		console.error('[Dashboard] 保存配置失败:', err);
	}
}
