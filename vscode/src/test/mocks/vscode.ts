// VSCode API mock for vitest

/**
 * 测试用 Settings 存储：模拟 workspace.getConfiguration() 的持久化行为。
 * config.test.ts 等测试直接操作此对象来编排 VSCode Settings 的初始状态。
 */
export const settingsStore: Record<string, unknown> = {};

export const ThemeColor = class {
	constructor(public id: string) {}
};
export const window = {
	createStatusBarItem: () => ({
		text: '',
		color: undefined,
		tooltip: undefined,
		command: undefined,
		show: () => {},
		hide: () => {},
		dispose: () => {},
	}),
	createWebviewViewProvider: () => ({}),
};
export const workspace = {
	getConfiguration: () => ({
		get: <T>(key: string, defaultValue?: T): T | undefined =>
			settingsStore[key] !== undefined ? (settingsStore[key] as T) : defaultValue,
		update: async (key: string, value: unknown): Promise<void> => {
			if (value === undefined) {
				delete settingsStore[key];
			} else {
				settingsStore[key] = value;
			}
		},
	}),
};
export const commands = {
	registerCommand: () => ({ dispose: () => {} }),
	executeCommand: () => Promise.resolve(),
};
export const Uri = {
	joinPath: (...parts: string[]) => parts.join('/'),
	parse: (uri: string) => ({ fsPath: uri }),
};
export const ExtensionContext = class {};
