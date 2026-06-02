# AI Quota Dashboard

> VSCode 扩展插件 + 浏览器扩展 —— AI Coding Plan 配额用量仪表盘。实时追踪 GLM Coding Plan、Kimi Membership、Xiaomi MiMo Token Plan 等 AI 服务的配额消耗情况，帮助开发者避免超额使用，合理规划 API 调用。

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

## 📸 截图

<p align="center">
  <!-- TODO: 添加仪表盘截图 -->
  <img src="vscode/resources/screenshot-dashboard.png" alt="仪表盘截图" width="600" style="border-radius: 8px; border: 1px solid #e1e4e8;">
  <br>
  <em>侧边栏仪表盘 —— 实时展示多服务配额状态</em>
</p>

<p align="center">
  <img src="vscode/resources/screenshot-statusbar.png" alt="状态栏截图" width="600" style="border-radius: 8px; border: 1px solid #e1e4e8;">
  <br>
  <em>底部状态栏 —— 配额使用率与倒计时一目了然</em>
</p>

---

## ✨ 功能亮点

| 特性 | 说明 |
|------|------|
| 🎯 **多服务支持** | 支持 GLM Coding Plan (CN)、Kimi Membership、Xiaomi MiMo Token Plan，通过注册表模式易于扩展更多 AI 服务 |
| 📊 **实时仪表盘** | 侧边栏 Webview 展示配额进度、用量统计、历史趋势，支持 SVG 曲线图 |
| 📈 **状态栏监控** | 底部状态栏实时显示配额使用率、Token 用量和倒计时，颜色预警（绿/黄/红） |
| 🌉 **浏览器 Cookie Bridge** | Chrome / Edge / Firefox 扩展自动同步浏览器登录态，无需手动复制 Token |
| 🔐 **双模式认证** | 支持「手动输入 Token」和「浏览器扩展自动同步」两种鉴权方式 |
| 💤 **智能 AFK 检测** | 用户长时间无操作后自动暂停刷新，节省系统资源和 API 调用次数 |
| ⚡ **高性能缓存** | LRU 内存缓存（60s TTL）+ AsyncQueue 并发控制，避免重复请求和竞态条件 |
| 🔒 **数据本地存储** | 所有配额数据存储在本地 globalState / Secret Storage，**不上传任何云端** |
| 📜 **历史记录持久化** | 自动保留 30 天历史用量数据，支持趋势分析和按日期去重合并 |
| 🧩 **ServiceDescriptor 注册表** | 模块化架构，新增 AI 服务只需实现标准接口即可自动集成仪表盘、状态栏和设置页 |

---

## 📋 目录

