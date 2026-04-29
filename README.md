# AI Usage Monitor

> VSCode 扩展插件 — AI Coding Plan 配额用量仪表盘。实时追踪 GLM Coding Plan、Kimi Membership 等 AI 服务的配额消耗情况，帮助开发者避免超额使用。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 功能特性

| 特性 | 说明 |
|------|------|
| **多服务支持** | GLM Coding Plan (CN)、Kimi Membership，易于扩展更多 AI 服务 |
| **实时仪表盘** | 侧边栏 Webview 展示配额进度、用量统计、历史趋势 |
| **状态栏监控** | 底部状态栏实时显示配额使用率和倒计时 |
| **智能 AFK 检测** | 用户长时间无操作后自动暂停刷新，节省资源 |
| **配额预警** | 使用率超过阈值时显示警告颜色 |
| **GLM 详情分析** | 模型用量 / 工具用量详情，支持 SVG 曲线图展示 |
| **数据本地存储** | 所有配额数据存储在本地，不上传云端 |

## 支持的服务

| 服务 | 鉴权方式 | 特色功能 |
|------|---------|---------|
| GLM Coding Plan (CN) | API Key (Bearer Token) | 配额卡片 + 模型/工具用量详情 + SVG 曲线图 |
| Kimi Membership | JWT Token (浏览器 Cookie) | 配额进度条 + 子限额展示 |

## 安装

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/Zheng404/ai_usage_monitor_vscode.git
cd ai_usage_monitor_vscode

# 安装依赖
npm install

# 编译
npm run compile

# 在 VSCode 中按 F5 启动调试，或打包安装
```

### VSCode 市场（待发布）

搜索 "AI Usage Monitor" 并安装。

## 快速开始

1. 安装插件后，点击左侧活动栏的 **脉冲图标** (AI 配额) 打开仪表盘
2. 切换到「设置」标签，添加你的 AI 服务：
   - **GLM**: 输入 API Key（从 [GLM 开放平台](https://open.bigmodel.cn/) 获取）
   - **Kimi**: 输入浏览器 Cookie 中的 JWT Token（按 F12 → Application → Cookies → kimi.com → 复制 `kimi-auth` 的值）
3. 返回「仪表盘」标签查看实时配额使用情况

## 使用指南

### 命令面板

按 `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)，输入以下命令：

| 命令 | 功能 |
|------|------|
| `AI Usage Monitor: 刷新配额` | 清空缓存并重新拉取所有服务数据 |
| `AI Usage Monitor: 打开配额面板` | 聚焦侧边栏仪表盘 |
| `AI Usage Monitor: 打开设置` | 聚焦仪表盘并切换到设置标签 |
| `AI Usage Monitor: 清除历史` | 仅清除历史数据 |
| `AI Usage Monitor: 重置数据` | 删除所有配置、API Key、历史记录 |

### 全局设置

在「设置 → 全局设置」中可以调整：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 自动刷新间隔 | 600 秒 | 设为 0 禁用自动刷新 |
| 配额预警阈值 | 0.8 (80%) | 使用率超过此值显示警告 |
| AFK 检测阈值 | 3600 秒 | 无操作超此时长后暂停刷新 |

## 开发

```bash
# 编译 TypeScript
npm run compile

# 监听模式开发
npm run watch

# ESLint 检查
npm run lint

# 运行测试
npm test

# 监听模式运行测试
npm run test:watch
```

### 环境要求

- VSCode 1.80+
- Node.js 18+

## 架构

项目采用 **ServiceDescriptor 注册表模式**，每个 AI 服务是一个完整的「包」：

```
src/
├── extension.ts              # 扩展入口
├── core/                     # 核心模块
│   ├── types.ts              # 基础类型
│   ├── config.ts             # 配置管理
│   ├── fetch.ts              # HTTP 工具
│   ├── format.ts             # 格式化
│   ├── cache.ts              # 内存缓存 (60s TTL)
│   ├── afk.ts                # AFK 检测器
│   └── *.test.ts             # 单元测试
├── services/                 # 服务层
│   ├── registry.ts           # 服务注册表
│   ├── types.ts              # 接口定义
│   ├── glm/                  # GLM 服务包
│   └── kimi/                 # Kimi 服务包
├── storage/
│   └── persistence.ts        # 历史数据持久化
├── ui/
│   ├── statusbar.ts          # 状态栏管理
│   └── statusBarRenderer.ts  # 状态栏渲染器接口
├── dashboard/                # 侧边栏 Webview
│   ├── webviewView.ts        # WebviewViewProvider
│   ├── styles.ts             # 通用样式
│   └── templates/            # 模板系统
│       ├── index.ts          # 模板组装入口
│       ├── shared.ts         # 共享渲染函数
│       └── settings.ts       # 设置页渲染
├── commands/
│   └── index.ts              # 命令注册
└── test/
    └── mocks/
        └── vscode.ts         # VSCode API mock
```

### 新增 AI 服务

1. 在 `src/services/` 创建新目录（结构参考 `glm/` 或 `kimi/`）
2. 实现 `QuotaProvider` 接口（`provider.ts`）
3. 定义扩展数据类型（`types.ts`）
4. 编写仪表盘卡片模板（`template.ts`，需注册到 `serviceTemplates.{kind}`）
5. 编写专属样式（`styles.ts`）
6. 编写设置元数据（`settings.ts`）
7. 可选：实现 `StatusBarRenderer` 接口（`statusBar.ts`），否则状态栏显示 `?`
8. 可选：实现 `DetailProvider` 接口（`provider.ts`）+ `mergeDetailData`，支持仪表盘详情懒加载。两者需同时提供
9. 组装 ServiceDescriptor（`index.ts`）
10. 在 `src/services/registry.ts` 注册

## 数据流

```
pollAll() 定时触发
    │
    ├─ AFK 检测（超阈值则跳过）
    ├─ 遍历启用的 ServiceProfile
    │   ├─ 检查内存缓存 (60s TTL)
    │   ├─ resolveProvider(kind) → QuotaProvider.fetch(key, endpoint)
    │   ├─ 返回 ServiceData
    │   └─ attachHistory() 合并历史数据
    │
    ├─ StatusBar.feed() → flush()
    ├─ DashboardWebviewViewProvider.update() → postMessage
    └─ saveHistory() → globalState 持久化
```

## 配置存储

| 数据 | 存储位置 | Key |
|------|---------|-----|
| 服务列表 | `globalState` | `services` |
| API Keys | `Secret Storage` | `apiKeys.{serviceId}` |
| 刷新间隔 | `globalState` | `refreshInterval` |
| 预警阈值 | `globalState` | `warnThreshold` |
| AFK 阈值 | `globalState` | `afkThreshold` |
| 历史数据 | `globalState` | `aiUsageMonitor.history` |

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 运行时 | Node.js (VSCode Extension Host) |
| 框架 | VSCode Extension API |
| 构建 | tsc |
| 代码检查 | ESLint + @typescript-eslint |
| 数据存储 | globalState + Secret Storage |
| 可视化 | Webview (HTML/CSS/JS + SVG) |

## 已知问题

1. 配置未完全接入 VSCode Settings API — 代码仍读写 `globalState`
2. Webview JS 为字符串拼接，无类型检查
3. `warnThreshold` 配置声明但未实际触发警告通知

## License

MIT © [Zheng404](https://github.com/Zheng404)
