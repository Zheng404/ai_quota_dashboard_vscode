# ai_usage_monitor_vscode

> VSCode 扩展插件 — AI Coding Plan 配额用量仪表盘。实时追踪 GLM Coding Plan、Kimi Membership 等 AI 服务的配额消耗情况，帮助开发者避免超额使用。

## 项目定位

AI 配额用量仪表盘（不是行为追踪器）。所有配额数据本地存储，不上传云端。

### 当前支持的服务

| 服务 | 目录 | 鉴权方式 | 特色功能 |
|------|------|---------|---------|
| GLM Coding Plan (CN) | `src/services/glm/` | API Key (Bearer Token) | 配额卡片 + 模型/工具用量详情 + SVG 曲线图 |
| Kimi Membership | `src/services/kimi/` | JWT Token (浏览器 Cookie) | 配额进度条 + 子限额展示 |

---

## 架构总览

```
src/
├── extension.ts              # 扩展入口：activate/deactivate、命令注册、轮询循环
├── core/
│   ├── types.ts              # 基础类型：ServiceProfile、QuotaSlot、ServiceData 等
│   ├── config.ts             # 配置管理（globalState + Secret Storage）
│   ├── fetch.ts              # HTTP 客户端（httpRequest + getJson + postJson）
│   ├── format.ts             # 数字格式化 (fmtNum)
│   ├── cache.ts              # 内存缓存管理器 (CacheManager, 60s TTL)
│   ├── afk.ts                # AFK 检测器 (AfkDetector)
│   └── *.test.ts             # 单元测试
├── services/                 # 服务层（ServiceDescriptor 注册表模式）
│   ├── registry.ts           # 服务注册表：kind → ServiceDescriptor 映射
│   ├── types.ts              # QuotaProvider / StatusBarRenderer / DetailProvider 接口
│   ├── glm/                  # GLM 服务包
│   │   ├── index.ts          # GLM ServiceDescriptor 组装
│   │   ├── provider.ts       # GLM 数据拉取 + 解析 + DetailProvider
│   │   ├── statusBar.ts      # GLM 状态栏渲染器 (StatusBarRenderer)
│   │   ├── constants.ts      # GLM 配额标签常量
│   │   ├── types.ts          # GlmServiceData + ModelUsageData + ToolUsageData
│   │   ├── template.ts       # GLM 仪表盘卡片模板（JS 字符串，含 SVG 图表）
│   │   ├── styles.ts         # GLM 专属 CSS
│   │   └── settings.ts       # GLM 设置表单元数据
│   └── kimi/                 # Kimi 服务包（结构同 GLM）
├── storage/
│   └── persistence.ts        # 历史数据持久化（globalState，30 天保留）
├── ui/
│   ├── statusbar.ts          # 状态栏通用调度器（通过 ServiceDescriptor 分发）
│   └── statusBarRenderer.ts  # StatusBarRenderer 接口 + 共享工具函数
├── dashboard/                # 侧边栏 Webview 仪表盘
│   ├── webviewView.ts        # WebviewViewProvider（HTML 骨架 + 消息路由）
│   ├── styles.ts             # 通用 CSS + 聚合各服务样式
│   └── templates/
│       ├── index.ts          # JS 片段组装入口
│       ├── shared.ts         # 共享渲染函数 + 模板调度器
│       └── settings.ts       # 设置页渲染 + 事件绑定（数据驱动，无 kind 硬编码）
├── commands/
│   └── index.ts              # clearHistory 命令
└── test/
    └── mocks/
        └── vscode.ts         # VSCode API mock（供 vitest 使用）
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 运行时 | Node.js (VSCode Extension Host) |
| 框架 | VSCode Extension API |
| 构建 | tsc |
| 代码检查 | ESLint + @typescript-eslint |
| 数据存储 | globalState + Secret Storage |
| 可视化 | Webview (内联 HTML/CSS/JS，SVG 图表) |

### 核心设计模式：ServiceDescriptor 注册表

每个 AI 服务是一个完整的「包」，包含数据提供者、仪表盘模板、样式和设置元数据：

```typescript
interface ServiceDescriptor {
  kind: ServiceId;              // 'glm' | 'kimi' | ...
  displayName: string;          // 'GLM Coding Plan (CN)'
  defaultName: string;          // 添加时的默认名称
  badgeLabel: string;
  badgeCssClass: string;
  provider: QuotaProvider;      // 数据拉取逻辑
  templateScript: string;       // 仪表盘卡片 JS 模板
  styles: string;               // 专属 CSS
  settings: ServiceSettingsDescriptor;  // 设置表单元数据
  statusBarRenderer?: StatusBarRenderer;  // 状态栏渲染器（可选）
  detailProvider?: DetailProvider;        // 详情数据提供者（可选，用于懒加载）
  mergeDetailData?(existing: ServiceData, detail: unknown, range: string): void;  // 合并详情数据
  helpCommand?: string;         // 帮助命令标识
  helpMessage?: string;         // 帮助提示内容
}
```

新增服务只需在 `src/services/` 新建目录，实现上述结构，然后在 `src/services/registry.ts` 注册即可。

### 数据流

```
pollAll() 定时触发
    │
    ├─ AFK 检测（超阈值则跳过）
    ├─ 遍历启用的 ServiceProfile
    │   ├─ 检查内存缓存 (60s TTL)
    │   ├─ resolveProvider(kind) → QuotaProvider.fetch(key, endpoint)
    │   ├─ 返回 ServiceData（服务可扩展专属字段）
    │   └─ attachHistory() 合并历史数据
    │
    ├─ StatusBar.feed() → flush()（每服务一个状态栏项，通过 ServiceDescriptor.statusBarRenderer 定制渲染）
    ├─ DashboardWebviewViewProvider.update() → postMessage
    └─ saveHistory() → globalState 持久化
