import * as vscode from 'vscode';
import { clearHistory } from '../storage/persistence';

export function registerAll(context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// 清除历史数据
	disposables.push(
		vscode.commands.registerCommand('aiUsageMonitor.clearHistory', async () => {
			const ans = await vscode.window.showWarningMessage(
				'确定要清除所有历史用量数据吗？',
				'确定',
				'取消'
			);
			if (ans === '确定') {
				await clearHistory(context);
				vscode.window.showInformationMessage('历史数据已清除');
			}
		})
	);

	return disposables;
}
