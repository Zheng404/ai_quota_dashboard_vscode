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
| **Node.js** | 20.x | 运行 TypeScript 编译、测试和打包 |
| **npm** | 10.x | 包管理器（随 Node.js 安装） |
| **VSCode** | ≥ 1.80 | 运行和调试 VSCode 扩展 |
| **Chrome / Edge** | 最新版 | 测试浏览器扩展（Chrome Manifest V3） |
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
│   │   │   └── mimo/           # MiMo 服务完整包
│   │   ├── ui/                 # 状态栏、Webview 仪表盘
│   │   ├── dashboard/          # Webview 模板与样式
│   │   ├── storage/            # 历史数据持久化
│   │   └── test/mocks/         # VSCode API Mock
│   ├── package.json            # 扩展清单与脚本
│   ├── tsconfig.json           # TypeScript 配置（strict 模式）
│   └── eslint.config.mjs       # ESLint 配置
├── browser-common/             # 浏览器扩展共享代码（Chrome/Firefox 共用）
│   ├── browser-api.js          # 浏览器 API 兼容层
│   ├── cache.js / config.js    # 缓存与配置管理
│   ├── popup.html / popup.js   # Popup 仪表盘
│   ├── dashboard.html / dashboard.js # 独立 Dashboard 页面
│   ├── templates.js            # 卡片模板
│   ├── styles.css              # 样式表
│   ├── api/                    # API 客户端（glm/kimi/mimo）
│   └── scripts/
│       └── background.js       # Service Worker（Cookie Bridge + 凭证检测）
├── chrome/                     # Chrome/Edge 专属（仅 manifest + icons）
│   ├── manifest.json           # Manifest V3
│   └── icons/
├── firefox/                    # Firefox 专属（仅 manifest + icons）
│   ├── manifest.json           # Manifest V3 + browser_specific_settings.gecko
│   └── icons/
├── build.sh                    # 一键打包脚本（复制共享代码 → 打包 → 清理）
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

# 3. 验证编译
npm run compile
```

### 编译与运行

| 命令 | 作用 |
|------|------|
| `npm run compile` | 使用 `tsc` 编译 TypeScript 到 `out/` 目录 |
| `npm run watch` | 监听模式，文件变更自动重新编译 |
| `npm run lint` | 运行 ESLint 检查代码风格 |
| `npm test` | 运行 vitest 单元测试（一次性） |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run vscode:prepublish` | 发布前的预编译 |

```bash
cd vscode

# 开发模式（终端 1：监听编译）
npm run watch

# 开发模式（终端 2：监听测试）
npm run test:watch
```

### 调试（F5）

1. 在 VSCode 中打开 `vscode/` 文件夹作为工作区
2. 按 `F5` 或点击左侧「运行和调试」→「Run Extension」
3. 这会启动一个新的 **Extension Development Host** 窗口
4. 在新窗口中：
   - 侧边栏会出现「AI 配额」图标
   - 命令面板可使用所有 `aiQuotaDashboard.*` 命令
5. 在原窗口的「调试控制台」可查看日志输出

**断点调试**：在源码中设置断点，Extension Host 会暂停并允许单步调试。

```json
// .vscode/launch.json（如不存在可手动创建）
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

### 架构设计：ServiceDescriptor 模式

本项目采用**注册表模式**管理各 AI 服务。每个服务是一个独立的「包」，包含完整的数据流和渲染逻辑。

```typescript
// src/services/types.ts
interface ServiceDescriptor {
  kind: ServiceId;                    // 服务标识，如 'glm'
  displayName: string;                // 显示名称
  defaultName: string;                // 默认自定义名称
  badgeLabel: string;                 // 徽章文字
  badgeCssClass: string;              // 徽章 CSS 类
  provider: QuotaProvider;            // 数据拉取逻辑
  templateScript: string;             // 仪表盘卡片 JS 模板
  styles: string;                     // 专属 CSS
  settings: ServiceSettingsDescriptor; // 设置表单元数据
  statusBarRenderer?: StatusBarRenderer;   // 状态栏渲染器（可选）
  detailProvider?: DetailProvider;         // 详情懒加载提供者（可选）
  mergeDetailData?(existing, detail, range): void; // 合并详情数据
  helpCommand?: string;               // 帮助命令标识
  helpMessage?: string;               // 帮助提示内容
}
```

**数据流**：

```
pollAll() 定时触发
    ├─ AFK 检测（超阈值则跳过）
    ├─ 遍历 ServiceProfile
    │   ├─ 检查内存缓存 (60s TTL)
    │   ├─ resolveProvider(kind) → QuotaProvider.fetch(key, endpoint)
    │   ├─ 返回 ServiceData
    │   └─ attachHistory() 合并历史数据
    ├─ StatusBar.feed() → flush()
    ├─ DashboardWebviewViewProvider.update() → postMessage
    └─ saveHistory() → globalState 持久化
```

**注册服务**：在 `src/services/registry.ts` 中导入并注册：

```typescript
import { myServiceDescriptor } from './myservice';

