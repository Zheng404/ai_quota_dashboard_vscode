import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate, deactivate } from './extension';
import { DashboardWebviewViewProvider } from './dashboard/webviewView';
import { settingsStore } from './test/mocks/vscode';
import type { ServiceData, ServiceProfile } from './core/types';
import type { GlmServiceData } from './services/glm/types';
import { getDescriptor } from './services/registry';

const testState = vi.hoisted(() => ({
	commandHandlers: new Map<string, (...args: unknown[]) => unknown>(),
	providerFetch: vi.fn(),
}));

vi.mock('vscode', async () => {
	const actual = await vi.importActual<typeof import('vscode')>('vscode');
	const disposable = () => ({ dispose: () => {} });
	return {
		...actual,
		commands: {
			registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
				testState.commandHandlers.set(id, handler);
				return {
					dispose: () => {
						if (testState.commandHandlers.get(id) === handler) {
							testState.commandHandlers.delete(id);
						}
					},
				};
			}),
			executeCommand: vi.fn(async (id: string, ...args: unknown[]) => {
				const handler = testState.commandHandlers.get(id);
				if (!handler) { throw new Error(`未注册命令: ${id}`); }
				return handler(...args);
			}),
		},
		window: {
			...actual.window,
			createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
			registerWebviewViewProvider: vi.fn(disposable),
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			onDidChangeActiveTextEditor: vi.fn(disposable),
			onDidChangeWindowState: vi.fn(disposable),
			onDidChangeTerminalState: vi.fn(disposable),
			onDidChangeTextEditorSelection: vi.fn(disposable),
			onDidChangeVisibleTextEditors: vi.fn(disposable),
		},
		workspace: {
			...actual.workspace,
			onDidChangeConfiguration: vi.fn(disposable),
			onDidChangeTextDocument: vi.fn(disposable),
		},
	};
});

vi.mock('./services/registry', async () => {
	const actual = await vi.importActual<typeof import('./services/registry')>('./services/registry');
	return {
		...actual,
		resolveProvider: vi.fn((kind: string) => ({ kind, fetch: testState.providerFetch })),
	};
});

interface MockContext {
	ctx: vscode.ExtensionContext;
	storage: Record<string, unknown>;
	secrets: Record<string, string>;
}

interface ViewSnapshot {
	data: Map<string, ServiceData>;
	refreshingIds: string[];
}

const viewUpdates: ViewSnapshot[] = [];

function createMockContext(
	profiles: ServiceProfile[] = [],
	initialSecrets: Record<string, string> = {},
	history: Record<string, unknown> = {},
): MockContext {
	const storage: Record<string, unknown> = {
		services: profiles,
		'aiQuotaDashboard.history': history,
	};
	const secrets = { ...initialSecrets };
	const ctx = {
		extensionUri: vscode.Uri.parse('/extension'),
		subscriptions: [],
		globalState: {
			get: <T>(key: string, defaultValue?: T): T | undefined =>
				storage[key] !== undefined ? storage[key] as T : defaultValue,
			update: async (key: string, value: unknown): Promise<void> => {
				if (value === undefined) {
					delete storage[key];
				} else {
					storage[key] = value;
				}
			},
			keys: () => Object.keys(storage),
		},
		secrets: {
			get: async (key: string) => secrets[key],
			store: async (key: string, value: string) => { secrets[key] = value; },
			delete: async (key: string) => { delete secrets[key]; },
		},
	} as unknown as vscode.ExtensionContext;
	return { ctx, storage, secrets };
}

function quotaData(): ServiceData {
	return {
		id: '',
		name: '',
		kind: 'glm',
		slots: [{ label: '额度', percent: 25 }],
		updatedAt: Date.now(),
	};
}

function getGlmDetailProvider() {
	const detailProvider = getDescriptor('glm').detailProvider;
	if (!detailProvider) { throw new Error('测试需要 GLM DetailProvider'); }
	return detailProvider;
}

async function executeCommand(id: string, data?: unknown): Promise<void> {
	await vscode.commands.executeCommand(id, data);
}

/** 用缺失服务的单服务刷新排队，等待后台首轮完成，同时验证其自身可收敛。 */
async function drainRefreshQueue(): Promise<void> {
	await executeCommand('aiQuotaDashboard.refreshService', { id: '__missing__' });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	testState.commandHandlers.clear();
	testState.providerFetch.mockReset();
	testState.providerFetch.mockResolvedValue(quotaData());
	viewUpdates.length = 0;
	for (const key of Object.keys(settingsStore)) {
		delete settingsStore[key];
	}
	vi.spyOn(DashboardWebviewViewProvider.prototype, 'update').mockImplementation(
		(data, _settings, refreshingIds = []) => {
			viewUpdates.push({ data: new Map(data), refreshingIds: [...refreshingIds] });
		},
	);
});