```

---

## 数据模型

```typescript
// 服务标识（字符串，不限定联合类型，便于扩展）
type ServiceId = string;

// 服务配置
interface ServiceProfile {
  id: string;           // 如 'glm-1714000000000'
  kind: ServiceId;
  displayName: string;
  enabled: boolean;
  endpoint?: string;
}

// 配额槽位
interface QuotaSlot {
  label: string;        // 如 '每5小时额度', 'MCP 每月额度'
  percent: number;      // 0-100
  used?: number;
  limit?: number;
  resetsAt?: number;    // Unix timestamp
}

// 历史数据点
interface UsagePoint {
  at: number;           // Unix timestamp
  tokens?: number;
  calls?: number;
}

// 服务完整数据
interface ServiceData {
  id: string;
  name: string;
  kind: ServiceId;
  slots: QuotaSlot[];
  history?: UsagePoint[];
  updatedAt: number;
  err?: string;
}

// Provider 接口
interface QuotaProvider {
  kind: ServiceId;
  fetch(apiKey: string, endpoint?: string): Promise<ServiceData>;
}

// Webview 设置数据
interface SettingsData {
  profiles: ServiceProfile[];
  keys: Record<string, string>;
  refreshInterval: number;
  warnThreshold: number;
  afkThreshold: number;
}
```

### 服务扩展数据（继承 ServiceData）

```typescript
// GLM 专属扩展
interface GlmServiceData extends ServiceData {
  level?: string;                           // 套餐等级，如 'pro'
  modelUsage?: ModelUsageData;              // 模型用量（当日）
  toolUsage?: ToolUsageData;                // 工具用量（当日）
  modelUsageByRange?: Record<TimeRange, ModelUsageData>;  // 按范围缓存
  toolUsageByRange?: Record<TimeRange, ToolUsageData>;
}

interface ModelUsageData {
  totalTokens: number;
  totalCalls: number;
  modelSummary: { modelName: string; totalTokens: number; sortOrder: number }[];
  history: UsagePoint[];
  modelSeries: { modelName: string; tokensUsage: (number|null)[]; totalTokens: number }[];
  xTime: string[];
}

interface ToolUsageData {
  totalNetworkSearch: number;
  totalWebRead: number;
  totalZread: number;
  toolSummary: { toolCode: string; toolName: string; totalUsageCount: number; sortOrder: number }[];
  history: UsagePoint[];
  toolSeries: { toolCode: string; toolName: string; usageCount: (number|null)[]; totalUsageCount: number }[];
  xTime: string[];
}

