import * as vscode from 'vscode';
import { ServiceData, ServiceProfile } from '../core/types';
import { getStyles } from './styles';
import { getScript } from './templates/index';
import { getAllDescriptors } from '../services/registry';

export interface SettingsData {
  profiles: ServiceProfile[];
  keys: Record<string, string>;
  refreshInterval: number;
  warnThreshold: number;
  afkThreshold: number;
}

export class DashboardWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = 'aiQuotaDashboard.dashboardView';

  private view?: vscode.WebviewView;
  private data = new Map<string, ServiceData>();
  private settings: SettingsData = {
    profiles: [],
    keys: {},
    refreshInterval: 600,
    warnThreshold: 0.8,
    afkThreshold: 3600,
  };
  private messageDisposable?: vscode.Disposable;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // 清理旧监听器，防止重复注册
    this.messageDisposable?.dispose();
    this.messageDisposable = webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.command) {
          case 'requestInitialData':
            this.update(this.data, this.settings);
            return;
          case 'refresh':
            await vscode.commands.executeCommand('aiQuotaDashboard.refresh');
            return;
          case 'refreshService':
            await vscode.commands.executeCommand(
              'aiQuotaDashboard.refreshService',
              message.data,
            );
            return;
          case 'requestDetailRange':
            await vscode.commands.executeCommand(
              'aiQuotaDashboard.requestDetailRange',
              message.data,
            );
            return;
          case 'saveService':
          case 'saveGlobal':
          case 'addService':
          case 'removeService':
          case 'resetData':
            await vscode.commands.executeCommand(
              `aiQuotaDashboard.${message.command}`,
              message.data,
            );
            return;
          default: {
            // 通用 help 分发：匹配服务的 helpCommand
            const desc = getAllDescriptors().find(
              (d) => d.helpCommand === message.command,
            );
            if (desc?.helpMessage) {
              vscode.window.showInformationMessage(desc.helpMessage, '确定');
              return;
            }
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Webview 消息处理失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  update(data: Map<string, ServiceData>, settings?: SettingsData, refreshingIds?: string[]) {
    this.data = new Map(data);
    if (settings) {
      this.settings = settings;
    }
    if (this.view) {
      this.view.webview.postMessage({
        command: 'updateData',
        services: Array.from(this.data.values()),
        settings: this.settings,
        refreshingIds: refreshingIds || [],
      });
    }
  }

  switchToSettings(subtab: 'services' | 'global' = 'services') {
    if (this.view) {
      this.view.webview.postMessage({
        command: 'switchToSettings',
        subtab,
      });
    }
  }

  dispose() {
    this.messageDisposable?.dispose();
    this.messageDisposable = undefined;
    this.view = undefined;
  }

  private getHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${getStyles()}
</style>
</head>
<body>
<div class="container">
	<div class="tabs">
		<button class="tab-btn active" data-tab="dashboard">仪表盘</button>
		<button class="tab-btn" data-tab="services">服务</button>
		<button class="tab-btn" data-tab="global">设置</button>
	</div>
	<div class="tab-panel active" id="panel-dashboard">
		<div class="empty-state"><p>加载中...</p></div>
	</div>
	<div class="tab-panel" id="panel-services"></div>
	<div class="tab-panel" id="panel-global"></div>
</div>
<script>
(function() {
	const vscode = acquireVsCodeApi();
${getScript()}
})();
</script>
</body>
</html>`;
  }
}