afterEach(async () => {
	// 通过公开重置命令清理模块级 serviceData/cache，避免用例间残留；不增加测试专用生产接口。
	if (testState.commandHandlers.has('aiQuotaDashboard.resetData')) {
		await executeCommand('aiQuotaDashboard.resetData', { confirmed: true });
	}
	deactivate();
	testState.commandHandlers.clear();
	vi.restoreAllMocks();
});

describe('扩展命令与刷新并发回归', () => {
	it('saveService/addService 拒绝非法 kind，且不改写已有 profile 或 Secret', async () => {
		const originalProfiles: ServiceProfile[] = [{ id: 'invalid-kind', kind: 'glm', displayName: '原名称' }];
		const mock = createMockContext(originalProfiles, { 'apiKeys.invalid-kind': 'old-key' });
		await activate(mock.ctx);
		await drainRefreshQueue();
		vi.mocked(vscode.window.showInformationMessage).mockClear();

		await executeCommand('aiQuotaDashboard.saveService', {
			id: 'invalid-kind', name: '不应保存', kind: 'unknown', key: 'new-key',
		});
		await executeCommand('aiQuotaDashboard.addService', { kind: 'unknown' });

		expect(mock.storage.services).toEqual(originalProfiles);
		expect(mock.secrets['apiKeys.invalid-kind']).toBe('old-key');
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('不支持的服务类型，已拒绝保存');
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('不支持的服务类型，无法添加服务');
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
	});

	it('saveService 在 profile 缺失时提示失败，不刷新也不显示成功 toast', async () => {
		const mock = createMockContext();
		await activate(mock.ctx);
		await drainRefreshQueue();
		vi.mocked(vscode.window.showInformationMessage).mockClear();
		testState.providerFetch.mockClear();

		await executeCommand('aiQuotaDashboard.saveService', {
			id: 'missing', name: 'GLM', kind: 'glm', key: 'new-key',
		});

		expect(mock.storage.services).toEqual([]);
		expect(mock.secrets['apiKeys.missing']).toBeUndefined();
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('服务不存在或已被删除，配置未保存');
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		expect(testState.providerFetch).not.toHaveBeenCalled();
	});

	it('saveService 空名称显示中文验证错误，不改配置且不触发刷新', async () => {
		const originalProfiles: ServiceProfile[] = [{ id: 'empty-name', kind: 'glm', displayName: '原名称' }];
		const mock = createMockContext(originalProfiles, { 'apiKeys.empty-name': 'old-key' });
		await activate(mock.ctx);
		await drainRefreshQueue();
		vi.mocked(vscode.window.showInformationMessage).mockClear();
		testState.providerFetch.mockClear();

		await executeCommand('aiQuotaDashboard.saveService', {
			id: 'empty-name', name: '', kind: 'glm', key: 'new-key',
		});

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('displayName 不能为空');
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		expect(testState.providerFetch).not.toHaveBeenCalled();
		expect(mock.storage.services).toEqual(originalProfiles);
		expect(mock.secrets['apiKeys.empty-name']).toBe('old-key');
	});

	it('首轮 updateView 异常后清理本轮 refreshingIds，缺失 profile 也能收敛', async () => {
		const mock = createMockContext(
			[{ id: 'view-error', kind: 'glm', displayName: 'GLM' }],
			{ 'apiKeys.view-error': 'key' },
		);
		vi.mocked(DashboardWebviewViewProvider.prototype.update).mockImplementationOnce(() => {
			throw new Error('view unavailable');
		});

		await activate(mock.ctx);
		await vi.waitFor(() => {
			expect(viewUpdates.length).toBeGreaterThan(0);
			expect(viewUpdates.at(-1)?.refreshingIds).toEqual([]);
		});

		expect(testState.providerFetch).not.toHaveBeenCalled();
	});

	it('Secret 统一 trim：空白值进入 noKey，Provider 只收到规范化 Key', async () => {
		const mock = createMockContext(
			[
				{ id: 'blank-key', kind: 'glm', displayName: '空白' },
				{ id: 'padded-key', kind: 'glm', displayName: '规范' },
			],
			{
				'apiKeys.blank-key': ' \t\n ',
				'apiKeys.padded-key': '  secret-key  ',
			},
		);

		await activate(mock.ctx);
		await drainRefreshQueue();

		expect(testState.providerFetch).toHaveBeenCalledTimes(1);
		expect(testState.providerFetch).toHaveBeenCalledWith('secret-key', undefined, { log: expect.any(Function) });
		const latest = viewUpdates.at(-1)?.data;
		expect(latest?.get('blank-key')?.noKey).toBe(true);
		expect(latest?.get('padded-key')?.err).toBeUndefined();
	});

	it.each([
		{ outcome: 'reject', label: '失败' },
		{ outcome: 'invalid', label: '空响应' },
		{ outcome: 'success', label: '成功' },
	] as const)('详情请求 pending 后删除服务，$label 回写均不复活卡片或缓存', async ({ outcome }) => {
		const pending = deferred<unknown>();
		const mock = createMockContext(
			[{ id: 'deleted-detail', kind: 'glm', displayName: 'GLM' }],
			{ 'apiKeys.deleted-detail': 'detail-key' },
		);
		const fetchDetail = vi.spyOn(getGlmDetailProvider(), 'fetchDetail')
			.mockImplementation(() => pending.promise);
		await activate(mock.ctx);
		await drainRefreshQueue();

		const requesting = executeCommand('aiQuotaDashboard.requestDetailRange', {
			serviceId: 'deleted-detail', range: 'week',
		});
		await vi.waitFor(() => expect(fetchDetail).toHaveBeenCalledTimes(1));
		await executeCommand('aiQuotaDashboard.removeService', {
			id: 'deleted-detail', confirmed: true,
		});
		const updateCountAfterRemoval = viewUpdates.length;

		if (outcome === 'reject') {
			pending.reject(new Error('late detail failure'));
		} else if (outcome === 'invalid') {
			pending.resolve(undefined);
		} else {
			pending.resolve({ modelUsage: { source: 'late' }, toolUsage: { source: 'late' } });
		}
		await requesting;

		expect(viewUpdates.at(-1)?.data.has('deleted-detail')).toBe(false);
		expect(viewUpdates).toHaveLength(updateCountAfterRemoval);
	});

	it('配额请求 pending 时完成 week 详情，成功刷新后保留详情与状态', async () => {
		const detailPending = deferred<unknown>();
		const providerPending = deferred<ServiceData>();
		const mock = createMockContext(
			[{ id: 'detail-during-quota', kind: 'glm', displayName: 'GLM' }],
			{ 'apiKeys.detail-during-quota': 'shared-key' },
		);
		const fetchDetail = vi.spyOn(getGlmDetailProvider(), 'fetchDetail')
			.mockImplementation(() => detailPending.promise);
		await activate(mock.ctx);
		await drainRefreshQueue();
		testState.providerFetch.mockClear();
		testState.providerFetch.mockImplementation(() => providerPending.promise);

		const requestingDetail = executeCommand('aiQuotaDashboard.requestDetailRange', {
			serviceId: 'detail-during-quota', range: 'week',
		});
		await vi.waitFor(() => expect(fetchDetail).toHaveBeenCalledTimes(1));
		const refreshing = executeCommand('aiQuotaDashboard.refresh');
		await vi.waitFor(() => expect(testState.providerFetch).toHaveBeenCalledTimes(1));

		const weekModelUsage = { source: 'week-model' };
		const weekToolUsage = { source: 'week-tool' };
		detailPending.resolve({ modelUsage: weekModelUsage, toolUsage: weekToolUsage });
		await requestingDetail;
		const refreshed: GlmServiceData = {
			...quotaData(),
			slots: [{ label: '新额度', percent: 40 }],
			modelUsageByRange: {
				day: { totalTokens: 1, totalCalls: 1, modelSummary: [], history: [], modelSeries: [], xTime: [] },
			},
			toolUsageByRange: {
				day: {
					totalNetworkSearch: 1, totalWebRead: 0, totalZread: 0,
					toolSummary: [], history: [], toolSeries: [], xTime: [],
				},
			},
		};
		providerPending.resolve(refreshed);
		await refreshing;

		const latest = viewUpdates.at(-1)?.data.get('detail-during-quota') as GlmServiceData | undefined;
		expect(latest?.slots).toEqual([{ label: '新额度', percent: 40 }]);
		expect(latest?.modelUsageByRange?.week).toEqual(weekModelUsage);
		expect(latest?.toolUsageByRange?.week).toEqual(weekToolUsage);
		expect(latest?.detailStates?.week).toEqual({ status: 'ok' });
	});

	it('网络等待期间删除服务后，不回写旧快照或历史', async () => {
		const pending = deferred<ServiceData>();
		testState.providerFetch.mockImplementation(() => pending.promise);
		const mock = createMockContext(
			[{ id: 'delete-during-fetch', kind: 'glm', displayName: 'GLM' }],
			{ 'apiKeys.delete-during-fetch': '  race-key  ' },
			{
				'delete-during-fetch': [{ at: Date.now(), tokens: 10, calls: 1, kind: 'percent' }],
			},
		);
		await activate(mock.ctx);
		await vi.waitFor(() => expect(testState.providerFetch).toHaveBeenCalledTimes(1));

		const removing = executeCommand('aiQuotaDashboard.removeService', {
			id: 'delete-during-fetch', confirmed: true,
		});
		await vi.waitFor(() => expect(mock.storage.services).toEqual([]));
		pending.resolve(quotaData());
		await removing;

		expect(testState.providerFetch).toHaveBeenCalledWith('race-key', undefined, { log: expect.any(Function) });
		expect(viewUpdates.at(-1)?.data.has('delete-during-fetch')).toBe(false);
		expect(viewUpdates.at(-1)?.refreshingIds).toEqual([]);
		expect(mock.storage['aiQuotaDashboard.history']).toEqual({});
	});
});
