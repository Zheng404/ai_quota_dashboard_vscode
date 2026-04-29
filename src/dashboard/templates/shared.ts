// 共享渲染函数 + 模板调度器

export function getSharedScript(): string {
	return `
	// ====== 共享工具 ======

	function fmtNum(n) {
		if (n == null) return '-';
		if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
		if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
		return String(n);
	}

	function fmtDateTime(d) {
		const pad = function(n) { return String(n).padStart(2, '0'); };
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
	}

	function escapeHtml(text) {
		return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	// ====== 共享渲染器 ======

	function renderNoConfig() {
		return '<div class="empty-state"><div class="empty-icon">\\u{1F4CA}</div><p class="empty-title">暂无配额数据</p><p class="empty-hint">切换到「设置」标签添加服务</p></div>';
	}

	function renderErrorCard(data) {
		return '<div class="service-card error"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span><span class="badge badge-error">错误</span></div><p class="error-message">' + escapeHtml(data.err) + '</p></div>';
	}

	function renderSlot(slot) {
		const pct = Math.min(slot.percent, 100);
		const color = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success';
		let detail = '';
		if (slot.used != null && slot.limit != null) detail = fmtNum(slot.used) + ' / ' + fmtNum(slot.limit);
		if (slot.resetsAt) {
			const diff = slot.resetsAt - Date.now();
			if (diff > 0) {
				const mins = Math.floor(diff / 60000);
				const hrs = Math.floor(mins / 60);
				const rem = mins % 60;
				detail += detail ? (' \\u00b7 ' + hrs + 'h ' + rem + 'm') : (hrs + 'h ' + rem + 'm');
			}
		}
		return '<div class="slot"><div class="slot-header"><span class="slot-label">' + escapeHtml(slot.label) + '</span><span class="slot-percent ' + color + '">' + pct.toFixed(1) + '%</span></div><div class="progress-bar"><div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div></div><div class="slot-detail">' + detail + '</div></div>';
	}

	// ====== 模板注册表 ======
	const serviceTemplates = {};

	// 调度器 —— 每个服务必须注册专用模板，无 fallback
	function renderService(data) {
		if (data.err) return renderErrorCard(data);
		const tmpl = serviceTemplates[data.kind];
		if (tmpl) {
			return tmpl.renderCard(data);
		}
		return '<div class="service-card error"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span><span class="badge badge-error">未注册</span></div><p class="error-message">服务类型 <code>' + escapeHtml(data.kind) + '</code> 暂无专用仪表盘，请在对应服务目录下注册模板。</p></div>';
	}
	`;
}
