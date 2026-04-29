// GLM 仪表盘模板（按官方设计实现）
// 设计要点：
// - 头部两行：[名称][等级] [刷新] / [服务名] [更新时间]
// - 用量统计：3个配额卡片垂直排列
// - 使用详情：模型用量/工具用量 主Tab + 当日/近7天/近30天 子Tab
// - 曲线图 + 汇总数据

export function getGlmTemplate(): string {
	return `
	// ====== GLM 前端状态管理 ======
	const glmStates = {};

	function getGlmState(svcId) {
		if (!glmStates[svcId]) {
			glmStates[svcId] = { mainTab: 'model', subTab: 'day', data: null };
		}
		return glmStates[svcId];
	}

	function getModelUsageForRange(data, range) {
		if (data.modelUsageByRange && data.modelUsageByRange[range]) {
			return data.modelUsageByRange[range];
		}
		if (range === 'day' && data.modelUsage) {
			return data.modelUsage;
		}
		return undefined;
	}

	function getToolUsageForRange(data, range) {
		if (data.toolUsageByRange && data.toolUsageByRange[range]) {
			return data.toolUsageByRange[range];
		}
		if (range === 'day' && data.toolUsage) {
			return data.toolUsage;
		}
		return undefined;
	}

	// ====== GLM 模板注册 ======
	serviceTemplates.glm = {
		renderCard: function(data) {
			const state = getGlmState(data.id);
			state.data = data;
			return '<div class="glm-card" id="glm-card-' + data.id + '">' +
				renderGlmHeader(data) +
				renderGlmQuota(data) +
				renderGlmDetailSection(data, state) +
				'</div>';
		}
	};

	// ====== 头部渲染 ======
	function renderGlmHeader(data) {
		const level = data.level || '';
		const levelBadge = level ? '<span class="glm-level-badge">' + escapeHtml(level.toUpperCase()) + '</span>' : '';
		const renewLine = data.nextRenewTime
			? '<div class="glm-header-row glm-header-row3"><span class="glm-renew-label">会员有效期至：</span><span class="glm-renew-time">' + escapeHtml(data.nextRenewTime) + '</span></div>'
			: '';
		return '<div class="glm-header">' +
			'<div class="glm-header-row">' +
				'<div class="glm-header-left">' +
					'<span class="glm-user-name">' + escapeHtml(data.name) + '</span>' +
					levelBadge +
				'</div>' +
				'<button class="btn btn-icon btn-refresh-svc glm-refresh-btn" data-service-id="' + data.id + '" title="刷新"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button>' +
			'</div>' +
			'<div class="glm-header-row glm-header-row2">' +
				'<span class="glm-service-name">GLM Coding Plan (CN)</span>' +
				'<span class="glm-update-time">' + fmtDateTime(new Date(data.updatedAt)) + '</span>' +
			'</div>' +
			renewLine +
			'</div>';
	}

	// ====== 用量统计渲染 ======
	function renderGlmQuota(data) {
		const slotsHtml = data.slots.map(function(s) {
			return renderGlmQuotaCard(s);
		}).join('');
		return '<div class="glm-quota-section">' +
			'<div class="glm-quota-cards">' + slotsHtml + '</div>' +
			'</div>';
	}

	function renderGlmQuotaCard(slot) {
		const pct = Math.min(slot.percent, 100);
		const color = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success';
		let detailLine = '';
		if (slot.label === 'MCP 每月额度' && slot.used != null && slot.limit != null) {
			detailLine = '<div class="glm-quota-detail-line">已调用次数：' + fmtNum(slot.used) + '&nbsp;&nbsp;&nbsp;&nbsp;总量：' + fmtNum(slot.limit) + '</div>';
		}
		let resetLine = '';
		if (slot.resetsAt) {
			resetLine = '<div class="glm-quota-reset">重置时间：' + formatDateTime(new Date(slot.resetsAt)) + '</div>';
		}
		return '<div class="glm-quota-card">' +
			'<div class="glm-quota-header">' +
				'<span class="glm-quota-label">' + escapeHtml(slot.label) + '</span>' +
				'<span class="glm-quota-percent">' + pct.toFixed(0) + '%<span class="glm-quota-used">已使用</span></span>' +
			'</div>' +
			'<div class="progress-bar glm-progress">' +
				'<div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div>' +
			'</div>' +
			detailLine +
			resetLine +
			'</div>';
	}

	// ====== 使用详情渲染 ======
	function renderGlmDetailSection(data, state) {
		const mainTabs = '<div class="glm-main-tabs">' +
			'<button class="glm-main-tab' + (state.mainTab === 'model' ? ' active' : '') + '" data-svc-id="' + data.id + '" data-tab="model">模型用量</button>' +
			'<button class="glm-main-tab' + (state.mainTab === 'tool' ? ' active' : '') + '" data-svc-id="' + data.id + '" data-tab="tool">工具用量</button>' +
			'</div>';
		const subTabs = '<div class="glm-sub-tabs">' +
			'<button class="glm-sub-tab' + (state.subTab === 'day' ? ' active' : '') + '" data-svc-id="' + data.id + '" data-range="day">当日</button>' +
			'<button class="glm-sub-tab' + (state.subTab === 'week' ? ' active' : '') + '" data-svc-id="' + data.id + '" data-range="week">近7天</button>' +
			'<button class="glm-sub-tab' + (state.subTab === 'month' ? ' active' : '') + '" data-svc-id="' + data.id + '" data-range="month">近30天</button>' +
			'</div>';
		const content = renderGlmDetailContent(data, state);
		return '<div class="glm-detail-section">' +
			mainTabs + subTabs +
			'<div class="glm-detail-content" id="glm-detail-content-' + data.id + '">' + content + '</div>' +
			'</div>';
	}

	function renderGlmDetailContent(data, state) {
		const range = state.subTab;
		if (state.mainTab === 'model') {
			const usage = getModelUsageForRange(data, range);
			if (usage) {
				return renderGlmModelDetail(usage, range);
			}
			return renderGlmLoading();
		}
		if (state.mainTab === 'tool') {
			const usage = getToolUsageForRange(data, range);
			if (usage) {
				return renderGlmToolDetail(usage, range);
			}
			return renderGlmLoading();
		}
		return renderGlmLoading();
	}

	function renderGlmLoading() {
		return '<div class="glm-loading">加载中...</div>';
	}

	// ====== 模型用量详情 ======
	function renderGlmModelDetail(usage, range) {
		// 计算总量序列，在图上增加总量灰色线
		let totalSeries = [];
		if (usage.modelSeries && usage.modelSeries.length > 0) {
			const dataLen = usage.modelSeries[0].tokensUsage ? usage.modelSeries[0].tokensUsage.length : 0;
			const totalTokensUsage = [];
			for (let i = 0; i < dataLen; i++) {
				let sum = 0;
				for (let j = 0; j < usage.modelSeries.length; j++) {
					sum += (usage.modelSeries[j].tokensUsage[i] || 0);
				}
				totalTokensUsage.push(sum);
			}
			totalSeries = [{
				modelName: 'Token 消耗总量',
				tokensUsage: totalTokensUsage,
				totalTokens: usage.totalTokens,
			}];
		}
		const chart = renderGlmChart(usage.modelSeries.concat(totalSeries), usage.xTime, 'tokens', range);
		const summaryItems = usage.modelSummary.map(function(m) {
			return '<div class="glm-summary-item">' +
				'<span class="glm-summary-dot" style="background:' + getModelColor(m.modelName) + '"></span>' +
				'<span class="glm-summary-name">' + escapeHtml(m.modelName) + '</span>' +
				'<span class="glm-summary-value">' + fmtTokens(m.totalTokens) + '</span>' +
				'</div>';
		}).join('');
		const totalItem = '<div class="glm-summary-item">' +
			'<span class="glm-summary-dot" style="background:' + getModelColor('Token 消耗总量') + '"></span>' +
			'<span class="glm-summary-name">Token 总量</span>' +
			'<span class="glm-summary-value">' + fmtTokens(usage.totalTokens) + '</span>' +
			'</div>';
		return chart + '<div class="glm-summary-row">' + totalItem + summaryItems + '</div>';
	}

	// ====== 工具用量详情 ======
	function renderGlmToolDetail(usage, range) {
		const chart = renderGlmChart(usage.toolSeries, usage.xTime, 'calls', range);
		const summaryItems = usage.toolSummary.map(function(t) {
			return '<div class="glm-summary-item">' +
				'<span class="glm-summary-dot" style="background:' + getToolColor(t.toolCode) + '"></span>' +
				'<span class="glm-summary-name">' + escapeHtml(t.toolName.replace(/\s*MCP$/, '')) + '</span>' +
				'<span class="glm-summary-value">' + t.totalUsageCount + ' 次</span>' +
				'</div>';
		}).join('');
		return chart + '<div class="glm-summary-row">' + summaryItems + '</div>';
	}

	// ====== 平滑曲线图渲染（二次贝塞尔） ======
	function renderGlmChart(series, xTime, valueKey, range) {
		if (!series || series.length === 0 || !xTime || xTime.length === 0) {
			return '';
		}
		const dataLen = xTime.length;
		let globalMax = 0;
		series.forEach(function(s) {
			const arr = valueKey === 'tokens' ? s.tokensUsage : s.usageCount;
			if (arr) {
				arr.forEach(function(v) {
					if (v != null && v > globalMax) globalMax = v;
				});
			}
		});
		if (globalMax === 0) globalMax = 1;
		const width = 260;
		const height = 100;
		const padding = { top: 5, right: 5, bottom: 25, left: 5 };
		const chartW = width - padding.left - padding.right;
		const chartH = height - padding.top - padding.bottom;

		// 计算所有数据点的坐标
		function getPoint(i, v) {
			return {
				x: padding.left + (i / (dataLen - 1 || 1)) * chartW,
				y: padding.top + chartH - ((v || 0) / globalMax) * chartH,
			};
		}

		// 生成平滑曲线路径（二次贝塞尔）
		const lines = series.map(function(s) {
			const arr = valueKey === 'tokens' ? s.tokensUsage : s.usageCount;
			if (!arr || arr.length === 0) return '';
			const color = valueKey === 'tokens' ? getModelColor(s.modelName) : getToolColor(s.toolCode);
			const pts = arr.map(function(v, i) { return getPoint(i, v); });
			if (pts.length === 0) return '';
			if (pts.length === 1) {
				return '<circle cx="' + pts[0].x + '" cy="' + pts[0].y + '" r="2" fill="' + color + '"/>';
			}
			// 二次贝塞尔平滑曲线：M p0 Q cp1 p1 Q cp2 p2 ...
			// 控制点取相邻两点的中点
			let path = 'M ' + pts[0].x + ' ' + pts[0].y;
			for (let i = 1; i < pts.length; i++) {
				const cp = { x: (pts[i-1].x + pts[i].x) / 2, y: (pts[i-1].y + pts[i].y) / 2 };
				path += ' Q ' + cp.x + ' ' + pts[i-1].y + ' ' + pts[i].x + ' ' + pts[i].y;
			}
			return '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="' + path + '" opacity="0.85"/>';
		}).join('');

		// X 轴标签 —— 不显示，避免格式问题和拥挤
		const labels = '';

		let gridLines = '';
		for (let i = 0; i <= 4; i++) {
			const y = padding.top + (i / 4) * chartH;
			gridLines += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="var(--vscode-panel-border)" stroke-width="0.5" opacity="0.3"/>';
		}
		const svg = '<svg class="glm-chart" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
			gridLines + lines + labels +
			'</svg>';
		return '<div class="glm-chart-wrap">' + svg + '</div>';
	}

	// ====== 颜色映射 ======
	function getModelColor(modelName) {
		if (modelName === 'Token 消耗总量') return '#666';
		const colors = {
			'GLM-5.1': '#4A90D9',
			'GLM-5': '#4A90D9',
			'GLM-5-Turbo': '#9B59B6',
			'GLM-4.7': '#E67E22',
			'GLM-4': '#E67E22',
			'GLM-4.6V': '#2ECC71',
			'GLM-4.5-Air': '#1ABC9C',
			'GLM-4V': '#F39C12',
		};
		return colors[modelName] || '#888';
	}

	function getToolColor(toolCode) {
		const colors = {
			'search-prime': '#4A90D9',
			'web-reader': '#E67E22',
			'zread': '#2ECC71',
		};
		return colors[toolCode] || '#888';
	}

	// ====== 格式化工具 ======
	function formatDateTime(d) {
		const pad = function(n) { return String(n).padStart(2, '0'); };
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
	}

	function fmtTokens(n) {
		if (n == null) return '-';
		if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M';
		if (n >= 1e3) return (n / 1e3).toFixed(2) + ' K';
		return String(n);
	}

	// ====== Tab 切换处理 ======
	function switchGlmMainTab(svcId, tab) {
		const state = getGlmState(svcId);
		state.mainTab = tab;
		const contentEl = document.getElementById('glm-detail-content-' + svcId);
		if (contentEl && state.data) {
			contentEl.innerHTML = renderGlmDetailContent(state.data, state);
		}
		document.querySelectorAll('.glm-main-tab[data-svc-id="' + svcId + '"]').forEach(function(el) {
			el.classList.toggle('active', el.dataset.tab === tab);
		});
	}

	function switchGlmSubTab(svcId, range) {
		const state = getGlmState(svcId);
		state.subTab = range;
		const hasData = state.data && (
			(state.mainTab === 'model' && getModelUsageForRange(state.data, range)) ||
			(state.mainTab === 'tool' && getToolUsageForRange(state.data, range))
		);
		if (hasData) {
			const contentEl = document.getElementById('glm-detail-content-' + svcId);
			if (contentEl && state.data) {
				contentEl.innerHTML = renderGlmDetailContent(state.data, state);
			}
		} else {
			const contentEl = document.getElementById('glm-detail-content-' + svcId);
			if (contentEl) {
				contentEl.innerHTML = renderGlmLoading();
			}
			if (typeof vscode !== 'undefined') {
				vscode.postMessage({ command: 'requestDetailRange', data: { serviceId: svcId, range: range } });
			}
		}
		document.querySelectorAll('.glm-sub-tab[data-svc-id="' + svcId + '"]').forEach(function(el) {
			el.classList.toggle('active', el.dataset.range === range);
		});
	}

	// ====== 事件委托（GLM Tab 切换） ======
	document.addEventListener('click', function(e) {
		if (!e.target) return;
		// 主Tab切换
		if (e.target.classList && e.target.classList.contains('glm-main-tab')) {
			const svcId = e.target.dataset.svcId;
			const tab = e.target.dataset.tab;
			if (svcId && tab) {
				switchGlmMainTab(svcId, tab);
			}
		}
		// 子Tab切换
		if (e.target.classList && e.target.classList.contains('glm-sub-tab')) {
			const svcId = e.target.dataset.svcId;
			const range = e.target.dataset.range;
			if (svcId && range) {
				switchGlmSubTab(svcId, range);
			}
		}
	});
	`;
}