- [安装](#安装)
  - [VSCode 扩展](#vscode-扩展)
  - [浏览器扩展（可选）](#浏览器扩展可选)
- [快速开始](#快速开始)
  - [方式一：浏览器扩展自动同步（推荐）](#方式一浏览器扩展自动同步推荐)
  - [方式二：手动输入 Token](#方式二手动输入-token)
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

浏览器扩展用于自动同步已登录网站的 Cookie 到 VSCode 扩展，**无需手动复制粘贴 Token**。

#### Chrome / Edge

1. 从 [GitHub Releases](https://github.com/Zheng404/ai_quota_dashboard_vscode/releases) 下载 `ai-quota-cookie-bridge-chrome.zip` 并解压
2. 打开 Chrome/Edge，地址栏输入 `chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择解压后的 `chrome/` 目录

#### Firefox

1. 从 [GitHub Releases](https://github.com/Zheng404/ai_quota_dashboard_vscode/releases) 下载 `ai-quota-cookie-bridge-firefox.zip` 并解压
2. 打开 Firefox，地址栏输入 `about:debugging#/runtime/this-firefox`
3. 点击 **临时载入附加组件**
4. 选择解压后的 `firefox/manifest.json`

> ⚠️ **注意**：Firefox 临时扩展在浏览器重启后需重新加载。如需永久安装，需等待扩展提交至 [Firefox Add-ons](https://addons.mozilla.org/)。

---

## 快速开始

### 方式一：浏览器扩展自动同步（推荐）

适合 **Kimi** 和 **MiMo** 等基于浏览器 Cookie 鉴权的服务。

1. **安装 VSCode 扩展** 和 **浏览器扩展**（见上方安装步骤）
2. 在浏览器中登录目标网站：
   - [kimi.com](https://www.kimi.com)（Kimi）
   - [xiaomimimo.com](https://platform.xiaomimimocom)（MiMo）
3. VSCode 中打开 **AI Quota Dashboard** 侧边栏（点击活动栏图标或执行命令 `AI Quota Dashboard: 打开配额面板`）
4. 切换到 **「设置」** 标签，点击 **「添加服务」**：
   - **服务类型**：选择 Kimi / MiMo / GLM
   - **认证方式**：选择 **"Cookie Bridge 自动获取"**
   - 点击 **保存**
5. 浏览器扩展会自动检测对应网站的 Cookie 变化，并安全推送给 VSCode 扩展
6. 返回 **「仪表盘」** 查看实时配额状态

> 💡 **提示**：浏览器扩展支持防抖推送（1.5s 延迟）和失败重试（最多 3 次），确保 Cookie 同步稳定可靠。

---

### 方式二：手动输入 Token

适合所有服务类型，特别是 **GLM** 等使用 API Key 鉴权的服务。

1. 安装 **VSCode 扩展**
2. 打开仪表盘，切换到 **「设置」** 标签
3. 点击 **「添加服务」**，根据服务类型填写对应信息：

   | 服务 | 认证信息 | 获取方式 |
   |------|---------|---------|
   | **GLM** | API Key | 登录 [GLM 开放平台](https://open.bigmodel.cn/) → 个人中心 → 复制 API Key |
   | **Kimi** | JWT Token | 浏览器按 `F12` → Application → Cookies → `kimi.com` → 复制 `kimi-auth` 的值 |
   | **MiMo** | Cookie | 浏览器按 `F12` → Application → Cookies → `platform.xiaomimimo.com` → 复制完整 Cookie 字符串 |

4. **认证方式**：选择 **"手动输入"**
5. 点击 **保存**，返回 **「仪表盘」** 查看实时配额

> 🔒 **安全提示**：所有 Token 和 Cookie 均存储在 VSCode 的 **Secret Storage** 中，经过加密处理，不会以明文形式保存在配置文件里。

---

## 使用指南

### 命令面板

按 `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)，输入以下命令：

| 命令 | 功能 |
|------|------|
| `AI Quota Dashboard: 刷新配额` | 清空缓存并重新拉取所有服务数据 |
| `AI Quota Dashboard: 打开配额面板` | 聚焦侧边栏仪表盘 |
| `AI Quota Dashboard: 打开设置` | 聚焦仪表盘并切换到设置标签 |
| `AI Quota Dashboard: 清除历史` | 仅清除历史数据（保留配置和 API Key） |
| `AI Quota Dashboard: 重置数据` | **删除所有配置、API Key、历史记录**（不可逆） |

### 浏览器扩展快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + Q` | 打开扩展弹窗面板（显示 Cookie 状态、手动同步） |
| `Alt + Shift + Q` | 打开 AI Quota Dashboard 独立页面（查看配额状态） |

### 全局设置

在仪表盘 **「设置 → 全局设置」** 中可以调整以下参数：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 自动刷新间隔 | `600` 秒 | 轮询拉取配额数据的间隔，设为 `0` 禁用自动刷新 |
| 配额预警阈值 | `0.8` (80%) | 使用率超过此值时状态栏显示警告颜色（黄色 → 红色） |
| AFK 检测阈值 | `3600` 秒 | 无键盘/鼠标操作超此时长后暂停自动刷新，恢复活动时继续 |

### 支持的服务

| 服务 | 目录 | 鉴权方式 | 特色功能 |
|------|------|---------|---------|
| **GLM Coding Plan (CN)** | `vscode/src/services/glm/` | API Key (Bearer Token) | 配额卡片 + 模型/工具用量详情 + SVG 曲线图（当日/近7天/近30天） |
| **Kimi Membership** | `vscode/src/services/kimi/` | JWT Token (浏览器 Cookie) | 配额进度条 + 子限额展示 + 会员等级 + 有效期 |
| **Xiaomi MiMo Token Plan** | `vscode/src/services/mimo/` | Cookie (浏览器登录态) | 套餐用量统计 + 补偿 Token 额度 + 有效期展示 + 自动续费状态 |

---

## 架构设计

### 项目结构

```
ai_quota_dashboard_vscode/
├── vscode/                   # VSCode 扩展
│   ├── src/
│   │   ├── extension.ts      # 扩展入口：activate/deactivate、命令注册、轮询循环
│   │   ├── bridge/           # Cookie Bridge HTTP 服务器
│   │   │   └── server.ts     # 本地 HTTP 服务，接收浏览器扩展推送的 Cookie
│   │   ├── core/             # 核心模块
│   │   │   ├── types.ts      # 基础类型：ServiceProfile、QuotaSlot、ServiceData 等
│   │   │   ├── config.ts     # 配置管理（globalState + Secret Storage）
│   │   │   ├── fetch.ts      # HTTP 客户端（含指数退避重试、请求日志）
│   │   │   ├── format.ts     # 数字格式化 (fmtNum)
│   │   │   ├── cache.ts      # LRU 内存缓存管理器（60s TTL，最大 100 条目）
│   │   │   ├── afk.ts        # AFK 检测器（键盘/鼠标活动监听）
│   │   │   └── *.test.ts     # 单元测试
│   │   ├── services/         # 服务层（ServiceDescriptor 注册表模式）
│   │   │   ├── registry.ts   # 服务注册表：kind → ServiceDescriptor 映射
│   │   │   ├── types.ts      # QuotaProvider / StatusBarRenderer / DetailProvider 接口
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
│   │       └── index.ts      # 命令注册
│   ├── resources/            # 图标、截图等资源
│   ├── package.json          # 扩展清单
│   └── ...
├── chrome/                   # Chrome / Edge 浏览器扩展（Manifest V3）
│   ├── manifest.json
│   ├── background.js         # Service Worker：Cookie 监控、推送逻辑
│   ├── popup/                # 弹窗面板
│   ├── dashboard/            # 独立 Dashboard 页面
│   └── ...
├── firefox/                  # Firefox 浏览器扩展（Manifest V3）
│   ├── manifest.json
│   └── ...（结构与 chrome/ 一致）
├── build.sh                  # 打包脚本（VSCode + Chrome + Firefox）
└── README.md
```

### VSCode 扩展架构

项目采用 **ServiceDescriptor 注册表模式**，每个 AI 服务是一个完整的「包」，包含数据提供者、仪表盘模板、样式和设置元数据：

```typescript
interface ServiceDescriptor {
  kind: ServiceId;                    // 'glm' | 'kimi' | 'mimo' | ...
  displayName: string;                // 'GLM Coding Plan (CN)'
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
      │  1. 监控目标网站 Cookie 变化            │
      ├───────────────────────────────────────▶│
      │                                        │
      │  2. 启动本地 HTTP 服务器 (localhost)    │
      │◀───────────────────────────────────────┤
      │                                        │
      │  3. GET /health (获取动态 token + port) │
      │◀───────────────────────────────────────┤
      │                                        │
      │  4. POST /cookies                       │
      │     (含目标域名 + 过滤后的 Cookie 字段)  │
      ├───────────────────────────────────────▶│
      │                                        │ 5. 验证 token
      │                                        │ 6. 更新 Secret Storage
      │                                        │ 7. 触发配额刷新
      │                                        │
      │  8. 返回成功响应                        │
      │◀───────────────────────────────────────┤
```

**安全机制**：
- 动态 Token 认证（每次 VSCode 启动生成随机 token）
- PID 后缀端口文件，避免多 VSCode 实例冲突
- Cookie 推送时过滤敏感字段（`httpOnly` / `secure` / `expirationDate`）
- 请求体大小限制（≤ 1MB），防止 DoS
- POST 请求 5 秒超时
- 所有浏览器扩展页面使用 `createElement`/`textContent` 替代 `innerHTML`，并配置 CSP

### 数据流

```
pollAll() 定时触发
    │
    ├─ AFK 检测（用户无操作超阈值则跳过本次刷新）
    ├─ AsyncQueue 串行执行，消除并发竞态
    ├─ 遍历 ServiceProfile
    │   ├─ 检查 LRU 内存缓存 (60s TTL)
    │   ├─ resolveProvider(kind) → QuotaProvider.fetch(key, endpoint)
    │   ├─ 返回 ServiceData（服务可扩展专属字段）
    │   └─ attachHistory() 合并本地持久化历史数据
    │
    ├─ StatusBar.feed() → flush()（每服务一个状态栏项，定制渲染）
    ├─ DashboardWebviewViewProvider.update() → postMessage
    └─ saveHistory() → globalState 持久化
```

### 配置存储

| 数据 | 存储位置 | Key | 说明 |
|------|---------|-----|------|
| 服务列表 | `globalState` | `services` | 服务配置（id、kind、displayName、endpoint） |
| API Keys / Cookie | `Secret Storage` | `apiKeys.{serviceId}` | 加密存储，安全隔离 |
| 刷新间隔 | `globalState` | `refreshInterval` | 默认 600 秒 |
| 预警阈值 | `globalState` | `warnThreshold` | 默认 0.8 (80%) |
| AFK 阈值 | `globalState` | `afkThreshold` | 默认 3600 秒 |
| 历史数据 | `globalState` | `aiQuotaDashboard.history` | 最多保留 30 天，按日期去重合并 |

### 扩展新 AI 服务

1. 在 `vscode/src/services/` 创建新目录（结构参考 `glm/`、`kimi/` 或 `mimo/`）
2. 实现 `QuotaProvider` 接口（`provider.ts`）—— 数据拉取与解析
3. 定义扩展数据类型（`types.ts`）—— 继承 `ServiceData`
4. 编写仪表盘卡片模板（`template.ts`）—— 注册到 `serviceTemplates.{kind}`
5. 编写专属样式（`styles.ts`）
6. 编写设置元数据（`settings.ts`）—— 驱动设置页渲染
7. **可选**：实现 `StatusBarRenderer` 接口（`statusBar.ts`），否则状态栏显示 `?`
8. **可选**：实现 `DetailProvider` 接口（`provider.ts`）+ `mergeDetailData`，支持仪表盘详情懒加载。两者需同时提供
9. 组装 `ServiceDescriptor`（`index.ts`）
10. 在 `vscode/src/services/registry.ts` 注册

---

## 开发指南

### 环境要求

- **VSCode**: 1.80+
- **Node.js**: 18+
- **浏览器**: Chrome 109+ / Edge 109+ / Firefox 109+

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

浏览器扩展为纯 JavaScript，**无需构建步骤**。

```bash
# Chrome / Edge
cd chrome
# 直接在浏览器中加载已解压的扩展（chrome://extensions/ → 开发者模式 → 加载已解压）

# Firefox
cd firefox
# 在 about:debugging#/runtime/this-firefox 中临时载入 manifest.json
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
| `src/storage/persistence.test.ts` | 历史数据加载、保存、合并、清理 |
| `src/ui/statusBarRenderer.test.ts` | 倒计时格式化、颜色计算 |

### 打包发布

```bash
# 打包所有扩展（VSCode + Chrome + Firefox）
./build.sh

# 输出目录
build/
├── ai-quota-dashboard-*.vsix       # VSCode 扩展
├── ai-quota-cookie-bridge-chrome.zip   # Chrome / Edge 浏览器扩展
└── ai-quota-cookie-bridge-firefox.zip  # Firefox 浏览器扩展
```

---

## 常见问题

### Q: 状态栏显示 `?` 是什么意思？

**A**: 该服务未实现 `StatusBarRenderer` 接口。状态栏无法识别如何渲染此服务的配额信息。如需支持，请为对应服务包添加 `statusBar.ts`。

### Q: GLM 提示「鉴权失败」怎么办？

**A**: API Key 无效或已过期。请登录 [GLM 开放平台](https://open.bigmodel.cn/) 重新生成 API Key，并在设置页更新。

### Q: Kimi 提示「鉴权失败」，但 Cookie 已同步？

**A**: Kimi 使用的是 JWT Token（`kimi-auth` Cookie），不是 API Key。请确保浏览器扩展正确同步了 `kimi.com` 域下的 Cookie，或手动从开发者工具中获取 `kimi-auth` 的值。

### Q: 仪表盘数据不更新，状态栏也没有变化？

**A**: 可能原因：
1. **缓存未过期**：LRU 缓存 TTL 为 60 秒，可点击刷新按钮手动清空缓存
2. **AFK 状态**：用户长时间无操作后自动暂停刷新，移动鼠标或按下键盘即可恢复
3. **网络问题**：检查 VSCode Output Channel「AI Quota Dashboard」中的请求日志

### Q: 历史数据丢失或显示不完整？

**A**: 历史数据保留策略为 **30 天**，超期自动清理。如需长期保存，请定期导出备份。同一天内按日期去重合并，优先保留信息更完整的数据点。

### Q: 浏览器扩展无法连接 VSCode？

**A**: 
1. 重启 VSCode，确保 Bridge 服务器已启动
2. 检查 VSCode Output Channel「AI Quota Dashboard」中的日志
3. 浏览器扩展会自动重连，等待几秒后重试
4. 确认浏览器扩展弹窗中显示的「VSCode 状态」为已连接

### Q: Cookie Bridge 推送失败，提示 Token 不匹配？

**A**: 
- 每次 VSCode 启动时会生成新的动态 Token
- 浏览器扩展会自动通过 `/health` 端点获取最新 Token
- 如仍失败，尝试在浏览器扩展弹窗中手动点击「同步」按钮

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
| 数据存储 | `globalState` + Secret Storage |
| 可视化 | Webview (内联 HTML/CSS/JS + SVG 图表) |
| 浏览器扩展 | Chrome Extension Manifest V3 |

---

## 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

### [0.3.0] - 2026-06-02

**新增**

- 🌉 **浏览器扩展（Cookie Bridge）**：Chrome/Edge 和 Firefox 双平台支持，自动同步 `kimi.com` 和 `xiaomimimo.com` Cookie
- 🔐 **双模式认证**：`manual`（手动输入）和 `bridge`（浏览器自动同步）
- ⚡ **LRU 内存缓存**：限制最大 100 条目，防止内存泄漏
- ⚡ **AsyncQueue 并发控制**：Promise-based 串行队列，消除竞态条件

**安全**

- XSS 防护：浏览器扩展全部使用 `createElement`/`textContent` 替代 `innerHTML`
- Content Security Policy：为所有 HTML 页面添加 CSP 策略
- 敏感字段过滤：Cookie 推送时移除 `httpOnly`/`secure`/`expirationDate`
- PID 后缀端口文件：避免多 VSCode 实例冲突

[查看完整更新日志 →](vscode/CHANGELOG.md)

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. **Fork** 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
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
- 优先使用专用工具（Read/Write/Edit）而非系统命令操作文件

---

## 许可证

[MIT](LICENSE) © [Zheng404](https://github.com/Zheng404)

---

<p align="center">
  如果本项目对你有帮助，请给个 ⭐ Star 支持一下！
</p>
