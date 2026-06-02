import { ServiceDescriptor } from '../types';
import { kimiProvider } from './provider';
import { getKimiTemplate } from './template';
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
	templateScript: getKimiTemplate(),
	styles: KIMI_STYLES,
	settings: KIMI_SETTINGS,
	statusBarRenderer: kimiStatusBarRenderer,
	helpCommand: 'showKimiHelp',
	helpMessage: 'Kimi Token 获取方式：浏览器 F12 → Application → Cookies → kimi.com → 复制 kimi-auth 的值',
};
