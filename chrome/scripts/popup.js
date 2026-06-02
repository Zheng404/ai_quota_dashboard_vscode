/**
 * AI Quota Cookie Bridge — Popup Script
 */

const dot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const servicesDiv = document.getElementById('services');
const syncBtn = document.getElementById('sync-btn');
const lastSyncDiv = document.getElementById('last-sync');

/** 共享 Cookie 目标配置 */
const TARGET_COOKIES = [
  { key: 'Kimi', url: 'https://www.kimi.com', names: ['kimi-auth'] },
  { key: 'MiMo', url: 'https://platform.xiaomimimo.com', names: ['api-platform_serviceToken', 'userId'] },
];

/**
 * 安全地创建服务项 DOM 元素
 * @param {string} key - 服务名称
 * @param {boolean} found - 是否找到 Cookie
 * @returns {HTMLElement}
 */
function createServiceItem(key, found) {
  const item = document.createElement('div');
  item.className = 'service-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'service-name';
  nameSpan.textContent = key;

  const statusSpan = document.createElement('span');
  statusSpan.className = `service-status ${found ? 'found' : 'missing'}`;
  statusSpan.textContent = found ? '已登录' : '未登录';

  item.appendChild(nameSpan);
  item.appendChild(statusSpan);

  return item;
}

/** 检查各服务 Cookie 状态 */
async function checkCookies() {
  const results = [];
  for (const t of TARGET_COOKIES) {
    let found = false;
    for (const name of t.names) {
      try {
        const cookie = await chrome.cookies.get({ url: t.url, name });
        if (cookie && cookie.value) { found = true; break; }
      } catch { /* ignore */ }
    }
    results.push({ key: t.key, found });
  }

  // 清空并重新填充（安全 DOM 操作，避免 innerHTML）
  servicesDiv.replaceChildren();
  for (const r of results) {
    servicesDiv.appendChild(createServiceItem(r.key, r.found));
  }
}

/** 更新连接状态 */
async function updateStatus() {
  // 向 background 查询状态
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      dot.className = 'status-dot disconnected';
      statusText.textContent = '后台服务未运行';
      return;
    }
    if (response?.connected) {
      dot.className = 'status-dot connected';
      statusText.textContent = `已连接 (port ${response.port})`;
    } else {
      dot.className = 'status-dot disconnected';
      statusText.textContent = 'VSCode 未连接';
    }
  });
}

/** 手动同步 */
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = '同步中...';

  chrome.runtime.sendMessage({ action: 'relayNow' }, (response) => {
    syncBtn.disabled = false;
    syncBtn.textContent = '立即同步';

    if (response?.success) {
      lastSyncDiv.textContent = `上次同步: ${new Date().toLocaleTimeString()}`;
    }

    updateStatus();
    checkCookies();
  });
});

// 初始化
updateStatus();
checkCookies();
