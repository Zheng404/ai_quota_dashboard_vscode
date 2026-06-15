# AI Quota Dashboard

> VSCode 扩展插件 + 浏览器扩展 —— AI 配额用量仪表盘。实时追踪 GLM Coding Plan (CN)、Kimi Membership、Xiaomi MiMo Token Plan 等 AI 服务的配额消耗情况，帮助开发者避免超额使用，合理规划 API 调用。

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=Zheng404.ai-quota-dashboard">
    <img src="https://img.shields.io/visual-studio-marketplace/v/Zheng404.ai-quota-dashboard?label=VSCode%20Marketplace&color=blue&style=flat-square" alt="VSCode Marketplace">
  </a>
  <a href="https://open-vsx.org/extension/Zheng404/ai-quota-dashboard">
    <img src="https://img.shields.io/open-vsx/v/Zheng404/ai-quota-dashboard?label=Open%20VSX&color=purple&style=flat-square" alt="Open VSX">
  </a>
  <a href="https://img.shields.io/visual-studio-marketplace/d/Zheng404.ai-quota-dashboard">
    <img src="https://img.shields.io/visual-studio-marketplace/d/Zheng404.ai-quota-dashboard?label=Downloads&color=green&style=flat-square" alt="Downloads">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT">
  </a>
</p>

<p align="center">
  <a href="#功能亮点">功能亮点</a> •
  <a href="#安装">安装</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用指南">使用指南</a> •
  <a href="#架构设计">架构设计</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#常见问题">常见问题</a> •
  <a href="#更新日志">更新日志</a>
</p>

---

## ✨ 功能亮点

| 特性 | 说明 |
|------|------|
| 🎯 **多服务支持** | 支持 GLM Coding Plan (CN)、Kimi Membership、Xiaomi MiMo Token Plan，通过注册表模式易于扩展更多 AI 服务 |
| 📊 **实时仪表盘** | 侧边栏 Webview 展示配额进度、用量统计、历史趋势，支持 SVG 曲线图；刷新时无缝保留旧数据 |
| 📈 **状态栏监控** | 底部状态栏实时显示配额使用率、Token 用量和倒计时，颜色预警（绿/黄/红） |
| 🌉 **Cookie Bridge 凭证转发** | 浏览器扩展自动采集 Kimi/MiMo Cookie 与 GLM API Key，推送至 VSCode 后**自动分发到对应 AI 服务**并自动创建，无需手动复制粘贴（需先在 VSCode 添加 Cookie Bridge 服务启用） |
| 🔐 **双模式认证** | AI 服务支持 `manual`（手动输入）与 `bridge`（浏览器自动同步）两种模式，可随时切换 |
| 🛎️ **配额预警通知** | 配额使用率超过阈值时弹出 VSCode 警告通知（30 分钟冷却，避免刷屏） |
| 💤 **智能 AFK 检测** | 用户长时间无操作后自动暂停刷新，节省系统资源和 API 调用次数 |
| ⚡ **高性能缓存** | LRU 内存缓存（60s TTL，错误 300s TTL，最大 100 条目）+ AsyncQueue 并发控制，避免重复请求和竞态条件 |
| 🔒 **数据本地存储** | 所有配额数据存储在本地 globalState / Secret Storage，**不上传任何云端** |
| 📜 **历史记录持久化** | 自动保留 30 天历史用量数据，支持趋势分析和按日期去重合并 |
| 🧩 **ServiceDescriptor 注册表** | 模块化架构，新增 AI 服务只需实现标准接口即可自动集成仪表盘、状态栏和设置页 |

---

## 📋 目录

