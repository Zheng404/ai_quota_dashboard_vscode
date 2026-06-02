# Cookie Bridge 浏览器扩展

> AI Quota Dashboard 的配套浏览器扩展。自动同步浏览器登录态至 VSCode，让 Kimi、MiMo 等基于 Cookie 鉴权的服务无需手动复制 Token。

## 什么是 Cookie Bridge

AI Quota Dashboard 需要访问你的 AI 服务配额数据。对于 **GLM Coding Plan**，你可以直接复制 API Key；但对于 **Kimi Membership** 和 **Xiaomi MiMo Token Plan**，你需要提供浏览器登录态（Cookie/JWT）。

手动复制 Cookie 步骤繁琐且容易出错。Cookie Bridge 浏览器扩展可以：

- **自动监控** 已登录网站的 Cookie 变化
- **安全推送** 至 VSCode 扩展的本地服务器
- **实时同步** 登录态，无需手动干预

所有通信仅在 **本地环回地址** 完成，不会向任何第三方服务器发送数据。

## 功能特性

| 特性 | 说明 |
|------|------|
| **自动 Cookie 同步** | 监控 `kimi.com` 和 `xiaomimimo.com` 的 Cookie 变化，变更后自动推送给 VSCode |
| **安全认证** | 动态 Token 认证，防止未授权访问 |
| **防抖推送** | 避免频繁变更导致的重复请求，聚合后统一推送 |
| **失败重试队列** | 网络波动或 VSCode 未启动时自动重试 |
| **Dashboard 独立页面** | 完整的 Web 仪表盘，支持查看配额状态、刷新数据 |
| **Popup 快捷弹窗** | 点击工具栏图标快速查看状态、触发同步、打开设置 |
| **服务发现** | 自动检测当前页面所属服务，高亮显示 |
| **XSS 防护** | 全部使用 `createElement`/`textContent`，不使用 `innerHTML` |
| **CSP 策略** | 所有页面均配置 Content Security Policy |

## 安装

### Chrome / Edge

1. 下载 `ai-quota-cookie-bridge-chrome.zip` 并解压
2. 打开 Chrome/Edge，地址栏输入 `chrome://extensions/`（Edge 为 `edge://extensions/`）
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择解压后的目录

> 扩展将保持已启用状态，直到你手动移除。

### Firefox

1. 下载 `ai-quota-cookie-bridge-firefox.zip` 并解压
2. 打开 Firefox，地址栏输入 `about:debugging#/runtime/this-firefox`
3. 点击 **临时载入附加组件**
4. 选择解压后的 `manifest.json`

