import * as vscode from 'vscode';

// Data Bridge 状态管理（内存 + globalState 持久化）

interface BridgeState {
	lastPushAt?: number;
	/** 已接收配额数据的服务种类 */
	receivedKinds: string[];
	connected: boolean;
	lastError?: string;
}

const DEFAULT_STATE: BridgeState = {
	receivedKinds: [],
	connected: false,
};

const STATE_KEY = 'aiQuotaDashboard.bridgeState';

let memoryState: BridgeState | undefined;

/** 从 VSCode globalState 加载 Bridge 状态 */
export function loadBridgeState(): BridgeState {
	if (memoryState) { return memoryState; }

	try {
		const ctx = getExtensionContext();
		if (ctx) {
			const stored = ctx.globalState.get<BridgeState | undefined>(STATE_KEY, undefined);
			if (stored) {
				memoryState = stored;
				return stored;
			}
		}
	} catch {
		// ignore
	}

	memoryState = { ...DEFAULT_STATE };
	return memoryState;
}

/** 更新 Bridge 状态 */
export async function updateBridgeState(updates: Partial<BridgeState>): Promise<void> {
	const current = loadBridgeState();
	memoryState = { ...current, ...updates };

	try {
		const ctx = getExtensionContext();
		if (ctx) {
			await ctx.globalState.update(STATE_KEY, memoryState);
		}
	} catch {
		// ignore
	}
}

let extensionContext: vscode.ExtensionContext | undefined;

/** 设置 ExtensionContext（在 extension.ts activate 中调用） */
export function setBridgeExtensionContext(ctx: vscode.ExtensionContext): void {
	extensionContext = ctx;
}

function getExtensionContext(): vscode.ExtensionContext | undefined {
	return extensionContext;
}