// Kimi 专属扩展
interface KimiServiceData extends ServiceData {
  level?: string;       // 会员等级，如 'KIMI-PRO'
}
```

---

## 配置存储

| 数据 | 存储位置 | Key |
|------|---------|-----|
| 服务列表 | `globalState` | `services` |
| API Keys | `Secret Storage` | `apiKeys.{serviceId}` |
| 刷新间隔 | `globalState` | `refreshInterval` (默认 600s) |
| 预警阈值 | `globalState` | `warnThreshold` (默认 0.8) |
| AFK 阈值 | `globalState` | `afkThreshold` (默认 3600s) |
| 历史数据 | `globalState` | `aiUsageMonitor.history` |

**注意**：`package.json` 已声明 `configuration` 属性，但代码中配置仍读写 `globalState`，尚未完全接入 VSCode Settings API。设置 UI 仅做展示和修改 globalState。

---

## 命令参考

### 命令面板可见命令

| 命令 | 功能 | 注册位置 |
|------|------|---------|
| `aiUsageMonitor.refresh` | 清空缓存并重新拉取所有服务数据 | extension.ts |
| `aiUsageMonitor.openDashboard` | 聚焦侧边栏 Webview | extension.ts |
| `aiUsageMonitor.openSettings` | 聚焦 Webview 并切换到设置标签 | extension.ts |
| `aiUsageMonitor.resetData` | 删除所有配置、API Key、历史记录 | extension.ts |
| `aiUsageMonitor.clearHistory` | 仅清除历史数据 | commands/index.ts |

### 内部命令（从 Webview 消息调用）

| 命令 | 功能 |
|------|------|
| `aiUsageMonitor.saveService` | 保存单个服务配置 |
| `aiUsageMonitor.addService` | 添加新服务实例 |
| `aiUsageMonitor.removeService` | 删除服务实例 |
| `aiUsageMonitor.saveGlobal` | 保存全局设置 |
| `aiUsageMonitor.refreshService` | 刷新单个服务（data: { id }) |
| `aiUsageMonitor.requestDetailRange` | 服务详情懒加载（data: { serviceId, range })，通过 DetailProvider 接口通用化 |

---

## Webview 通信协议

### Extension → Webview

| 命令 | 数据 | 说明 |
|------|------|------|
| `updateData` | `{ services, settings }` | 全量更新仪表盘数据 |
| `switchToSettings` | `{ subtab }` | 切换到设置页的指定子标签 |

### Webview → Extension

| 命令 | 数据 | 说明 |
|------|------|------|
| `requestInitialData` | - | Webview 加载完成请求初始数据 |
| `refresh` | - | 刷新所有配额 |
| `refreshService` | `{ id }` | 刷新单个服务 |
| `requestDetailRange` | `{ serviceId, range }` | 服务详情懒加载（通过 DetailProvider 接口通用化） |
| `saveService` | `{ id, name, kind, key, enabled }` | 保存服务 |
| `addService` | `{ kind }` | 添加服务 |
| `removeService` | `{ id }` | 删除服务 |
| `saveGlobal` | `{ refreshInterval, warnThreshold, afkThreshold }` | 保存全局设置 |
| `resetData` | - | 重置所有数据 |
| `{helpCommand}` | - | 动态帮助命令（如 `showKimiHelp`） |

---

## Webview 模板系统

仪表盘采用「注册表 + 数据驱动」渲染模式：

1. **模板注册**：每个服务在 `templateScript` 中向全局 `serviceTemplates` 注册 `renderCard` 函数
2. **调度器**：`shared.ts` 中的 `renderService(data)` 根据 `data.kind` 分发到对应模板
3. **无 fallback**：未注册 kind 显示错误提示，强制每个服务实现专属模板
4. **设置页**：`settings.ts` 通过注入 `serviceSettingsMap` 元数据，无 kind 硬编码

```javascript
// 模板注册示例（GLM）
serviceTemplates.glm = {
  renderCard: function(data) {
    // 返回 HTML 字符串
  }
};
```

---

## 状态栏渲染

每个启用服务对应一个独立的 `StatusBarItem`，按服务类型定制：

- **GLM**：显示非 MCP 配额的百分比 + 倒计时，如 `GLM：87%/2.3h | 45%/5.9d`
- **Kimi**：显示所有配额的百分比 + 倒计时，如 `Kimi：12%/4min | 34%/4h`
- **Tooltip**：按服务类型构建 Markdown 内容（配额进度条 + 操作按钮）
- **颜色**：根据最高配额使用率着色（green/yellow/red）

---

## GLM 详情分析

GLM 仪表盘卡片包含多层结构：

1. **头部**：用户名称 + 等级徽章 / 刷新按钮 + 服务名 + 更新时间
2. **配额区域**：3 个配额卡片（每5小时/每周/MCP每月），含进度条和重置时间
3. **详情区域**：
   - 主 Tab：「模型用量」/「工具用量」
   - 子 Tab：「当日」/「近7天」/「近30天」
   - 内容：SVG 平滑曲线图（二次贝塞尔）+ 汇总统计标签

**懒加载机制**：首次只拉取当日数据，切换时间范围时通过 `requestDetailRange` 命令按需拉取并缓存。

---

## 运行与开发

```bash
npm run compile      # 编译 TypeScript
npm run watch        # 监听模式开发
npm run lint         # ESLint 检查
npm run test         # 运行 vitest 测试套件
npm run test:watch   # 监听模式运行测试
```

### 环境要求

- VSCode 1.80+
- Node.js 18+

---

## 编码规范

- **语言**: TypeScript，严格模式 (`strict: true`)
- **命名**: PascalCase (类/接口), camelCase (函数/变量), UPPER_SNAKE_CASE (常量)
- **代码检查**: ESLint + @typescript-eslint
- **提交规范**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- **注释语言**: 中文

---

## 已知技术债务

1. **配置未完全接入 VSCode Settings API** — `package.json` 已声明 `configuration` 属性，但代码仍读写 `globalState`。理想应通过 `vscode.workspace.getConfiguration()` 读取，允许用户在 VSCode 设置面板中编辑。
2. **Webview JS 为字符串拼接** — 模板函数返回内联 JS 字符串，无类型检查，维护成本高。可考虑构建时模板编译改善。
3. **`warnThreshold` 配置声明但未实际使用** — 配置中存在预警阈值，但代码中没有根据阈值触发警告通知的逻辑。

---

## AI 使用指引

### 给 AI 助手的关键上下文

1. **项目阶段**: 功能完整，可用于日常使用
2. **扩展类型**: VSCode Extension (WebviewViewProvider 侧边栏)
3. **核心定位**: 配额用量仪表盘，不是行为追踪器
4. **数据隐私**: 所有配额数据必须本地存储，不上传云端
5. **性能约束**: 监听逻辑必须轻量，不影响编辑器性能
6. **扩展模式**: 新增 AI 服务遵循 ServiceDescriptor 注册表模式

### 常见开发任务

- **添加新 AI 服务**:
  1. 在 `src/services/` 创建新目录（结构参考 `glm/` 或 `kimi/`）
  2. 实现 `QuotaProvider` 接口（`provider.ts`）
  3. 定义扩展数据类型（`types.ts`）
  4. 编写仪表盘卡片模板（`template.ts`，需注册到 `serviceTemplates.{kind}`）
  5. 编写专属样式（`styles.ts`）
  6. 编写设置元数据（`settings.ts`）
  7. 可选：实现 `StatusBarRenderer` 接口（`statusBar.ts`），否则状态栏显示 `?`
  8. 可选：实现 `DetailProvider` 接口（`provider.ts`）+ `mergeDetailData`（`index.ts`），支持仪表盘详情懒加载。两者需同时提供
  9. 组装 ServiceDescriptor（`index.ts`）
  10. 在 `src/services/registry.ts` 注册

- **修改仪表盘样式**: 编辑对应服务的 `styles.ts`（通用样式在 `src/dashboard/styles.ts`）
- **修改仪表盘渲染**: 编辑对应服务的 `template.ts`（共享逻辑在 `src/dashboard/templates/shared.ts`）
- **添加命令**: 在 `extension.ts` 注册命令，在 `package.json` `contributes.commands` 声明

---

*最后更新: 2026-04-29*