> ⚠️ Firefox 临时扩展在浏览器重启后会失效，需重新加载。如需永久安装，需将扩展提交至 [Firefox Add-ons](https://addons.mozilla.org/)。

## 快速开始

### 第一步：安装扩展

按上方说明安装 Chrome/Edge 或 Firefox 版本。

### 第二步：登录 AI 服务

在浏览器中登录你需要监控的 AI 服务：

- [Kimi](https://www.kimi.com) — 登录后扩展会自动捕获 `kimi-auth` 等关键 Cookie
- [MiMo](https://platform.xiaomimimo.com) — 登录后扩展会自动捕获平台 Cookie

### 第三步：在 VSCode 中配置服务

1. 打开 VSCode，确保已安装 **AI Quota Dashboard** 扩展
2. 打开侧边栏仪表盘，切换到 **「设置」** 标签
3. 点击 **「添加服务」**
4. 选择服务类型（Kimi / MiMo）
5. **认证方式** 选择 **「Cookie Bridge 自动获取」**
6. 保存配置

### 第四步：自动同步

浏览器扩展会自动检测到 VSCode 的本地服务，并在 Cookie 变化时推送。你也可以：

- 点击浏览器工具栏的扩展图标，在 Popup 中手动触发 **「立即同步」**
- 在 Dashboard 页面点击刷新按钮

### 第五步：查看配额

返回 VSCode 仪表盘，即可看到实时配额数据。

## 使用详解

### Popup 弹窗

点击浏览器工具栏的扩展图标打开 Popup：

- **服务状态**：显示当前检测到的服务和连接状态
- **Cookie 预览**：展示即将同步的关键 Cookie（已脱敏）
- **立即同步** 按钮：手动触发一次 Cookie 推送
- **打开仪表盘** 按钮：在新标签页打开 Dashboard
- **打开 VSCode** 按钮：调用 VSCode 协议打开扩展

### Dashboard 页面

按 `Alt+Shift+Q` 或点击 Popup 中的「打开仪表盘」进入：

- **配额卡片**：与 VSCode 仪表盘一致，显示配额进度条、用量、倒计时
- **服务选择**：支持 Kimi / MiMo 切换查看
- **刷新按钮**：手动拉取最新数据
- **连接状态**：显示与 VSCode Bridge 服务器的连接状态

### 自动同步触发条件

以下情况会自动触发 Cookie 推送：

1. Cookie 值发生变化（如 Token 刷新）
2. Cookie 被新增或删除
3. 手动点击「立即同步」
4. 扩展启动时（如果已有 Cookie）

推送前会进行 **1 秒防抖**，避免批量变更导致的多次请求。

## 安全考虑

### 本地通信-only

- 浏览器扩展 ↔ VSCode 的通信 **仅限于 `localhost` 环回地址**
- 不会向任何外部服务器发送请求
- 不会在扩展的 `storage` 中持久化 Cookie 数据

### 动态 Token 认证

- VSCode Bridge 服务器每次启动时生成 **随机 Token**
- 浏览器扩展通过 `/health` 接口获取当前 Token
- 所有 `/cookies` 推送请求必须在 Header 中携带此 Token
- Token 不匹配时请求会被拒绝

### 敏感字段过滤

推送 Cookie 时，以下字段会被 **自动移除**：

- `httpOnly`
- `secure`
- `expirationDate`
- `sameSite`
- `hostOnly`

仅推送必要的 `name`、`value`、`domain`、`path`。

### 请求体限制

Bridge 服务器限制 POST Body ≤ 1MB，防止异常大数据攻击。

### XSS 防护

Dashboard 和 Popup 全部使用 DOM API（`document.createElement`、`textContent`）动态构建 UI，**不使用 `innerHTML`**，杜绝 XSS 注入风险。

### Content Security Policy

所有 HTML 页面均配置了严格的 CSP：

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:*; img-src 'self' data:;
```

## 架构

```
┌─────────────────┐         ┌──────────────────────┐
│  Browser Page   │         │   VSCode Extension   │
│  (kimi.com)     │         │                      │
└────────┬────────┘         │  ┌────────────────┐  │
         │ Cookie 变化       │  │ Bridge Server  │  │
         │                  │  │ (localhost)    │  │
         ▼                  │  └────────┬───────┘  │
┌─────────────────┐         │           │          │
│ Service Worker  │─────────┼───POST /cookies─────▶│
│ (background.js) │  (Token │           │          │
│                 │  认证)   │           ▼          │
│ • 监控 Cookie   │         │  验证 Token → Secret │
│ • 防抖聚合      │         │  Storage → 触发刷新  │
│ • 推送队列      │         │                      │
└─────────────────┘         └──────────────────────┘
         │
         ├─ GET /health ◀── 获取 port + token
         │
         ├─ chrome.cookies API 监听变更
         │
         └─ 与 Popup / Dashboard 通信
              (chrome.runtime.sendMessage)
```

### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| Service Worker | `scripts/background.js` | Cookie 监控、防抖、推送、与 VSCode 通信 |
| Popup | `popup.html` + `popup.js` | 快捷弹窗，显示状态、手动同步 |
| Dashboard | `dashboard.html` + `dashboard.js` | 独立页面，完整配额展示 |
| Cookie API | `api/cookies.js` | 封装 `chrome.cookies` / `browser.cookies` 差异 |
| Manifest V3 | `manifest.json` | 权限声明（`cookies`、`activeTab`、`host_permissions`） |

### 消息传递

```javascript
// Service Worker → Popup/Dashboard
chrome.runtime.sendMessage({
  type: 'statusUpdate',
  data: { connected: true, services: [...] }
});

// Popup → Service Worker
chrome.runtime.sendMessage({
  type: 'triggerSync'
});
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + Q` | 打开扩展 Popup 弹窗 |
| `Alt + Shift + Q` | 打开 AI Quota Dashboard 独立页面 |

> 快捷键可在浏览器扩展管理页面的「键盘快捷键」中自定义。

## 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| **扩展图标显示「未连接」** | VSCode 未启动或 Bridge 未启动 | 确保 VSCode 已打开，且 AI Quota Dashboard 扩展已激活 |
| **Cookie 未自动同步** | 未登录目标网站 | 访问 kimi.com / xiaomimimo.com 并确认已登录 |
| **手动同步失败** | Bridge 服务器端口冲突 | 重启 VSCode，等待 3 秒后重试 |
| **Dashboard 数据空白** | VSCode 中未配置对应服务 | 在 VSCode 设置中添加服务并选择「Cookie Bridge」模式 |
| **Kimi 显示鉴权失败** | Cookie 已过期 | 在浏览器中刷新 kimi.com 页面，扩展会自动获取新 Cookie |
| **Popup 显示服务不匹配** | 当前页面非支持的服务域名 | 切换到 kimi.com 或 xiaomimimo.com 页面 |
| **Firefox 扩展消失** | 临时扩展重启后失效 | 重新执行「临时载入附加组件」步骤 |
| **Dashboard 页面报错** | CSP 阻止了外部资源 | 确保没有浏览器插件（如广告拦截器）修改了响应头 |

## 隐私政策

### 数据收集

**本扩展不收集任何用户数据。**

- 不发送数据到开发者服务器
- 不上传 Cookie 到云端
- 不使用任何第三方分析或追踪服务

### 数据使用

扩展仅在以下场景处理数据：

1. **读取 Cookie**：通过浏览器 `cookies` API 读取 `kimi.com` 和 `xiaomimimo.com` 的 Cookie
2. **本地传输**：通过 `localhost` HTTP 请求将 Cookie 发送至 VSCode 扩展
3. **内存缓存**：Cookie 仅在 Service Worker 内存中临时保存（用于防抖和重试），不持久化

### 权限说明

| 权限 | 用途 |
|------|------|
| `cookies` | 读取目标网站的认证 Cookie |
| `activeTab` | 获取当前标签页信息以判断服务类型 |
| `storage` | 存储扩展自身配置（如连接状态、用户偏好） |
| `host_permissions` | 访问 `kimi.com` 和 `xiaomimimo.com` 的 Cookie |
| `http://localhost/*` | 与 VSCode Bridge 服务器通信 |

### 数据共享

**无。** 扩展不会与任何第三方共享数据。

## 项目链接

- **主项目**: [ai_quota_dashboard_vscode](https://github.com/Zheng404/ai_quota_dashboard_vscode)
- **VSCode 扩展**: 见主项目 README
- **Chrome/Edge 扩展**: `chrome/` 目录
- **Firefox 扩展**: `firefox/` 目录
- **问题反馈**: [GitHub Issues](https://github.com/Zheng404/ai_quota_dashboard_vscode/issues)

## License

MIT © [Zheng404](https://github.com/Zheng404)