const _defaultRegistry = createRegistry([
  glmDescriptor,
  kimiDescriptor,
  mimoDescriptor,
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

#### 第 4 步：编写仪表盘模板

```typescript
// nova/template.ts
export function getNovaTemplate(): string {
  return `
    serviceTemplates.nova = {
      renderCard: function(data) {
        const slots = data.slots || [];
        let html = '<div class="nova-card">';
        html += '<h3>' + escapeHtml(data.name) + '</h3>';
        slots.forEach(function(slot) {
          html += '<div class="quota-row">';
          html += '<span>' + slot.label + '</span>';
          html += '<div class="progress-bar">';
          html += '<div class="progress-fill" style="width:' + slot.percent + '%"></div>';
          html += '</div>';
          html += '<span>' + Math.round(slot.percent) + '%</span>';
          html += '</div>';
        });
        html += '</div>';
        return html;
      }
    };
  `;
}
```

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
import { getNovaTemplate } from './template';
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
  templateScript: getNovaTemplate(),
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
  novaDescriptor,  // ← 添加
]);
```

#### 第 10 步：添加样式到仪表盘

```typescript
// src/dashboard/styles.ts
import { NOVA_STYLES } from '../services/nova/styles';

export const dashboardStyles = `
  ${GLM_STYLES}
  ${KIMI_STYLES}
  ${MIMO_STYLES}
  ${NOVA_STYLES}  /* ← 添加 */
`;
```

---

## 浏览器扩展开发

浏览器扩展（Cookie Bridge）是**纯 JavaScript**，无需构建步骤。

### 本地测试加载

> **注意**：`chrome/` 和 `firefox/` 目录仅包含 `manifest.json` 和 `icons/`，共享代码存放在 `browser-common/`。加载前需要先运行 `build.sh` 将共享代码复制进去，或手动复制 `browser-common/` 的文件到对应目录。

#### Chrome / Edge

1. 在项目根目录运行 `./build.sh` 复制共享代码到 `chrome/`
2. 打开浏览器，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `chrome/` 目录
6. 扩展图标会出现在工具栏，点击 `Alt+Q` 可快速打开弹窗

#### Firefox

1. 在项目根目录运行 `./build.sh` 复制共享代码到 `firefox/`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击「临时载入附加组件」
4. 选择 `firefox/manifest.json`
5. 扩展会立即加载，重启浏览器后需重新加载（临时扩展特性）

### 调试 Service Worker

#### Chrome

1. 进入 `chrome://extensions/`
2. 找到「AI Quota Cookie Bridge」，点击「Service Worker」链接
3. 会打开 DevTools，可在 Console 查看日志、在 Sources 设置断点

#### Firefox

1. 进入 `about:debugging#/runtime/this-firefox`
2. 找到扩展，点击「检查」
3. 在「控制台」和「调试器」中查看 Background Script 的运行状态

**关键调试技巧**：在 `scripts/background.js` 中使用 `console.log()` 输出日志，内容会显示在 Service Worker 的 DevTools 控制台中。

### Chrome 与 Firefox 的差异

| 差异点 | Chrome | Firefox |
|--------|--------|---------|
| **Manifest** | 标准 V3 | V3 + `browser_specific_settings.gecko` |
| **扩展 ID** | 自动生成 | 需在 manifest 中显式声明 `id` |
| **Background** | `service_worker` | `scripts`（数组） |
| **Cookie API** | `chrome.cookies` | `browser.cookies`（已兼容） |
| **最小版本** | Chrome 88+ | Firefox 116+ |
| **持久化** | Service Worker 非持久 | 事件页面，行为略有差异 |

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

项目根目录提供了一键打包脚本，同时打包浏览器扩展和 VSCode 扩展：

```bash
# 在项目根目录执行
./build.sh

# 输出：
# build/
# ├── ai-quota-cookie-bridge-chrome-v1.0.0.zip
# ├── ai-quota-cookie-bridge-firefox-v1.0.0.zip
# └── ai-quota-dashboard-x.x.x.vsix
```

**脚本逻辑**：
1. 清理 `build/` 目录
2. 打包 Chrome 扩展（zip）
3. 打包 Firefox 扩展（zip）
4. 检查 `vsce` 是否安装，如已安装则打包 VSIX

### 手动打包

#### 浏览器扩展

```bash
# Chrome（需要先将 browser-common 复制到 chrome/）
cp -r browser-common/* chrome/
cd chrome
zip -r ../build/ai-quota-dashboard-chrome.zip manifest.json popup.html dashboard.html popup.js dashboard.js templates.js styles.css browser-api.js cache.js config.js api/ scripts/ icons/

# Firefox（需要先将 browser-common 复制到 firefox/）
cp -r browser-common/* firefox/
cd firefox
zip -r ../build/ai-quota-dashboard-firefox.zip manifest.json popup.html dashboard.html popup.js dashboard.js templates.js styles.css browser-api.js cache.js config.js api/ scripts/ icons/

# 清理（打包后删除复制的文件）
# ... or just use build.sh
```

#### 创建 VSIX

```bash
cd vscode

# 确保已编译
npm run compile

# 使用 vsce 打包
vsce package

# 输出：ai-quota-dashboard-x.x.x.vsix
# 如需指定输出目录
vsce package --out ../build/
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
| `vscode` | 安装依赖 → Lint → 编译 → 测试 → 安全审计 → 打包 VSIX → 上传 Artifact |
| `browser` | 验证 Manifest JSON → 打包 Chrome/Firefox zip → 上传 Artifact |

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
- 确认 `out/extension.js` 存在
- 检查 `.vscode/launch.json` 的 `outFiles` 路径是否正确

#### 仪表盘显示空白或样式错乱

- 检查对应服务的 `templateScript` 是否正确注册到 `serviceTemplates.{kind}`
- 检查 `dashboard/styles.ts` 是否引入了该服务的 CSS
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

*本文档最后更新：2026-06-10*