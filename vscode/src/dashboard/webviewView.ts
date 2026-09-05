import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { ServiceData, ServiceProfile } from '../core/types';
import { getStyles } from './styles';
import { getAllDescriptors } from '../services/registry';
import type { ServiceSettingsMeta } from '../webview/types';

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
    refreshInterval: 60,
    warnThreshold: 0.8,
    afkThreshold: 3600,
  };
  private messageDisposable?: vscode.Disposable;

  constructor(private readonly extensionUri: vscode.Uri) {}

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

  /** 从注册表提取服务设置元数据（注入 webview bundle，数据驱动设置页） */
  private buildSettingsMeta(): ServiceSettingsMeta[] {
    return getAllDescriptors().map(d => ({
      kind: d.kind,
      displayName: d.displayName,
      keyPlaceholder: d.settings.keyPlaceholder,
      keyHint: d.settings.keyHint,
      showHelpButton: d.settings.showHelpButton,
      helpCommand: d.helpCommand ?? '',
    }));
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.js'),
    );
    const settingsMeta = JSON.stringify(this.buildSettingsMeta());

    // CSP：script-src 不再允许 'unsafe-inline'（字符串模板体系已移除）；
    // 唯一的 inline 脚本是元数据注入，经 nonce 指令精确放行，bundle 走 cspSource 外链
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
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
<script nonce="${nonce}">window.__AQD_SETTINGS_META__=${settingsMeta};</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
