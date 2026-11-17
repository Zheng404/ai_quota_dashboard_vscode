// Dashboard Webview 通用样式表（服务特定样式由各 ServiceDescriptor 贡献）

import { getAllDescriptors } from '../services/registry';

export function getStyles(): string {
	let css = `
	:root {
		--aqd-radius: 6px;
		--aqd-border: var(--vscode-panel-border);
		--aqd-muted: var(--vscode-descriptionForeground);
		--aqd-success: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
		--aqd-warning: var(--vscode-editorWarning-foreground, var(--vscode-charts-yellow));
		--aqd-danger: var(--vscode-errorForeground, var(--vscode-charts-red));
	}
	* { margin: 0; padding: 0; box-sizing: border-box; }
	html { min-width: 0; }
	body {
		min-width: 0;
		padding: 8px 10px 16px;
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		line-height: 1.45;
		color: var(--vscode-foreground);
		background: var(--vscode-sideBar-background);
	}
	button, input, select, textarea { max-width: 100%; font: inherit; }
	button, select { cursor: pointer; }
	button { color: inherit; }
	img, svg { max-width: 100%; }
	[hidden] { display: none !important; }
	.container { width: 100%; max-width: 720px; min-width: 0; margin: 0 auto; }
	.sr-only {
		position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
		overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
	}
	.icon { width: 16px; height: 16px; flex: 0 0 auto; vertical-align: -3px; }
	:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }

	/* 顶级标签页 */
	.tabs {
		display: flex; gap: 2px; margin-bottom: 12px;
		border-bottom: 1px solid var(--aqd-border);
	}
	.tab-btn {
		flex: 1; min-width: 0; min-height: 30px; padding: 5px 8px;
		background: transparent; border: 0; border-bottom: 2px solid transparent;
		color: var(--aqd-muted); font-size: 12px; font-family: inherit;
		transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
	}
	.tab-btn:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
	.tab-btn.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
	.tab-panel { display: none; min-width: 0; }
	.tab-panel.active { display: block; }

	/* 服务卡片：一层容器，内部用分隔与留白组织信息 */
	.service-card {
		min-width: 0; margin-bottom: 10px;
		background: var(--vscode-editor-background);
		border: 1px solid var(--aqd-border); border-radius: var(--aqd-radius);
	}
	.service-card-error { border-left: 2px solid var(--aqd-danger); }
	.service-header { display: flex; align-items: flex-start; gap: 8px; padding: 11px 12px 10px; }
	.service-heading { flex: 1; min-width: 0; }
	.service-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 7px; min-width: 0; }
	.service-name { min-width: 0; font-size: 13px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
	.service-subtitle { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 5px; margin-top: 3px; color: var(--aqd-muted); font-size: 10.5px; }
	.update-time { font-variant-numeric: tabular-nums; }
	.refresh-state { color: var(--aqd-muted); }
	.service-renew { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 6px; font-size: 11px; color: var(--aqd-muted); }
	.service-renew-value { color: var(--vscode-foreground); font-variant-numeric: tabular-nums; }
	.service-badge {
		display: inline-flex; align-items: center; min-height: 17px; padding: 1px 6px;
		border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
		font-size: 9px; font-weight: 600; line-height: 1.4; letter-spacing: .02em;
	}
	.badge-error { background: var(--vscode-inputValidation-errorBackground); color: var(--aqd-danger); border: 1px solid var(--aqd-danger); }
	.badge-muted { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
	.icon-button {
		display: inline-flex; align-items: center; justify-content: center;
		width: 28px; height: 28px; flex: 0 0 28px; margin: -4px -4px 0 0;
		padding: 0; border: 1px solid transparent; border-radius: 4px;
		background: transparent; color: var(--aqd-muted);
	}
	.icon-button:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
	.icon-button[aria-disabled="true"] { cursor: progress; color: var(--vscode-foreground); }
	.btn-refresh-svc.spinning .icon { animation: spin 900ms linear infinite; }

	/* 配额 */
	.quota-section { min-width: 0; padding: 2px 12px 10px; border-top: 1px solid var(--aqd-border); }
	.quota-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 2px 18px; }
	.quota-item { min-width: 0; padding: 9px 0 7px; }
	.quota-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
	.quota-label { min-width: 0; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
	.quota-percent { flex: 0 0 auto; font-size: 15px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
	.quota-percent.success { color: var(--aqd-success); }
	.quota-percent.warning { color: var(--aqd-warning); }
	.quota-percent.danger { color: var(--aqd-danger); }
	.quota-used { margin-left: 4px; color: var(--aqd-muted); font-size: 10px; font-weight: 400; }
	.progress-track {
		width: 100%; height: 4px; overflow: hidden; border-radius: 2px;
		background: var(--vscode-editor-inactiveSelectionBackground, var(--aqd-border));
	}
	.progress-fill { height: 100%; border-radius: inherit; transition: width 240ms ease; }
	.progress-fill.success { background: var(--vscode-charts-green); }
	.progress-fill.warning { background: var(--vscode-charts-yellow); }
	.progress-fill.danger { background: var(--vscode-charts-red); }
	.quota-meta { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 5px; color: var(--aqd-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
	.quota-note { margin-top: 5px; color: var(--aqd-muted); font-size: 10px; }
	.inline-empty { padding: 18px 0; color: var(--aqd-muted); font-size: 11px; text-align: center; }

	/* 加载、错误与空态 */
	.loading-body { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 82px; padding: 20px 12px; border-top: 1px solid var(--aqd-border); color: var(--aqd-muted); font-size: 12px; }
	.loading-spinner { display: inline-flex; color: var(--vscode-focusBorder); animation: spin 900ms linear infinite; }
	.initial-loading { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 120px; }
	.initial-loading .loading-spinner { width: 14px; height: 14px; border: 2px solid var(--aqd-border); border-top-color: var(--vscode-focusBorder); border-radius: 50%; }
	.service-error { display: flex; align-items: flex-start; gap: 8px; padding: 11px 12px 12px; border-top: 1px solid var(--aqd-border); }
	.service-error > .icon { margin-top: 2px; color: var(--aqd-danger); }
	.service-empty-body { display: flex; align-items: flex-start; gap: 10px; padding: 14px 12px; border-top: 1px solid var(--aqd-border); color: var(--aqd-muted); }
	.service-empty-body > .icon { width: 18px; height: 18px; margin-top: 1px; }
	.service-empty-title { color: var(--vscode-foreground); font-size: 12px; font-weight: 600; }
	.service-empty-copy { margin: 3px 0 10px; font-size: 11px; }
	.stale-notice { display: flex; align-items: flex-start; gap: 7px; padding: 8px 12px; border-top: 1px solid var(--aqd-border); background: var(--vscode-editor-inactiveSelectionBackground); color: var(--aqd-muted); font-size: 10.5px; }
	.stale-notice > .icon { width: 14px; height: 14px; margin-top: 2px; }
	.stale-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 1px; overflow-wrap: anywhere; }
	.stale-copy strong { color: var(--vscode-foreground); font-size: 11px; font-weight: 600; }
	.stale-error-detail { margin-top: 2px; }
	.stale-retry { flex: 0 0 auto; min-height: 24px; padding: 2px 7px; }
	.stale-retry.spinning .icon { animation: spin 900ms linear infinite; }
	.error-message { color: var(--aqd-danger); font-size: 12px; overflow-wrap: anywhere; }
	.error-recovery { margin-top: 5px; color: var(--aqd-muted); font-size: 11px; }
	.empty-state { max-width: 300px; margin: 0 auto; padding: 36px 14px; color: var(--aqd-muted); text-align: center; }
	.empty-icon { margin-bottom: 10px; color: var(--aqd-muted); }
	.empty-icon .icon { width: 24px; height: 24px; }
	.empty-title { margin-bottom: 5px; color: var(--vscode-foreground); font-size: 13px; font-weight: 600; }
	.empty-hint { margin-bottom: 16px; font-size: 11px; line-height: 1.6; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* 设置 */
	.settings-section { min-width: 0; padding: 2px 0 16px; }
	.settings-title { font-size: 13px; font-weight: 600; }
	.settings-description { margin: 4px 0 14px; color: var(--aqd-muted); font-size: 11px; line-height: 1.55; }
	.section-header { margin-bottom: 14px; }
	.form-group { min-width: 0; margin-bottom: 12px; }
	.form-label { display: block; margin-bottom: 4px; color: var(--vscode-foreground); font-size: 12px; font-weight: 500; }
	.form-value { color: var(--vscode-foreground); font-size: 12px; }
	.form-input {
		width: 100%; min-width: 0; min-height: 28px; padding: 4px 8px;
		border: 1px solid var(--vscode-input-border, var(--aqd-border)); border-radius: 4px;
		outline: 0; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
		font-family: inherit; font-size: 12px;
	}
	.form-input:hover { border-color: var(--vscode-inputOption-hoverBorder, var(--vscode-focusBorder)); }
	.form-input:focus { border-color: var(--vscode-focusBorder); outline: 1px solid var(--vscode-focusBorder); outline-offset: 0; }
	.form-hint { display: block; margin-top: 4px; color: var(--aqd-muted); font-size: 10.5px; line-height: 1.5; }
	.form-row-hint { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; }
	.form-row-hint .form-hint { flex: 1; min-width: 140px; }
	.form-row-hint .key-state-hint { flex-basis: 100%; }
	.form-input[aria-invalid="true"] { border-color: var(--aqd-danger); }
	.form-error { display: block; margin-top: 4px; color: var(--aqd-danger); font-size: 10.5px; line-height: 1.5; }
	.form-error:empty, .form-status:empty { display: none; }
	.form-status { margin-top: 8px; font-size: 11px; line-height: 1.5; }
	.form-status.success { color: var(--aqd-success); }
	.form-status.error { color: var(--aqd-danger); }
	.form-actions { margin-top: 14px; }
	.form-actions .btn-primary { width: 100%; }

	/* 按钮 */
	.btn {
		display: inline-flex; align-items: center; justify-content: center; gap: 6px;
		min-height: 28px; padding: 4px 12px;
		border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px;
		font-family: inherit; font-size: 12px; line-height: 1.35; text-align: center;
		transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
	}
	.btn .icon { width: 14px; height: 14px; }
	.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
	.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
	.btn:disabled { cursor: wait; opacity: .7; }
	#save-global-btn[aria-busy="true"] .icon { animation: spin 900ms linear infinite; }
	.btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
	.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
	.btn-danger { background: transparent; border-color: var(--aqd-danger); color: var(--aqd-danger); }
	.btn-danger:hover { background: var(--vscode-inputValidation-errorBackground); }
	.btn-sm { min-height: 26px; padding: 3px 9px; font-size: 11px; }
	.btn-link { min-height: 0; padding: 0; border: 0; background: transparent; color: var(--vscode-textLink-foreground); font-size: 10.5px; }
	.btn-link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

	/* 添加与服务配置 */
	.add-service-row { display: flex; align-items: center; gap: 7px; width: 100%; }
	.add-service-select { flex: 1; min-width: 0; }
	#add-service-btn { flex: 0 0 auto; white-space: nowrap; }
	.service-item {
		min-width: 0; margin-bottom: 10px; padding: 12px;
		background: var(--vscode-editor-background); border: 1px solid var(--aqd-border); border-radius: var(--aqd-radius);
	}
	.svc-row-kind { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
	.svc-kind-label { min-width: 0; color: var(--vscode-foreground); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
	.svc-row-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 7px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--aqd-border); }
	.settings-empty { padding: 18px 10px; border: 1px dashed var(--aqd-border); border-radius: var(--aqd-radius); color: var(--aqd-muted); font-size: 11px; text-align: center; }

	/* 非模态危险操作确认：默认焦点落在取消，Escape 可返回 */
	.inline-confirm { margin-top: 10px; padding: 10px; border-left: 2px solid var(--aqd-danger); border-radius: 3px; background: var(--vscode-editor-inactiveSelectionBackground); }
	.confirm-title { color: var(--vscode-foreground); font-size: 12px; font-weight: 600; }
	.confirm-copy { margin-top: 4px; color: var(--aqd-muted); font-size: 11px; line-height: 1.55; overflow-wrap: anywhere; }
	.confirm-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
	.danger-zone { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--aqd-border); }
	.danger-zone .settings-description { margin-bottom: 10px; }

	@media (min-width: 600px) {
		body { padding: 12px 16px 20px; }
		.service-header { padding: 12px 14px; }
		.quota-section { padding-right: 14px; padding-left: 14px; }
	}
	@media (max-width: 280px) {
		.add-service-row { flex-wrap: wrap; }
		.add-service-select { flex-basis: 100%; }
		#add-service-btn { width: 100%; }
		.service-header { padding-right: 10px; padding-left: 10px; }
		.quota-section { padding-right: 10px; padding-left: 10px; }
		.quota-header { align-items: flex-start; }
		.stale-notice { flex-wrap: wrap; }
		.stale-retry { margin-left: 21px; }
	}
	@media (prefers-reduced-motion: reduce) {
		*, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
		.loading-spinner, .btn-refresh-svc.spinning .icon, #save-global-btn[aria-busy="true"] .icon { animation: none; }
	}
	@media (forced-colors: active) {
		.progress-fill { background: Highlight; }
		.service-card-error, .inline-confirm { border-left-color: Mark; }
	}
	`;

	for (const desc of getAllDescriptors()) {
		css += desc.styles;
	}

	return css;
}
