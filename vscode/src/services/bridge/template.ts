export function getBridgeTemplate(): string {
	return `
	// ====== Bridge 模板注册 ======
	serviceTemplates.bridge = {
		renderCard: function(data) {
			return '<div class="bridge-card" id="bridge-card-' + data.id + '">' +
				renderBridgeHeader(data) +
				renderBridgeStatus(data) +
				'</div>';
		}
	};

	function renderBridgeHeader(data) {
		const statusColor = data.connected ? '#22c55e' : '#ef4444';
		const statusText = data.connected ? '已连接浏览器扩展' : '未连接浏览器扩展';
		return '<div class="bridge-header">' +
			'<div class="bridge-header-row">' +
				'<div class="bridge-header-left">' +
					'<span class="bridge-user-name">' + escapeHtml(data.name) + '</span>' +
					'<span class="bridge-status-badge" style="color: ' + statusColor + '; border-color: ' + statusColor + ';">' + statusText + '</span>' +
				'</div>' +
				'<button class="btn btn-icon btn-refresh-svc bridge-refresh-btn" data-service-id="' + data.id + '" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>' +
			'</div>' +
			'<div class="bridge-header-row bridge-header-row2">' +
				'<span class="bridge-service-name">Cookie Bridge</span>' +
				'<span class="bridge-update-time">' + fmtDateTime(new Date(data.updatedAt)) + '</span>' +
			'</div>' +
			'</div>';
	}

	function renderBridgeStatus(data) {
		const creds = data.receivedCredentials || [];
		const lastPush = data.lastPushAt
			? '<div class="bridge-info-row"><span class="bridge-info-label">最后同步：</span><span class="bridge-info-value">' + fmtDateTime(new Date(data.lastPushAt)) + '</span></div>'
			: '<div class="bridge-info-row"><span class="bridge-info-label">最后同步：</span><span class="bridge-info-value">暂无</span></div>';

		const credLabels = {
			kimiAuthToken: 'Kimi',
			mimoCookie: 'MiMo',
			glmApiKey: 'GLM'
		};

		let credsHtml = '';
		if (creds.length === 0) {
			credsHtml = '<div class="bridge-cred-empty">浏览器扩展尚未推送任何凭证</div>';
		} else {
			credsHtml = '<div class="bridge-cred-list">' +
				creds.map(function(c) {
					const label = credLabels[c] || c;
					return '<span class="bridge-cred-tag">' + escapeHtml(label) + '</span>';
				}).join('') +
				'</div>';
		}

		const errorHtml = data.lastError
			? '<div class="bridge-error-row"><span class="bridge-error-label">诊断：</span><span class="bridge-error-value">' + escapeHtml(data.lastError) + '</span></div>'
			: '';

		return '<div class="bridge-status-section">' +
			lastPush +
			'<div class="bridge-info-row"><span class="bridge-info-label">已接收凭证：</span></div>' +
			credsHtml +
			errorHtml +
			'<div class="bridge-hint">浏览器扩展推送的凭证将自动分发到对应的 Kimi / MiMo / GLM 服务。</div>' +
			'</div>';
	}
	`;
}
