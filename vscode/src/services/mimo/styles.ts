// Xiaomi MiMo Token Plan 专属样式
// 参考官方截图的金色/米色风格

export const MIMO_STYLES = `
/* ===== MiMo 徽章 ===== */
.badge-mimo {
	background: linear-gradient(135deg, #C9A96E, #B8944F);
	color: #fff;
}

/* ===== MiMo 卡片整体 ===== */
.mimo-card {
	background: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 8px;
	overflow: hidden;
	margin-bottom: 16px;
}

/* ===== 头部区域 ===== */
.mimo-header {
	padding: 12px 14px;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.mimo-header-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
}

.mimo-header-row2 {
	margin-top: 4px;
}

.mimo-header-row3 {
	margin-top: 4px;
}

.mimo-header-left {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.mimo-user-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-foreground);
}

.mimo-service-name {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.mimo-update-time {
	font-size: 10px;
	color: var(--vscode-descriptionForeground);
	margin-left: auto;
}

.mimo-refresh-btn {
	padding: 2px 6px;
	font-size: 12px;
	margin-left: auto;
	flex-shrink: 0;
}

/* 套餐等级徽章（暖金色渐变） */
.mimo-plan-badge {
	background: linear-gradient(135deg, #D4A853, #C49A43);
	color: #fff;
	font-size: 9px;
	font-weight: 700;
	padding: 1px 6px;
	border-radius: 10px;
	letter-spacing: 0.5px;
}

/* 有效期 */
.mimo-expiry-label {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
}

.mimo-expiry-time {
	font-size: 11px;
	color: var(--vscode-foreground);
	font-weight: 500;
}

/* ===== 用量统计区域 ===== */
.mimo-quota-section {
	padding: 12px 0;
}

.mimo-quota-cards {
	padding: 0 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.mimo-quota-card {
	background: var(--vscode-sideBar-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 6px;
	padding: 10px 12px;
}

.mimo-quota-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.mimo-quota-label {
	font-size: 12px;
	color: var(--vscode-foreground);
}

.mimo-quota-percent {
	font-size: 16px;
	font-weight: 700;
	color: var(--vscode-foreground);
}

.mimo-quota-used {
	font-size: 11px;
	font-weight: 400;
	color: var(--vscode-descriptionForeground);
	margin-left: 4px;
}

.mimo-progress {
	height: 4px;
	margin-bottom: 6px;
}

.mimo-quota-detail {
	font-size: 11px;
	color: var(--vscode-descriptionForeground);
	margin-top: 4px;
}
`;
