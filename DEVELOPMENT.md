# 开发者指南

> 本文档面向希望为 AI Quota Dashboard 贡献代码或进行二次开发的开发者。内容涵盖 VSCode 扩展和浏览器扩展的完整开发流程。

---

## 目录

- [前置要求](#前置要求)
- [项目结构概览](#项目结构概览)
- [VSCode 扩展开发](#vscode-扩展开发)
  - [环境搭建](#环境搭建)
  - [编译与运行](#编译与运行)
  - [调试（F5）](#调试f5)
  - [架构设计：ServiceDescriptor 模式](#架构设计servicedescriptor-模式)
  - [如何添加新的 AI 服务](#如何添加新的-ai-服务)
- [浏览器扩展开发](#浏览器扩展开发)
  - [本地测试加载](#本地测试加载)
  - [调试 Service Worker](#调试-service-worker)
  - [Chrome 与 Firefox 的差异](#chrome-与-firefox-的差异)
- [测试](#测试)
  - [运行单元测试](#运行单元测试)
  - [测试结构](#测试结构)
  - [Mock VSCode API](#mock-vscode-api)
- [构建与打包](#构建与打包)
  - [使用 build.sh](#使用-buildsh)
  - [手动打包](#手动打包)
  - [创建 VSIX](#创建-vsix)
- [CI/CD 概览](#cicd-概览)
- [代码风格与 Lint](#代码风格与-lint)
- [常见问题排查](#常见问题排查)

---

## 前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| **Node.js** | ≥ 18（推荐 20.x） | 运行 TypeScript 编译、测试和打包 |
| **npm** | 随 Node.js 安装 | 包管理器 |
| **VSCode** | ≥ 1.80 | 运行和调试 VSCode 扩展 |
| **Chrome / Edge** | ≥ 116 | 测试浏览器扩展（Manifest V3） |
| **Firefox** | ≥ 116 | 测试 Firefox 版本（Manifest V3） |
| **vsce** | 全局安装 | 打包 VSIX：`npm install -g @vscode/vsce` |
| **Git** | 任意 | 版本控制 |

```bash
# 验证环境
node --version   # v20.x.x
npm --version    # 10.x.x
vsce --version   # 3.x.x
```

---

## 项目结构概览

```
ai_quota_dashboard_vscode/
├── vscode/                     # VSCode 扩展
│   ├── src/
│   │   ├── extension.ts        # 扩展入口
│   │   ├── core/               # 核心模块（类型、缓存、格式化、AFK 检测等）
│   │   ├── services/           # 服务层（ServiceDescriptor 注册表）
│   │   │   ├── registry.ts     # 服务注册中心
│   │   │   ├── types.ts        # QuotaProvider / ServiceDescriptor 接口
│   │   │   ├── glm/            # GLM 服务完整包
│   │   │   ├── kimi/           # Kimi 服务完整包
│   │   │   ├── mimo/           # MiMo 服务完整包
│   │   │   └── bridge/         # Data Bridge 状态服务（kind='bridge'，状态整合在「服务」标签页）
│   │   ├── ui/                 # 状态栏、Webview 仪表盘
│   │   ├── dashboard/          # Webview 模板与样式
│   │   ├── storage/            # 历史数据持久化
│   │   └── test/mocks/         # VSCode API Mock
│   ├── package.json            # 扩展清单与脚本
│   ├── tsconfig.json           # TypeScript 配置（strict 模式）
│   └── eslint.config.mjs       # ESLint 配置
├── browser-common/             # 浏览器扩展共享代码（Chrome/Firefox 共用）
│   ├── cache.js / config.js    # 缓存与配置管理
│   ├── shared-ui.js            # Popup/Dashboard 共享 UI 工厂（createSharedUI，页面差异经选项注入）
│   ├── popup.html / popup.js   # Popup 仪表盘（页面专属逻辑，主体由 shared-ui.js 承载）
│   ├── dashboard.html / dashboard.js # 独立 Dashboard 页面（同上）
│   ├── templates.js            # 卡片模板
│   ├── styles.css              # 样式表
│   ├── api/                    # API 客户端（glm/kimi/mimo）
│   ├── protocol/               # Data Bridge 协议共享层（双端单一可信源）
│   └── scripts/
│       ├── background.js       # Service Worker 瘦入口（init + 事件注册 + 编排）
│       ├── lib/                # background 子模块（发布态经 esbuild 内联进 IIFE bundle）
│       └── kimi-content.js     # Kimi content script（镜像 kimi.com localStorage 令牌）
├── chrome/                     # Chrome/Edge 专属（仅 manifest + icons）
│   ├── manifest.json           # Manifest V3
│   └── icons/
├── firefox/                    # Firefox 专属（仅 manifest + icons）
│   ├── manifest.json           # Manifest V3 + browser_specific_settings.gecko
│   └── icons/
├── build.sh                    # 一键打包脚本（staging 组装 → esbuild → zip/VSIX，源码树零接触）
└── .github/workflows/          # CI/CD 工作流
    ├── ci.yml                  # 持续集成
    └── release.yml             # 发版自动发布
```

---

## VSCode 扩展开发

### 环境搭建

```bash
# 1. 进入 VSCode 扩展目录
cd vscode

# 2. 安装依赖
npm install

# 3. 验证类型检查
npm run compile

# 4. 产出构建产物（F5 调试前必需）
npm run build
```

### 编译与运行

| 命令 | 作用 |
|------|------|
| `npm run compile` | `tsc` 纯类型检查（noEmit，不产出文件） |
| `npm run build` | esbuild 打包：extension → `out/extension.js`（cjs）、webview → `media/dashboard.js`（iife） |
| `npm run watch` | esbuild 监听模式（extension/webview 两个 bundle 同时监听，文件变更自动重建） |
| `npm run clean` | 清理 `out/` 与 `media/` 构建产物 |
| `npm run build:browser` | esbuild 打包浏览器扩展 background（IIFE → `build/staging/{chrome,firefox}/scripts/background.js`） |
| `npm run lint` | 运行 ESLint 检查代码风格 |
| `npm test` | 运行 vitest 单元测试（一次性） |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run vscode:prepublish` | 发布前预检（`clean && compile && build`，vsce 打包时自动触发） |

```bash
cd vscode

# 开发模式（终端 1：监听两个 bundle 重建）
npm run watch

# 开发模式（终端 2：监听测试）
npm run test:watch
```

### 调试（F5）

> **前置条件**：先在 `vscode/` 目录执行 `npm run build`（`out/extension.js` 与 `media/dashboard.js` 为 esbuild 产物，`npm run compile` 只做类型检查不产出文件）；日常开发可保持 `npm run watch` 自动重建。

1. 在 VSCode 中打开**项目根目录**作为工作区
2. 按 `F5` 或点击左侧「运行和调试」→「Run Extension」
3. 这会启动一个新的 **Extension Development Host** 窗口
4. 在新窗口中：
   - 侧边栏会出现「AI 配额」图标
   - 命令面板可使用所有 `aiQuotaDashboard.*` 命令
5. 在原窗口的「调试控制台」可查看日志输出

**断点调试**：在源码中设置断点，Extension Host 会暂停并允许单步调试。

```json
// .vscode/launch.json（位于项目根目录）
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}/vscode"],
      "outFiles": ["${workspaceFolder}/vscode/out/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

### 架构设计：ServiceDescriptor 模式

本项目采用**注册表模式**管理各 AI 服务。每个服务是一个独立的「包」，包含完整的数据流和渲染逻辑。

```typescript
// src/services/types.ts
interface ServiceDescriptor {
  kind: ServiceId;                    // 服务标识，如 'glm' | 'kimi' | 'mimo' | 'bridge'
  displayName: string;                // 显示名称
  defaultName: string;                // 默认自定义名称
  badgeLabel: string;                 // 徽章文字
  badgeCssClass: string;              // 徽章 CSS 类
  provider: QuotaProvider;            // 数据拉取逻辑
  styles: string;                     // 专属 CSS
  settings: ServiceSettingsDescriptor; // 设置表单元数据
  statusBarRenderer?: StatusBarRenderer;   // 状态栏渲染器（可选）
  detailProvider?: DetailProvider;         // 详情懒加载提供者（可选）
  mergeDetailData?(existing, detail, range): void; // 合并详情数据
  helpCommand?: string;               // 帮助命令标识
  helpMessage?: string;               // 帮助提示内容
}
```

> 注：卡片渲染不再属于 ServiceDescriptor（早期 `templateScript` 字段已随构建链移除）——仪表盘卡片为 `src/webview/cards/{kind}.ts` TS 模块，构建期编译进 `media/dashboard.js`，在 `src/webview/main.ts` 显式注册。

**数据流**：

> 以下路径相对于 `vscode/src/`。

```
pullAll() 定时触发
    ├─ AFK 检测（超阈值则跳过）
    ├─ AsyncQueue 串行执行（消除并发竞态）
    ├─ 遍历 ServiceProfile
    │   ├─ 命中 LRU 内存缓存 → 直接使用旧数据
    │   └─ 未命中 → refreshingIds.add(id) → resolveProvider(kind).fetch()
    │        └─ fetch 完成后 refreshingIds.delete(id)
    ├─ updateView() 先推一次（旧数据 + refreshingIds）→ 前端按钮转圈、卡片不中断
    ├─ StatusBar.feed() → flush()
    ├─ DashboardWebviewViewProvider.update() → postMessage（含 refreshingIds）
    ├─ saveHistory() → globalState 持久化
    └─ checkQuotaWarnings() → 超阈值弹出 VSCode 警告通知（30 分钟冷却）
```

> **无缝刷新**：`refreshingIds: Set<string>` 标记正在刷新的服务，随 `updateData` 推送给前端。刷新时保留旧数据，对应服务卡片刷新按钮旋转（`.spinning svg`）；首次加载/新增服务时显示轻量加载骨架卡（`renderLoadingCard`）。仪表盘采用三个平级 tab：仪表盘 / 服务 / 设置。

> **Bridge 按需启停**：Bridge 服务器**仅在用户添加了 Data Bridge 服务后启动**（`syncBridgeLifecycle` → `ensureBridgeRunning`），移除后自动关闭（`stopBridgeIfIdle`）。浏览器扩展推送配额数据后，VSCode 的 `handleDataPayload()`（`extension.ts`）会**自动创建/更新**对应的 AI 服务（标记 `dataSource='bridge'`，无需凭证）：推送的 `serviceData` 写入 `bridgeDataStore`（模块级 Map，活到下次推送），bridge 数据源的 AI 服务**不再发网络请求、不需要也不存储 Secret 凭证**。Secret Storage 中历史遗留的 bridge 凭证由一次性迁移 `migrateBridgeCredentials()` 清理（标记 `aiQuotaDashboard.bridgeSecretsCleared`，须先于 `migrateBridgeDataSource()` 执行——后者会把缺失 `dataSource` 的旧 profile 落盘为 `manual`，顺序颠倒会导致清理条件失效）。分发查找只接管 `dataSource='bridge'` 的服务：已存在同 kind 的 manual 服务时另行新建 bridge-fed 服务并存，绝不修改 manual profile、绝不删除其 Secret（见 `bridge/targets.ts` 纯函数 `resolveBridgeTargets`）。bridge-fed 服务**不在服务标签页单独展示**（状态整合在 Data Bridge 条目内）；移除 Data Bridge 服务时级联移除全部 bridge-fed 服务（纯派生可自动重建），改为手动输入的路径是「移除 Data Bridge 服务 → 手动添加同 kind 服务」。Bridge 状态（连接徽章、最后同步、已接收数据种类标签）整合在「服务」标签页的 Bridge 服务条目内，不在仪表盘单独显示卡片。

**注册服务**：在 `src/services/registry.ts` 中导入并注册：

```typescript
import { myServiceDescriptor } from './myservice';

const _defaultRegistry = createRegistry([
  glmDescriptor,
  kimiDescriptor,
  mimoDescriptor,
  bridgeDescriptor,
  myServiceDescriptor,  // ← 新服务加在这里
]);
```

### 如何添加新的 AI 服务

假设要添加一个名为 `nova` 的新服务，步骤如下：

#### 第 1 步：创建服务目录

```bash
cd vscode/src/services
mkdir nova
touch nova/index.ts nova/provider.ts nova/types.ts nova/template.ts \
      nova/styles.ts nova/settings.ts nova/statusBar.ts
```

#### 第 2 步：实现数据提供者

```typescript
// nova/provider.ts
import { QuotaProvider } from '../types';
import { ServiceData, QuotaSlot } from '../../core/types';
import { httpRequest } from '../../core/fetch';

export const novaProvider: QuotaProvider = {
  kind: 'nova',
  async fetch(apiKey: string, endpoint?: string): Promise<ServiceData> {
    const url = endpoint || 'https://api.nova.example/v1/quota';
    const res = await httpRequest(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const json = JSON.parse(res);

    const slots: QuotaSlot[] = [{
      label: '每日额度',
      percent: json.data.used / json.data.limit * 100,
      used: json.data.used,
      limit: json.data.limit,
      resetsAt: json.data.resetTime,
    }];

    return {
      id: 'placeholder',  // 由上层填充
      name: 'Nova',
      kind: 'nova',
      slots,
      updatedAt: Date.now(),
    };
  }
};
```

#### 第 3 步：定义扩展类型（可选）

```typescript
// nova/types.ts
import { ServiceData } from '../../core/types';

export interface NovaServiceData extends ServiceData {
  tier?: string;        // 套餐等级
  region?: string;      // 服务区域
}
```

#### 第 4 步：编写 Webview 卡片渲染模块

```typescript
// src/webview/cards/nova.ts
import { registerCard } from '../shared';
import type { WebviewServiceData } from '../types';
// 共享渲染工具（escapeHtml / fmtNum / SVG 图表等）经模块 import，类型安全
import { escapeHtml, fmtNum } from '../shared';

export function registerNovaCard() {
  registerCard('nova', (data: WebviewServiceData) => {
    const slots = data.slots || [];
    let html = '<div class="nova-card">';
    html += '<h3>' + escapeHtml(data.name) + '</h3>';
    slots.forEach((slot) => {
      html += '<div class="quota-row">';
      html += '<span>' + escapeHtml(slot.label) + '</span>';
      html += '<div class="progress-bar">';
      html += '<div class="progress-fill" style="width:' + slot.percent + '%"></div>';
      html += '</div>';
      html += '<span>' + Math.round(slot.percent) + '%</span>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  });
}
```

随后在 `src/webview/main.ts` 顶部显式注册：

```typescript
import { registerNovaCard } from './cards/nova';
registerNovaCard();
```

> 卡片经 esbuild 构建期编译进 `media/dashboard.js`（IIFE bundle），由 `shared.ts` 的 `renderService(data)` 按 `data.kind` 从内置注册表分发；未注册 kind 显式报错。无 inline script、无字符串模板注入。

#### 第 5 步：编写专属样式

```typescript
// nova/styles.ts
export const NOVA_STYLES = `
  .nova-card {
    padding: 16px;
    border-radius: 8px;
    background: var(--vscode-editor-background);
  }
  .nova-card h3 {
    margin: 0 0 12px 0;
    color: var(--vscode-foreground);
  }
  .quota-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--vscode-progressBar-background);
    transition: width 0.3s ease;
  }
`;
```

#### 第 6 步：编写设置元数据

```typescript
// nova/settings.ts
import { ServiceSettingsDescriptor } from '../types';

export const NOVA_SETTINGS: ServiceSettingsDescriptor = {
  keyPlaceholder: 'API Key',
  keyHint: '在 Nova 控制台获取 API Key',
  showHelpButton: true,
};
```

AI 服务默认 `dataSource='manual'`（手动输入）。服务标签页根据 `dataSource` 渲染三种形态：
- `manual`：显示输入框 + 提示
- `bridge`（由 Data Bridge 推送得到）：不在服务列表单独展示（状态整合在 Data Bridge 条目内）；移除 Data Bridge 服务时级联移除（纯派生，浏览器下次推送自动重建）
- `kind='bridge'` 服务本身：显示 Bridge 连接状态徽章

若希望新服务支持 Data Bridge 推送，还需在浏览器扩展 `relay.js` 的 `gatherAllQuotaData()` 中复用 `api/` fetcher、用自身凭证采集该服务配额数据；VSCode 端 `extension.ts` 的 `handleDataPayload` 接收逻辑按 `kind` 匹配（内置 `glm`/`kimi`/`mimo`）。

#### 第 7 步：实现状态栏渲染器（可选）

```typescript
// nova/statusBar.ts
import { StatusBarRenderer, StatusBarSegment, TooltipMeta, TooltipQuotaLine } from '../../ui/statusBarRenderer';
import { NovaServiceData } from './types';

export const novaStatusBarRenderer: StatusBarRenderer<NovaServiceData> = {
  filterSlots(data) {
    return data.slots.map(s => ({
      text: `${Math.round(s.percent)}%`,
      percent: s.percent,
      resetsAt: s.resetsAt,
    }));
  },
  buildTooltipMeta(data) {
    return { title: data.name, subtitle: data.tier || '' };
  },
  buildTooltipQuotas(data) {
    return data.slots.map(s => ({
      label: s.label,
      percent: s.percent,
      detail: s.limit ? `${s.used}/${s.limit}` : undefined,
    }));
  }
};
```

#### 第 8 步：组装 ServiceDescriptor

```typescript
// nova/index.ts
import { ServiceDescriptor } from '../types';
import { novaProvider } from './provider';
import { NOVA_STYLES } from './styles';
import { NOVA_SETTINGS } from './settings';
import { novaStatusBarRenderer } from './statusBar';

export const novaDescriptor: ServiceDescriptor = {
  kind: 'nova',
  displayName: 'Nova AI Platform',
  defaultName: 'Nova',
  badgeLabel: 'NOVA',
  badgeCssClass: 'badge-nova',
  provider: novaProvider,
  styles: NOVA_STYLES,
  settings: NOVA_SETTINGS,
  statusBarRenderer: novaStatusBarRenderer,
  helpCommand: 'showNovaHelp',
  helpMessage: '请访问 https://nova.example.com/settings/api 获取 API Key',
};
```

#### 第 9 步：注册到全局注册表

```typescript
// src/services/registry.ts
import { novaDescriptor } from './nova';

const _defaultRegistry = createRegistry([
  glmDescriptor,
  kimiDescriptor,
  mimoDescriptor,
  bridgeDescriptor,
  novaDescriptor,  // ← 添加
]);
```

#### 第 10 步：添加样式到仪表盘

样式通过注册表**自动聚合**（`styles.ts` 遍历 `getAllDescriptors()` 收集每个服务的 `desc.styles`），无需手动编辑聚合代码。只需在 `nova/styles.ts` 导出 `NOVA_STYLES` 并在 `nova/index.ts` 的 descriptor 中设置 `styles: NOVA_STYLES` 即可：

**注意事项**：
- `ServiceProfile` 的 `dataSource` 字段决定数据来源：`'manual'`（用户手动输入凭证）或 `'bridge'`（浏览器扩展推送配额数据）
- 新增 AI 服务时默认 `dataSource='manual'`；浏览器扩展推送该 kind 的配额数据后，`handleDataPayload` 会自动创建/更新对应服务并标记 `'bridge'`
- Bridge 服务（`kind='bridge'`）固定 `dataSource='bridge'`，仅用于展示浏览器扩展连接状态
- 同一 kind 的 bridge 来源服务由推送自动创建/更新；已知行为：bridge-fed 服务被移除后，若浏览器仍推送该 kind 会自动重建

### 配置存储与 Bridge 状态持久化

VSCode 扩展的配置与状态持久化位置如下：

| 数据 | 存储位置 | Key | 说明 |
|------|---------|-----|------|
| 服务列表 | `globalState` | `services` | `ServiceProfile[]`，含 `dataSource` 字段（`manual` 或 `bridge`） |
| API Keys / Cookie | `Secret Storage` | `apiKeys.{serviceId}` | 每个 profile 独立存储，仅 `manual` 来源服务使用；bridge 数据源服务不存储凭证 |
| 刷新间隔 | `globalState` + Settings | `refreshInterval` / `aiQuotaDashboard.refreshInterval` | 默认 600 秒，同步写入 Settings |
| 预警阈值 | `globalState` + Settings | `warnThreshold` / `aiQuotaDashboard.warnThreshold` | 默认 0.8，超阈值触发警告通知（30 分钟冷却） |
| AFK 阈值 | `globalState` + Settings | `afkThreshold` / `aiQuotaDashboard.afkThreshold` | 默认 3600 秒，同步写入 Settings |
| 历史数据 | `globalState` | `aiQuotaDashboard.history` | 30 天保留，UTC 按日期去重 |
| **Bridge 连接状态** | `globalState` | `aiQuotaDashboard.bridgeState` | 由 `bridge/state.ts` 维护（内存 + globalState 双层） |
| **迁移标记** | `globalState` | `aiQuotaDashboard.bridgeSecretsCleared` | bridge 凭证一次性迁移清理（Secret Storage 历史遗留凭证）完成后写入 |

**Bridge 状态说明**：

- `aiQuotaDashboard.bridgeState` 保存 Bridge 的运行状态：`connected`、`lastPushAt`、`receivedKinds`（已接收配额数据的服务种类数组）、`lastError`。
- 浏览器扩展推送配额数据后，`handleDataPayload` 先更新该状态摘要，再**自动创建/更新**对应的 AI 服务（标记 `dataSource='bridge'`）：推送的 `serviceData` 写入 `bridgeDataStore`（模块级 Map，活到下次推送），最后**热重载**刷新（保留旧数据 + 标记 refreshingIds + `updateView()`）。
- Bridge 状态（连接徽章、最后同步、已接收数据种类标签、诊断）整合在「服务」标签页的 Bridge 服务条目内（`settings.ts` 的 `renderServiceItem`），不在仪表盘单独显示卡片。`bridge/provider.ts` 读取 `bridgeState` 生成数据，不拉取远程 API。
- bridge 数据源的 AI 服务不再发网络请求、不需要也不存储 Secret 凭证；历史遗留 bridge 凭证由一次性迁移 `migrateBridgeCredentials()` 清理。
- Bridge 服务器**按需启停**：`syncBridgeLifecycle` 检查是否存在 `kind='bridge'` profile，有则 `ensureBridgeRunning` 启动监听，无则 `stopBridgeIfIdle` 关闭。

---

## 浏览器扩展开发

浏览器扩展（Data Bridge）为**纯 JavaScript**：开发态共享代码为 ESM 直载（manifest `type: module`，无需构建），发布态 background 经 esbuild 打包为 IIFE 单文件（见「构建与打包」）。

### 本地测试加载

> **说明**：`chrome/` 和 `firefox/` 目录仅含 `manifest.json` 和 `icons/`，共享代码在 `browser-common/`。运行 `./build.sh` 后，完整的可加载目录在 `build/staging/{chrome,firefox}/`（共享代码 + IIFE bundle + 改写过 version 的 manifest）；源码树目录全程零接触。

#### Chrome / Edge

1. 在项目根目录运行 `./build.sh` 组装 staging
2. 打开浏览器，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `build/staging/chrome/` 目录
6. 扩展图标会出现在工具栏，点击 `Alt+Q` 可快速打开弹窗

> 想以 ESM 源码态（未 bundle）调试 background：自行组装目录（如 `cp -r browser-common/* chrome-src/` 后补平台 manifest/icons），源码 manifest 本就指向 ESM 源码路径，两浏览器均可直载。

#### Firefox

1. 在项目根目录运行 `./build.sh` 组装 staging
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击「临时载入附加组件」
4. 选择 `build/staging/firefox/manifest.json`
5. 扩展会立即加载，重启浏览器后需重新加载（临时扩展特性）

### 调试 Service Worker

#### Chrome

1. 进入 `chrome://extensions/`
2. 找到「AI Quota Dashboard」，点击「Service Worker」链接
3. 会打开 DevTools，可在 Console 查看日志、在 Sources 设置断点

#### Firefox

1. 进入 `about:debugging#/runtime/this-firefox`
2. 找到扩展，点击「检查」
3. 在「控制台」和「调试器」中查看 Background Script 的运行状态

**关键调试技巧**：在 `scripts/background.js` 中使用 `console.log()` 输出日志，内容会显示在 Service Worker 的 DevTools 控制台中。

### background.js 职责

浏览器扩展作为**统一配额数据推送端**，用自身凭证（Kimi 网页令牌 / MiMo Cookie / GLM API Key）调 API 拉取配额数据，把**配额数据**（而非凭证）推送给 VSCode，VSCode 端自动创建/更新对应的 AI 服务：

**代码结构**：`scripts/background.js` 为瘦入口（仅 init 流程 + 事件监听注册 + 跨模块编排），具体职责拆分在 `scripts/lib/` 六个子模块——`config-sync.js`（监控目标/显示名称/刷新间隔）、`bridge-client.js`（端口发现/推送/重试队列/互斥锁）、`cookie-utils.js`（Cookie 读取/JWT 挑选）、`credential.js`（凭证缓存/TTL/失效探测/后台标签页刷新）、`kimi-relay.js`（Kimi access_token 被动镜像）、`relay.js`（配额数据采集 `gatherAllQuotaData()` / 推送 `relayData(force)` / 防抖）。开发态 ESM 直载，发布态经 esbuild 内联进 IIFE 单文件。

```javascript
// 推送数据示例（POST /data，需携带 X-Auth-Token 头）
{
  source: 'ai-quota-data-bridge',
  timestamp: Date.now(),
  data: [
    { kind: 'glm', serviceData: { /* GlmServiceData：slots/history/扩展字段 */ } },
    { kind: 'kimi', serviceData: { /* KimiServiceData */ } },
    { kind: 'mimo', serviceData: { /* MimoServiceData */ } },
  ],
  activeKinds: ['glm', 'kimi', 'mimo'],
  displayNames: { glm: '我的 GLM' },
}
// 注意：payload 不含任何凭证（Cookie / API Key 均不推送）
```

**核心行为**：

1. **配额数据推送 + VSCode 自动创建/更新**：`relay.js` 的 `gatherAllQuotaData()` 复用 `api/{glm,kimi,mimo}.js` fetcher，用浏览器端自身凭证调 API 拉取全部配额数据，经 `relayData(force)`（保留互斥锁 / 防抖 / 重试队列）推送。VSCode 的 `handleDataPayload` 收到后自动创建/更新对应 AI 服务（`dataSource='bridge'`，无需凭证），并同步移除浏览器已删除的服务（按 `activeKinds`）。
2. **凭证仅浏览器端自用**：`chrome.cookies.onChanged` 监听所有目标域名（`kimi.com`、`xiaomimimo.com`）的 Cookie 变化，**不再触发 Data Bridge 推送**，仅广播 `cookieChanged` 消息触发浏览器端单服务刷新。
3. **定时凭证检测**：通过 `chrome.alarms` 按刷新间隔执行凭证检查（下限 5 分钟）：凭证存在性、过期时间和 API 探测（浏览器自身拉数依赖有效 Cookie），发现失效时通过后台非激活标签页（`loadCredentialViaBackgroundTab`）自动刷新，成功后重新推送配额数据。
4. **端口发现**：启动时遍历 fallback 端口 `[37100..37110]`，对每个端口 `GET /health`（请求头携带打包进扩展的 `X-Bridge-Probe` 探测密钥）探测，密钥校验通过后获取 `authToken` 并维持推送通道。优先尝试上次成功的端口。

> **GLM API Key 说明**：GLM 凭证不是浏览器登录态，而是用户在浏览器扩展 Popup 设置中手动填入、保存在 `chrome.storage.local` 的 API Key，仅供浏览器端拉取 GLM 配额使用，不会推送给 VSCode。

### Chrome 与 Firefox 的差异

| 差异点 | Chrome | Firefox |
|--------|--------|---------|
| **Manifest** | 标准 V3（permissions + content_scripts） | V3 + `browser_specific_settings.gecko` |
| **扩展 ID** | 自动生成 | 需在 manifest 中显式声明 `id` |
| **Background** | `service_worker`（`type: module`） | `scripts` 数组（`type: module`） |
| **Cookie API** | `chrome.cookies` | `chrome.cookies`（Firefox 内置兼容） |
| **凭证刷新** | 后台标签页（`loadCredentialViaBackgroundTab`） | 同左（两端一致） |
| **最小版本** | Chrome 116+ | Firefox 116+ |
| **持久性** | Service Worker 非持久 | 事件页面 |

**代码兼容性**：项目中使用 `const api = typeof browser !== 'undefined' ? browser : chrome;` 做 API 兼容（如已封装）。

```javascript
// 示例：兼容的 Cookie 读取
const api = typeof browser !== 'undefined' ? browser : chrome;

api.cookies.get({ url: 'https://kimi.com', name: 'kimi-auth' })
  .then(cookie => {
    console.log('Cookie value:', cookie?.value);
  });
```

---

## 测试

### 运行单元测试

```bash
cd vscode

# 一次性运行所有测试
npm test

# 监听模式（开发时推荐）
npm run test:watch

# 运行特定测试文件
npx vitest run src/core/cache.test.ts

# 带覆盖率报告
npx vitest run --coverage
```

### 测试结构

测试文件与源码文件**同目录**，命名规范：`{source}.test.ts`

```
src/
├── core/
│   ├── cache.ts
│   ├── cache.test.ts          # ← 测试文件
│   ├── format.ts
│   ├── format.test.ts
│   └── ...
├── services/glm/
│   ├── provider.ts
│   └── provider.test.ts       # ← 测试文件
└── ...
```

**示例测试**：

```typescript
// src/core/cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from './cache';

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it('stores and retrieves data', () => {
    const data = { id: 'test', name: 'Test', kind: 'test', slots: [], updatedAt: Date.now() };
    cache.set('test', data, 60);
    expect(cache.get('test')).toEqual(data);
  });

  it('returns undefined for expired entry', () => {
    const data = { id: 'test', name: 'Test', kind: 'test', slots: [], updatedAt: Date.now() };
    cache.set('test', data, -1); // 已过期
    expect(cache.get('test')).toBeUndefined();
  });
});
```

### Mock VSCode API

由于单元测试在 Node.js 环境中运行，无法直接使用 VSCode API。项目提供了统一的 Mock：

```typescript
// src/test/mocks/vscode.ts
export const ThemeColor = class { constructor(public id: string) {} };
export const window = {
  createStatusBarItem: () => ({
    text: '', color: undefined, tooltip: undefined,
    command: undefined, show: () => {}, hide: () => {}, dispose: () => {},
  }),
};
export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
};
// ... 更多 mock
```

在 `vitest.config.ts` 中配置路径别名，将 `vscode` 模块指向 mock：

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      vscode: '/src/test/mocks/vscode.ts',
    },
  },
});
```

**测试原则**：
- 只测试**纯函数**（数据解析、格式化、计算逻辑）
- 不涉及 Webview 渲染和 VSCode UI 交互
- 使用 `describe` + `it` 组织测试用例
- 断言使用 `expect().toEqual()` / `expect().toBe()` 等 vitest 标准 API

---

## 构建与打包

### 使用 build.sh

项目根目录提供了一键打包脚本，同时打包浏览器扩展和 VSCode 扩展。采用 **staging 架构**：源码树 `chrome/`、`firefox/` 全程零接触，无清理段，构建中断不残留：

```bash
# 在项目根目录执行
./build.sh

# 输出（版本号自动取自 vscode/package.json，无需手工同步）：
# build/
# ├── ai-quota-dashboard-chrome-v1.1.5.zip
# ├── ai-quota-dashboard-firefox-v1.1.5.zip
# ├── ai-quota-dashboard-x.x.x.vsix
# └── staging/               # 组装目录（chrome/ + firefox/，可 unpacked 调试）
```

**脚本流程**：

1. `VERSION` 从 `vscode/package.json` 读取（版本号唯一可信源，消除多处手工同步）
2. 组装 staging：`build/staging/{chrome,firefox}/` = 平台 `manifest.json` + `icons/` + rsync(`browser-common/` 全部；rsync 不可用时回退 cp)
3. `npm --prefix vscode run build:browser`：esbuild 将 background（瘦入口 + `scripts/lib/` + `protocol/`）打包为 IIFE 单文件，覆盖 staging 内的 `scripts/background.js`
4. 改写 **staging 副本** manifest 的 version 后从 staging 打 zip（源码树 manifest 零改动，无需备份/恢复）
5. zip 为显式清单制：`scripts/` 只含 `background.js`（IIFE bundle）+ `kimi-content.js`，`scripts/lib/` 已内联不进包，`protocol/` 因 popup/dashboard 运行时 import 保留进包
6. 检查 `vsce` 是否安装，如已安装则打包 VSCode 扩展（内部触发 `vscode:prepublish = clean && compile && build`）

### 手动打包

#### 浏览器扩展

```bash
# 推荐：直接使用 build.sh（staging 组装 + esbuild + zip 一步到位）
./build.sh

# 仅重建 background bundle（如调试打包产物）
npm --prefix vscode run build:browser
# 产物：build/staging/{chrome,firefox}/scripts/background.js
```

#### 创建 VSIX

```bash
cd vscode

# esbuild 打包（vsce 也会经 vscode:prepublish 自动执行，此处手动跑便于排查）
npm run build

# 使用 vsce 打包
vsce package

# 输出：ai-quota-dashboard-x.x.x.vsix
# 如需指定输出目录
vsce package --no-dependencies -o ../build/
```

**本地安装 VSIX**：

1. 在 VSCode 中打开「扩展」视图（Ctrl+Shift+X）
2. 点击右上角 `...` →「从 VSIX 安装」
3. 选择生成的 `.vsix` 文件

---

## CI/CD 概览

项目使用 **GitHub Actions** 实现自动化构建和发布。

### CI 工作流（`.github/workflows/ci.yml`）

**触发条件**：`push` / `pull_request` 到 `main` 分支

**任务**：

| Job | 说明 |
|-----|------|
| `vscode` | 安装依赖 → Lint → Compile（类型检查）→ Build（esbuild）→ 断言 `out/extension.js` 产物 → 测试 → vsce 打包 VSIX → 上传 Artifact |
| `browser` | 安装依赖（esbuild）→ 校验 Manifest JSON → `bash build.sh`（staging 流程）→ `unzip -l` 断言 `scripts/background.js` 与 `protocol/index.js` 在包 → 上传 Artifact |

**Artifact 保留期**：7 天

### Release 工作流（`.github/workflows/release.yml`）

**触发条件**：推送 `v*.*.*` 格式的 tag

**流程**：

1. **VSCode Job**：
   - 从 tag 提取版本号
   - 更新 `package.json` 版本
   - 编译、打包 VSIX
   - 发布到 **VSCode Marketplace**（需 `VSCE_PAT`）
   - 发布到 **Open VSX**（需 `OPENVSX_PAT`）

2. **Browser Job**：
   - 使用 VSCode Job 产出的版本号
   - 打包 Chrome/Firefox zip

3. **GitHub Release Job**：
   - 下载所有 Artifact
   - 创建 GitHub Release
   - 自动附加 VSIX 和浏览器扩展 zip

**所需 Secrets**：

| Secret | 用途 |
|--------|------|
| `VSCE_PAT` | 发布到 VSCode Marketplace |
| `OPENVSX_PAT` | 发布到 Open VSX Registry |

---

## 代码风格与 Lint

项目使用 **ESLint** + **@typescript-eslint** 进行代码检查，配置在 `vscode/eslint.config.mjs`。

**关键规则**：
- `strict: true` — TypeScript 严格模式
- 命名规范：PascalCase（类/接口）、camelCase（函数/变量）、UPPER_SNAKE_CASE（常量）
- 无未使用变量（`noUnusedLocals` / `noUnusedParameters`）
- 无隐式返回（`noImplicitReturns`）

```bash
cd vscode

# 运行检查
npm run lint

# 自动修复（如 eslint 配置支持）
npx eslint src --fix
```

**提交规范**：使用 Conventional Commits

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
refactor: 重构代码（无功能变更）
test: 添加/修改测试
chore: 构建/工具变更
```

---

## 常见问题排查

### VSCode 扩展

#### 按 F5 后 Extension Host 没有加载扩展

- 检查 `npm run compile` 是否成功（无 TypeScript 错误）
- 确认已执行 `npm run build` 且 `out/extension.js`、`media/dashboard.js` 存在（esbuild 产物，`compile` 不产出）
- 检查 `.vscode/launch.json` 的 `outFiles` 路径是否正确

#### 仪表盘显示空白或样式错乱

- 检查对应服务的卡片模块是否在 `src/webview/main.ts` 中显式调用了 `registerXxxCard()`（未注册 kind 会显式报错）
- 检查 `dashboard/styles.ts` 是否引入了该服务的 CSS
- 确认 `npm run build` 已重新产出 `media/dashboard.js`（卡片源码改动需重建 bundle）
- 在 Webview DevTools 中查看 Console 错误（在 Extension Host 中按 `Ctrl+Shift+P` →「打开 Webview 开发者工具」）

#### API 请求返回 401/403

- 检查 API Key / Cookie 是否有效
- 查看 `src/core/fetch.ts` 的请求日志
- 确认目标 API 的域名是否在浏览器扩展的 `host_permissions` 中

#### 状态栏不显示或显示 `?`

- 检查该服务是否实现了 `StatusBarRenderer`
- 检查 `statusBarRenderer` 是否正确传入 `ServiceDescriptor`

### 浏览器扩展

#### Service Worker 频繁终止（Chrome）

Manifest V3 的 Service Worker 是非持久的，超过 5 分钟无事件会自动终止。如需持久化任务，使用 `chrome.alarms` API 定期唤醒。

#### Firefox 加载扩展后重启消失

Firefox 临时加载的扩展在浏览器重启后会消失，属于正常行为。如需持久安装，需通过 `about:addons` 正式安装或使用 Firefox Developer Edition 的临时加载调试功能。

#### Cookie 读取返回 undefined

- 确认用户已登录目标网站（如 kimi.com）
- 检查 `host_permissions` 是否包含正确的域名
- 在 Service Worker DevTools 中手动测试 `chrome.cookies.get()`

### 测试相关

#### 测试中报错 `Cannot find module 'vscode'`

- 确认 `vitest.config.ts` 中配置了 `vscode` → `src/test/mocks/vscode.ts` 的 alias
- 确认 mock 文件路径正确

#### TypeScript 编译通过但测试失败

- 检查测试文件是否同步了源码的最新变更
- 使用 `npm run test:watch` 实时观察失败用例

### 构建相关

#### `vsce package` 报错 "Missing publisher"

- 检查 `vscode/package.json` 中是否有 `publisher` 字段
- 确认 `publisher` 与 VSCode Marketplace 的发布者 ID 一致
- 如需本地测试，可添加 `--no-dependencies` 参数跳过部分检查：`vsce package --no-dependencies`

#### `npm run compile` 报错 `Cannot find module 'vscode'`

- 运行 `npm install` 安装依赖（`@types/vscode` 会提供类型定义）
- 确保在 `vscode/` 目录下执行命令

#### 浏览器扩展打包后无法安装

- 检查 `manifest.json` 是否为有效的 JSON（无尾随逗号）
- 确认 `manifest_version` 为 3
- 确认所有 `scripts` 和 `icons` 路径指向的文件存在于 zip 中

---

*本文档最后更新：2026-09-04*