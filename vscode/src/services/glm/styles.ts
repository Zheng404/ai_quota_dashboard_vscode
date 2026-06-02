// GLM 仪表盘样式（按官方设计）

export const GLM_STYLES = `
/* ===== GLM 卡片整体 ===== */
.glm-card {
	background: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 8px;
	overflow: hidden;
	margin-bottom: 16px;
}

/* ===== 头部区域 ===== */
.glm-header {
	padding: 12px 14px;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.glm-header-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
}

.glm-header-row2 {
	margin-top: 4px;
}

.glm-header-row3 {
	margin-top: 4px;
}

.glm-renew-label {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.glm-renew-time {
	font-size: 11px;
	color: var(--vscode-foreground);
	font-weight: 500;
}

.glm-header-left {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.glm-user-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-foreground);
}

.glm-service-name {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.glm-update-time {
	font-size: 10px;
	color: var(--vscode-descriptionForeground);
	margin-left: auto;
}

.glm-refresh-btn {
	padding: 2px 6px;
	font-size: 12px;
	margin-left: auto;
	flex-shrink: 0;
}

/* 等级徽章 */
.glm-level-badge {
	background: linear-gradient(135deg, #FFD700, #FFA500);
	color: #333;
	font-size: 9px;
	font-weight: 700;
	padding: 1px 6px;
	border-radius: 10px;
	letter-spacing: 0.5px;
}

/* ===== 分区标题 ===== */
.glm-section-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--vscode-foreground);
	margin-bottom: 10px;
	padding: 0 14px;
}

/* ===== 用量统计区域 ===== */
.glm-quota-section {
	padding: 12px 0;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.glm-quota-cards {
	padding: 0 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.glm-quota-card {
	background: var(--vscode-sideBar-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 6px;
	padding: 10px 12px;
}

.glm-quota-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.glm-quota-label {
	font-size: 12px;
	color: var(--vscode-foreground);
}

.glm-quota-percent {
	font-size: 16px;
	font-weight: 700;
	color: var(--vscode-foreground);
}

.glm-quota-used {
	font-size: 11px;
	font-weight: 400;
	color: var(--vscode-descriptionForeground);
	margin-left: 4px;
}

.glm-progress {
	height: 4px;
	margin-bottom: 6px;
}

.glm-quota-detail-line {
	font-size: 10px;
	color: var(--vscode-foreground);
	margin-top: 4px;
}

.glm-quota-reset {
	font-size: 10px;
	color: var(--vscode-descriptionForeground);
	margin-top: 2px;
}

/* ===== 使用详情区域 ===== */
.glm-detail-section {
	padding: 12px 0;
}

/* 主Tab */
.glm-main-tabs {
	display: flex;
	gap: 2px;
	margin-bottom: 8px;
	padding: 0 14px;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.glm-main-tab {
	flex: 1;
	padding: 5px 8px;
	background: transparent;
	border: none;
	border-bottom: 2px solid transparent;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
	font-family: inherit;
	cursor: pointer;
	transition: all 0.2s;
}

.glm-main-tab:hover {
	color: var(--vscode-foreground);
}

.glm-main-tab.active {
	color: var(--vscode-foreground);
	border-bottom-color: #4A90D9;
	font-weight: 500;
}

/* 子Tab */
.glm-sub-tabs {
	display: flex;
	gap: 2px;
	margin-bottom: 10px;
	padding: 0 14px;
}

.glm-sub-tab {
	padding: 3px 10px;
	background: transparent;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 3px;
	color: var(--vscode-descriptionForeground);
	font-size: 10px;
	font-family: inherit;
	cursor: pointer;
	transition: all 0.2s;
}

.glm-sub-tab:hover {
	color: var(--vscode-foreground);
	border-color: var(--vscode-focusBorder);
}

.glm-sub-tab.active {
	background: #4A90D9;
	color: #fff;
	border-color: #4A90D9;
}

/* 详情内容 */
.glm-detail-content {
	padding: 0 14px;
}

.glm-loading {
	text-align: center;
	padding: 20px;
	color: var(--vscode-descriptionForeground);
	font-size: 12px;
}

/* ===== 汇总统计行 ===== */
.glm-summary-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 12px;
	margin-bottom: 12px;
}

.glm-summary-item {
	display: flex;
	align-items: center;
	gap: 5px;
	background: var(--vscode-sideBar-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	padding: 5px 8px;
	font-size: 11px;
}

.glm-summary-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	flex-shrink: 0;
}

.glm-summary-name {
	color: var(--vscode-descriptionForeground);
}

.glm-summary-value {
	color: var(--vscode-foreground);
	font-weight: 600;
	margin-left: auto;
}

/* ===== 折线图 ===== */
.glm-chart-wrap {
	width: 100%;
	height: 100px;
	background: var(--vscode-sideBar-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	padding: 4px;
	overflow: hidden;
}

.glm-chart {
	width: 100%;
	height: 100%;
}
`;
