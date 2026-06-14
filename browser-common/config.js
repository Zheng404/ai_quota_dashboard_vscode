/**
 * 配置管理模块
 */

export let config = {
	services: [],
	glmApiKey: '',
	settings: {
		refreshInterval: 600,
		warnThreshold: 0.8,
		/** 是否开启 MiMo 后台自动刷新 session cookie */
		mimoAutoRefresh: false,
		/** 是否开启 Kimi 后台自动刷新 session cookie */
		kimiAutoRefresh: false,
	},
};

export async function loadConfig() {
	try {
		const stored = await chrome.storage.local.get(['dashboardConfig', 'glmApiKey']);
		if (stored.dashboardConfig) {
			config = { ...config, ...stored.dashboardConfig };
		}
		if (stored.glmApiKey) {
			config.glmApiKey = stored.glmApiKey;
		}
		if (!Array.isArray(config.services)) {
			config.services = [];
		}
		// 确保新设置项有默认值
		if (!config.settings) {
			config.settings = { refreshInterval: 600, warnThreshold: 0.8, mimoAutoRefresh: false, kimiAutoRefresh: false };
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
		await chrome.storage.local.set({
			dashboardConfig: config,
			glmApiKey: config.glmApiKey,
		});
	} catch (err) {
		console.error('[Dashboard] 保存配置失败:', err);
	}
}
