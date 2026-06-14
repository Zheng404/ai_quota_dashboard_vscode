import { QuotaProvider } from '../types';
import { BridgeServiceData } from './types';
import { loadBridgeState } from './state';

// Cookie Bridge 数据提供者
// 该服务不拉取远程 API，只展示浏览器扩展推送的凭证状态

export const bridgeProvider: QuotaProvider = {
	kind: 'bridge',
	async fetch(): Promise<BridgeServiceData> {
		const state = loadBridgeState();
		return {
			id: 'bridge',
			name: 'Cookie Bridge',
			kind: 'bridge',
			slots: [],
			updatedAt: Date.now(),
			lastPushAt: state.lastPushAt,
			receivedCredentials: state.receivedCredentials,
			connected: state.connected,
			lastError: state.lastError,
		};
	},
};
