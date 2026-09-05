import { ServiceDescriptor } from '../types';
import { bridgeProvider } from './provider';
import { BRIDGE_STYLES } from './styles';
import { BRIDGE_SETTINGS } from './settings';
import { bridgeStatusBarRenderer } from './statusBar';

export const bridgeDescriptor: ServiceDescriptor = {
	kind: 'bridge',
	displayName: 'Data Bridge',
	defaultName: 'Data Bridge',
	badgeLabel: 'Bridge',
	badgeCssClass: 'badge-bridge',
	provider: bridgeProvider,
	// Bridge 卡片不在仪表盘渲染（仪表盘过滤 kind==='bridge'），无模板脚本；
	// 连接状态整合在设置页的服务条目内展示
	styles: BRIDGE_STYLES,
	settings: BRIDGE_SETTINGS,
	statusBarRenderer: bridgeStatusBarRenderer,
};
