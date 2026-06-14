import { ServiceDescriptor } from '../types';
import { bridgeProvider } from './provider';
import { getBridgeTemplate } from './template';
import { BRIDGE_STYLES } from './styles';
import { BRIDGE_SETTINGS } from './settings';
import { bridgeStatusBarRenderer } from './statusBar';

export const bridgeDescriptor: ServiceDescriptor = {
	kind: 'bridge',
	displayName: 'Cookie Bridge',
	defaultName: 'Cookie Bridge',
	badgeLabel: 'Bridge',
	badgeCssClass: 'badge-bridge',
	provider: bridgeProvider,
	templateScript: getBridgeTemplate(),
	styles: BRIDGE_STYLES,
	settings: BRIDGE_SETTINGS,
	statusBarRenderer: bridgeStatusBarRenderer,
};
