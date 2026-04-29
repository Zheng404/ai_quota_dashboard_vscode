// VSCode API mock for vitest
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
		get: () => undefined,
		update: () => Promise.resolve(),
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
