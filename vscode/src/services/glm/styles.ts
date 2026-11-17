// GLM 详情、等级与图表样式；卡片和配额共用 Dashboard 基座

export const GLM_STYLES = `
.glm-level-badge {
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
}
.glm-detail-section { min-width: 0; padding: 10px 12px 12px; border-top: 1px solid var(--aqd-border); }
.glm-main-tabs { display: flex; gap: 3px; border-bottom: 1px solid var(--aqd-border); }
.glm-main-tab {
	flex: 1; min-width: 0; min-height: 28px; padding: 4px 8px;
	background: transparent; border: 0; border-bottom: 2px solid transparent;
	color: var(--aqd-muted); font-family: inherit; font-size: 11px;
}
.glm-main-tab:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
.glm-main-tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
.glm-sub-tabs { display: flex; flex-wrap: wrap; gap: 5px; margin: 9px 0; }
.glm-sub-tab {
	min-height: 24px; padding: 2px 9px; border: 1px solid var(--aqd-border); border-radius: 4px;
	background: transparent; color: var(--aqd-muted); font-family: inherit; font-size: 10.5px;
}
.glm-sub-tab:hover { color: var(--vscode-foreground); border-color: var(--vscode-focusBorder); }
.glm-sub-tab.active { background: var(--vscode-button-secondaryBackground); border-color: transparent; color: var(--vscode-button-secondaryForeground); }
.glm-detail-content { min-width: 0; min-height: 76px; }
.glm-loading, .glm-detail-empty { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 76px; padding: 16px 8px; color: var(--aqd-muted); font-size: 11px; text-align: center; }
.glm-loading.glm-detail-status { min-height: 0; padding: 5px 0 10px; }
.glm-loading .icon { color: var(--vscode-focusBorder); animation: spin 900ms linear infinite; }
.glm-detail-error { display: flex; align-items: flex-start; gap: 7px; min-height: 76px; padding: 14px 8px; color: var(--aqd-muted); font-size: 11px; }
.glm-detail-error.glm-detail-status { min-height: 0; padding: 5px 0 10px; }
.glm-detail-error > .icon { width: 14px; height: 14px; margin-top: 2px; color: var(--aqd-danger); }
.glm-detail-error-copy { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.glm-detail-error-copy strong { color: var(--vscode-foreground); font-weight: 600; }
.glm-detail-error-copy p { margin-top: 3px; }
.glm-detail-retry { flex: 0 0 auto; min-height: 24px; padding: 2px 7px; }
.glm-detail-retry[aria-disabled="true"] { cursor: wait; opacity: .7; }
.glm-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 132px), 1fr)); gap: 5px 14px; margin-top: 10px; }
.glm-summary-item { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 2px 0; font-size: 10.5px; }
.glm-summary-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; }
.glm-summary-name { min-width: 0; color: var(--aqd-muted); overflow-wrap: anywhere; }
.glm-summary-value { margin-left: auto; color: var(--vscode-foreground); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.glm-chart-wrap { width: 100%; height: 104px; padding: 4px; overflow: hidden; border: 1px solid var(--aqd-border); border-radius: 4px; background: var(--vscode-sideBar-background); }
.glm-chart { display: block; width: 100%; height: 100%; }
@media (min-width: 600px) {
	.glm-detail-section { padding-right: 14px; padding-left: 14px; }
}
@media (prefers-reduced-motion: reduce) {
	.glm-loading .icon { animation: none; }
}
`;