- [安装](#安装)
  - [VSCode 扩展](#vscode-扩展)
  - [浏览器扩展（可选）](#浏览器扩展可选)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
  - [命令面板](#命令面板)
  - [浏览器扩展快捷键](#浏览器扩展快捷键)
  - [全局设置](#全局设置)
  - [支持的服务](#支持的服务)
- [架构设计](#架构设计)
  - [项目结构](#项目结构)
  - [VSCode 扩展架构](#vscode-扩展架构)
  - [Cookie Bridge 通信流程](#cookie-bridge-通信流程)
  - [数据流](#数据流)
  - [配置存储](#配置存储)
  - [扩展新 AI 服务](#扩展新-ai-服务)
- [开发指南](#开发指南)
  - [环境要求](#环境要求)
  - [VSCode 扩展开发](#vscode-扩展开发)
  - [浏览器扩展开发](#浏览器扩展开发)
  - [测试](#测试)
  - [打包发布](#打包发布)
- [常见问题](#常见问题)
- [技术栈](#技术栈)
- [更新日志](#更新日志)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 安装

### VSCode 扩展

#### 从应用市场安装（推荐）

**VSCode / VSCode Insiders**：
1. 打开 VSCode，点击左侧活动栏的 **扩展图标** (`Ctrl+Shift+X`)
2. 搜索 **"AI Quota Dashboard"**
3. 点击 **安装**

**VSCodium / Cursor / Windsurf**（使用 Open VSX）：
1. 打开扩展面板 (`Ctrl+Shift+X`)
2. 搜索 **"AI Quota Dashboard"**
3. 点击 **安装**

或直接点击下方链接在浏览器中安装：

<p>
  <a href="https://marketplace.visualstudio.com/items?itemName=Zheng404.ai-quota-dashboard">
    <img src="https://img.shields.io/badge/VSCode%20Marketplace-安装-blue?style=for-the-badge" alt="VSCode Marketplace">
  </a>
  <a href="https://open-vsx.org/extension/Zheng404/ai-quota-dashboard">
    <img src="https://img.shields.io/badge/Open%20VSX-安装-purple?style=for-the-badge" alt="Open VSX">
  </a>
</p>

#### 从 VSIX 文件安装

```bash
# 1. 从 GitHub Releases 下载最新 .vsix 文件
#    https://github.com/Zheng404/ai_quota_dashboard_vscode/releases

# 2. 执行安装命令
code --install-extension ai-quota-dashboard-*.vsix

# 或使用 VSCode 图形界面：
# 扩展面板 → ... → 从 VSIX 安装
```

---

### 浏览器扩展（可选）

浏览器扩展提供 **Cookie Bridge 凭证转发** 和 **浏览器端仪表盘** 两个功能：

- **Cookie Bridge 凭证转发**：浏览器扩展自动采集 Kimi/MiMo 的 Cookie 与 GLM API Key，推送到 VSCode 后**自动分发到对应 AI 服务**（写入 Secret Storage 并标记 `dataSource='bridge'`），无需手动复制粘贴凭证
- **凭证自动刷新**：每 30 分钟检测凭证有效性，失效时在后台静默刷新（Offscreen API 双层策略 / 最小化窗口降级），全程无感知
- **浏览器端仪表盘**：在浏览器弹窗或独立页面中直接查看 GLM / Kimi / MiMo 的实时配额状态，独立工作，不依赖 VSCode

> 💡 **提示**：浏览器扩展是可选的。不安装时，VSCode 扩展仍可独立工作，AI 服务通过手动输入认证信息配置。

#### Chrome / Edge

1. 从 [GitHub Releases](https://github.com/Zheng404/ai_quota_dashboard_vscode/releases) 下载 `ai-quota-dashboard-chrome-v1.0.0.zip` 并解压
2. 打开 Chrome/Edge，地址栏输入 `chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择解压后的 `chrome/` 目录

#### Firefox

1. 从 [GitHub Releases](https://github.com/Zheng404/ai_quota_dashboard_vscode/releases) 下载 `ai-quota-dashboard-firefox-v1.0.0.zip` 并解压
2. 打开 Firefox，地址栏输入 `about:debugging#/runtime/this-firefox`
3. 点击 **临时载入附加组件**
4. 选择解压后的 `firefox/manifest.json`

> ⚠️ **注意**：Firefox 临时扩展在浏览器重启后需重新加载。如需永久安装，需等待扩展提交至 [Firefox Add-ons](https://addons.mozilla.org/)。

---

## 快速开始

### 方式一：浏览器扩展自动同步凭证（推荐）

最省事的方式 —— 安装浏览器扩展后，所有凭证自动从浏览器同步到 VSCode，无需手动复制粘贴。

1. **安装 VSCode 扩展** 和 **浏览器扩展**（见上方安装步骤）
2. 在 VSCode 仪表盘切换到 **「服务」** 标签，点击 **「添加服务」** 选择 **「Cookie Bridge」**。只有添加后 VSCode 才会启动本地 Bridge 服务器监听端口（移除该服务后会自动关闭）
3. 在浏览器中登录 [kimi.com](https://kimi.com) 和 [platform.xiaomimimo.com](https://platform.xiaomimimo.com)（MiMo）
4. （可选）在浏览器扩展 Popup 的「服务」中填入 GLM API Key（GLM 凭证不来自浏览器登录态）
5. 浏览器扩展会自动发现 VSCode Bridge 端口并推送凭证。VSCode 收到后会：
   - **自动创建** 对应的 AI 服务（若尚不存在）
   - **自动写入凭证** 到 Secret Storage，并标记为 `dataSource='bridge'`
   - **去重**：同一服务类型只保留一个（优先保留 Bridge 推送的）
6. 返回 **「仪表盘」** 即可查看实时配额

> 💡 **提示**：浏览器扩展支持防抖推送（1.5s 延迟）和失败重试队列，确保凭证同步稳定可靠。若想改回手动输入，在 VSCode 服务标签页点击该服务条目上的「切换为手动输入」即可。

---

### 方式二：手动输入认证信息

不使用浏览器扩展时，可直接在 VSCode 服务标签页手动配置 AI 服务。

1. 安装 **VSCode 扩展**
2. 打开仪表盘，切换到 **「服务」** 标签
3. 点击 **「添加服务」**，选择服务类型，根据提示填写认证信息：

   | 服务 | 认证方式 | 认证信息 | 获取方式 |
   |------|---------|---------|---------|
   | **GLM** | API Key | Bearer Token | 登录 [GLM 开放平台](https://open.bigmodel.cn/) → 个人中心 → 复制 API Key |
   | **Kimi** | JWT Token | `kimi-auth` Cookie 值 | 浏览器按 `F12` → Application → Cookies → `kimi.com` → 复制 `kimi-auth` 的值 |
   | **MiMo** | Cookie | 完整 Cookie 字符串 | 浏览器按 `F12` → Application → Cookies → `platform.xiaomimimo.com` → 复制完整 Cookie 字符串 |

4. 点击 **保存**，返回 **「仪表盘」** 查看实时配额

> 🔒 **安全提示**：所有 Token 和 Cookie 均存储在 VSCode 的 **Secret Storage** 中，经过加密处理，不会以明文形式保存在配置文件里。

---

## 使用指南

### 命令面板

按 `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)，输入以下命令：

| 命令 | 功能 |
|------|------|
| `刷新配额数据` | 清空缓存并重新拉取所有服务数据 |
| `打开配额面板` | 聚焦侧边栏仪表盘 |
| `打开设置面板` | 聚焦仪表盘并切换到设置标签 |
| `清除历史数据` | 仅清除历史数据（保留配置和 API Key） |
| `重置所有数据` | **删除所有配置、API Key、历史记录**（不可逆） |

### 浏览器扩展快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + Q` | 打开扩展弹窗面板（显示配额状态、手动同步） |
| `Alt + Shift + Q` | 打开 AI Quota Dashboard 独立页面（全宽仪表盘） |

### 全局设置

在仪表盘 **「设置」** 标签中可以调整以下参数（同时会写入 VSCode Settings，可在设置面板编辑）：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 自动刷新间隔 | `600` 秒 | 轮询拉取配额数据的间隔，设为 `0` 禁用自动刷新 |
| 配额预警阈值 | `0.8` (80%) | 使用率超过此值时弹出 VSCode 警告通知（30 分钟冷却） |
| AFK 检测阈值 | `3600` 秒 | 无键盘/鼠标操作超此时长后暂停自动刷新，恢复活动时继续 |

### 支持的服务

| 服务 | 目录 | 默认认证方式 | 特色功能 |
|------|------|------------|---------|
| **Cookie Bridge** | `vscode/src/services/bridge/` | 需用户手动添加后启用 | 状态整合在「服务」标签页的 Bridge 条目中，显示连接徽章、最后同步时间和已连接服务标签（Kimi/MiMo/GLM）；不在仪表盘单独展示卡片 |
| **GLM Coding Plan (CN)** | `vscode/src/services/glm/` | `manual`（可切 `bridge`） | API Key（Bearer Token）认证；配额卡片 + 模型/工具用量详情 + SVG 曲线图（当日/近7天/近30天） |
| **Kimi Membership** | `vscode/src/services/kimi/` | `manual`（可切 `bridge`） | `kimi-auth` Cookie 值作 Bearer Token（JWT）认证；配额进度条 + 子限额展示 + 会员等级 + 有效期 |
| **Xiaomi MiMo Token Plan** | `vscode/src/services/mimo/` | `manual`（可切 `bridge`） | `serviceToken` Cookie 认证；套餐用量统计 + 补偿 Token 额度 + 有效期展示 + 自动续费状态 |

---

## 架构设计

### 项目结构

```
ai_quota_dashboard_vscode/
├── vscode/                   # VSCode 扩展
│   ├── src/
│   │   ├── extension.ts      # 扩展入口：activate/deactivate、命令注册、轮询循环、Bridge 按需启停（syncBridgeLifecycle）
│   │   ├── bridge/           # Cookie Bridge HTTP 服务器
│   │   │   └── server.ts     # 本地 HTTP 服务（127.0.0.1），接收浏览器扩展推送的凭证
│   │   ├── core/             # 核心模块
│   │   │   ├── types.ts      # 基础类型：ServiceProfile、QuotaSlot、ServiceData 等
│   │   │   ├── config.ts     # ConfigManager（globalState + Secret Storage + 部分 Settings API）
│   │   │   ├── fetch.ts      # HTTP 客户端（含指数退避重试、请求日志）
│   │   │   ├── format.ts     # 数字格式化 (fmtNum)
│   │   │   ├── cache.ts      # LRU 内存缓存管理器（60s TTL，错误 300s，最大 100 条目）
│   │   │   ├── afk.ts        # 离开检测器（键盘/鼠标/编辑器活动监听）
│   │   │   └── *.test.ts     # 单元测试
│   │   ├── services/         # 服务层（ServiceDescriptor 注册表模式）
│   │   │   ├── registry.ts   # 服务注册表：kind → ServiceDescriptor 映射
│   │   │   ├── types.ts      # QuotaProvider / StatusBarRenderer / DetailProvider 接口
│   │   │   ├── bridge/       # Cookie Bridge 状态监控服务（状态整合在「服务」标签页）
│   │   │   ├── glm/          # GLM 服务完整包
│   │   │   ├── kimi/         # Kimi 服务完整包
│   │   │   └── mimo/         # MiMo 服务完整包
│   │   ├── storage/
│   │   │   └── persistence.ts # 历史数据持久化（globalState，30 天保留）
│   │   ├── ui/
│   │   │   ├── statusbar.ts  # 状态栏通用调度器
│   │   │   └── statusBarRenderer.ts # 渲染器接口 + 共享工具函数
│   │   ├── dashboard/        # 侧边栏 Webview 仪表盘
│   │   │   ├── webviewView.ts # WebviewViewProvider（HTML 骨架 + 消息路由）
│   │   │   ├── styles.ts     # 通用 CSS + 聚合各服务样式
│   │   │   └── templates/    # JS 模板系统（注册表 + 数据驱动渲染）
│   │   └── commands/
│   │       └── index.ts      # clearHistory 命令
│   ├── resources/            # 图标资源
│   ├── package.json          # 扩展清单
│   └── ...
├── browser-common/           # 浏览器扩展共享代码（Chrome/Firefox 共用）
│   ├── browser-api.js        # 浏览器 API 兼容层
│   ├── cache.js              # 基于 storage.local 的带 TTL 缓存（正常 60s / 错误 300s）
│   ├── config.js             # 集中式配置管理
│   ├── offscreen.html        # Offscreen 文档：双层凭证刷新（fetch → iframe 回退）
│   ├── popup.html / popup.js # Popup 仪表盘
│   ├── dashboard.html / dashboard.js # 独立 Dashboard 页面
│   ├── templates.js          # 卡片渲染模板
│   ├── styles.css            # 样式表
│   ├── api/                  # API 客户端（glm/kimi/mimo）
│   └── scripts/
│       └── background.js     # Service Worker（Cookie Bridge + 凭证检测 + 自动刷新）
├── chrome/                   # Chrome/Edge 专属（仅 manifest + icons）
├── firefox/                  # Firefox 专属（仅 manifest + icons）
├── build.sh                  # 打包脚本（复制共享代码到 chrome/firefox → 打包 → 清理）
└── README.md
```

### VSCode 扩展架构

项目采用 **ServiceDescriptor 注册表模式**，每个 AI 服务是一个完整的「包」，包含数据提供者、仪表盘模板、样式和设置元数据：

```typescript
interface ServiceDescriptor {
  kind: ServiceId;                    // 'bridge' | 'glm' | 'kimi' | 'mimo' | ...
  displayName: string;                // 'Cookie Bridge' | 'GLM Coding Plan (CN)'
  defaultName: string;                // 添加时的默认名称
  badgeLabel: string;
  badgeCssClass: string;
  provider: QuotaProvider;            // 数据拉取逻辑
  templateScript: string;             // 仪表盘卡片 JS 模板
  styles: string;                     // 专属 CSS
  settings: ServiceSettingsDescriptor; // 设置表单元数据
  statusBarRenderer?: StatusBarRenderer;   // 状态栏渲染器（可选）
  detailProvider?: DetailProvider;         // 详情数据提供者（可选，用于懒加载）
  mergeDetailData?(existing, detail, range): void;  // 合并详情数据
  helpCommand?: string;               // 帮助命令标识
  helpMessage?: string;               // 帮助提示内容
}
```

**核心优势**：新增 AI 服务只需在 `vscode/src/services/` 新建目录，实现上述结构，然后在 `vscode/src/services/registry.ts` 注册即可，**无需修改核心代码**。

### Cookie Bridge 通信流程

```
Browser Extension                        VSCode Extension
      │                                        │
      │  1. 用户添加 Cookie Bridge 服务后，     │
      │     Bridge 启动监听                    │
      │     127.0.0.1:[37100..37110] 之一       │
      │◀───────────────────────────────────────┤
      │                                        │
      │  2. GET /health (携带探测密钥,            │
      │     发现端口 + 获取会话 token)            │
      │◀───────────────────────────────────────┤
      │                                        │
      │  3. 浏览器扩展监控目标站点 Cookie        │
      │     （kimi.com / xiaomimimo.com）       │
      │     + storage.local 中的 GLM API Key    │
      │                                        │
      │  4. POST /cookies (携带 X-Auth-Token)   │
      │     推送凭证：                          │
      │     • kimiAuthToken                    │
      │     • mimoCookie                       │
      │     • glmApiKey                        │
      ├───────────────────────────────────────▶│
      │                                        │ 5. 验证 token
      │                                        │ 6. 更新 Bridge 服务状态
      │                                        │    （连接状态、已接收凭证种类、最后同步时间）
      │                                        │ 7. 分发凭证到 AI 服务：
      │                                        │    • 已有对应服务 → 写入 Secret Storage + dataSource='bridge'
      │                                        │    • 无对应服务 → 自动创建
      │                                        │    • 去重：同 kind 只保留一个（优先 bridge）
      │                                        │ 8. 清除缓存 + 触发 pullAll() 刷新
      │                                        │ 9. 返回成功响应
      │◀───────────────────────────────────────┤
      │                                        │
      │  10. 每 30 分钟检测凭证有效性           │
      │      失效时后台静默刷新（无窗口弹出）    │
      │◀───────────────────────────────────────┤
```

**Bridge 自动分发机制**（`extension.ts` 的 `handleCookiePayload`）：
- **按需启停**：Bridge 服务器仅在用户添加了 Cookie Bridge 服务后启动（`syncBridgeLifecycle` → `ensureBridgeRunning`），移除该服务后自动关闭端口（`stopBridgeIfIdle`）
- 浏览器扩展推送全部凭证（`kimiAuthToken` + `mimoCookie` + `glmApiKey`），VSCode **自动分发到对应的 AI 服务**
- 分发时写入 Secret Storage 并标记 `dataSource='bridge'`；若对应 AI 服务不存在，**自动创建**
- **去重**：同一服务类型只保留一个实例（优先保留 `dataSource='bridge'` 的）
- **同步移除**：浏览器扩展推送 `activeKinds` 后，VSCode 会移除被浏览器删除的 bridge 来源服务
- 用户可在 VSCode 服务标签页把某个服务从 `bridge` **切换为手动输入**

**端口发现**：
- VSCode Bridge 服务器依次尝试端口 `37100` ~ `37110`，找到第一个可用端口绑定 `127.0.0.1`
- 端口号写入系统临时目录的 PID 文件 `os.tmpdir()/.ai-quota-bridge-port-{pid}`（用于本地进程管理，避免多 VSCode 实例冲突）
- 浏览器扩展（无法直接读文件系统）通过**探测 `/health` 端点**发现端口：优先尝试上次成功的端口，失败后遍历 `[37100..37110]`

**凭证自动刷新**（浏览器扩展 `background.js`）：
- `chrome.alarms` 每 30 分钟执行凭证健康检查（存在性 + 过期时间 + API 探测）
- 检测到失效时采用**三层降级刷新**，全程无窗口弹出、无任务栏图标：
  1. **Offscreen API（Chrome 116+，首选）**：`chrome.offscreen.createDocument` 创建 Offscreen 文档，先 `fetch(url)` 触发 Set-Cookie，若 Cookie 未变再创建隐藏 `<iframe>` 让页面 JS 完整执行
  2. **最小化弹出窗口（Firefox / Chrome <116 降级）**：`chrome.windows.create({ state: 'minimized' })`，等待页面加载后关闭
  3. 刷新后重新探测，成功后自动推送给 VSCode

**安全机制**：
- HTTP 服务器仅绑定 `127.0.0.1`，拒绝外部网络连接
- 双层 Token 认证：
  - **探测密钥**（`BRIDGE_PROBE_SECRET`）：打包进扩展的固定密钥，`GET /health` 必须携带 `X-Bridge-Probe` 头，校验通过才返回会话 authToken。本地其它进程不知道此密钥，无法获取 token 伪造推送
  - **会话 authToken**：每次 VSCode 启动生成随机 `authToken`，`POST /cookies` 必须携带 `X-Auth-Token`
- CORS 仅放行 `chrome-extension://` / `moz-extension://` 来源
- Cookie 推送时过滤敏感字段（`httpOnly` / `secure` / `expirationDate`），仅发送 `name` 和 `value`
- 请求体大小限制（≤ 1MB），防止 DoS；POST 请求 5 秒超时
- 浏览器扩展全部页面使用 `createElement`/`textContent` 替代 `innerHTML`，并配置 CSP
- VSCode 端 Webview 仪表盘和状态栏 tooltip 对所有动态文本做 `escapeHtml`/`escapeMarkdown` 转义

### 浏览器扩展核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| 浏览器 API 兼容层 | `browser-common/browser-api.js` | 统一 Chrome/Firefox API 差异 |
| 缓存模块 | `browser-common/cache.js` | storage.local 带 TTL 缓存（正常 60s / 错误 300s） |
| 配置管理 | `browser-common/config.js` | 集中式配置读写 |
| 共享常量 | `browser-common/constants.js` | `BRIDGE_PROBE_SECRET` 探测密钥（访问 `/health` 的第一层门槛） |
| Service Worker | `browser-common/scripts/background.js` | 端口发现、Cookie 监控、凭证失效检测、自动刷新（Offscreen/窗口降级）、防抖推送、与 VSCode 通信 |
| Popup | `browser-common/popup.html` + `popup.js` | 仪表盘弹窗，显示配额卡片、详情 Tab、设置管理 |
| 卡片模板 | `browser-common/templates.js` | GLM / Kimi / MiMo 配额卡片和 SVG 图表模板 |
| 样式表 | `browser-common/styles.css` | Popup 和卡片样式 |
| GLM API | `browser-common/api/glm.js` | GLM 配额数据拉取（Bearer Token 认证） |
| Kimi API | `browser-common/api/kimi.js` | Kimi 配额数据拉取（Bearer Token 认证） |
| MiMo API | `browser-common/api/mimo.js` | MiMo 配额数据拉取（Cookie 认证） |

### 数据流

```
pullAll() 定时触发
    │
    ├─ AFK 检测（用户无操作超阈值则跳过本次刷新）
    ├─ AsyncQueue 串行执行，消除并发竞态
    ├─ 遍历 ServiceProfile
    │   ├─ 检查 LRU 内存缓存 (60s TTL；错误数据 300s TTL)
    │   ├─ resolveProvider(kind) → QuotaProvider.fetch(key, endpoint)
    │   ├─ 返回 ServiceData（服务可扩展专属字段）
    │   └─ attachHistory() 合并本地持久化历史数据
    │
    ├─ StatusBar.feed() → flush()（每服务一个状态栏项，定制渲染）
    ├─ DashboardWebviewViewProvider.update() → postMessage
    ├─ saveHistory() → globalState 持久化
    └─ checkQuotaWarnings() → 超阈值弹出警告通知（30 分钟冷却）

Cookie Bridge（独立数据流，仅当用户添加了 Cookie Bridge 服务后启动）：
浏览器扩展 → POST /cookies → handleCookiePayload 回调
    │
    ├─ 更新 Bridge 服务状态（连接状态、最后同步时间、已接收凭证种类）
    ├─ 分发凭证到 AI 服务（Kimi/MiMo/GLM → Secret Storage + dataSource='bridge'）
    │   ├─ 去重：同 kind 只保留一个（优先 bridge）
    │   └─ 同步移除：浏览器已删除的 bridge 来源服务
    ├─ 标记 Bridge profile 为已连接
    └─ 热重载：保留旧数据 + 标记 refreshingIds + pullAll() 刷新（卡片不中断、按钮转圈）
```

### 配置存储

| 数据 | 存储位置 | Key | 说明 |
|------|---------|-----|------|
| 服务列表 | `globalState` | `services` | 服务配置（id、kind、displayName、endpoint、dataSource） |
| API Keys / Cookie | `Secret Storage` | `apiKeys.{serviceId}` | 每个 profile 独立存储，`bridge` 来源由 Bridge 自动写入 |
| Bridge 服务状态 | `globalState` | `aiQuotaDashboard.bridgeState` | Bridge 卡片连接状态、最后同步时间、已接收凭证种类 |
| 刷新间隔 | `globalState` + Settings | `refreshInterval` | 默认 600 秒，同步写入 `aiQuotaDashboard.refreshInterval` |
| 预警阈值 | `globalState` + Settings | `warnThreshold` | 默认 0.8，同步写入 Settings；超阈值触发警告通知 |
| AFK 阈值 | `globalState` + Settings | `afkThreshold` | 默认 3600 秒，同步写入 `aiQuotaDashboard.afkThreshold` |
| 历史数据 | `globalState` | `aiQuotaDashboard.history` | 最多保留 30 天，按日期去重合并 |

> ℹ️ **说明**：全局三项设置（刷新间隔、预警阈值、AFK 阈值）在写入 `globalState` 的同时也会同步到 VSCode Settings（`config.ts` 的 `setState` 对这三项额外调用 `workspace.getConfiguration().update()`），因此用户既可在仪表盘设置页、也可在 VSCode 设置面板中修改。

### 扩展新 AI 服务

1. 在 `vscode/src/services/` 创建新目录（结构参考 `glm/`、`kimi/` 或 `mimo/`；`bridge/` 为固定的状态监控服务，不需要复制）
2. 实现 `QuotaProvider` 接口（`provider.ts`）—— 数据拉取与解析
3. 定义扩展数据类型（`types.ts`）—— 继承 `ServiceData`
4. 编写仪表盘卡片模板（`template.ts`）—— 注册到 `serviceTemplates.{kind}`
5. 编写专属样式（`styles.ts`）
6. 编写设置元数据（`settings.ts`）—— 驱动设置页渲染
7. **可选**：实现 `StatusBarRenderer` 接口（`statusBar.ts`），否则状态栏显示 `?`
8. **可选**：实现 `DetailProvider` 接口（`provider.ts`）+ `mergeDetailData`，支持仪表盘详情懒加载。两者需同时提供
9. 组装 `ServiceDescriptor`（`index.ts`）
10. 在 `vscode/src/services/registry.ts` 注册
11. 在 `vscode/src/dashboard/styles.ts` 引入新服务的样式

新增 AI 服务默认 `dataSource='manual'`；若希望支持浏览器扩展自动同步，需同时让浏览器扩展 `background.js` 的 `COOKIE_TARGETS` / `gatherAll*` 采集该服务凭证，VSCode 端的 `handleCookiePayload` 分发逻辑会自动按 `kind` 处理（目前内置支持 `glm`/`kimi`/`mimo`）。

---

## 开发指南

### 环境要求

- **VSCode**: 1.80+
- **Node.js**: 18+（推荐 20.x）
- **浏览器**: Chrome 116+ / Edge 116+ / Firefox 116+

### VSCode 扩展开发

```bash
cd vscode

# 安装依赖
npm install

# 编译 TypeScript
npm run compile

# 监听模式开发（推荐）
npm run watch

# ESLint 代码检查
npm run lint

# 运行单元测试
npm test

# 监听模式运行测试
npm run test:watch
```

**启动调试**：
1. VSCode 中打开 `vscode/` 目录
2. 按 `F5` 启动 Extension Host 调试窗口
3. 在新窗口中测试扩展功能

### 浏览器扩展开发

浏览器扩展采用「共享代码 + 浏览器差异」架构，**无需构建步骤**。

```
browser-common/               # 共享代码（Chrome/Firefox 共用）
├── browser-api.js            # 浏览器 API 兼容层
├── cache.js / config.js      # 缓存与配置管理
├── offscreen.html            # Offscreen 凭证刷新文档
├── popup.html / popup.js     # Popup 仪表盘
├── templates.js              # 卡片模板
├── styles.css                # 样式表
├── api/                      # API 客户端
└── scripts/
    └── background.js         # Service Worker

chrome/                        # Chrome 专属
├── manifest.json              # 含 offscreen 权限 + service_worker
└── icons/

firefox/                       # Firefox 专属
├── manifest.json              # scripts 数组 + browser_specific_settings.gecko
└── icons/
```

开发时直接加载 `chrome/` 或 `firefox/` 目录需要先运行 `build.sh` 将共享代码复制进去，或者直接将 `browser-common/` 的文件手动复制到对应目录。

```bash
# 先在项目根目录运行 ./build.sh 复制共享代码（或手动 cp）
# Chrome / Edge：chrome://extensions/ → 开发者模式 → 加载已解压 → 选择 chrome/
# Firefox：about:debugging#/runtime/this-firefox → 临时载入 → 选 firefox/manifest.json
```

### 测试

项目使用 **vitest** 作为测试框架。测试文件与源码同目录，命名 `{source}.test.ts`：

```bash
cd vscode
npm test
```

| 测试文件 | 覆盖内容 |
|---------|---------|
| `src/core/cache.test.ts` | LRU 缓存 get/set/clear/dispose |
| `src/core/afk.test.ts` | AFK 检测器活动监听逻辑 |
| `src/core/format.test.ts` | fmtNum 数字格式化（K/M/B 缩写） |
| `src/core/types.test.ts` | getColorLevel 颜色等级计算 |
| `src/services/glm/provider.test.ts` | GLM 数据解析逻辑 |
| `src/services/kimi/provider.test.ts` | Kimi 数据解析（窗口限制、主配额、余额） |
| `src/services/mimo/provider.test.ts` | MiMo 数据解析逻辑 |
| `src/services/bridge/provider.test.ts` | Bridge 状态数据组装 |
| `src/storage/persistence.test.ts` | 历史数据加载、保存、合并、清理 |
| `src/ui/statusBarRenderer.test.ts` | 倒计时格式化、颜色计算 |

### 打包发布

```bash
# 打包所有扩展（VSCode + Chrome + Firefox）
./build.sh

# 输出目录
build/
├── ai-quota-dashboard-*.vsix             # VSCode 扩展
├── ai-quota-dashboard-chrome-v1.0.0.zip  # Chrome / Edge 浏览器扩展
└── ai-quota-dashboard-firefox-v1.0.0.zip # Firefox 浏览器扩展
```

---

## 常见问题

### Q: 浏览器扩展推送凭证后，VSCode 没有自动创建服务？

**A**:
1. **确认已在 VSCode「服务」标签添加 Cookie Bridge 服务**（只有添加后 Bridge 服务器才会启动并监听端口，浏览器扩展才能发现并推送凭证）
2. 确认浏览器扩展已登录目标网站（kimi.com / xiaomimimo.com），或已在扩展设置中填入 GLM API Key
3. 在浏览器扩展 Popup 中查看「VSCode 状态」是否已连接；未连接时点击「同步」手动触发
4. 检查 VSCode Output Channel「AI Quota Dashboard」中 `[Bridge]` 日志

### Q: 状态栏显示 `?` 是什么意思？

**A**: 该服务未实现 `StatusBarRenderer` 接口，状态栏无法识别如何渲染其配额信息。内置的 GLM/Kimi/MiMo/Bridge 均已实现，新增自定义服务时如需支持请添加 `statusBar.ts`。

### Q: GLM / Kimi / MiMo 提示「认证失败」怎么办？

**A**: 首先确认认证方式：
- **Bridge 模式**（`dataSource='bridge'`）：凭证由浏览器扩展推送。请在浏览器中重新登录目标网站，或等待 30 分钟内的自动刷新；也可在浏览器扩展 Popup 点击「检测凭证」手动触发
- **手动模式**（`dataSource='manual'`）：请重新获取并更新认证信息：
  - GLM：登录 [GLM 开放平台](https://open.bigmodel.cn/) 复制 API Key
  - Kimi：浏览器 `F12` → Cookies → `kimi.com` → 复制 `kimi-auth` 值
  - MiMo：浏览器 `F12` → Cookies → `platform.xiaomimimo.com` → 复制完整 Cookie 字符串

### Q: 仪表盘数据不更新，状态栏也没有变化？

**A**: 可能原因：
1. **缓存未过期**：LRU 缓存正常 TTL 60 秒，错误数据 TTL 300 秒，可点击刷新按钮手动清空缓存
2. **AFK 状态**：用户长时间无操作后自动暂停刷新，移动鼠标或按下键盘即可恢复
3. **网络问题**：检查 VSCode Output Channel「AI Quota Dashboard」中的请求日志

### Q: 没有收到配额预警通知？

**A**: 配额预警需要满足全部条件：
1. 预警阈值在 `(0, 1)` 区间内（默认 0.8，设为 0 或 1 会禁用通知）
2. 某个服务的配额使用率 ≥ 阈值
3. 距离上次预警通知已超过 **30 分钟**冷却期（避免刷屏）

预警通知会以 VSCode 警告弹窗形式出现，列出所有超阈值的服务及其实际使用率。

### Q: 历史数据丢失或显示不完整？

**A**: 历史数据保留策略为 **30 天**，超期自动清理。同一天内按日期（UTC）去重合并，优先保留信息更完整的数据点。

### Q: 浏览器扩展无法连接 VSCode？

**A**:
1. **确认已在 VSCode「服务」标签添加 Cookie Bridge 服务**（未添加则 Bridge 服务器不启动，浏览器扩展无法连接）
2. 检查 VSCode Output Channel「AI Quota Dashboard」中的 `[Bridge]` 日志
3. 浏览器扩展会自动重连（优先上次成功的端口，失败后遍历端口范围），等待几秒后重试
4. 确认浏览器扩展 Popup 中「VSCode 状态」为已连接

### Q: Cookie Bridge 推送失败，提示 Token 不匹配？

**A**:
- 每次 VSCode 启动时会生成新的动态 `authToken`
- 浏览器扩展通过 `/health` 端点自动获取最新 Token 和端口
- 如仍失败，尝试在浏览器扩展 Popup 中手动点击「同步」按钮

### Q: 为什么同一个 AI 服务类型只能有一个卡片？

**A**: 这是 Cookie Bridge 的**去重机制**（`deduplicateAiProfiles`）。当浏览器扩展多次推送凭证时，VSCode 会清理同一服务类型（kind）下重复的 **bridge** 服务，避免产生重复卡片。**用户手动配置的服务（manual）永远不参与去重**，不会被自动删除。因此你可以同时保留一个 bridge 来源的服务和一个手动输入的服务。

### Q: Cookie Bridge 推送凭证会泄露给不需要的服务吗？

**A**: 不会。凭证传输全程在本地完成：
- 浏览器扩展通过 `localhost` HTTP 请求将凭证发送至本机 VSCode
- 凭证**不上传任何云端或开发者服务器**
- VSCode 端仅把凭证分发到 `kind` 完全匹配的 AI 服务（GLM→glm、Kimi→kimi、MiMo→mimo）

### Q: 编译报错 `Cannot find module 'vscode'`？

**A**: 未安装 VSCode 类型定义。请运行 `cd vscode && npm install` 确保 `@types/vscode` 已正确安装。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 运行时 | Node.js (VSCode Extension Host) |
| 框架 | VSCode Extension API |
| 构建 | `tsc` |
| 代码检查 | ESLint + @typescript-eslint |
| 测试 | vitest |
| 数据存储 | `globalState` + Secret Storage + 部分 Settings API |
| 可视化 | Webview (内联 HTML/CSS/JS + SVG 图表) |
| 浏览器扩展 | Chrome / Firefox Manifest V3 |

---

## 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

### [1.0.0] - 2026-06-14

**新增**

- ⚡ **仪表盘无缝刷新**：刷新时保留旧数据，对应服务卡片刷新按钮旋转；不再全屏"数据加载中"闪烁
- 🔗 **Bridge 状态整合进「服务」标签页**：连接徽章、最后同步时间、已连接服务标签整合进服务列表的 Bridge 条目

**变更**

- 🌉 **Cookie Bridge 按需启停**：仅在用户添加 Cookie Bridge 服务后才启动 Bridge 服务器，移除后自动关闭
- 🗂️ **tab 扁平化**：仪表盘/服务/设置三个平级标签（原为两级 tab）
- 🏷️ **卡片服务名改用官方名称**：GLM Coding Plan (CN) / Kimi Membership / Xiaomi MiMo Token Plan
- 📝 **Kimi / MiMo 凭证文案按认证机制区分**：Kimi（JWT/Bearer）、MiMo（serviceToken）

**修复**

- 🐛 刷新按钮 CSS（图标实际不旋转）、浏览器扩展 Kimi/MiMo 卡片边框缺失、dashboard.js 致命 bug 等

### [0.9.0] - 2026-06-10

**新增**

- 🌉 **Cookie Bridge 凭证转发**：浏览器扩展自动采集 Kimi/MiMo Cookie 与 GLM API Key，推送到 VSCode 后**自动分发到对应 AI 服务**并自动创建，无需手动配置
- 🔍 **Bridge 端口发现增强**：预定义端口范围 `[37100..37110]`，PID 端口文件避免多实例冲突
- 🔄 **凭证自动刷新**：每 30 分钟检测凭证有效性，失效时后台三层降级刷新（Offscreen 双层策略 / 最小化窗口）
- 🛎️ **配额预警通知**：配额使用率超阈值时弹出 VSCode 警告（30 分钟冷却）

**改进**

- 🇨🇳 **UI 文本中文化**：服务名称、命令标题、状态栏全面中文化
- 🔒 **安全加固**：XSS 防护、CSP、敏感字段过滤、请求超时、Mutex 保护
- ⚡ **性能优化**：LRU 内存缓存（正常 60s / 错误 300s TTL）、AsyncQueue 并发控制、指数退避重试

[查看完整更新日志 →](vscode/CHANGELOG.md)

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. **Fork** 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing-feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

**提交规范**：遵循 [Conventional Commits](https://www.conventionalcommits.org/)

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具

**编码规范**：
- TypeScript 严格模式
- 测试文件与源码同目录，命名 `{source}.test.ts`
- 注释使用中文

---

## 隐私政策

**本扩展不收集任何用户数据。**

- 不发送数据到开发者服务器
- 不上传 Cookie 到云端
- 不使用任何第三方分析或追踪服务

扩展处理数据的场景：

1. **凭证采集**：浏览器扩展监控目标站点 Cookie（kimi.com / xiaomimimo.com）与 storage.local 中的 GLM API Key
2. **本地传输**：通过 `localhost` HTTP 请求将凭证发送至本机 VSCode 扩展
3. **凭证分发**：VSCode 将凭证写入 Secret Storage（操作系统级密钥链加密），并标记 `dataSource='bridge'`
4. **内存缓存**：凭证仅在 Service Worker 内存中临时保存（防抖和重试），不持久化到磁盘
5. **手动配置**：不使用浏览器扩展时，AI 服务认证信息由用户在 VSCode 设置页手动输入
6. **自动刷新**：仅在检测到凭证失效时，临时访问对应网站以刷新 Cookie

浏览器扩展权限说明：

| 权限 | 用途 |
|------|------|
| `cookies` | 读取目标网站的认证 Cookie（kimi.com / xiaomimimo.com） |
| `storage` | 存储扩展自身配置（服务列表、GLM API Key、连接状态） |
| `tabs` | 后台打开临时标签页 / 最小化窗口进行凭证自动刷新 |
| `offscreen` | Chrome 116+ 的 Offscreen API 凭证刷新 |
| `alarms` | 定时凭证检测和健康检查 |
| `host_permissions` | 访问 `kimi.com`、`xiaomimimo.com`、`open.bigmodel.cn`、`127.0.0.1` |

---

## 许可证

[MIT](LICENSE) © [Zheng404](https://github.com/Zheng404)

---

<p align="center">
  如果本项目对你有帮助，请给个 ⭐ Star 支持一下！
</p>
