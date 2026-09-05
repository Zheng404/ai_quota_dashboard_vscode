import { QuotaProvider } from '../types';
import { BridgeServiceData } from './types';
import { loadBridgeState } from './state';

// Data Bridge 数据提供者
// 该服务不拉取远程 API，只展示浏览器扩展推送的配额数据状态

export const bridgeProvider: QuotaProvider = {
	kind: 'bridge',
	async fetch(): Promise<BridgeServiceData> {
		const state = loadBridgeState();
		return {
			id: 'bridge',
			name: 'Data Bridge',
			kind: 'bridge',
			slots: [],
			updatedAt: Date.now(),
			lastPushAt: state.lastPushAt,
			receivedKinds: state.receivedKinds,
			connected: state.connected,
			lastError: state.lastError,
		};
	},
};
