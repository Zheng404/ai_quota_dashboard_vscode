import { describe, it, expect } from 'vitest';
import { bridgeProvider } from './provider';
import { updateBridgeState, setBridgeExtensionContext } from './state';
import { BridgeServiceData } from './types';

describe('bridge provider', () => {
	it('should return bridge state from memory', async () => {
		const mockCtx = {
			globalState: {
				get: <T>() => undefined as T | undefined,
				update: () => Promise.resolve(),
			},
		} as unknown as import('vscode').ExtensionContext;
		setBridgeExtensionContext(mockCtx);
		await updateBridgeState({
			connected: true,
			receivedCredentials: ['kimi', 'mimo'],
			lastPushAt: 1718000000000,
		});

		const data = await bridgeProvider.fetch('') as BridgeServiceData;
		expect(data.kind).toBe('bridge');
		expect(data.connected).toBe(true);
		expect(data.receivedCredentials).toEqual(['kimi', 'mimo']);
		expect(data.lastPushAt).toBe(1718000000000);
		expect(data.slots).toEqual([]);
	});

	it('should return default state when no state set', async () => {
		await updateBridgeState({
			connected: false,
			receivedCredentials: [],
			lastPushAt: undefined,
			lastError: undefined,
		});

		const data = await bridgeProvider.fetch('') as BridgeServiceData;
		expect(data.kind).toBe('bridge');
		expect(data.connected).toBe(false);
		expect(data.receivedCredentials).toEqual([]);
	});
});
