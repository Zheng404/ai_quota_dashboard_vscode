// Kimi Membership 专属样式

export const KIMI_STYLES = `
/* ===== Kimi 徽章 ===== */
.badge-kimi {
	background: var(--vscode-charts-purple, var(--vscode-button-secondaryBackground));
	color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
}

/* ===== Kimi 卡片整体 ===== */
.kimi-card {
	background: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 8px;
	overflow: hidden;
	margin-bottom: 16px;
}

/* ===== 头部区域 ===== */
.kimi-header {
	padding: 12px 14px;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.kimi-header-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
}

.kimi-header-row2 {
	margin-top: 4px;
}

.kimi-header-row3 {
	margin-top: 4px;
}

.kimi-renew-label {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.kimi-renew-time {
	font-size: 11px;
	color: var(--vscode-foreground);
	font-weight: 500;
}

.kimi-header-left {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.kimi-user-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-foreground);
}

.kimi-service-name {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.kimi-update-time {
	font-size: 10px;
	color: var(--vscode-descriptionForeground);
	margin-left: auto;
}

.kimi-refresh-btn {
	padding: 2px 6px;
	font-size: 12px;
	margin-left: auto;
	flex-shrink: 0;
}

/* 等级徽章 */
.kimi-level-badge {
	background: linear-gradient(135deg, #9B59B6, #8E44AD);
	color: #fff;
	font-size: 9px;
	font-weight: 700;
	padding: 1px 6px;
	border-radius: 10px;
	letter-spacing: 0.5px;
}

/* ===== 用量统计区域 ===== */
.kimi-quota-section {
	padding: 12px 0;
}

.kimi-quota-cards {
	padding: 0 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.kimi-quota-card {
	background: var(--vscode-sideBar-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 6px;
	padding: 10px 12px;
}

.kimi-quota-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.kimi-quota-label {
	font-size: 12px;
	color: var(--vscode-foreground);
}

.kimi-quota-percent {
	font-size: 16px;
	font-weight: 700;
	color: var(--vscode-foreground);
}

.kimi-quota-used {
	font-size: 11px;
	font-weight: 400;
	color: var(--vscode-descriptionForeground);
	margin-left: 4px;
}

.kimi-progress {
	height: 4px;
	margin-bottom: 6px;
}

.kimi-quota-detail-line {
	font-size: 10px;
	color: var(--vscode-foreground);
	margin-top: 4px;
}

.kimi-quota-reset {
	font-size: 10px;
	color: var(--vscode-descriptionForeground);
	margin-top: 2px;
}
`;
