import { ServiceDescriptor } from '../types';
import { kimiProvider } from './provider';
import { KIMI_STYLES } from './styles';
import { KIMI_SETTINGS } from './settings';
import { kimiStatusBarRenderer } from './statusBar';

export const kimiDescriptor: ServiceDescriptor = {
	kind: 'kimi',
	displayName: 'Kimi Membership',
	defaultName: 'Kimi',
	badgeLabel: 'Kimi',
	badgeCssClass: 'badge-kimi',
	provider: kimiProvider,
	// 卡片模板已迁 src/webview/cards/kimi.ts（构建期打包进 media/dashboard.js）
	styles: KIMI_STYLES,
	settings: KIMI_SETTINGS,
	statusBarRenderer: kimiStatusBarRenderer,
	helpCommand: 'showKimiHelp',
	helpMessage: 'Kimi Code API Key 获取方式：访问 Kimi Code 控制台 → 创建并复制 API Key（sk- 开头）→ 粘贴到上方输入框',
};
