// 本文件由 esbuild 从 src/webview/ 打包生成（npm run build），请勿手改
"use strict";
(() => {
  // src/webview/compute.ts
  var GLOBAL_SETTING_RULES = {
    refreshInterval: { label: "\u81EA\u52A8\u5237\u65B0\u95F4\u9694", min: 0, max: 86400, step: 60 },
    warnThreshold: { label: "\u9884\u8B66\u9608\u503C", min: 0, max: 1, step: 0.05 },
    afkThreshold: { label: "\u79BB\u5F00\u68C0\u6D4B", min: 0, max: 86400, step: 60 }
  };
  function validateGlobalSettings(input) {
    const values = {};
    for (const field of ["refreshInterval", "warnThreshold", "afkThreshold"]) {
      const rule = GLOBAL_SETTING_RULES[field];
      const raw = input[field].trim();
      if (!raw) return { ok: false, field, message: "\u8BF7\u8F93\u5165" + rule.label };
      const value = Number(raw);
      if (!Number.isFinite(value)) return { ok: false, field, message: rule.label + "\u5FC5\u987B\u662F\u6709\u6548\u6570\u5B57" };
      if (value < rule.min || value > rule.max) {
        return { ok: false, field, message: rule.label + "\u5FC5\u987B\u5728 " + rule.min + " \u5230 " + rule.max + " \u4E4B\u95F4" };
      }
      const steps = (value - rule.min) / rule.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) {
        return { ok: false, field, message: rule.label + "\u5FC5\u987B\u4EE5 " + rule.step + " \u4E3A\u6B65\u957F" };
      }
      values[field] = value;
    }
    return { ok: true, values };
  }
  function computeVisibleServices(profiles, services) {
    const servicesMap = /* @__PURE__ */ new Map();
    (services ?? []).forEach((service) => servicesMap.set(service.id, service));
    return (profiles ?? []).map((profile) => {
      const data = servicesMap.get(profile.id);
      if (data) return data;
      return {
        id: profile.id,
        name: profile.displayName,
        kind: profile.kind,
        slots: [],
        updatedAt: Date.now(),
        _loading: true
      };
    });
  }
  function shouldSkipPanelRerender(isEditing, hasOpenConfirmation) {
    return isEditing || hasOpenConfirmation;
  }
  function pruneStatesByProfiles(states, profiles) {
    const activeIds = new Set((profiles ?? []).map((profile) => profile.id));
    for (const id of Object.keys(states)) {
      if (!activeIds.has(id)) delete states[id];
    }
  }

  // src/webview/shared.ts
  var vscodeApi = acquireVsCodeApi();
  function fmtNum(n) {
    if (n == null || !Number.isFinite(n)) return "-";
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
  function isValidDate(date) {
    return !Number.isNaN(date.getTime());
  }
  function formatUpdatedAt(timestamp) {
    const date = new Date(timestamp);
    if (!isValidDate(date)) return void 0;
    const now = /* @__PURE__ */ new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    const full = fmtDateTime(date);
    return {
      compact: sameDay ? full.slice(11) : full.slice(5, 16),
      full,
      iso: date.toISOString()
    };
  }
  var ICON_PATHS = {
    "circle-alert": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    "circle-help": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "key-round": '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "refresh-cw": '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    "settings-2": '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>'
  };
  function renderIcon(name, className = "") {
    const classes = "icon" + (className ? " " + className : "");
    return '<svg class="' + classes + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICON_PATHS[name] + "</svg>";
  }
  function bindTabKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const currentTab = target.closest('[role="tab"]');
      const tabList = currentTab?.closest('[role="tablist"]');
      if (!currentTab || !tabList) return;
      const tabs = Array.from(tabList.querySelectorAll('[role="tab"]')).filter(
        (tab) => tab.closest('[role="tablist"]') === tabList && tab.getAttribute("aria-disabled") !== "true"
      );
      const currentIndex = tabs.indexOf(currentTab);
      if (currentIndex < 0 || tabs.length === 0) return;
      let nextIndex;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    });
  }
  function getServiceLabel(kind) {
    if (kind === "glm") return "GLM Coding Plan (CN)";
    if (kind === "kimi") return "Kimi Membership";
    return kind;
  }
  function renderServiceHeader(data, options) {
    const id = escapeHtml(data.id);
    const name = escapeHtml(data.name);
    const updated = formatUpdatedAt(data.updatedAt);
    const updatedHtml = updated && options.showUpdatedAt !== false ? '<span class="service-subtitle-separator" aria-hidden="true">\xB7</span><time class="update-time" datetime="' + updated.iso + '" title="\u5B8C\u6574\u66F4\u65B0\u65F6\u95F4\uFF1A' + updated.full + '">\u66F4\u65B0\u4E8E ' + updated.compact + "</time>" : "";
    const renewalHtml = options.renewal ? '<div class="service-renew"><span>\u4F1A\u5458\u6709\u6548\u671F\u81F3</span><span class="service-renew-value">' + escapeHtml(options.renewal) + "</span></div>" : "";
    const refreshHtml = options.showRefresh === false ? "" : '<button type="button" class="icon-button btn-refresh-svc" data-service-id="' + id + '" data-service-name="' + name + '" data-focus-key="refresh-' + id + '" aria-label="\u5237\u65B0 ' + name + '" aria-busy="false" title="\u5237\u65B0 ' + name + '">' + renderIcon("refresh-cw") + "</button>";
    return '<header class="service-header"><div class="service-heading"><div class="service-title-row"><h2 class="service-name" id="service-title-' + id + '">' + name + "</h2>" + (options.badgeHtml ?? "") + '</div><div class="service-subtitle"><span>' + escapeHtml(options.serviceLabel) + "</span>" + updatedHtml + '<span class="refresh-state" data-refresh-state hidden>\xB7 \u5237\u65B0\u4E2D</span></div>' + renewalHtml + "</div>" + refreshHtml + "</header>";
  }
  function renderNoConfig() {
    return '<div class="empty-state"><div class="empty-icon">' + renderIcon("gauge") + '</div><h2 class="empty-title">\u8FD8\u6CA1\u6709\u670D\u52A1</h2><p class="empty-hint">\u6DFB\u52A0 GLM \u6216 Kimi \u670D\u52A1\u540E\uFF0C\u5373\u53EF\u5728\u8FD9\u91CC\u67E5\u770B\u914D\u989D\u4E0E\u91CD\u7F6E\u65F6\u95F4\u3002</p><button type="button" class="btn btn-primary" data-switch-tab="services">' + renderIcon("plus") + "\u6DFB\u52A0\u670D\u52A1</button></div>";
  }
  function renderNoKeyCard(data) {
    const id = escapeHtml(data.id);
    return '<article class="service-card service-card-empty" data-service-card="' + id + '" aria-labelledby="service-title-' + id + '">' + renderServiceHeader(data, {
      serviceLabel: getServiceLabel(data.kind),
      badgeHtml: '<span class="service-badge badge-muted">\u5F85\u914D\u7F6E</span>',
      showUpdatedAt: false,
      showRefresh: false
    }) + '<div class="service-empty-body">' + renderIcon("key-round") + '<div><h3 class="service-empty-title">\u5C1A\u672A\u914D\u7F6E API Key</h3><p class="service-empty-copy">\u6DFB\u52A0\u5BC6\u94A5\u540E\u5373\u53EF\u67E5\u8BE2\u914D\u989D\uFF1B\u5BC6\u94A5\u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u3002</p><button type="button" class="btn btn-sm btn-primary" data-switch-tab="services" data-focus-service-id="' + id + '">' + renderIcon("settings-2") + "\u53BB\u914D\u7F6E</button></div></div></article>";
  }
  function renderStaleNotice(data) {
    if (!data.staleError) return "";
    const id = escapeHtml(data.id);
    const name = escapeHtml(data.name);
    return '<div class="stale-notice" role="status">' + renderIcon("circle-alert") + '<div class="stale-copy"><strong>\u6570\u636E\u8FC7\u671F \xB7 \u5237\u65B0\u5931\u8D25</strong><span>\u4EE5\u4E0B\u4ECD\u4E3A\u4E0A\u6B21\u6210\u529F\u83B7\u53D6\u7684\u6570\u636E\u3002</span><span class="stale-error-detail">' + escapeHtml(data.staleError) + '</span></div><button type="button" class="btn btn-sm btn-secondary btn-refresh-svc stale-retry" data-service-id="' + id + '" data-service-name="' + name + '" data-focus-key="stale-retry-' + id + '" aria-label="\u91CD\u8BD5\u5237\u65B0 ' + name + '">' + renderIcon("refresh-cw") + "\u91CD\u8BD5</button></div>";
  }
  function renderErrorCard(data) {
    return '<article class="service-card service-card-error" data-service-card="' + escapeHtml(data.id) + '" aria-labelledby="service-title-' + escapeHtml(data.id) + '">' + renderServiceHeader(data, { serviceLabel: getServiceLabel(data.kind), badgeHtml: '<span class="service-badge badge-error">\u6570\u636E\u4E0D\u53EF\u7528</span>' }) + '<div class="service-error">' + renderIcon("circle-alert") + '<div><p class="error-message">' + escapeHtml(data.err) + '</p><p class="error-recovery">\u68C0\u67E5\u7F51\u7EDC\u6216 API Key \u540E\uFF0C\u4F7F\u7528\u4E0A\u65B9\u5237\u65B0\u6309\u94AE\u91CD\u8BD5\u3002</p></div></div></article>';
  }
  function renderLoadingCard(data) {
    return '<article class="service-card loading-card" data-service-card="' + escapeHtml(data.id) + '" aria-labelledby="service-title-' + escapeHtml(data.id) + '" aria-busy="true">' + renderServiceHeader(data, { serviceLabel: getServiceLabel(data.kind), showUpdatedAt: false }) + '<div class="loading-body" role="status"><span class="loading-spinner">' + renderIcon("loader-circle") + "</span><span>\u6B63\u5728\u83B7\u53D6\u914D\u989D\u2026</span></div></article>";
  }
  function getQuotaLevel(percent) {
    return percent >= 90 ? "danger" : percent >= 75 ? "warning" : "success";
  }
  function normalizePercent(percent) {
    if (!Number.isFinite(percent)) return 0;
    return Math.min(100, Math.max(0, percent));
  }
  function formatPercent(percent) {
    return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  }
  function renderQuotaCard(slot, serviceId, index) {
    const percent = normalizePercent(slot.percent);
    const percentText = formatPercent(percent);
    const level = getQuotaLevel(percent);
    const id = "quota-" + escapeHtml(serviceId) + "-" + index;
    const includedInTotal = slot.label.includes("\u542B\u4E8E\u603B\u989D");
    const label = includedInTotal ? slot.label.replace(/\s*[（(]含于总额[）)]/g, "") : slot.label;
    const details = [];
    if (slot.used != null && slot.limit != null) {
      details.push("<span>\u5DF2\u7528 " + fmtNum(slot.used) + " / \u9650\u989D " + fmtNum(slot.limit) + "</span>");
    }
    if (slot.resetsAt) {
      const resetDate = new Date(slot.resetsAt);
      if (isValidDate(resetDate)) details.push("<span>\u91CD\u7F6E\u4E8E " + fmtDateTime(resetDate) + "</span>");
    }
    const note = includedInTotal ? '<div class="quota-note">\u542B\u4E8E\u672C\u6708\u603B\u989D\uFF0C\u4E0D\u91CD\u590D\u7D2F\u8BA1</div>' : "";
    return '<div class="quota-item"><div class="quota-header"><span class="quota-label" id="' + id + '-label">' + escapeHtml(label) + '</span><span class="quota-percent ' + level + '">' + percentText + '%<span class="quota-used">\u5DF2\u7528</span></span></div><div class="progress-track" role="progressbar" aria-labelledby="' + id + '-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percentText + '" aria-valuetext="\u5DF2\u4F7F\u7528 ' + percentText + '%"><div class="progress-fill ' + level + '" style="width:' + percentText + '%" aria-hidden="true"></div></div>' + (details.length ? '<div class="quota-meta">' + details.join("") + "</div>" : "") + note + "</div>";
  }
  function renderQuotaSection(data) {
    const slots = data.slots ?? [];
    const content = slots.length > 0 ? '<div class="quota-list">' + slots.map((slot, index) => renderQuotaCard(slot, data.id, index)).join("") + "</div>" : '<div class="inline-empty" role="status">\u6682\u672A\u6536\u5230\u914D\u989D\u6570\u636E</div>';
    return '<section class="quota-section" aria-label="' + escapeHtml(data.name) + '\u914D\u989D\u7528\u91CF">' + content + "</section>";
  }
  var bundleTemplates = {};
  function registerServiceTemplate(kind, renderCard2) {
    bundleTemplates[kind] = { renderCard: (data) => renderCard2(data) };
  }
  function renderService(data) {
    if (data._loading) return renderLoadingCard(data);
    if (data.noKey) return renderNoKeyCard(data);
    if (data.err) return renderErrorCard(data);
    const tmpl = bundleTemplates[data.kind];
    if (tmpl) return tmpl.renderCard(data);
    return '<article class="service-card service-card-error" data-service-card="' + escapeHtml(data.id) + '">' + renderServiceHeader(data, { serviceLabel: getServiceLabel(data.kind), badgeHtml: '<span class="service-badge badge-error">\u672A\u6CE8\u518C</span>' }) + '<div class="service-error">' + renderIcon("circle-alert") + '<p class="error-message">\u670D\u52A1\u7C7B\u578B <code>' + escapeHtml(data.kind) + "</code> \u6682\u65E0\u4E13\u7528\u4EEA\u8868\u76D8\uFF0C\u8BF7\u5728\u670D\u52A1\u76EE\u5F55\u4E2D\u6CE8\u518C\u6A21\u677F\u3002</p></div></article>";
  }

  // src/webview/cards/glm.ts
  var glmStates = {};
  var RANGE_LABELS = { day: "\u5F53\u65E5", week: "\u8FD17\u5929", month: "\u8FD130\u5929" };
  function getGlmState(svcId) {
    if (!glmStates[svcId]) {
      glmStates[svcId] = { mainTab: "model", subTab: "day", data: null };
    }
    return glmStates[svcId];
  }
  function renderCard(data) {
    const state = getGlmState(data.id);
    state.data = data;
    const id = escapeHtml(data.id);
    const level = data.level?.trim();
    const badgeHtml = level ? '<span class="service-badge glm-level-badge">' + escapeHtml(level.toUpperCase()) + "</span>" : "";
    return '<article class="service-card glm-card" id="glm-card-' + id + '" data-service-card="' + id + '" aria-labelledby="service-title-' + id + '">' + renderServiceHeader(data, { serviceLabel: "GLM Coding Plan (CN)", badgeHtml, renewal: data.nextRenewTime }) + renderStaleNotice(data) + renderQuotaSection(data) + renderGlmDetailSection(data, state) + "</article>";
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
      zread: "#2ECC71"
    };
    return colors[toolCode] || "#888";
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
      totalSeries = [{ modelName: "Token \u6D88\u8017\u603B\u91CF", tokensUsage: totalTokensUsage, totalTokens: usage.totalTokens }];
    }
    const chart = renderGlmChart(usage.modelSeries.concat(totalSeries), usage.xTime, "tokens", range);
    const summaryItems = usage.modelSummary.map(
      (m) => '<div class="glm-summary-item"><span class="glm-summary-dot" style="background:' + getModelColor(m.modelName) + '"></span><span class="glm-summary-name">' + escapeHtml(m.modelName) + '</span><span class="glm-summary-value">' + fmtNum(m.totalTokens) + "</span></div>"
    ).join("");
    const totalItem = '<div class="glm-summary-item"><span class="glm-summary-dot" style="background:' + getModelColor("Token \u6D88\u8017\u603B\u91CF") + '"></span><span class="glm-summary-name">Token \u6D88\u8017\u603B\u91CF</span><span class="glm-summary-value">' + fmtNum(usage.totalTokens) + "</span></div>";
    return chart + '<div class="glm-summary-row">' + totalItem + summaryItems + "</div>";
  }
  function renderGlmToolDetail(usage, range) {
    const chart = renderGlmChart(usage.toolSeries, usage.xTime, "calls", range);
    const summaryItems = usage.toolSummary.map(
      (t) => '<div class="glm-summary-item"><span class="glm-summary-dot" style="background:' + getToolColor(t.toolCode) + '"></span><span class="glm-summary-name">' + escapeHtml(t.toolName.replace(/\s*MCP$/, "")) + '</span><span class="glm-summary-value">' + t.totalUsageCount + " \u6B21</span></div>"
    ).join("");
    return chart + '<div class="glm-summary-row">' + summaryItems + "</div>";
  }
  function renderGlmChart(series, xTime, valueKey, range) {
    if (!series || series.length === 0 || !xTime || xTime.length === 0) {
      return '<div class="glm-detail-empty" role="status">\u5F53\u524D\u8303\u56F4\u6682\u65E0\u53EF\u7ED8\u5236\u7684\u7528\u91CF\u6570\u636E</div>';
    }
    const dataLen = xTime.length;
    let globalMax = 0;
    series.forEach((s) => {
      const arr = "tokensUsage" in s ? s.tokensUsage : s.usageCount;
      arr?.forEach((v) => {
        if (v != null && v > globalMax) globalMax = v;
      });
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
    const lines = series.map((s) => {
      const arr = "tokensUsage" in s ? s.tokensUsage : s.usageCount;
      if (!arr || arr.length === 0) return "";
      const color = "tokensUsage" in s ? getModelColor(s.modelName) : getToolColor(s.toolCode);
      const pts = arr.map((v, i) => getPoint(i, v));
      if (pts.length === 0) return "";
      if (pts.length === 1) {
        return '<circle cx="' + pts[0].x + '" cy="' + pts[0].y + '" r="2" fill="' + color + '"/>';
      }
      let path = "M " + pts[0].x + " " + pts[0].y;
      for (let i = 1; i < pts.length; i++) path += " L " + pts[i].x + " " + pts[i].y;
      return '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="' + path + '" opacity="0.85"/>';
    }).join("");
    let gridLines = "";
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + i / 4 * chartH;
      gridLines += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="var(--vscode-panel-border)" stroke-width="0.5" opacity="0.3"/>';
    }
    const chartLabel = (valueKey === "tokens" ? "Token \u7528\u91CF" : "\u5DE5\u5177\u8C03\u7528\u6B21\u6570") + "\u6298\u7EBF\u56FE\uFF0C" + RANGE_LABELS[range] + "\uFF1B\u6570\u503C\u89C1\u4E0B\u65B9\u6C47\u603B";
    const svg = '<svg class="glm-chart" viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" role="img" aria-label="' + chartLabel + '" focusable="false">' + gridLines + lines + "</svg>";
    return '<div class="glm-chart-wrap">' + svg + "</div>";
  }
  function getModelUsageForRange(data, range) {
    return data.modelUsageByRange?.[range] ?? (range === "day" ? data.modelUsage : void 0);
  }
  function getToolUsageForRange(data, range) {
    return data.toolUsageByRange?.[range] ?? (range === "day" ? data.toolUsage : void 0);
  }
  function getCurrentUsage(state) {
    if (!state.data) return void 0;
    return state.mainTab === "model" ? getModelUsageForRange(state.data, state.subTab) : getToolUsageForRange(state.data, state.subTab);
  }
  function getDetailLabelledBy(svcId, state) {
    return "glm-main-tab-" + svcId + "-" + state.mainTab + " glm-sub-tab-" + svcId + "-" + state.subTab;
  }
  function isCurrentDetailBusy(state) {
    const status = state.data?.detailStates?.[state.subTab]?.status;
    return status === "loading" || !getCurrentUsage(state) && status !== "error" && status !== "ok";
  }
  function renderGlmDetailSection(data, state) {
    const id = escapeHtml(data.id);
    const contentId = "glm-detail-content-" + id;
    const mainTabs = ["model", "tool"].map((tab) => {
      const selected = state.mainTab === tab;
      return '<button type="button" role="tab" class="glm-main-tab' + (selected ? " active" : "") + '" id="glm-main-tab-' + id + "-" + tab + '" data-svc-id="' + id + '" data-tab="' + tab + '" data-focus-key="glm-main-' + id + "-" + tab + '" aria-selected="' + selected + '" aria-controls="' + contentId + '" tabindex="' + (selected ? "0" : "-1") + '">' + (tab === "model" ? "\u6A21\u578B\u7528\u91CF" : "\u5DE5\u5177\u7528\u91CF") + "</button>";
    }).join("");
    const subTabs = ["day", "week", "month"].map((range) => {
      const selected = state.subTab === range;
      return '<button type="button" role="tab" class="glm-sub-tab' + (selected ? " active" : "") + '" id="glm-sub-tab-' + id + "-" + range + '" data-svc-id="' + id + '" data-range="' + range + '" data-focus-key="glm-sub-' + id + "-" + range + '" aria-selected="' + selected + '" aria-controls="' + contentId + '" tabindex="' + (selected ? "0" : "-1") + '">' + RANGE_LABELS[range] + "</button>";
    }).join("");
    return '<section class="glm-detail-section" aria-label="\u4F7F\u7528\u8BE6\u60C5"><div class="glm-main-tabs" role="tablist" aria-label="\u7528\u91CF\u7C7B\u578B">' + mainTabs + '</div><div class="glm-sub-tabs" role="tablist" aria-label="\u65F6\u95F4\u8303\u56F4">' + subTabs + '</div><div class="glm-detail-content" id="' + contentId + '" role="tabpanel" data-focus-key="glm-detail-' + id + '" aria-labelledby="' + getDetailLabelledBy(id, state) + '" aria-live="polite" aria-busy="' + isCurrentDetailBusy(state) + '" tabindex="0">' + renderGlmDetailContent(state) + "</div></section>";
  }
  function renderGlmDetailContent(state) {
    if (!state.data) return renderGlmLoading(state.subTab);
    const detailState = state.data.detailStates?.[state.subTab];
    const usage = getCurrentUsage(state);
    let statusHtml = "";
    if (detailState?.status === "loading") statusHtml = renderGlmLoading(state.subTab, Boolean(usage));
    if (detailState?.status === "error") statusHtml = renderGlmDetailError(state, detailState.message, Boolean(usage));
    let usageHtml = "";
    if (usage) {
      usageHtml = state.mainTab === "model" ? renderGlmModelDetail(usage, state.subTab) : renderGlmToolDetail(usage, state.subTab);
    } else if (detailState?.status === "ok") {
      usageHtml = '<div class="glm-detail-empty" role="status">\u5F53\u524D\u8303\u56F4\u6682\u65E0' + (state.mainTab === "model" ? "\u6A21\u578B" : "\u5DE5\u5177") + "\u7528\u91CF\u6570\u636E</div>";
    } else if (detailState?.status !== "loading" && detailState?.status !== "error") {
      statusHtml = renderGlmLoading(state.subTab);
    }
    return statusHtml + usageHtml;
  }
  function renderGlmLoading(range, compact = false) {
    return '<div class="glm-loading' + (compact ? " glm-detail-status" : "") + '" role="status">' + renderIcon("loader-circle") + "<span>\u6B63\u5728\u52A0\u8F7D" + RANGE_LABELS[range] + "\u8BE6\u60C5\u2026</span></div>";
  }
  function renderGlmDetailError(state, message, compact = false) {
    const svcId = state.data ? escapeHtml(state.data.id) : "";
    return '<div class="glm-detail-error' + (compact ? " glm-detail-status" : "") + '" role="alert">' + renderIcon("circle-alert") + '<div class="glm-detail-error-copy"><strong>' + RANGE_LABELS[state.subTab] + "\u8BE6\u60C5\u52A0\u8F7D\u5931\u8D25</strong><p>" + escapeHtml(message ?? "\u8BF7\u7A0D\u540E\u91CD\u8BD5") + '</p></div><button type="button" class="btn btn-sm btn-secondary glm-detail-retry" data-svc-id="' + svcId + '" data-range="' + state.subTab + '">' + renderIcon("refresh-cw") + "\u91CD\u8BD5</button></div>";
  }
  function requestCurrentRangeIfNeeded(svcId, state) {
    const detailState = state.data?.detailStates?.[state.subTab];
    if (state.data && !getCurrentUsage(state) && !detailState) {
      vscodeApi.postMessage({ command: "requestDetailRange", data: { serviceId: svcId, range: state.subTab } });
    }
  }
  function updateGlmDetail(svcId, state) {
    const contentEl = document.getElementById("glm-detail-content-" + svcId);
    if (contentEl) {
      contentEl.innerHTML = renderGlmDetailContent(state);
      contentEl.setAttribute("aria-busy", String(isCurrentDetailBusy(state)));
      contentEl.setAttribute("aria-labelledby", getDetailLabelledBy(svcId, state));
    }
  }
  function syncGlmTabs(svcId, state) {
    document.querySelectorAll(".glm-main-tab, .glm-sub-tab").forEach((el) => {
      if (el.dataset.svcId !== svcId) return;
      const selected = el.classList.contains("glm-main-tab") ? el.dataset.tab === state.mainTab : el.dataset.range === state.subTab;
      el.classList.toggle("active", selected);
      el.setAttribute("aria-selected", String(selected));
      el.tabIndex = selected ? 0 : -1;
    });
  }
  function switchGlmMainTab(svcId, tab) {
    const state = getGlmState(svcId);
    state.mainTab = tab;
    updateGlmDetail(svcId, state);
    syncGlmTabs(svcId, state);
    requestCurrentRangeIfNeeded(svcId, state);
  }
  function switchGlmSubTab(svcId, range) {
    const state = getGlmState(svcId);
    state.subTab = range;
    updateGlmDetail(svcId, state);
    syncGlmTabs(svcId, state);
    requestCurrentRangeIfNeeded(svcId, state);
  }
  function registerGlmCard() {
    registerServiceTemplate("glm", renderCard);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const mainTab = target.closest(".glm-main-tab");
      if (mainTab?.dataset.svcId && mainTab.dataset.tab) {
        switchGlmMainTab(mainTab.dataset.svcId, mainTab.dataset.tab);
        return;
      }
      const subTab = target.closest(".glm-sub-tab");
      if (subTab?.dataset.svcId && subTab.dataset.range) {
        switchGlmSubTab(subTab.dataset.svcId, subTab.dataset.range);
        return;
      }
      const retry = target.closest(".glm-detail-retry");
      if (retry?.dataset.svcId && retry.dataset.range) {
        retry.setAttribute("aria-disabled", "true");
        vscodeApi.postMessage({
          command: "requestDetailRange",
          data: { serviceId: retry.dataset.svcId, range: retry.dataset.range }
        });
      }
    });
  }

  // src/webview/cards/kimi.ts
  function registerKimiCard() {
    registerServiceTemplate("kimi", function renderCard2(data) {
      const id = escapeHtml(data.id);
      const level = data.level?.trim();
      const badgeHtml = level ? '<span class="service-badge badge-kimi">\u4F1A\u5458 \xB7 ' + escapeHtml(level) + "</span>" : "";
      const membershipNote = level ? "" : '<p class="kimi-membership-note">\u4F1A\u5458\u7B49\u7EA7\u6682\u4E0D\u53EF\u7528\uFF0C\u914D\u989D\u4E0D\u53D7\u5F71\u54CD</p>';
      return '<article class="service-card kimi-card" id="kimi-card-' + id + '" data-service-card="' + id + '" aria-labelledby="service-title-' + id + '">' + renderServiceHeader(data, { serviceLabel: "Kimi Membership", badgeHtml }) + renderStaleNotice(data) + renderQuotaSection(data) + membershipNote + "</article>";
    });
  }

  // src/webview/settings.ts
  var serviceSettingsMap = window.__AQD_SETTINGS_META__ ?? [];
  var globalSavePending = false;
  function getServiceSettings(kind) {
    return serviceSettingsMap.find((s) => s.kind === kind);
  }
  function renderServiceItem(p, keys) {
    const meta = getServiceSettings(p.kind);
    const id = escapeHtml(p.id);
    const name = escapeHtml(p.displayName);
    const kindLabel = meta?.displayName ?? p.kind;
    const confirmId = "remove-confirm-" + id;
    const removeButton = '<button type="button" class="btn btn-sm btn-danger remove-service-btn" aria-label="\u79FB\u9664 ' + name + ' \u670D\u52A1" aria-expanded="false" aria-controls="' + confirmId + '">' + renderIcon("trash-2") + "\u79FB\u9664\u670D\u52A1</button>";
    const confirmHtml = '<div class="inline-confirm" id="' + confirmId + '" data-confirm-panel role="group" aria-labelledby="' + confirmId + '-title" hidden><strong class="confirm-title" id="' + confirmId + '-title">\u79FB\u9664 ' + name + '\uFF1F</strong><p class="confirm-copy">\u5C06\u5220\u9664\u6B64\u670D\u52A1\u548C\u672C\u673A API Key\u3002\u4E4B\u540E\u53EF\u4EE5\u91CD\u65B0\u6DFB\u52A0\u670D\u52A1\u5E76\u518D\u6B21\u8F93\u5165\u5BC6\u94A5\u3002</p><div class="confirm-actions"><button type="button" class="btn btn-sm btn-secondary confirm-cancel">\u53D6\u6D88</button><button type="button" class="btn btn-sm btn-danger confirm-remove">\u7EE7\u7EED\u79FB\u9664</button></div></div>';
    if (!meta) {
      return '<section class="service-item" data-id="' + id + '" aria-labelledby="service-kind-' + id + '"><div class="svc-row-kind"><h3 class="svc-kind-label" id="service-kind-' + id + '" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + '</h3></div><div class="form-group"><span class="form-label">\u663E\u793A\u540D\u79F0</span><div class="form-value">' + name + '</div></div><div class="form-group"><span class="form-label">\u670D\u52A1\u7C7B\u578B</span><div class="form-value"><code>' + escapeHtml(p.kind) + '</code></div></div><div class="form-row-hint"><span class="form-hint">' + renderIcon("circle-alert") + '\u4E0D\u652F\u6301\u7684\u670D\u52A1\u7C7B\u578B\uFF1B\u4EC5\u53EF\u67E5\u770B\u914D\u7F6E\u6216\u79FB\u9664\u6B64\u670D\u52A1\u3002</span></div><div class="svc-row-actions">' + removeButton + "</div>" + confirmHtml + "</section>";
    }
    const placeholder = meta.keyPlaceholder;
    const key = keys[p.id] ?? "";
    const hintId = "service-key-hint-" + id;
    let hintHtml = '<div class="form-row-hint" id="' + hintId + '">';
    if (meta.keyHint) hintHtml += '<span class="form-hint">' + escapeHtml(meta.keyHint) + "</span>";
    hintHtml += '<span class="form-hint key-state-hint">\u4FDD\u6301\u63A9\u7801\u4E0D\u53D8\u4F1A\u4FDD\u7559\u73B0\u6709\u5BC6\u94A5\uFF1B\u6E05\u7A7A\u540E\u4FDD\u5B58\u5C06\u5220\u9664\u5BC6\u94A5\uFF1B\u8F93\u5165\u65B0\u503C\u540E\u4FDD\u5B58\u5C06\u66FF\u6362\u5BC6\u94A5\u3002</span>';
    if (meta.showHelpButton) {
      hintHtml += '<button type="button" class="btn btn-link svc-help-btn" data-help-cmd="' + escapeHtml(meta.helpCommand) + '" aria-label="\u83B7\u53D6 ' + escapeHtml(kindLabel) + ' \u5BC6\u94A5\u5E2E\u52A9">' + renderIcon("circle-help") + "\u5982\u4F55\u83B7\u53D6\u5BC6\u94A5\uFF1F</button>";
    }
    hintHtml += "</div>";
    const authHtml = '<div class="form-group"><span class="form-label">\u8BA4\u8BC1\u65B9\u5F0F</span><div class="form-value">\u624B\u52A8 API Key <span class="form-hint">\u4EC5\u4FDD\u5B58\u5728\u672C\u673A Secret Storage</span></div></div><div class="form-group"><label class="form-label" for="service-key-' + id + '">API Key</label><input type="password" class="form-input svc-key" id="service-key-' + id + '" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(key) + '" autocomplete="off" spellcheck="false" aria-describedby="' + hintId + '">' + hintHtml + "</div>";
    const endpointHintId = "service-endpoint-hint-" + id;
    const endpointHtml = meta.endpointEditable ? '<div class="form-group"><label class="form-label" for="service-endpoint-' + id + '">API \u5730\u5740</label><input type="url" class="form-input svc-endpoint" id="service-endpoint-' + id + '" value="' + escapeHtml(p.endpoint ?? "") + '" placeholder="' + escapeHtml(meta.endpointPlaceholder ?? "https://api.example.com") + '" autocomplete="off" spellcheck="false" inputmode="url" aria-describedby="' + endpointHintId + '"><span class="form-hint" id="' + endpointHintId + '">\u652F\u6301\u5BF9\u5E94\u670D\u52A1\u7684\u5B98\u65B9 API \u5730\u5740\uFF1B\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u5730\u5740\u3002</span></div>' : "";
    const actionsHtml = '<div class="svc-row-actions">' + removeButton + '<button type="button" class="btn btn-sm btn-primary save-service-btn" aria-label="\u4FDD\u5B58 ' + name + ' \u914D\u7F6E">' + renderIcon("save") + "\u4FDD\u5B58\u914D\u7F6E</button></div>" + confirmHtml;
    const nameInput = '<div class="form-group"><label class="form-label" for="service-name-' + id + '">\u663E\u793A\u540D\u79F0</label><input type="text" class="form-input svc-name" id="service-name-' + id + '" value="' + name + '" placeholder="\u663E\u793A\u540D\u79F0" required maxlength="100"></div>';
    return '<section class="service-item" data-id="' + id + '" aria-labelledby="service-kind-' + id + '"><div class="svc-row-kind"><h3 class="svc-kind-label" id="service-kind-' + id + '" data-kind="' + escapeHtml(p.kind) + '">' + escapeHtml(kindLabel) + "</h3></div>" + nameInput + authHtml + endpointHtml + actionsHtml + "</section>";
  }
  function renderServiceListSettings(settings) {
    const items = settings.profiles.map((p) => renderServiceItem(p, settings.keys)).join("");
    const options = serviceSettingsMap.map(
      (s) => '<option value="' + escapeHtml(s.kind) + '">' + escapeHtml(s.displayName) + "</option>"
    ).join("");
    const empty = settings.profiles.length === 0 ? '<div class="settings-empty">\u5C1A\u672A\u6DFB\u52A0\u670D\u52A1\u3002\u9009\u62E9\u670D\u52A1\u7C7B\u578B\u5E76\u6DFB\u52A0\uFF0C\u7136\u540E\u8F93\u5165\u5BF9\u5E94 API Key\u3002</div>' : "";
    return '<section class="settings-section" aria-labelledby="services-settings-title"><h2 class="settings-title" id="services-settings-title">\u670D\u52A1\u8FDE\u63A5</h2><p class="settings-description">\u914D\u7F6E\u663E\u793A\u540D\u79F0\u4E0E API Key\u3002\u5BC6\u94A5\u4EC5\u7528\u4E8E\u5411\u5BF9\u5E94\u5B98\u65B9 API \u67E5\u8BE2\u914D\u989D\u3002</p><div class="section-header"><div class="add-service-row"><label class="sr-only" for="new-service-kind">\u670D\u52A1\u7C7B\u578B</label><select class="form-input add-service-select" id="new-service-kind">' + options + '</select><button type="button" class="btn btn-sm btn-primary" id="add-service-btn">' + renderIcon("plus") + '\u6DFB\u52A0\u670D\u52A1</button></div></div><div id="services-list">' + items + empty + "</div></section>";
  }
  function renderGlobalField(field, label, value, hint) {
    const rule = GLOBAL_SETTING_RULES[field];
    return '<div class="form-group" data-global-field="' + field + '"><label class="form-label" for="' + field + '">' + label + '</label><input type="number" id="' + field + '" class="form-input" value="' + escapeHtml(String(value)) + '" required min="' + rule.min + '" max="' + rule.max + '" step="' + rule.step + '" inputmode="' + (field === "warnThreshold" ? "decimal" : "numeric") + '" aria-describedby="' + field + "-hint " + field + '-error"><span class="form-hint" id="' + field + '-hint">' + hint + '</span><span class="form-error" id="' + field + '-error" role="alert"></span></div>';
  }
  function renderGlobalSettings(settings) {
    return '<section class="settings-section" aria-labelledby="global-settings-title"><h2 class="settings-title" id="global-settings-title">\u5168\u5C40\u8BBE\u7F6E</h2><p class="settings-description">\u63A7\u5236\u81EA\u52A8\u5237\u65B0\u3001\u914D\u989D\u9884\u8B66\u4E0E\u79BB\u5F00\u68C0\u6D4B\u3002</p>' + renderGlobalField("refreshInterval", "\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09", settings.refreshInterval, "0 \u8868\u793A\u7981\u7528\uFF0C\u9ED8\u8BA4 60 \u79D2\uFF1B\u53EF\u8BBE 0\uFF5E86400\uFF0C\u4EE5 60 \u79D2\u4E3A\u6B65\u957F\u3002") + renderGlobalField("warnThreshold", "\u9884\u8B66\u9608\u503C\uFF080\u20131\uFF09", settings.warnThreshold, "\u4F7F\u7528\u7387\u8FBE\u5230\u6B64\u6BD4\u4F8B\u65F6\u53D1\u9001\u9884\u8B66\uFF0C\u9ED8\u8BA4 0.8\uFF1B\u4EE5 0.05 \u4E3A\u6B65\u957F\u3002") + renderGlobalField("afkThreshold", "\u79BB\u5F00\u68C0\u6D4B\uFF08\u79D2\uFF09", settings.afkThreshold, "\u65E0\u64CD\u4F5C\u8D85\u8FC7\u6B64\u65F6\u957F\u540E\u6682\u505C\u81EA\u52A8\u5237\u65B0\uFF1B0 \u8868\u793A\u7981\u7528\uFF0C\u9ED8\u8BA4 1 \u5C0F\u65F6\uFF1B\u6700\u5927 86400 \u79D2\u3002") + '<div class="form-actions"><button type="button" class="btn btn-primary" id="save-global-btn"' + (globalSavePending ? ' disabled aria-busy="true"' : ' aria-busy="false"') + ">" + renderIcon(globalSavePending ? "loader-circle" : "save") + (globalSavePending ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5168\u5C40\u914D\u7F6E") + '</button></div><div class="form-status" id="save-global-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="danger-zone" aria-labelledby="reset-data-title"><h3 class="settings-title" id="reset-data-title">\u91CD\u7F6E\u6240\u6709\u6570\u636E</h3><p class="settings-description">\u5220\u9664\u5168\u90E8\u670D\u52A1\u3001API Key \u548C\u5386\u53F2\u8BB0\u5F55\u3002VSCode \u8BBE\u7F6E\u4F1A\u4FDD\u7559\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002</p><button type="button" class="btn btn-danger" id="reset-data-btn" aria-expanded="false" aria-controls="reset-data-confirm">\u91CD\u7F6E\u6240\u6709\u6570\u636E</button><div class="inline-confirm" id="reset-data-confirm" data-confirm-panel role="group" aria-labelledby="reset-data-confirm-title" hidden><strong class="confirm-title" id="reset-data-confirm-title">\u786E\u5B9A\u7EE7\u7EED\u91CD\u7F6E\uFF1F</strong><p class="confirm-copy">\u91CD\u7F6E\u540E\u65E0\u6CD5\u6062\u590D\u3002\u5982\u679C\u4ECD\u9700\u8FD9\u4E9B API Key\uFF0C\u8BF7\u53D6\u6D88\u5E76\u5148\u81EA\u884C\u5907\u4EFD\u3002</p><div class="confirm-actions"><button type="button" class="btn btn-sm btn-secondary confirm-cancel">\u53D6\u6D88</button><button type="button" class="btn btn-sm btn-danger confirm-reset">\u7EE7\u7EED\u91CD\u7F6E</button></div></div></div></section>';
  }
  function bindInlineConfirmation(container, trigger, onConfirm, onDismiss) {
    const panel = container.querySelector("[data-confirm-panel]");
    const cancel = panel?.querySelector(".confirm-cancel");
    const confirm = panel?.querySelector(".confirm-remove, .confirm-reset");
    if (!panel || !cancel || !confirm) return;
    const setOpen = (open, restoreFocus = false) => {
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      if (open) cancel.focus();
      else if (restoreFocus) trigger.focus();
    };
    const dismiss = () => {
      setOpen(false, true);
      onDismiss?.();
    };
    trigger.addEventListener("click", () => setOpen(true));
    cancel.addEventListener("click", dismiss);
    confirm.addEventListener("click", () => {
      setOpen(false, true);
      onConfirm();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
    });
  }
  function bindServiceEvents(onDismissConfirmation) {
    document.querySelectorAll(".service-item").forEach((item) => {
      const save = item.querySelector(".save-service-btn");
      const remove = item.querySelector(".remove-service-btn");
      save?.addEventListener("click", () => {
        const kind = item.querySelector(".svc-kind-label")?.dataset.kind ?? serviceSettingsMap[0]?.kind ?? "";
        const payload = {
          id: item.dataset.id ?? "",
          name: item.querySelector(".svc-name")?.value ?? "",
          kind,
          key: item.querySelector(".svc-key")?.value ?? ""
        };
        const meta = serviceSettingsMap.find((s) => s.kind === kind);
        const endpointInput = item.querySelector(".svc-endpoint");
        if (meta?.endpointEditable && endpointInput) payload.endpoint = endpointInput.value.trim();
        vscodeApi.postMessage({ command: "saveService", data: payload });
      });
      if (remove) {
        bindInlineConfirmation(item, remove, () => {
          vscodeApi.postMessage({ command: "removeService", data: { id: item.dataset.id ?? "", confirmed: true } });
        }, onDismissConfirmation);
      }
    });
  }
  function bindAddService() {
    const addBtn = document.getElementById("add-service-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        const kindEl = document.getElementById("new-service-kind");
        vscodeApi.postMessage({ command: "addService", data: { kind: kindEl?.value ?? "glm" } });
      };
    }
  }
  function setGlobalStatus(message, kind = "") {
    const status = document.getElementById("save-global-status");
    if (!status) return;
    status.textContent = message;
    status.className = "form-status" + (kind ? " " + kind : "");
  }
  function clearGlobalFieldError(field) {
    const input = document.getElementById(field);
    const error = document.getElementById(field + "-error");
    input?.removeAttribute("aria-invalid");
    if (error) error.textContent = "";
  }
  function setGlobalFieldError(field, message) {
    const input = document.getElementById(field);
    const error = document.getElementById(field + "-error");
    input?.setAttribute("aria-invalid", "true");
    if (error) error.textContent = message;
  }
  function setGlobalSavePending(pending) {
    globalSavePending = pending;
    const button = document.getElementById("save-global-btn");
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = pending;
    button.setAttribute("aria-busy", String(pending));
    button.innerHTML = renderIcon(pending ? "loader-circle" : "save") + (pending ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5168\u5C40\u914D\u7F6E");
  }
  function handleSaveGlobalResult(result) {
    setGlobalSavePending(false);
    if (result.ok) {
      for (const field of Object.keys(GLOBAL_SETTING_RULES)) clearGlobalFieldError(field);
      setGlobalStatus(result.message ?? "\u5168\u5C40\u914D\u7F6E\u5DF2\u4FDD\u5B58", "success");
      return;
    }
    const message = result.message ?? "\u5168\u5C40\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
    if (result.field) {
      setGlobalFieldError(result.field, message);
      setGlobalStatus("\u8BF7\u4FEE\u6B63\u6807\u8BB0\u7684\u5B57\u6BB5\u540E\u518D\u4FDD\u5B58\u3002", "error");
      document.getElementById(result.field)?.focus();
      return;
    }
    setGlobalStatus(message, "error");
  }
  function bindGlobalEvents(onDismissConfirmation) {
    const saveBtn = document.getElementById("save-global-btn");
    if (saveBtn) {
      saveBtn.onclick = () => {
        if (globalSavePending) return;
        const fields = Object.keys(GLOBAL_SETTING_RULES);
        for (const field of fields) clearGlobalFieldError(field);
        setGlobalStatus("");
        const values = {
          refreshInterval: document.getElementById("refreshInterval")?.value ?? "",
          warnThreshold: document.getElementById("warnThreshold")?.value ?? "",
          afkThreshold: document.getElementById("afkThreshold")?.value ?? ""
        };
        const result = validateGlobalSettings(values);
        if (!result.ok) {
          setGlobalFieldError(result.field, result.message);
          setGlobalStatus("\u8BF7\u4FEE\u6B63\u6807\u8BB0\u7684\u5B57\u6BB5\u540E\u518D\u4FDD\u5B58\u3002", "error");
          document.getElementById(result.field)?.focus();
          return;
        }
        setGlobalSavePending(true);
        vscodeApi.postMessage({ command: "saveGlobal", data: result.values });
      };
    }
    for (const field of Object.keys(GLOBAL_SETTING_RULES)) {
      document.getElementById(field)?.addEventListener("input", () => {
        clearGlobalFieldError(field);
        setGlobalStatus("");
      });
    }
    const resetBtn = document.getElementById("reset-data-btn");
    const globalPanel = document.getElementById("panel-global");
    if (resetBtn && globalPanel) {
      bindInlineConfirmation(globalPanel, resetBtn, () => {
        vscodeApi.postMessage({ command: "resetData", data: { confirmed: true } });
      }, onDismissConfirmation);
    }
  }

  // src/webview/main.ts
  registerGlmCard();
  registerKimiCard();
  bindTabKeyboard();
  var lastUpdateMessage;
  var servicesPanelHash = "";
  var globalPanelHash = "";
  var activeRefreshingIds = /* @__PURE__ */ new Set();
  function announce(message) {
    const region = document.getElementById("dashboard-announcer");
    if (region) region.textContent = message;
  }
  function activateTopTab(button) {
    const tab = button.dataset.tab ?? "dashboard";
    document.querySelectorAll(".tab-btn").forEach((tabButton) => {
      const selected = tabButton === button;
      tabButton.classList.toggle("active", selected);
      tabButton.setAttribute("aria-selected", String(selected));
      tabButton.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const selected = panel.id === "panel-" + tab;
      panel.classList.toggle("active", selected);
      panel.hidden = !selected;
    });
    servicesPanelHash = "";
    globalPanelHash = "";
    if (lastUpdateMessage) handleUpdateData(lastUpdateMessage);
  }
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => activateTopTab(button));
  });
  function applyRefreshingState() {
    document.querySelectorAll(".btn-refresh-svc").forEach((button) => {
      const id = button.dataset.serviceId ?? "";
      const name = button.dataset.serviceName ?? "\u670D\u52A1";
      const refreshing = activeRefreshingIds.has(id);
      button.classList.toggle("spinning", refreshing);
      button.setAttribute("aria-disabled", String(refreshing));
      button.setAttribute("aria-busy", String(refreshing));
      button.setAttribute("aria-label", (refreshing ? "\u6B63\u5728\u5237\u65B0 " : "\u5237\u65B0 ") + name);
      button.title = (refreshing ? "\u6B63\u5728\u5237\u65B0 " : "\u5237\u65B0 ") + name;
      const card = button.closest("[data-service-card]");
      if (card) card.setAttribute("aria-busy", String(refreshing || card.classList.contains("loading-card")));
      const state = card?.querySelector("[data-refresh-state]");
      if (state) state.hidden = !refreshing;
    });
  }
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const refreshButton = target.closest(".btn-refresh-svc");
    if (refreshButton) {
      if (refreshButton.getAttribute("aria-disabled") === "true") return;
      const id = refreshButton.dataset.serviceId;
      if (!id) return;
      activeRefreshingIds.add(id);
      applyRefreshingState();
      announce("\u6B63\u5728\u5237\u65B0 " + (refreshButton.dataset.serviceName ?? "\u670D\u52A1"));
      vscodeApi.postMessage({ command: "refreshService", data: { id } });
      return;
    }
    const switchButton = target.closest("[data-switch-tab]");
    if (switchButton) {
      const tabName = switchButton.dataset.switchTab ?? "dashboard";
      const serviceId = switchButton.dataset.focusServiceId;
      const tab = Array.from(document.querySelectorAll(".tab-btn")).find((button) => button.dataset.tab === tabName);
      if (tab) {
        tab.click();
        if (serviceId) {
          const serviceItem = Array.from(document.querySelectorAll(".service-item")).find((item) => item.dataset.id === serviceId);
          serviceItem?.querySelector(".svc-key")?.focus();
        } else {
          document.getElementById(tabName === "services" ? "new-service-kind" : "panel-" + tabName)?.focus();
        }
      }
      return;
    }
    const helpButton = target.closest(".svc-help-btn");
    if (helpButton) vscodeApi.postMessage({ command: helpButton.dataset.helpCmd ?? "" });
  });
  function isEditingInPanel(panel) {
    if (!panel) return false;
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) return false;
    return panel.contains(active);
  }
  function captureDashboardFocus(panel) {
    const active = document.activeElement;
    return active instanceof HTMLElement && panel.contains(active) ? active.dataset.focusKey : void 0;
  }
  function restoreDashboardFocus(panel, focusKey) {
    if (!focusKey) return;
    const target = Array.from(panel.querySelectorAll("[data-focus-key]")).find((el) => el.dataset.focusKey === focusKey);
    target?.focus({ preventScroll: true });
  }
  function renderSettingsPanels(settings) {
    const servicesPanel = document.getElementById("panel-services");
    if (servicesPanel) {
      const servicesHash = JSON.stringify({ profiles: settings.profiles, keys: settings.keys });
      const skipRerender = shouldSkipPanelRerender(
        isEditingInPanel(servicesPanel),
        servicesPanel.querySelector("[data-confirm-panel]:not([hidden])") !== null
      );
      if (servicesHash !== servicesPanelHash && !skipRerender) {
        servicesPanel.innerHTML = renderServiceListSettings(settings);
        servicesPanelHash = servicesHash;
        bindServiceEvents(reconcileSettingsPanels);
        bindAddService();
      }
    }
    const globalPanel = document.getElementById("panel-global");
    if (globalPanel) {
      const globalHash = JSON.stringify(settings);
      const skipRerender = shouldSkipPanelRerender(
        isEditingInPanel(globalPanel),
        globalPanel.querySelector("[data-confirm-panel]:not([hidden])") !== null
      );
      if (globalHash !== globalPanelHash && !skipRerender) {
        globalPanel.innerHTML = renderGlobalSettings(settings);
        globalPanelHash = globalHash;
        bindGlobalEvents(reconcileSettingsPanels);
      }
    }
  }
  function reconcileSettingsPanels() {
    if (lastUpdateMessage) renderSettingsPanels(lastUpdateMessage.settings);
  }
  function handleUpdateData(message) {
    const settings = message.settings;
    lastUpdateMessage = message;
    pruneStatesByProfiles(glmStates, settings.profiles);
    const previousRefreshingIds = activeRefreshingIds;
    activeRefreshingIds = new Set(message.refreshingIds ?? []);
    const dashboardPanel = document.getElementById("panel-dashboard");
    if (dashboardPanel) {
      const focusKey = captureDashboardFocus(dashboardPanel);
      const visibleServices = computeVisibleServices(settings.profiles, message.services);
      dashboardPanel.innerHTML = visibleServices.length > 0 ? visibleServices.map((service) => renderService(service)).join("") : renderNoConfig();
      applyRefreshingState();
      restoreDashboardFocus(dashboardPanel, focusKey);
    }
    for (const id of previousRefreshingIds) {
      if (!activeRefreshingIds.has(id)) {
        const profile = settings.profiles.find((item) => item.id === id);
        if (profile) announce(profile.displayName + " \u5237\u65B0\u7ED3\u675F");
      }
    }
    renderSettingsPanels(settings);
  }
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.command === "switchToSettings") {
      const subtab = message.subtab ?? "services";
      const targetTab = Array.from(document.querySelectorAll(".tab-btn")).find((button) => button.dataset.tab === subtab);
      if (targetTab) {
        targetTab.click();
        targetTab.focus();
      }
      return;
    }
    if (message.command === "saveGlobalResult") {
      handleSaveGlobalResult(message);
      return;
    }
    if (message.command === "updateData") handleUpdateData(message);
  });
  vscodeApi.postMessage({ command: "requestInitialData" });
})();
//# sourceMappingURL=dashboard.js.map
