export const BRIDGE_STYLES = `
/* ===== Bridge 卡片整体 ===== */
.bridge-card {
	background: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 8px;
	overflow: hidden;
	margin-bottom: 16px;
}

/* ===== 头部区域 ===== */
.bridge-header {
	padding: 12px 14px;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.bridge-header-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
}

.bridge-header-row2 {
	margin-top: 4px;
}

.bridge-header-left {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.bridge-user-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-foreground);
}

.bridge-service-name {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.bridge-update-time {
	font-size: 10px;
	color: var(--vscode-descriptionForeground);
}

.bridge-status-badge {
	font-size: 10px;
	padding: 2px 6px;
	border-radius: 4px;
	border: 1px solid;
	font-weight: 500;
}

/* ===== 状态区域 ===== */
.bridge-status-section {
	padding: 12px 14px;
}

.bridge-info-row {
	display: flex;
	gap: 6px;
	margin-bottom: 6px;
	font-size: 12px;
}

.bridge-info-label {
	color: var(--vscode-descriptionForeground);
}

.bridge-info-value {
	color: var(--vscode-foreground);
	font-weight: 500;
}

.bridge-cred-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: 6px 0 10px;
}

.bridge-cred-tag {
	font-size: 11px;
	padding: 3px 8px;
	border-radius: 4px;
	background: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
}

.bridge-cred-empty {
	font-size: 12px;
	color: var(--vscode-descriptionForeground);
	margin: 6px 0 10px;
}

.bridge-error-row {
	margin-top: 8px;
	padding: 8px;
	background: var(--vscode-inputValidation-errorBackground);
	border: 1px solid var(--vscode-inputValidation-errorBorder);
	border-radius: 4px;
	font-size: 11px;
}

.bridge-error-label {
	color: var(--vscode-errorForeground);
	font-weight: 600;
}

.bridge-error-value {
	color: var(--vscode-errorForeground);
}

.bridge-hint {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px solid var(--vscode-panel-border);
}
`;
