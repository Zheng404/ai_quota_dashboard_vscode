import * as vscode from "vscode";
import { ServiceData, ServiceProfile } from "../core/types";
import { getStyles } from "./styles";
import { getScript } from "./templates/index";
import { getAllDescriptors } from "../services/registry";

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
  public static readonly viewType = "aiUsageMonitor.dashboardView";

  private view?: vscode.WebviewView;
  private data = new Map<string, ServiceData>();
  private settings: SettingsData = {
    profiles: [],
    keys: {},
    refreshInterval: 600,
    warnThreshold: 0.8,
    afkThreshold: 3600,
  };

  constructor() {}

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

    webviewView.webview.onDidReceiveMessage((message) => {
      try {
        switch (message.command) {
          case "requestInitialData":
            this.update(this.data, this.settings);
            return;
          case "refresh":
            vscode.commands.executeCommand("aiUsageMonitor.refresh");
            return;
          case "refreshService":
            vscode.commands.executeCommand(
              "aiUsageMonitor.refreshService",
              message.data,
            );
            return;
          case "requestDetailRange":
            vscode.commands.executeCommand(
              "aiUsageMonitor.requestDetailRange",
              message.data,
            );
            return;
          case "saveService":
          case "saveGlobal":
          case "addService":
          case "removeService":
          case "resetData":
            vscode.commands.executeCommand(
              `aiUsageMonitor.${message.command}`,
              message.data,
            );
            return;
          default: {
            // 通用 help 分发：匹配服务的 helpCommand
            const desc = getAllDescriptors().find(
              (d) => d.helpCommand === message.command,
            );
            if (desc?.helpMessage) {
              vscode.window.showInformationMessage(desc.helpMessage, "确定");
              return;
            }
          }
        }
      } catch (err) {
        console.error('[AI Usage Monitor] Webview 消息处理异常:', err);
        vscode.window.showErrorMessage(
          `Webview 消息处理失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  update(data: Map<string, ServiceData>, settings?: SettingsData) {
    this.data = new Map(data);
    if (settings) {
      this.settings = settings;
    }
    if (this.view) {
      this.view.webview.postMessage({
        command: "updateData",
        services: Array.from(this.data.values()),
        settings: this.settings,
      });
    }
  }

  switchToSettings() {
    if (this.view) {
      this.view.webview.postMessage({
        command: "switchToSettings",
        subtab: "services",
      });
    }
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
		<button class="tab-btn" data-tab="settings">设置</button>
	</div>
	<div class="tab-panel active" id="panel-dashboard">
		<div class="empty-state"><p>加载中...</p></div>
	</div>
	<div class="tab-panel" id="panel-settings">
		<div class="sub-tabs">
			<button class="sub-tab-btn active" data-subtab="services">服务列表</button>
			<button class="sub-tab-btn" data-subtab="global">全局设置</button>
		</div>
		<div class="sub-tab-panel active" id="subpanel-services"></div>
		<div class="sub-tab-panel" id="subpanel-global"></div>
	</div>
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
