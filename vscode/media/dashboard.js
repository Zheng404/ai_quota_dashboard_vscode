// 本文件由 esbuild 从 src/webview/ 打包生成（npm run build），请勿手改
"use strict";
(() => {
  // src/webview/shared.ts
  var vscodeApi = acquireVsCodeApi();
  function fmtNum(n) {
    if (n == null) return "-";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }
  function fmtDateTime(d) {
    const pad = function(n) {
      return String(n).padStart(2, "0");
    };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderNoConfig() {
    return '<div class="empty-state"><div class="empty-icon">\u{1F4CA}</div><p class="empty-title">\u6682\u65E0\u670D\u52A1\u6570\u636E</p><p class="empty-hint">\u5207\u6362\u5230\u300C\u670D\u52A1\u300D\u6807\u7B7E\u9875\u6DFB\u52A0\u670D\u52A1</p></div>';
  }
  function renderErrorCard(data) {
    return '<div class="service-card error"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span><span class="badge badge-error">\u9519\u8BEF</span></div><p class="error-message">' + escapeHtml(data.err) + "</p></div>";
  }
  function renderLoadingCard(data) {
    return '<div class="service-card loading-card"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span></div><div class="loading-body"><span class="loading-spinner"></span><span class="loading-text">\u52A0\u8F7D\u4E2D...</span></div></div>';
  }
  var bundleTemplates = {};
  function registerServiceTemplate(kind, renderCard2) {
    bundleTemplates[kind] = { renderCard: (data) => renderCard2(data) };
  }
  function renderService(data) {
    if (data._loading) return renderLoadingCard(data);
    if (data.err) return renderErrorCard(data);
    const tmpl = bundleTemplates[data.kind];
    if (tmpl) {
      return tmpl.renderCard(data);
    }
    return '<div class="service-card error"><div class="service-header"><span class="service-name">' + escapeHtml(data.name) + '</span><span class="badge badge-error">\u672A\u6CE8\u518C</span></div><p class="error-message">\u670D\u52A1\u7C7B\u578B <code>' + escapeHtml(data.kind) + "</code> \u6682\u65E0\u4E13\u7528\u4EEA\u8868\u76D8\uFF0C\u8BF7\u5728\u670D\u52A1\u76EE\u5F55\u4E2D\u6CE8\u518C\u6A21\u677F\u3002</p></div>";
  }

  // src/webview/cards/glm.ts
  var glmStates = {};
  function getGlmState(svcId) {
    if (!glmStates[svcId]) {
      glmStates[svcId] = { mainTab: "model", subTab: "day", data: null };
    }
    return glmStates[svcId];
  }
  function renderCard(data) {
    const state = getGlmState(data.id);
    state.data = data;
    return '<div class="glm-card" id="glm-card-' + data.id + '">' + renderGlmHeader(data) + renderGlmQuota(data) + renderGlmDetailSection(data, state) + "</div>";
  }
  function renderGlmHeader(data) {
    const level = data.level ?? "";
    const levelBadge = level ? '<span class="glm-level-badge">' + escapeHtml(level.toUpperCase()) + "</span>" : "";
    const renewLine = data.nextRenewTime ? '<div class="glm-header-row glm-header-row3"><span class="glm-renew-label">\u4F1A\u5458\u6709\u6548\u671F\u81F3\uFF1A</span><span class="glm-renew-time">' + escapeHtml(data.nextRenewTime) + "</span></div>" : "";
    return '<div class="glm-header"><div class="glm-header-row"><div class="glm-header-left"><span class="glm-user-name">' + escapeHtml(data.name) + "</span>" + levelBadge + '</div><button class="btn btn-icon btn-refresh-svc glm-refresh-btn" data-service-id="' + data.id + '" title="\u5237\u65B0"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button></div><div class="glm-header-row glm-header-row2"><span class="glm-service-name">GLM Coding Plan (CN)</span><span class="glm-update-time">' + fmtDateTime(new Date(data.updatedAt)) + "</span></div>" + renewLine + "</div>";
  }
  function renderGlmQuota(data) {
    const slotsHtml = data.slots.map(function(s) {
      return renderGlmQuotaCard(s);
    }).join("");
    return '<div class="glm-quota-section"><div class="glm-quota-cards">' + slotsHtml + "</div></div>";
  }
  function renderGlmQuotaCard(slot) {
    const pct = Math.min(slot.percent, 100);
    const color = pct >= 90 ? "danger" : pct >= 75 ? "warning" : "success";
    let detailLine = "";
    if (slot.label === "MCP \u6BCF\u6708\u989D\u5EA6" && slot.used != null && slot.limit != null) {
      detailLine = '<div class="glm-quota-detail-line">\u5DF2\u8C03\u7528\u6B21\u6570\uFF1A' + fmtNum(slot.used) + "&nbsp;&nbsp;&nbsp;&nbsp;\u603B\u91CF\uFF1A" + fmtNum(slot.limit) + "</div>";
    }
    let resetLine = "";
    if (slot.resetsAt) {
      resetLine = '<div class="glm-quota-reset">\u91CD\u7F6E\u65F6\u95F4\uFF1A' + formatDateTime(new Date(slot.resetsAt)) + "</div>";
    }
    return '<div class="glm-quota-card"><div class="glm-quota-header"><span class="glm-quota-label">' + escapeHtml(slot.label) + '</span><span class="glm-quota-percent">' + pct.toFixed(0) + '%<span class="glm-quota-used">\u5DF2\u4F7F\u7528</span></span></div><div class="progress-bar glm-progress"><div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div></div>' + detailLine + resetLine + "</div>";
  }
  function getModelColor(modelName) {
    if (modelName === "Token \u6D88\u8017\u603B\u91CF") return "#666";
    const colors = {
      "GLM-5.1": "#4A90D9",
      "GLM-5": "#4A90D9",
      "GLM-5-Turbo": "#9B59B6",
      "GLM-4.7": "#E67E22",
      "GLM-4": "#E67E22",
      "GLM-4.6V": "#2ECC71",
      "GLM-4.5-Air": "#1ABC9C",
      "GLM-4V": "#F39C12"
    };
    return colors[modelName] || "#888";
  }
  function getToolColor(toolCode) {
    const colors = {
      "search-prime": "#4A90D9",
      "web-reader": "#E67E22",
      "zread": "#2ECC71"
    };
    return colors[toolCode] || "#888";
  }
  function formatDateTime(d) {
    const pad = function(n) {
      return String(n).padStart(2, "0");
    };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function fmtTokens(n) {
    return fmtNum(n);
  }
  function renderGlmModelDetail(usage, range) {
    let totalSeries = [];
    if (usage.modelSeries && usage.modelSeries.length > 0) {
      const dataLen = usage.modelSeries[0].tokensUsage ? usage.modelSeries[0].tokensUsage.length : 0;
      const totalTokensUsage = [];
      for (let i = 0; i < dataLen; i++) {
        let sum = 0;
        for (let j = 0; j < usage.modelSeries.length; j++) {
          sum += usage.modelSeries[j].tokensUsage[i] ?? 0;
        }
        totalTokensUsage.push(sum);
      }
      totalSeries = [{
        modelName: "Token \u6D88\u8017\u603B\u91CF",
        tokensUsage: totalTokensUsage,
        totalTokens: usage.totalTokens
      }];
    }
    const chart = renderGlmChart(usage.modelSeries.concat(totalSeries), usage.xTime, "tokens", range);
    const summaryItems = usage.modelSummary.map(function(m) {
      return '<div class="glm-summary-item"><span class="glm-summary-dot" style="background:' + getModelColor(m.modelName) + '"></span><span class="glm-summary-name">' + escapeHtml(m.modelName) + '</span><span class="glm-summary-value">' + fmtTokens(m.totalTokens) + "</span></div>";
    }).join("");
    const totalItem = '<div class="glm-summary-item"><span class="glm-summary-dot" style="background:' + getModelColor("Token \u6D88\u8017\u603B\u91CF") + '"></span><span class="glm-summary-name">Token \u6D88\u8017\u603B\u91CF</span><span class="glm-summary-value">' + fmtTokens(usage.totalTokens) + "</span></div>";
    return chart + '<div class="glm-summary-row">' + totalItem + summaryItems + "</div>";
  }
  function renderGlmToolDetail(usage, range) {
    const chart = renderGlmChart(usage.toolSeries, usage.xTime, "calls", range);
    const summaryItems = usage.toolSummary.map(function(t) {
      return '<div class="glm-summary-item"><span class="glm-summary-dot" style="background:' + getToolColor(t.toolCode) + '"></span><span class="glm-summary-name">' + escapeHtml(t.toolName.replace(/\s*MCP$/, "")) + '</span><span class="glm-summary-value">' + t.totalUsageCount + " \u6B21</span></div>";
    }).join("");
    return chart + '<div class="glm-summary-row">' + summaryItems + "</div>";
  }
  function renderGlmChart(series, xTime, _valueKey, _range) {
    if (!series || series.length === 0 || !xTime || xTime.length === 0) {
      return "";
    }
    const dataLen = xTime.length;
    let globalMax = 0;
    series.forEach(function(s) {
      const arr = "tokensUsage" in s ? s.tokensUsage : s.usageCount;
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
    function getPoint(i, v) {
      return {
        x: padding.left + i / (dataLen - 1 || 1) * chartW,
        y: padding.top + chartH - (v ?? 0) / globalMax * chartH
      };
    }
    const lines = series.map(function(s) {
      const arr = "tokensUsage" in s ? s.tokensUsage : s.usageCount;
      if (!arr || arr.length === 0) return "";
      const color = "tokensUsage" in s ? getModelColor(s.modelName) : getToolColor(s.toolCode);
      const pts = arr.map(function(v, i) {
        return getPoint(i, v);
      });
      if (pts.length === 0) return "";
      if (pts.length === 1) {
        return '<circle cx="' + pts[0].x + '" cy="' + pts[0].y + '" r="2" fill="' + color + '"/>';
      }
      let path = "M " + pts[0].x + " " + pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        path += " L " + pts[i].x + " " + pts[i].y;
      }
      return '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="' + path + '" opacity="0.85"/>';
    }).join("");
    const labels = "";
    let gridLines = "";
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + i / 4 * chartH;
      gridLines += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="var(--vscode-panel-border)" stroke-width="0.5" opacity="0.3"/>';
    }
    const svg = '<svg class="glm-chart" viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none">' + gridLines + lines + labels + "</svg>";
    return '<div class="glm-chart-wrap">' + svg + "</div>";
  }
  function getModelUsageForRange(data, range) {
    if (data.modelUsageByRange?.[range]) {
      return data.modelUsageByRange[range];
    }
    if (range === "day" && data.modelUsage) {
      return data.modelUsage;
    }
    return void 0;
  }
  function getToolUsageForRange(data, range) {
    if (data.toolUsageByRange?.[range]) {
      return data.toolUsageByRange[range];
    }
    if (range === "day" && data.toolUsage) {
      return data.toolUsage;
    }
    return void 0;
  }
  function renderGlmDetailSection(data, state) {
    const mainTabs = '<div class="glm-main-tabs"><button class="glm-main-tab' + (state.mainTab === "model" ? " active" : "") + '" data-svc-id="' + data.id + '" data-tab="model">\u6A21\u578B\u7528\u91CF</button><button class="glm-main-tab' + (state.mainTab === "tool" ? " active" : "") + '" data-svc-id="' + data.id + '" data-tab="tool">\u5DE5\u5177\u7528\u91CF</button></div>';
    const subTabs = '<div class="glm-sub-tabs"><button class="glm-sub-tab' + (state.subTab === "day" ? " active" : "") + '" data-svc-id="' + data.id + '" data-range="day">\u5F53\u65E5</button><button class="glm-sub-tab' + (state.subTab === "week" ? " active" : "") + '" data-svc-id="' + data.id + '" data-range="week">\u8FD17\u5929</button><button class="glm-sub-tab' + (state.subTab === "month" ? " active" : "") + '" data-svc-id="' + data.id + '" data-range="month">\u8FD130\u5929</button></div>';
    const content = renderGlmDetailContent(data, state);
    return '<div class="glm-detail-section">' + mainTabs + subTabs + '<div class="glm-detail-content" id="glm-detail-content-' + data.id + '">' + content + "</div></div>";
  }
  function renderGlmDetailContent(data, state) {
    const range = state.subTab;
    if (state.mainTab === "model") {
      const usage = getModelUsageForRange(data, range);
      if (usage) {
        return renderGlmModelDetail(usage, range);
      }
      return renderGlmLoading();
    }
    if (state.mainTab === "tool") {
      const usage = getToolUsageForRange(data, range);
      if (usage) {
        return renderGlmToolDetail(usage, range);
      }
      return renderGlmLoading();
    }
    return renderGlmLoading();
  }
  function renderGlmLoading() {
    return '<div class="glm-loading">\u6570\u636E\u52A0\u8F7D\u4E2D...</div>';
  }
  function switchGlmMainTab(svcId, tab) {
    const state = getGlmState(svcId);
    state.mainTab = tab;
    const contentEl = document.getElementById("glm-detail-content-" + svcId);
    if (contentEl && state.data) {
      contentEl.innerHTML = renderGlmDetailContent(state.data, state);
    }
    document.querySelectorAll('.glm-main-tab[data-svc-id="' + svcId + '"]').forEach(function(el) {
      el.classList.toggle("active", el.dataset.tab === tab);
    });
  }
  function switchGlmSubTab(svcId, range) {
    const state = getGlmState(svcId);
    state.subTab = range;
    const hasData = state.data && (state.mainTab === "model" && getModelUsageForRange(state.data, range) || state.mainTab === "tool" && getToolUsageForRange(state.data, range));
    if (hasData) {
      const contentEl = document.getElementById("glm-detail-content-" + svcId);
      if (contentEl && state.data) {
        contentEl.innerHTML = renderGlmDetailContent(state.data, state);
      }
    } else {
      const contentEl = document.getElementById("glm-detail-content-" + svcId);
      if (contentEl) {
        contentEl.innerHTML = renderGlmLoading();
      }
      vscodeApi.postMessage({ command: "requestDetailRange", data: { serviceId: svcId, range } });
    }
    document.querySelectorAll('.glm-sub-tab[data-svc-id="' + svcId + '"]').forEach(function(el) {
      el.classList.toggle("active", el.dataset.range === range);
    });
  }
  function registerGlmCard() {
    registerServiceTemplate("glm", renderCard);
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) return;
      if (target.classList?.contains("glm-main-tab")) {
        const svcId = target.dataset.svcId;
        const tab = target.dataset.tab;
        if (svcId && tab) {
          switchGlmMainTab(svcId, tab);
        }
      }
      if (target.classList?.contains("glm-sub-tab")) {
        const svcId = target.dataset.svcId;
        const range = target.dataset.range;
        if (svcId && range) {
          switchGlmSubTab(svcId, range);
        }
      }
    });
  }

  // src/webview/cards/kimi.ts
  function renderKimiHeader(data) {
    return '<div class="kimi-header"><div class="kimi-header-row"><div class="kimi-header-left"><span class="kimi-user-name">' + escapeHtml(data.name) + '</span></div><button class="btn btn-icon btn-refresh-svc kimi-refresh-btn" data-service-id="' + data.id + '" title="\u5237\u65B0"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button></div><div class="kimi-header-row kimi-header-row2"><span class="kimi-service-name">Kimi Membership</span><span class="kimi-update-time">' + fmtDateTime(new Date(data.updatedAt)) + "</span></div></div>";
  }
  function renderKimiQuota(data) {
    const slots = data.slots || [];
    const slotsHtml = slots.map(function(s) {
      return renderKimiQuotaCard(s);
    }).join("");
    return '<div class="kimi-quota-section"><div class="kimi-quota-cards">' + slotsHtml + "</div></div>";
  }
  function renderKimiQuotaCard(slot) {
    const pct = Math.min(slot.percent, 100);
    const color = pct >= 90 ? "danger" : pct >= 75 ? "warning" : "success";
    let resetLine = "";
    if (slot.resetsAt) {
      resetLine = '<div class="kimi-quota-reset">\u91CD\u7F6E\u65F6\u95F4\uFF1A' + fmtDateTime(new Date(slot.resetsAt)) + "</div>";
    }
    return '<div class="kimi-quota-card"><div class="kimi-quota-header"><span class="kimi-quota-label">' + escapeHtml(slot.label) + '</span><span class="kimi-quota-percent">' + pct.toFixed(0) + '%<span class="kimi-quota-used">\u5DF2\u4F7F\u7528</span></span></div><div class="progress-bar kimi-progress"><div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div></div>' + resetLine + "</div>";
  }
  function registerKimiCard() {
    registerServiceTemplate("kimi", function renderCard2(data) {
      return '<div class="kimi-card" id="kimi-card-' + data.id + '">' + renderKimiHeader(data) + renderKimiQuota(data) + "</div>";
    });
  }

  // src/webview/cards/mimo.ts
  function renderMimoHeader(data) {
    const planName = data.planName ?? "";
    const planBadge = planName ? '<span class="mimo-plan-badge">' + escapeHtml(planName) + "</span>" : "";
    const expiryLine = data.currentPeriodEnd ? '<div class="mimo-header-row mimo-header-row3"><span class="mimo-expiry-label">\u6709\u6548\u671F\u81F3\uFF1A</span><span class="mimo-expiry-time">' + escapeHtml(data.currentPeriodEnd) + "</span></div>" : "";
    return '<div class="mimo-header"><div class="mimo-header-row"><div class="mimo-header-left"><span class="mimo-user-name">' + escapeHtml(data.name) + "</span>" + planBadge + '</div><button class="btn btn-icon btn-refresh-svc mimo-refresh-btn" data-service-id="' + data.id + '" title="\u5237\u65B0"><svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M883.875 684.806c41.592-90.131 47.607-188.11 23.715-277.077-27.468-102.682-95.063-194.238-193.08-249.865l43.48-93.961-247.21 64.819 110.564 230.424 45.491-98.308c66.606 40.672 112.204 104.396 131.498 176.146 17.257 64.639 13.024 134.926-17.145 200.514-38.445 83.352-110.309 140.105-192.603 162.245a296.78 296.78 0 0 1-36.221 7.297l51.033 105.49c4.853-1.129 9.665-2.263 14.447-3.572 113.302-30.203 213.143-109.249 266.031-224.152z m-524.696 82.476c-67.595-40.598-113.886-104.87-133.367-177.273-17.252-64.64-12.985-134.967 17.145-200.48 38.447-83.386 110.31-140.141 192.605-162.28 13.646-3.651 27.541-6.275 41.587-7.957l-50.886-106.037c-6.676 1.426-13.353 2.956-19.957 4.744-113.266 30.272-213.141 109.317-266.07 224.221-41.511 90.097-47.533 188.11-23.639 277.038l0.073 0.293c27.686 103.375 96.083 195.406 195.196 250.886l-41.111 89.661 246.955-65.694-111.329-230.022-47.202 102.9z m0 0" fill="currentColor"/></svg></button></div><div class="mimo-header-row mimo-header-row2"><span class="mimo-service-name">Xiaomi MiMo Token Plan</span><span class="mimo-update-time">' + fmtDateTime(new Date(data.updatedAt)) + "</span></div>" + expiryLine + "</div>";
  }
  function renderMimoQuota(data) {
    const slots = data.slots || [];
    const slotsHtml = slots.map(function(s) {
      return renderMimoQuotaCard(s);
    }).join("");
    return '<div class="mimo-quota-section"><div class="mimo-quota-cards">' + slotsHtml + "</div></div>";
  }
  function renderMimoQuotaCard(slot) {
    const pct = Math.min(slot.percent, 100);
    const color = pct >= 90 ? "danger" : pct >= 75 ? "warning" : "success";
    const usedText = slot.used != null ? fmtNum(slot.used) : "-";
    const limitText = slot.limit != null ? fmtNum(slot.limit) : "-";
    return '<div class="mimo-quota-card"><div class="mimo-quota-header"><span class="mimo-quota-label">' + escapeHtml(slot.label) + '</span><span class="mimo-quota-percent">' + pct.toFixed(1) + '%<span class="mimo-quota-used">\u5DF2\u4F7F\u7528</span></span></div><div class="progress-bar mimo-progress"><div class="progress-fill ' + color + '" style="width:' + pct.toFixed(1) + '%"></div></div><div class="mimo-quota-detail">\u5DF2\u4F7F\u7528\uFF1A' + usedText + "&nbsp;&nbsp;\u603B\u989D\u5EA6\uFF1A" + limitText + "</div></div>";
  }
  function registerMimoCard() {
    registerServiceTemplate("mimo", function renderCard2(data) {
      return '<div class="mimo-card" id="mimo-card-' + data.id + '">' + renderMimoHeader(data) + renderMimoQuota(data) + "</div>";
    });
  }

  // src/webview/settings.ts
  var serviceSettingsMap = window.__AQD_SETTINGS_META__ ?? [];
  function getServiceSettings(kind) {
    return serviceSettingsMap.find((s) => s.kind === kind) ?? serviceSettingsMap[0];
  }
  function renderServiceItem(p, keys, bridgeState) {
    const meta = getServiceSettings(p.kind);
    const placeholder = meta ? meta.keyPlaceholder : "API Key";
    const key = keys[p.id] || "";
    const isBridgeService = p.kind === "bridge";
    let hintHtml = "";
    if (meta?.keyHint && !isBridgeService) {
      hintHtml = '<div class="form-row-hint"><span class="form-hint">' + escapeHtml(meta.keyHint) + "</span>";
      if (meta.showHelpButton) {
        hintHtml += '<button type="button" class="btn btn-link svc-help-btn" data-help-cmd="' + meta.helpCommand + '">\u5982\u4F55\u83B7\u53D6\u5BC6\u94A5\uFF1F</button>';
      }
      hintHtml += "</div>";
    }
    const kindLabel = meta ? meta.displayName : p.kind;
    let authHtml = "";
    if (isBridgeService) {
      const st = bridgeState ?? {};
      const connected = st.connected === true;
      const kindLabels = { kimi: "Kimi", mimo: "MiMo", glm: "GLM" };
      const kinds = st.receivedKinds ?? [];
      const lastSync = st.lastPushAt ? fmtDateTime(new Date(st.lastPushAt)) : "\u6682\u65E0";
      let kindsHtml;
      if (kinds.length === 0) {
        kindsHtml = '<span class="bridge-cred-empty">\u6D4F\u89C8\u5668\u6269\u5C55\u5C1A\u672A\u63A8\u9001\u4EFB\u4F55\u6570\u636E</span>';
      } else {
        kindsHtml = '<div class="bridge-cred-list">' + kinds.map(function(k) {
          return '<span class="bridge-cred-tag">' + escapeHtml(kindLabels[k] || k) + "</span>";
        }).join("") + "</div>";
      }
      const errHtml = st.lastError ? '<div class="bridge-error-row"><span class="bridge-error-label">\u8BCA\u65AD\uFF1A</span><span class="bridge-error-value">' + escapeHtml(st.lastError) + "</span></div>" : "";
      authHtml = '<div class="svc-row-datasource"><label class="form-label">\u8BA4\u8BC1\u65B9\u5F0F</label><div class="form-hint">Data Bridge \u81EA\u52A8\u83B7\u53D6</div></div><div class="svc-bridge-status"><span class="bridge-badge ' + (connected ? "connected" : "disconnected") + '">' + (connected ? "\u5DF2\u8FDE\u63A5\u6D4F\u89C8\u5668\u6269\u5C55" : "\u672A\u8FDE\u63A5\u6D4F\u89C8\u5668\u6269\u5C55") + '</span><div class="bridge-info-row" style="margin-top: 8px;"><span class="bridge-info-label">\u6700\u540E\u540C\u6B65\uFF1A</span><span class="bridge-info-value">' + escapeHtml(lastSync) + '</span></div><div class="bridge-info-row"><span class="bridge-info-label">\u5DF2\u63A5\u6536\u6570\u636E\u79CD\u7C7B\uFF1A</span></div>' + kindsHtml + errHtml + "</div>";
    } else {
      authHtml = '<div class="svc-row-datasource"><label class="form-label">\u8BA4\u8BC1\u65B9\u5F0F</label><div class="form-hint">\u624B\u52A8\u8F93\u5165</div></div><input type="text" class="form-input svc-key" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(key) + '" autocomplete="off">' + hintHtml;
    }
    const actionsHtml = '<div class="svc-row-actions"><button type="button" class="btn btn-sm btn-delete remove-service-btn">\u79FB\u9664\u670D\u52A1</button><button type="button" class="btn btn-sm btn-primary save-service-btn">\u4FDD\u5B58\u914D\u7F6E</button></div>';
    const nameInput = '<input type="text" class="form-input svc-name" value="' + escapeHtml(p.displayName) + '" placeholder="\u663E\u793A\u540D\u79F0">';
    return '<div class="service-item" data-id="' + escapeHtml(p.id) + '" data-datasource="' + escapeHtml(p.dataSource || "manual") + '"><div class="svc-row-kind"><span class="svc-kind-label" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + '</span></div><div class="svc-row-name">' + nameInput + "</div>" + authHtml + actionsHtml + "</div>";
  }
  function renderServiceListSettings(settings, bridgeState) {
    const profiles = settings.profiles.filter((p) => !(p.dataSource === "bridge" && p.kind !== "bridge"));
    const keys = settings.keys;
    const items = profiles.map((p) => renderServiceItem(p, keys, bridgeState)).join("");
    const options = serviceSettingsMap.map(
      (s) => '<option value="' + escapeHtml(s.kind) + '">' + escapeHtml(s.displayName) + "</option>"
    ).join("");
    return '<div class="settings-section"><div class="section-header"><div class="add-service-row"><select class="form-input add-service-select" id="new-service-kind">' + options + '</select><button type="button" class="btn btn-sm btn-primary" id="add-service-btn">+ \u6DFB\u52A0\u670D\u52A1</button></div></div><div id="services-list">' + items + "</div></div>";
  }
  function renderGlobalSettings(settings) {
    return '<div class="settings-section"><div class="form-group"><label class="form-label" for="refreshInterval">\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF0C0 \u8868\u793A\u7981\u7528\uFF09</label><input type="number" id="refreshInterval" class="form-input" value="' + escapeHtml(String(settings.refreshInterval)) + '" min="0" step="60"></div><div class="form-group"><label class="form-label" for="warnThreshold">\u9884\u8B66\u9608\u503C\uFF080 - 1\uFF09</label><input type="number" id="warnThreshold" class="form-input" value="' + escapeHtml(String(settings.warnThreshold)) + '" min="0" max="1" step="0.05"></div><div class="form-group"><label class="form-label" for="afkThreshold">\u79BB\u5F00\u68C0\u6D4B\uFF08\u79D2\uFF0C0 \u8868\u793A\u7981\u7528\uFF09</label><input type="number" id="afkThreshold" class="form-input" value="' + escapeHtml(String(settings.afkThreshold)) + '" min="0" step="60"><span class="form-hint">\u7528\u6237\u65E0\u64CD\u4F5C\u8D85\u8FC7\u6B64\u65F6\u957F\u540E\u6682\u505C\u81EA\u52A8\u5237\u65B0\uFF0C\u9ED8\u8BA4 1 \u5C0F\u65F6</span></div><div class="form-actions"><button type="button" class="btn btn-primary" id="save-global-btn">\u4FDD\u5B58\u5168\u5C40\u914D\u7F6E</button></div><div class="form-actions" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);"><button type="button" class="btn btn-danger" id="reset-data-btn">\u91CD\u7F6E\u6240\u6709\u6570\u636E</button></div></div>';
  }
  function bindServiceEvents() {
    document.querySelectorAll(".save-service-btn").forEach((el) => {
      el.addEventListener("click", () => {
        const item = el.closest(".service-item");
        if (!item) return;
        const kind = item.querySelector(".svc-kind-label")?.dataset.kind ?? serviceSettingsMap[0]?.kind ?? "";
        const dataSource = kind === "bridge" ? "bridge" : item.dataset.datasource ?? "manual";
        vscodeApi.postMessage({
          command: "saveService",
          data: {
            id: item.dataset.id ?? "",
            name: item.querySelector(".svc-name").value,
            kind,
            key: item.querySelector(".svc-key")?.value ?? "",
            dataSource
          }
        });
      });
    });
  }
  function bindAddService() {
    const addBtn = document.getElementById("add-service-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        const kindEl = document.getElementById("new-service-kind");
        vscodeApi.postMessage({ command: "addService", data: { kind: kindEl ? kindEl.value : "glm" } });
      };
    }
  }
  function bindGlobalEvents() {
    const saveBtn = document.getElementById("save-global-btn");
    if (saveBtn) {
      saveBtn.onclick = () => {
        const riEl = document.getElementById("refreshInterval");
        const wtEl = document.getElementById("warnThreshold");
        const atEl = document.getElementById("afkThreshold");
        let v = parseFloat(wtEl.value);
        if (isNaN(v)) v = 0.9;
        if (v < 0) v = 0;
        if (v > 1) v = 1;
        vscodeApi.postMessage({
          command: "saveGlobal",
          data: {
            refreshInterval: Number.isFinite(parseInt(riEl.value, 10)) ? parseInt(riEl.value, 10) : 60,
            warnThreshold: v,
            afkThreshold: Number.isFinite(parseInt(atEl.value, 10)) ? parseInt(atEl.value, 10) : 0
          }
        });
      };
    }
    const resetBtn = document.getElementById("reset-data-btn");
    if (resetBtn) {
      resetBtn.onclick = () => {
        vscodeApi.postMessage({ command: "resetData" });
      };
    }
  }

  // src/webview/main.ts
  registerGlmCard();
  registerKimiCard();
  registerMimoCard();
  function bindRefreshButtons() {
    document.querySelectorAll(".btn-refresh-svc").forEach((el) => {
      el.addEventListener("click", () => {
        el.classList.add("spinning");
        vscodeApi.postMessage({ command: "refreshService", data: { id: el.dataset.serviceId } });
      });
    });
  }
  var lastUpdateMessage;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab ?? "dashboard";
      document.getElementById("panel-" + tab)?.classList.add("active");
      servicesPanelHash = "";
      globalPanelHash = "";
      if (lastUpdateMessage) {
        handleUpdateData(lastUpdateMessage);
      }
    });
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (target?.classList?.contains("svc-help-btn")) {
      vscodeApi.postMessage({ command: target.dataset.helpCmd ?? "" });
    }
    if (target?.classList?.contains("remove-service-btn")) {
      const item = target.closest(".service-item");
      if (item) {
        vscodeApi.postMessage({ command: "removeService", data: { id: item.dataset.id } });
      }
    }
  });
  var servicesPanelHash = "";
  var globalPanelHash = "";
  function isEditingInPanel(panel) {
    if (!panel) {
      return false;
    }
    const ae = document.activeElement;
    if (!(ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement || ae instanceof HTMLSelectElement)) {
      return false;
    }
    return panel.contains(ae);
  }
  function handleUpdateData(message) {
    const services = message.services;
    const settings = message.settings;
    lastUpdateMessage = message;
    const dashboardPanel = document.getElementById("panel-dashboard");
    if (dashboardPanel) {
      const refreshingSet = new Set(message.refreshingIds ?? []);
      const profiles = (settings.profiles ?? []).filter((p) => p.kind !== "bridge");
      const servicesMap = /* @__PURE__ */ new Map();
      (services || []).forEach((s) => servicesMap.set(s.id, s));
      const visibleServices = profiles.map((p) => {
        const data = servicesMap.get(p.id);
        if (data) return data;
        return {
          id: p.id,
          name: p.displayName,
          kind: p.kind,
          slots: [],
          updatedAt: Date.now(),
          _loading: true
        };
      });
      const hasConfig = visibleServices.length > 0;
      dashboardPanel.innerHTML = hasConfig ? visibleServices.map((s) => renderService(s)).join("") : renderNoConfig();
      bindRefreshButtons();
      refreshingSet.forEach((id) => {
        const btn = document.querySelector('.btn-refresh-svc[data-service-id="' + id + '"]');
        if (btn) btn.classList.add("spinning");
      });
    }
    const servicesPanel = document.getElementById("panel-services");
    if (servicesPanel) {
      let bridgeState = null;
      const bridgeProfile = (settings.profiles ?? []).find((p) => p.kind === "bridge");
      if (bridgeProfile) {
        const servicesMap = /* @__PURE__ */ new Map();
        (services || []).forEach((s) => servicesMap.set(s.id, s));
        const bd = servicesMap.get(bridgeProfile.id);
        bridgeState = bd ? {
          connected: bd.connected,
          lastPushAt: bd.lastPushAt,
          receivedKinds: bd.receivedKinds ?? [],
          lastError: bd.lastError
        } : { connected: false, receivedKinds: [] };
      }
      const servicesHash = JSON.stringify({
        profiles: settings.profiles,
        keys: settings.keys,
        bridge: bridgeState
      });
      if (servicesHash !== servicesPanelHash && !isEditingInPanel(servicesPanel)) {
        servicesPanel.innerHTML = renderServiceListSettings(settings, bridgeState);
        servicesPanelHash = servicesHash;
        bindServiceEvents();
        bindAddService();
      }
    }
    const globalPanel = document.getElementById("panel-global");
    if (globalPanel) {
      const globalHash = JSON.stringify(settings);
      if (globalHash !== globalPanelHash && !isEditingInPanel(globalPanel)) {
        globalPanel.innerHTML = renderGlobalSettings(settings);
        globalPanelHash = globalHash;
        bindGlobalEvents();
      }
    }
  }
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.command === "switchToSettings") {
      const targetTab = document.querySelector('.tab-btn[data-tab="' + (message.subtab ?? "services") + '"]');
      if (targetTab) targetTab.click();
      return;
    }
    if (message.command !== "updateData") return;
    handleUpdateData(message);
  });
  vscodeApi.postMessage({ command: "requestInitialData" });
})();
//# sourceMappingURL=dashboard.js.map
