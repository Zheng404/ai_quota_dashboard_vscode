// Kimi 的卡片、头部和配额样式已并入 Dashboard 通用基座

export const KIMI_STYLES = `
.badge-kimi {
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
}
.kimi-membership-note { padding: 0 12px 10px; color: var(--aqd-muted); font-size: 10.5px; line-height: 1.5; }
@media (min-width: 600px) {
	.kimi-membership-note { padding-right: 14px; padding-left: 14px; }
}
`;
