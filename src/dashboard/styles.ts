// Dashboard Webview 通用样式表（服务特定样式由各 ServiceDescriptor 贡献）

import { getAllDescriptors } from '../services/registry';

export function getStyles(): string {
	let css = `
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body {
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		color: var(--vscode-foreground);
		background: var(--vscode-sideBar-background);
		padding: 12px;
	}
	.container { width: 100%; }

	/* Tabs */
	.tabs { display: flex; gap: 2px; margin-bottom: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
	.tab-btn {
		flex: 1; padding: 6px 12px; background: transparent; border: none;
		border-bottom: 2px solid transparent; color: var(--vscode-descriptionForeground);
		font-size: 12px; font-family: inherit; cursor: pointer; transition: all 0.2s;
	}
	.tab-btn:hover { color: var(--vscode-foreground); }
	.tab-btn.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); font-weight: 500; }

	.sub-tabs { display: flex; gap: 2px; margin-bottom: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
	.sub-tab-btn {
		flex: 1; padding: 5px 10px; background: transparent; border: none;
		border-bottom: 2px solid transparent; color: var(--vscode-descriptionForeground);
		font-size: 11px; font-family: inherit; cursor: pointer; transition: all 0.2s;
	}
	.sub-tab-btn:hover { color: var(--vscode-foreground); }
	.sub-tab-btn.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }

	.tab-panel { display: none; }
	.tab-panel.active { display: block; }
	.sub-tab-panel { display: none; }
	.sub-tab-panel.active { display: block; }

	/* Service Cards (仪表盘) */
	.service-card {
		background: var(--vscode-editor-inactiveSelectionBackground);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 6px; padding: 12px; margin-bottom: 12px;
	}
	.service-card.error { border-color: var(--vscode-charts-red); }
	.service-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 6px; }
	.service-name { font-size: 14px; font-weight: 600; }
	.update-time { font-size: 10px; color: var(--vscode-descriptionForeground); margin-left: auto; }
	.badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 500; }
	.badge-error { background: var(--vscode-charts-red); color: white; }
	.error-message { color: var(--vscode-charts-red); font-size: 12px; }

	/* Service kind badge (通用) */
	.badge-kind { font-size: 9px; padding: 1px 5px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

	.slot { margin-bottom: 10px; }
	.slot:last-child { margin-bottom: 0; }
	.slot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
	.slot-label { font-size: 12px; }
	.slot-percent { font-size: 13px; font-weight: 600; }
	.slot-percent.success { color: var(--vscode-charts-green); }
	.slot-percent.warning { color: var(--vscode-charts-yellow); }
	.slot-percent.danger { color: var(--vscode-charts-red); }
	.progress-bar { height: 6px; background: var(--vscode-progressBar-background); border-radius: 3px; overflow: hidden; }
	.progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
	.progress-fill.success { background: var(--vscode-charts-green); }
	.progress-fill.warning { background: var(--vscode-charts-yellow); }
	.progress-fill.danger { background: var(--vscode-charts-red); }
	.slot-detail { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 3px; }

	/* Charts */
	.history-section { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border); }
	.history-title { font-size: 11px; font-weight: 600; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
	.chart { display: flex; align-items: flex-end; gap: 3px; height: 60px; padding-bottom: 16px; }
	.chart-bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 16px; }
	.chart-bar-fill { width: 100%; background: var(--vscode-charts-blue); border-radius: 1px 1px 0 0; min-height: 2px; }
	.chart-bar-label { font-size: 8px; color: var(--vscode-descriptionForeground); margin-top: 2px; white-space: nowrap; transform: rotate(-35deg); transform-origin: top center; }

	/* Toolbar */
	.toolbar { display: flex; justify-content: flex-end; gap: 4px; margin-bottom: 10px; }
	.btn-icon {
		padding: 4px 8px; background: transparent; border: 1px solid var(--vscode-panel-border);
		border-radius: 4px; cursor: pointer; color: var(--vscode-foreground); font-size: 14px; line-height: 1;
	}
	.btn-icon:hover { background: var(--vscode-toolbar-hoverBackground); }
	.btn-refresh-svc { padding: 2px 6px; font-size: 12px; margin-left: auto; margin-right: 6px; }
	.btn-refresh-svc.spinning .icon { display: inline-block; animation: spin 1s linear infinite; }
	@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

	/* Empty State */
	.empty-state { text-align: center; padding: 40px 12px; color: var(--vscode-descriptionForeground); }
	.empty-icon { font-size: 36px; margin-bottom: 12px; }
	.empty-title { font-size: 14px; font-weight: 500; margin-bottom: 4px; color: var(--vscode-foreground); }
	.empty-hint { font-size: 12px; margin-bottom: 16px; opacity: 0.7; }

	/* Settings */
	.settings-section { padding: 4px 0; }
	.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
	.form-group { margin-bottom: 14px; }
	.form-label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 5px; color: var(--vscode-foreground); }
	.form-input {
		width: 100%; padding: 6px 8px;
		border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
		border-radius: 4px; background: var(--vscode-input-background);
		color: var(--vscode-input-foreground); font-family: inherit; font-size: 12px;
	}
	.form-input:focus { outline: none; border-color: var(--vscode-focusBorder); }
	.form-hint { display: block; font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 3px; }
	.form-actions { margin-top: 12px; }
	.form-actions .btn { width: 100%; }
	.form-row-hint { display: flex; justify-content: space-between; align-items: center; margin-top: 3px; }

	/* Buttons */
	.btn {
		padding: 6px 14px; border: 1px solid var(--vscode-button-border, transparent);
		border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit;
		text-align: center; transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
	.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
	.btn-danger { background: var(--vscode-charts-red); color: white; border-color: var(--vscode-charts-red); width: 100%; }
	.btn-danger:hover { opacity: 0.85; }
	.btn-sm { padding: 4px 10px; font-size: 11px; flex: 1; }
	#add-service-btn { flex: none !important; white-space: nowrap; }
	.btn-sm.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-border, transparent); }
	.btn-sm.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
	.btn-sm.btn-delete { background: transparent; border-color: var(--vscode-charts-red); color: var(--vscode-charts-red); }
	.btn-sm.btn-delete:hover { background: var(--vscode-charts-red); color: white; }

	.btn-link { background: transparent; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 11px; padding: 0; text-decoration: underline; }
	.btn-link:hover { color: var(--vscode-textLink-activeForeground); }

	/* Add service row */
	.add-service-row { display: flex; gap: 6px; align-items: center; width: 100%; }
	.add-service-select { flex: 1; min-width: 0; }

	/* Service Item (设置页卡片) */
	.service-item {
		background: var(--vscode-editor-inactiveSelectionBackground);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 6px; padding: 10px; margin-bottom: 8px;
	}
	.svc-row-name .svc-name { width: 100%; }
	.svc-row-kind { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
	.svc-kind-label { font-size: 13px; font-weight: 600; color: var(--vscode-foreground); }
	.svc-row-name { margin-bottom: 8px; }
	.svc-row-actions {
		display: flex; gap: 8px;
		margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border);
	}

	/* Toggle Switch */
	.toggle { position: relative; display: inline-block; width: 32px; height: 18px; flex-shrink: 0; }
	.toggle input { opacity: 0; width: 0; height: 0; }
	.toggle-slider {
		position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
		background: var(--vscode-panel-border); border-radius: 18px; transition: 0.2s;
	}
	.toggle-slider:before {
		position: absolute; content: ""; height: 14px; width: 14px;
		left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: 0.2s;
	}
	.toggle input:checked + .toggle-slider { background: var(--vscode-button-background); }
	.toggle input:checked + .toggle-slider:before { transform: translateX(14px); }

	/* Stats Grid */
	.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
	.stat-item { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; text-align: center; }
	.stat-value { font-size: 15px; font-weight: 600; color: var(--vscode-foreground); }
	.stat-label { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

	/* Daily Table */
	.daily-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border); }
	.daily-title { font-size: 11px; font-weight: 600; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
	.daily-table { width: 100%; border-collapse: collapse; font-size: 11px; }
	.daily-table th { text-align: left; padding: 3px 6px; color: var(--vscode-descriptionForeground); font-weight: 500; border-bottom: 1px solid var(--vscode-panel-border); }
	.daily-table td { padding: 3px 6px; border-bottom: 1px solid var(--vscode-panel-border, transparent); }
	.daily-table tr:last-child td { border-bottom: none; }
	.td-date { color: var(--vscode-foreground); }
	.td-num { text-align: right; color: var(--vscode-descriptionForeground); }
	`;

	// 追加各服务特定样式
	for (const desc of getAllDescriptors()) {
		css += desc.styles;
	}

	return css;
}
