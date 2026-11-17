import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { ServiceData, ServiceProfile } from '../core/types';
import { getStyles } from './styles';
import { getAllDescriptors } from '../services/registry';
import type { SaveGlobalResult, ServiceSettingsMeta } from '../webview/types';

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
          case 'saveGlobal': {
            const result = await vscode.commands.executeCommand<SaveGlobalResult>(
              'aiQuotaDashboard.saveGlobal',
              message.data,
            );
            this.view?.webview.postMessage({
              command: 'saveGlobalResult',
              ok: result?.ok === true,
              field: result?.field,
              message: result?.message ?? (result?.ok === true ? undefined : '全局配置保存失败，请重试'),
            });
            return;
          }
          case 'saveService':
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
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (message.command === 'saveGlobal') {
          this.view?.webview.postMessage({
            command: 'saveGlobalResult',
            ok: false,
            message: `全局配置保存失败：${errorMessage}`,
          });
        }
        vscode.window.showErrorMessage(`Webview 消息处理失败: ${errorMessage}`);
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
        refreshingIds: refreshingIds ?? [],
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
      endpointEditable: d.settings.endpointEditable,
      endpointPlaceholder: d.settings.endpointPlaceholder,
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
<title>AI 配额仪表盘</title>
<style>
${getStyles()}
</style>
</head>
<body>
<main class="container">
	<div class="tabs" role="tablist" aria-label="仪表盘视图" aria-orientation="horizontal">
		<button type="button" class="tab-btn active" id="tab-dashboard" role="tab" data-tab="dashboard" aria-selected="true" aria-controls="panel-dashboard" tabindex="0">仪表盘</button>
		<button type="button" class="tab-btn" id="tab-services" role="tab" data-tab="services" aria-selected="false" aria-controls="panel-services" tabindex="-1">服务</button>
		<button type="button" class="tab-btn" id="tab-global" role="tab" data-tab="global" aria-selected="false" aria-controls="panel-global" tabindex="-1">设置</button>
	</div>
	<div class="tab-panel active" id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard" tabindex="0">
		<div class="empty-state initial-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><p>正在读取配额…</p></div>
	</div>
	<div class="tab-panel" id="panel-services" role="tabpanel" aria-labelledby="tab-services" tabindex="0" hidden></div>
	<div class="tab-panel" id="panel-global" role="tabpanel" aria-labelledby="tab-global" tabindex="0" hidden></div>
</main>
<div class="sr-only" id="dashboard-announcer" role="status" aria-live="polite" aria-atomic="true"></div>
<script nonce="${nonce}">window.__AQD_SETTINGS_META__=${settingsMeta};</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
