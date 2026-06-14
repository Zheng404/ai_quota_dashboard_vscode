// Xiaomi MiMo Token Plan 仪表盘模板
// 设计要点：
// - 头部三行：[名称][等级] [刷新] / [服务名] [更新时间] / [有效期至]
// - 用量统计：配额卡片垂直排列（月度Token总量/套餐Token总量）

export function getMimoTemplate(): string {
	return `
	// ====== MiMo 模板注册 ======
	serviceTemplates.mimo = {
		renderCard: function(data) {
			return '<div class="mimo-card" id="mimo-card-' + data.id + '">' +
				renderMimoHeader(data) +
				renderMimoQuota(data) +
				'</div>';
		}
	};

	// ====== 头部渲染 ======
	function renderMimoHeader(data) {
		const planName = data.planName || '';
		const planBadge = planName ? '<span class="mimo-plan-badge">' + escapeHtml(planName) + '</span>' : '';
		const expiryLine = data.currentPeriodEnd
			? '<div class="mimo-header-row mimo-header-row3"><span class="mimo-expiry-label">有效期至：</span><span class="mimo-expiry-time">' + escapeHtml(data.currentPeriodEnd) + '</span></div>'
			: '';
		return '<div class="mimo-header">' +
			'<div class="mimo-header-row">' +
				'<div class="mimo-header-left">' +
					'<span class="mimo-user-name">' + escapeHtml(data.name) + '</span>' +
					planBadge +
				'</div>' +
				'<button class="btn btn-icon btn-refresh-svc mimo-refresh-btn" data-service-id="' + data.id + '" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>' +
			'</div>' +
			'<div class="mimo-header-row mimo-header-row2">' +
				'<span class="mimo-service-name">Xiaomi MiMo Token Plan</span>' +
				'<span class="mimo-update-time">' + fmtDateTime(new Date(data.updatedAt)) + '</span>' +
			'</div>' +
			expiryLine +
			'</div>';
	}

	// ====== 用量统计渲染 ======
	function renderMimoQuota(data) {
		const slots = data.slots || [];
		const slotsHtml = slots.map(function(s) {
			return renderMimoQuotaCard(s);
		}).join('');

		return '<div class="mimo-quota-section">' +
			'<div class="mimo-quota-cards">' + slotsHtml + '</div>' +
			'</div>';
	}

	function renderMimoQuotaCard(slot) {
		const pct = Math.min(slot.percent, 100);
		const color = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success';
		const usedText = slot.used != null ? fmtNum(slot.used) : '-';
		const limitText = slot.limit != null ? fmtNum(slot.limit) : '-';
		return '<div class="mimo-quota-card">' +
			'<div class="mimo-quota-header">' +
				'<span class="mimo-quota-label">' + escapeHtml(slot.label) + '</span>' +
				'<span class="mimo-quota-percent">' + pct.toFixed(1) + '%<span class="mimo-quota-used">已使用</span></span>' +
			'</div>' +
			'<div class="progress-bar mimo-progress">' +
				'<div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div>' +
			'</div>' +
			'<div class="mimo-quota-detail">已使用：' + usedText + '&nbsp;&nbsp;总额度：' + limitText + '</div>' +
			'</div>';
	}
	`;
}
