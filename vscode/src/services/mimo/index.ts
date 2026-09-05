import { ServiceDescriptor } from '../types';
import { mimoProvider } from './provider';
import { MIMO_STYLES } from './styles';
import { MIMO_SETTINGS } from './settings';
import { mimoStatusBarRenderer } from './statusBar';

export const mimoDescriptor: ServiceDescriptor = {
	kind: 'mimo',
	displayName: 'Xiaomi MiMo Token Plan',
	defaultName: 'MiMo',
	badgeLabel: 'MiMo',
	badgeCssClass: 'badge-mimo',
	provider: mimoProvider,
	// 卡片模板已迁 src/webview/cards/mimo.ts（构建期打包进 media/dashboard.js）
	styles: MIMO_STYLES,
	settings: MIMO_SETTINGS,
	statusBarRenderer: mimoStatusBarRenderer,
	helpCommand: 'showMimoHelp',
	helpMessage: 'MiMo Cookie 获取方式：浏览器 F12 → Application → Cookies → platform.xiaomimimo.com → 复制任意 Cookie 值',
};
