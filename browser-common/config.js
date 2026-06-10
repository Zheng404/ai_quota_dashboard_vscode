/**
 * 配置管理模块
 */

export let config = {
	services: [],
	glmApiKey: '',
	settings: {
		refreshInterval: 600,
		warnThreshold: 0.8,
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
