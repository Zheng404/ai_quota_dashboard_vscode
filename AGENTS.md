# ai_quota_dashboard_vscode

> VSCode 扩展插件 — AI Coding Plan 配额用量仪表盘。实时追踪 GLM Coding Plan (CN)、Kimi Membership、Xiaomi MiMo Token Plan 等 AI 服务的配额消耗情况，帮助开发者避免超额使用。

## 项目定位

AI 配额用量仪表盘（不是行为追踪器）。所有配额数据本地存储，不上传云端。

### 当前支持的服务

| 服务 | 目录 | 认证方式 | 特色功能 |
|------|------|---------|---------|
| Cookie Bridge | `src/services/bridge/` | 浏览器扩展推送 | 凭证中转分发服务，接收浏览器扩展凭证并自动分发到对应 AI 服务，同时展示连接状态和已接收凭证种类 |
| GLM Coding Plan (CN) | `src/services/glm/` | API Key（手动输入） | 配额卡片 + 模型/工具用量详情 + SVG 曲线图 |
| Kimi Membership | `src/services/kimi/` | JWT Token（手动输入） | 配额进度条 + 子限额展示 + 会员等级 |
| Xiaomi MiMo Token Plan | `src/services/mimo/` | Cookie（手动输入） | 套餐用量统计 + 补偿 Token 额度 + 有效期展示 + 自动续费状态 |

---

## 架构总览

```
src/
├── extension.ts              # 扩展入口：activate/deactivate、命令注册、轮询循环
├── core/                     # 核心模块
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
│   ├── bridge/               # Cookie Bridge 服务包
│   │   ├── index.ts          # Bridge ServiceDescriptor 组装
│   │   ├── provider.ts       # Bridge 状态数据提供者
│   │   ├── state.ts          # Bridge 状态持久化（globalState）
│   │   ├── statusBar.ts      # Bridge 状态栏渲染器
│   │   ├── template.ts       # Bridge 仪表盘卡片模板
│   │   ├── styles.ts         # Bridge 专属 CSS
│   │   └── settings.ts       # Bridge 设置表单元数据
│   ├── glm/                  # GLM 服务包
│   │   ├── index.ts          # GLM ServiceDescriptor 组装
│   │   ├── provider.ts       # GLM 数据拉取 + 解析 + DetailProvider
│   │   ├── statusBar.ts      # GLM 状态栏渲染器 (StatusBarRenderer)
│   │   ├── constants.ts      # GLM 配额标签常量
│   │   ├── types.ts          # GlmServiceData + ModelUsageData + ToolUsageData
│   │   ├── template.ts       # GLM 仪表盘卡片模板（JS 字符串，含 SVG 图表）
│   │   ├── styles.ts         # GLM 专属 CSS
│   │   └── settings.ts       # GLM 设置表单元数据
│   ├── kimi/                 # Kimi 服务包（结构同 GLM）
│   │   ├── index.ts
│   │   ├── provider.ts       # Kimi 数据拉取（Connect 协议）
│   │   ├── statusBar.ts
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   ├── template.ts
│   │   ├── styles.ts
│   │   └── settings.ts
│   └── mimo/                 # MiMo 服务包（结构同 GLM/Kimi，但无 constants.ts）
│       ├── index.ts
│       ├── provider.ts
│       ├── statusBar.ts
│       ├── types.ts
│       ├── template.ts
│       ├── styles.ts
│       └── settings.ts
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
| 测试 | vitest |
| 数据存储 | globalState + Secret Storage |
| 可视化 | Webview (内联 HTML/CSS/JS，SVG 图表) |

### 核心设计模式：ServiceDescriptor 注册表

每个 AI 服务是一个完整的「包」，包含数据提供者、仪表盘模板、样式和设置元数据：

```typescript
interface ServiceDescriptor {
  kind: ServiceId;              // 'bridge' | 'glm' | 'kimi' | 'mimo' | ...
  displayName: string;          // 'Cookie Bridge' | 'GLM Coding Plan (CN)'
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

新增服务只需在 `src/services/` 新建目录，实现上述结构，然后在 `src/services/registry.ts` 注册即可。`bridge` 服务负责接收浏览器扩展推送的凭证，并自动分发到对应的 AI 服务（GLM/Kimi/MiMo）。凭证写入 Secret Storage 并标记 `dataSource='bridge'` 后，AI 服务即可直接使用，无需手动配置。用户也可在设置页切换为手动输入模式。

### 数据流

> 以下路径相对于 `vscode/src/`。

```
pullAll() 定时触发
    │
    ├─ 离开检测（超阈值则跳过）
    ├─ 遍历 ServiceProfile
    │   ├─ 命中缓存 → 直接使用旧数据
    │   └─ 未命中 → refreshingIds.add(id) → QuotaProvider.fetch(key, endpoint)
    │        └─ fetch 完成后 refreshingIds.delete(id)
    │
    ├─ updateView() 先推一次（旧数据 + refreshingIds）→ 前端按钮转圈、卡片不中断
    ├─ StatusBar.feed() → flush()（每服务一个状态栏项，通过 ServiceDescriptor.statusBarRenderer 定制渲染）
    ├─ DashboardWebviewViewProvider.update() → postMessage（含 refreshingIds）
    └─ saveHistory() → globalState 持久化

Cookie Bridge（独立数据流，仅当用户添加了 Cookie Bridge 服务后启动）：
syncBridgeLifecycle() 按需启停：
    ├─ 有 kind='bridge' profile → ensureBridgeRunning()（启动 CookieBridgeServer 监听 37100）
    └─ 无 kind='bridge' profile → stopBridgeIfIdle()（关闭端口、释放资源）

浏览器扩展 → POST /cookies → CookieBridgeServer → handleCookiePayload()
    │
    ├─ 更新 Bridge 服务状态（连接状态、最后同步时间、已接收凭证种类）
    ├─ deduplicateAiProfiles() 仅清理重复的 bridge 服务（manual 服务永远不参与去重，保护用户手动输入的凭证）
    ├─ syncRemoveBridgeServices() 按浏览器 activeKinds 同步移除已废弃服务
    ├─ 分发凭证到 AI 服务（Kimi/MiMo/GLM → Secret Storage + dataSource='bridge'）
    ├─ 标记 Bridge profile 为已连接
    └─ 热重载：保留旧数据 + 标记 refreshingIds + pullAll() 刷新（卡片不中断）

注意：浏览器扩展推送的凭证会自动分发到对应的 GLM/Kimi/MiMo 服务（写入 Secret Storage 并更新 `dataSource='bridge'`），无需手动配置。但 Bridge 服务器仅当用户添加了 Cookie Bridge 服务后才会启动监听。
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
  endpoint?: string;
  dataSource?: 'manual' | 'bridge';  // 认证方式：手动输入或 Cookie Bridge
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
  level?: string;              // 会员等级名称，如 'Allegretto'
  membershipTitle?: string;
  currentEndTime?: string;     // 会员有效期截止日（YYYY-MM-DD）
  nextBillingTime?: string;
  subscriptionStatus?: string;
  subscriptionActive?: boolean;
  balances?: Array<{
    feature: string;
    amountUsedRatio: number;
    expireTime?: string;
  }>;
}

// MiMo 专属扩展
interface MimoServiceData extends ServiceData {
  planCode?: string;         // 套餐代码，如 'standard'
  planName?: string;         // 套餐名称，如 'Standard'
  currentPeriodEnd?: string; // 当前周期结束时间，如 '2026-05-29 23:59:59'
  expired?: boolean;         // 套餐是否已过期
  enableAutoRenew?: boolean; // 是否启用自动续费
}
```

---

## 核心模块说明

### 缓存机制（CacheManager）

`src/core/cache.ts` 提供带 TTL + LRU 淘汰的内存缓存：

- **TTL**: 正常数据 60 秒，错误数据 300 秒（由调用方传入，避免频繁重试失败请求）
- **LRU 淘汰**: 默认最大 100 条目，超限时淘汰最久未访问的条目
- **清理**: 每 5 分钟自动清理过期条目
- **键**: 以 `serviceId` 为键（如 `glm-1714000000000`）
- **用途**: 在自动轮询间隔较短时（如 60 秒），缓存可避免对同一服务的重复请求

```typescript
const cache = new CacheManager();  // 默认 maxSize=100，清理间隔 5 分钟
cache.set(id, data, 60);           // 正常 TTL 60 秒；错误数据调用方传 300
const cached = cache.get(id);      // 过期返回 undefined；命中时移动到末尾（LRU）
```

### 离开检测（AfkDetector）

`src/core/afk.ts` 检测用户活动状态：

- **触发条件**: 用户无键盘/鼠标操作超过阈值（默认 3600 秒）
- **行为**: 用户离开后，`pullAll()` 跳过数据拉取，节省资源
- **恢复**: 用户再次操作时自动恢复轮询
- **禁用**: 阈值设为 0 时关闭离开检测

### 历史数据持久化（persistence.ts）

`src/storage/persistence.ts` 管理历史用量数据：

- **存储位置**: `globalState`，Key 为 `aiQuotaDashboard.history`
- **保留策略**: 最多保留 30 天数据，自动清理过期条目
- **数据结构**: `Map<serviceId, UsagePoint[]>`
- **去重逻辑**: 同一天内只保留一个数据点（按日期去重）
- **合并策略**: API 返回的历史数据与本地持久化数据按日期合并，优先保留信息更完整的数据点
- **清除**: `clearHistory()` 仅清除历史；`clearAllData()` 清除所有配置和 API Key

### 状态栏渲染器（StatusBarRenderer）

`src/ui/statusBarRenderer.ts` 定义状态栏渲染接口：

```typescript
interface StatusBarRenderer<T extends ServiceData = ServiceData> {
  filterSlots(data: T): StatusBarSegment[];     // 筛选参与状态栏显示的配额
  buildTooltipMeta(data: T): TooltipMeta;       // 构建 tooltip 元信息
  buildTooltipQuotas(data: T): TooltipQuotaLine[];  // 构建 tooltip 配额行
}
```

各服务通过实现此接口提供专属状态栏渲染逻辑：
- **GLM**: 显示非 MCP 配额的百分比 + 倒计时
- **Kimi**: 显示所有配额的百分比 + 倒计时
- **MiMo**: 显示配额百分比 + Token 用量

### 仪表盘无缝刷新（refreshingIds）

`extension.ts` 维护模块级 `refreshingIds: Set<string>`，记录当前正在刷新的服务 ID。刷新流程采用「热重载」策略，避免数据中断：

1. **标记刷新态**：`pullService` / `doPullAll` / `afterConfigChange` / `handleCookiePayload` 在拉取前把服务 ID 加入 `refreshingIds`
2. **推旧数据**：立即 `updateView()`，此时前端拿到旧数据 + refreshingIds，对应服务刷新按钮旋转（`.spinning svg` 动画），卡片内容不中断
3. **拉取完成**：逐个清除 `refreshingIds` 标记，再次 `updateView()` 推送新数据
4. **加载骨架卡**：首次添加/无数据的服务显示轻量 `renderLoadingCard`（卡片框架 + 旋转圆环），不再用红色错误卡占位

```typescript
const refreshingIds = new Set<string>();  // extension.ts 模块级
// updateView 把 refreshingIds 作为第三参数传给 webview
dashboardViewProvider.update(serviceData, settings, Array.from(refreshingIds));
```

### Cookie Bridge 按需生命周期

Bridge 服务器**仅在用户添加了 Cookie Bridge 服务后启动**，而非扩展激活即启动。生命周期由三个函数管理：

| 函数 | 职责 |
|------|------|
| `syncBridgeLifecycle(bar, ctx)` | 入口：有 `kind='bridge'` profile 则 `ensureBridgeRunning`，否则 `stopBridgeIfIdle`。在 `activate()` 和每次 `afterConfigChange()` 后调用 |
| `ensureBridgeRunning(bar, ctx)` | 幂等：若服务器已运行直接返回；否则新建 `CookieBridgeServer`、`start(37100)`、**成功后才**赋值给模块级 `bridge` 并 push subscriptions、注册回调 `handleCookiePayload`。失败时 dispose 候选实例，允许下次重试 |
| `stopBridgeIfIdle(ctx)` | 若当前无 Bridge profile，则 `bridge.dispose()`、从 subscriptions 移除、置 `bridge = undefined` |

---

## 配置存储

| 数据 | 存储位置 | Key |
|------|---------|-----|
| 服务列表 | `globalState` | `services` |
| API Keys | `Secret Storage` | `apiKeys.{serviceId}` |
| Bridge 状态 | `globalState` | `aiQuotaDashboard.bridgeState` |
| 刷新间隔 | `globalState` + Settings | `refreshInterval` / `aiQuotaDashboard.refreshInterval` (默认 600s) |
| 预警阈值 | `globalState` + Settings | `warnThreshold` / `aiQuotaDashboard.warnThreshold` (默认 0.8) |
| AFK 阈值 | `globalState` + Settings | `afkThreshold` / `aiQuotaDashboard.afkThreshold` (默认 3600s) |
| 历史数据 | `globalState` | `aiQuotaDashboard.history` |

**注意**：全局三项设置在写入 `globalState` 时会同步写入 VSCode Settings（`config.ts` 的 `setState()` 对这三项额外调用 `workspace.getConfiguration().update()`），读取时优先 `globalState`、无值时回退到 Settings。

---

## 命令参考

### 命令面板可见命令

| 命令 | 功能 | 注册位置 |
|------|------|---------|
| `aiQuotaDashboard.refresh` | 刷新配额数据 | extension.ts |
| `aiQuotaDashboard.openDashboard` | 打开配额面板 | extension.ts |
| `aiQuotaDashboard.openSettings` | 打开设置面板 | extension.ts |
| `aiQuotaDashboard.resetData` | 重置所有数据 | extension.ts |
| `aiQuotaDashboard.clearHistory` | 清除历史数据 | commands/index.ts |

### 内部命令（从 Webview 消息调用）

| 命令 | 功能 |
|------|------|
| `aiQuotaDashboard.saveService` | 保存单个服务配置 |
| `aiQuotaDashboard.addService` | 添加新服务实例 |
| `aiQuotaDashboard.removeService` | 删除服务实例 |
| `aiQuotaDashboard.saveGlobal` | 保存全局设置 |
| `aiQuotaDashboard.refreshService` | 刷新单个服务（data: { id }) |
| `aiQuotaDashboard.requestDetailRange` | 服务详情懒加载（data: { serviceId, range })，通过 DetailProvider 接口通用化 |

---

## Webview 通信协议

### Extension → Webview

| 命令 | 数据 | 说明 |
|------|------|------|
| `updateData` | `{ services, settings, refreshingIds }` | 全量更新仪表盘数据（`refreshingIds` 为正在刷新的服务 ID 数组，前端据此让按钮转圈） |
| `switchToSettings` | `{ subtab }` | 切换到指定顶级标签（`'services'` 或 `'global'`；tab 已扁平化，不再有子标签） |

### Webview → Extension

| 命令 | 数据 | 说明 |
|------|------|------|
| `requestInitialData` | - | Webview 加载完成请求初始数据 |
| `refresh` | - | 刷新所有配额 |
| `refreshService` | `{ id }` | 刷新单个服务 |
| `requestDetailRange` | `{ serviceId, range }` | 服务详情懒加载（通过 DetailProvider 接口通用化） |
| `saveService` | `{ id, name, kind, key }` | 保存服务 |
| `addService` | `{ kind }` | 添加服务 |
| `removeService` | `{ id }` | 删除服务 |
| `saveGlobal` | `{ refreshInterval, warnThreshold, afkThreshold }` | 保存全局设置 |
| `resetData` | - | 重置所有数据 |
| `{helpCommand}` | - | 动态帮助命令（如 `showKimiHelp`、`showMimoHelp`） |

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
- **MiMo**：显示配额百分比 + Token 用量，如 `MiMo：45%（4.5M/10M）`
- **Tooltip**：按服务类型构建 Markdown 内容（配额进度条 + 操作按钮）
- **颜色**：根据最高配额使用率着色（green/yellow/red）

---

## 各服务仪表盘详情

> Cookie Bridge 服务卡片**不在仪表盘显示**（仪表盘通过 `filter(p => p.kind !== 'bridge')` 过滤）。Bridge 的连接状态（连接徽章、最后同步时间、已连接服务标签、诊断信息）整合在「服务」标签页的 Bridge 服务条目内（`settings.ts` 的 `renderServiceItem` 的 `isBridgeService` 分支）。

### GLM 详情分析

GLM 仪表盘卡片包含多层结构：

1. **头部**：用户名称 + 等级徽章 / 刷新按钮 + 服务名 + 更新时间
2. **配额区域**：3 个配额卡片（每5小时/每周/MCP每月），含进度条和重置时间
3. **详情区域**：
   - 主 Tab：「模型用量」/「工具用量」
   - 子 Tab：「当日」/「近7天」/「近30天」
   - 内容：SVG 平滑曲线图（二次贝塞尔）+ 汇总统计标签

**懒加载机制**：首次只拉取当日数据，切换时间范围时通过 `requestDetailRange` 命令按需拉取并缓存。

### Kimi 详情分析

Kimi 仪表盘卡片结构：

1. **头部**：用户自定义名称 + 会员等级徽章 / 刷新按钮 + 服务名 + 更新时间 + 会员有效期
2. **配额区域**：3 个配额卡片垂直排列
   - **频率限制明细**：基于 `limits` 数组第一个窗口限制（通常是 5 小时频限），含子限额详情
   - **本周用量**：基于 `detail` 主配额
   - **月度权益额度**：基于 `balances` 第一个余额项的 `amountUsedRatio`
3. **Tooltip 信息**：会员等级、有效期、并行度约束（如 FEATURE_CODING: 20）

Kimi 不涉及详情懒加载，所有数据在 `provider.ts` 中通过两个并行请求一次性拉取：
- `GetSubscription`：会员等级、有效期、余额、并行度约束
- `GetUsages`：频率限制明细、本周用量

### MiMo 详情分析

MiMo 仪表盘卡片结构：

1. **头部**：用户名称 + 套餐徽章 + 刷新按钮 / 服务名 + 更新时间 / 有效期至
2. **配额区域**：配额卡片垂直排列（当前套餐用量），含进度条；当存在补偿 Token 时额外显示补偿额度卡片

MiMo 不涉及详情懒加载，所有数据在 provider 中一次性拉取（用量 + 套餐详情并行请求）。

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

## 测试

项目使用 **vitest** 作为测试框架，测试文件与源码文件同目录，以 `.test.ts` 为后缀：

| 测试文件 | 测试内容 |
|---------|---------|
| `src/core/cache.test.ts` | CacheManager 的 get/set/clear/dispose |
| `src/core/afk.test.ts` | AfkDetector 的活动检测逻辑 |
| `src/core/format.test.ts` | fmtNum 数字格式化（K/M/B 缩写） |
| `src/core/types.test.ts` | getColorLevel 颜色等级计算 |
| `src/services/glm/provider.test.ts` | GLM 数据解析逻辑 |
| `src/services/kimi/provider.test.ts` | Kimi 数据解析逻辑（窗口限制、主配额、余额） |
| `src/services/mimo/provider.test.ts` | MiMo 数据解析逻辑 |
| `src/services/bridge/provider.test.ts` | Bridge 状态数据提供者 |
| `src/storage/persistence.test.ts` | 历史数据加载、保存、合并、清理 |
| `src/ui/statusBarRenderer.test.ts` | 倒计时格式化、颜色计算 |

### 测试规范

- 测试文件与源码文件同目录，命名：`{source}.test.ts`
- 使用 `src/test/mocks/vscode.ts` 提供的 VSCode API mock
- 单元测试聚焦纯函数（数据解析、格式化、计算逻辑），不涉及 Webview 和 VSCode UI

---

## 编码规范

- **语言**: TypeScript，严格模式 (`strict: true`)
- **命名**: PascalCase (类/接口), camelCase (函数/变量), UPPER_SNAKE_CASE (常量)
- **代码检查**: ESLint + @typescript-eslint
- **提交规范**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- **注释语言**: 中文

---

## 已知技术债务

1. **配置未完全接入 VSCode Settings API** — `package.json` 声明了 `configuration` 属性，`config.ts` 的 `setState()` 对刷新间隔、预警阈值、AFK 阈值三项会同步写入 VSCode Settings，但**读取时仍优先 `globalState`**（仅当 `globalState` 无值时回退到 Settings）。理想应统一以 Settings 为唯一可信源。
2. **Webview JS 为字符串拼接** — 模板函数返回内联 JS 字符串，无类型检查，维护成本高。可考虑构建时模板编译改善。

> 注：早期版本中 `warnThreshold` 声明但未使用，现已实现 `checkQuotaWarnings()`（`extension.ts`），超阈值弹出 VSCode 警告通知（30 分钟冷却），不再属于技术债务。

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
  1. 在 `src/services/` 创建新目录（结构参考 `glm/`、`kimi/` 或 `mimo/`）
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
- **编写测试**: 在对应模块旁创建 `{source}.test.ts`，使用 vitest

---

## 附录：第三方 API 接口参考

以下接口信息供开发和调试参考，实际请求逻辑封装在各服务的 `provider.ts` 中。

### GLM Coding Plan (CN)

**用量统计（配额限制）**
```
GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
Authorization: Bearer {API_KEY}
```

**模型用量详情**
```
GET https://open.bigmodel.cn/api/monitor/usage/model-usage?startTime=YYYY-MM-DD+00:00:00&endTime=YYYY-MM-DD+23:59:59
Authorization: Bearer {API_KEY}
```

**工具用量详情**
```
GET https://open.bigmodel.cn/api/monitor/usage/tool-usage?startTime=YYYY-MM-DD+00:00:00&endTime=YYYY-MM-DD+23:59:59
Authorization: Bearer {API_KEY}
```

**套餐有效期**
```
GET https://open.bigmodel.cn/api/biz/subscription/list
Authorization: Bearer {API_KEY}
```

**响应结构示例**

用量统计返回 `data.limits` 数组，包含多个配额项：
- `type`: `TOKENS_LIMIT` | `TIME_LIMIT`
- `unit`/`number`: 周期定义（如 unit=3, number=5 表示每5小时）
- `percentage`: 已使用百分比
- `nextResetTime`: 下次重置时间（Unix 时间戳）
- `usageDetails`: TIME_LIMIT 类型包含各模型/工具的用量明细

模型用量返回 `data.x_time`（时间轴）、`tokensUsage`（总 Token 消耗数组）、`modelDataList`（各模型分时数据）、`totalUsage.modelSummaryList`（模型汇总）。

工具用量返回 `data.networkSearchCount`、`webReadMcpCount`、`zreadMcpCount` 数组，以及 `toolDataList`（各工具分时数据）。

### Kimi Membership

**用量统计（频限 + 本周）**
```
POST https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
connect-protocol-version: 1

{"scope": ["FEATURE_CODING"]}
```

**会员等级与月权益**
```
POST https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscription
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
connect-protocol-version: 1

{}
```

**响应结构示例**

用量统计返回 `usages` 数组，每个 usage 包含：
- `scope`: 功能标识（如 `FEATURE_CODING`）
- `detail.limit`/`used`/`remaining`/`resetTime`: 配额详情
- `limits`: 子限额列表（含 window.duration 和 window.timeUnit）

会员信息返回 `subscription`（套餐信息）、`balances`（权益余额列表，含 `amountUsedRatio` 使用率）、`capabilities`（功能并行度约束）。

### Xiaomi MiMo Token Plan

**当前套餐用量**
```
GET https://platform.xiaomimimo.com/api/v1/tokenPlan/usage
Cookie: {COOKIE}
```

**套餐等级详情**
```
GET https://platform.xiaomimimo.com/api/v1/tokenPlan/detail
Cookie: {COOKIE}
```

**响应结构示例**

用量返回 `data.monthUsage`（月度总览）和 `data.usage`（套餐用量明细）：
- `monthUsage.items`: 月度 Token 统计（`month_total_token`）
- `usage.items`: 包含 `plan_total_token`（套餐额度）和 `compensation_total_token`（补偿额度）
- 每项含 `used`/`limit`/`percent`

套餐详情返回 `data.planCode`/`planName`/`currentPeriodEnd`/`expired`/`enableAutoRenew`。

---

## 浏览器扩展架构

浏览器扩展同时提供 **Cookie Bridge**（凭证转发）和 **仪表盘**（配额监控）两个功能。

### 目录结构

项目采用「共享代码 + 浏览器差异文件」架构，Chrome/Firefox 共用 `browser-common/` 中的代码：

```
browser-common/                # 共享代码（单一可信源）
├── browser-api.js             # 浏览器 API 兼容层（预留）
├── cache.js                   # 基于 storage.local 的带 TTL 缓存（正常 60s / 错误 300s）
├── config.js                  # 集中式配置管理（loadConfig/saveConfig）
├── constants.js               # 共享常量（BRIDGE_PROBE_SECRET 探测密钥）
├── offscreen.html             # Offscreen 文档：双层凭证刷新（fetch → iframe 回退）
├── popup.html                 # Popup 仪表盘 HTML
├── popup.js                   # Popup 主逻辑（仪表盘 + 设置 + 服务管理）
├── dashboard.html             # 独立仪表盘页面 HTML
├── dashboard.js               # 独立仪表盘逻辑
├── styles.css                 # 共享样式表
├── templates.js               # 卡片渲染模板（GLM/Kimi/MiMo + SVG 图表 + Tab 切换）
├── api/
│   ├── glm.js                 # GLM API 客户端（Bearer Token 认证）
│   ├── kimi.js                # Kimi API 客户端（kimi-auth Cookie 值作 Bearer Token 认证）
│   └── mimo.js                # MiMo API 客户端（Cookie 认证）
└── scripts/
    └── background.js          # Service Worker（Cookie Bridge + 凭证检测 + 自动刷新）

chrome/                         # Chrome/Edge 专属文件
├── manifest.json               # Manifest V3（service_worker 模式 + offscreen 权限）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png

firefox/                        # Firefox 专属文件
├── manifest.json               # Manifest V3（scripts 数组 + browser_specific_settings.gecko）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 构建流程（build.sh）

`build.sh` 采用「复制 → 打包 → 清理」策略：

1. 将 `browser-common/*` 完整复制到 `chrome/` 和 `firefox/`
2. 分别打 zip 包：`ai-quota-dashboard-chrome-v1.1.0.zip` / `ai-quota-dashboard-firefox-v1.1.0.zip`
3. 清理阶段：从 `chrome/` 和 `firefox/` 中删除复制进来的文件，仅保留 `manifest.json` 和 `icons/`
4. 打包 VSCode 扩展（`vsce package`）

### 共享模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 浏览器 API 兼容层 | `browser-api.js` | 统一 `chrome.*` / `browser.*` API 差异（当前为预留层） |
| 缓存 | `cache.js` | 基于 `chrome.storage.local` 的带 TTL 缓存（正常 60s / 错误 300s） |
| 配置管理 | `config.js` | 集中式 `loadConfig()` / `saveConfig()` |
| 共享常量 | `constants.js` | `BRIDGE_PROBE_SECRET` 探测密钥（访问 `/health` 的第一层门槛） |
| Popup 主逻辑 | `popup.js` | 仪表盘弹窗 + 设置管理，导入 config.js 和 cache.js |
| 卡片模板 | `templates.js` | GLM / Kimi / MiMo 配额卡片和 SVG 图表模板 |
| 样式表 | `styles.css` | Popup 和卡片样式 |

### Cookie Bridge 推送机制

**核心逻辑**：浏览器扩展作为统一凭证推送端，总是将所有目标站点的 Cookie/API Key 推送给 VSCode。VSCode 端收到后会自动分发到对应的 AI 服务（GLM/Kimi/MiMo），写入 Secret Storage 并更新 `dataSource='bridge'`，无需手动配置。

1. `popup.js` 维护 `config.services` 列表，保存在 `chrome.storage.local`（key: `dashboardConfig`）
2. `background.js` 启动后总是尝试发现 VSCode Bridge 端口并推送全部凭证
3. `chrome.cookies.onChanged` 监听所有目标站点 Cookie（kimi.com / xiaomimimo.com）变化
4. Cookie 变化或 GLM API Key 变化时，通过防抖推送给 VSCode
5. 添加/删除服务时，popup 发送 `configUpdated` 消息通知 background 重新推送

```
浏览器扩展启动
    │
    ├─ discoverPort() → 扫描 37100..37110，连接 VSCode Bridge
    ├─ relayCookies(true) → 采集全部凭证
    │     ├─ gatherAllCookies() → kimi-auth / MiMo Cookie
    │     ├─ gatherAllStorageCredentials() → GLM API Key
    │     └─ POST /cookies → VSCode Bridge
    │
    ├─ VSCode Bridge 更新 Bridge 服务状态
    ├─ VSCode 分发凭证到对应 AI 服务（Secret Storage + dataSource='bridge'）
    └─ 清除缓存 + 触发 pullAll() 刷新所有服务数据
```

### Cookie Bridge 端口发现

VSCode Bridge 服务器启动时通过以下机制让浏览器扩展自动发现端口：

1. **端口范围**：预定义 fallback 端口列表 `[37100..37110]`，顺序尝试直到找到可用端口绑定 `127.0.0.1`
2. **PID 端口文件**：VSCode 端写入 `os.tmpdir()/.ai-quota-bridge-port-{pid}`（权限 0600），仅用于本地进程管理、避免多 VSCode 实例冲突
3. **浏览器扩展发现**：Chrome 扩展无法读文件系统，改用**探测 `/health` 端点**——优先尝试上次成功的端口（`storage.local` 的 `bridgeLastPort`），失败后遍历 `[37100..37110]` 逐个 `GET /health`（请求头携带打包进扩展的 `X-Bridge-Probe` 探测密钥），密钥校验通过后从响应获取 `authToken`

### 凭证失效检测 + 自动刷新

**检测机制**（每 30 分钟执行一次）：

1. **Cookie 存在性检查**：`chrome.cookies.get()` 确认 Cookie 存在
2. **过期时间检查**：非 session cookie 检查 `expirationDate`
3. **API 探测**：
   - GLM：`GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`（Bearer Token 认证）
   - Kimi：`GET https://www.kimi.com/api-user/user/info`（Bearer Token 认证）
   - MiMo：`GET https://platform.xiaomimimo.com/api/v1/tokenPlan/detail`（Cookie 认证）
   - 返回 401/403 或业务码非 0 = 凭证失效

**自动刷新机制（三层降级策略）**：

凭证刷新完全对用户不可见（无窗口弹出、无任务栏图标），采用三层降级：

1. **Offscreen API（Chrome 116+）**：首选方案
   - `chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['IFRAME_SCRIPTING'] })`
   - Offscreen 文档内执行**双层刷新**：
     - **第一层（fetch）**：先 `fetch(url)` 请求目标网站，快速触发服务端 Set-Cookie（无需渲染页面）
     - **第二层（iframe 回退）**：若 fetch 后 Cookie 未变化，创建隐藏 `<iframe src={url}>` 让页面 JS 完整执行（覆盖 JS 设置的 Cookie 场景）
   - 完成后 `chrome.offscreen.closeDocument()` 清理资源

2. **最小化弹出窗口（Firefox / Chrome <116 降级）**：
   - `chrome.windows.create({ type: 'popup', focused: false, state: 'minimized', url })`
   - 窗口最小化到任务栏，用户不可见
   - 等待 `chrome.tabs.onUpdated` → `status: 'complete'` + 额外 2 秒延迟
   - 关闭窗口

3. **刷新后验证**：
   - 重新检测 Cookie 是否更新
   - 成功后自动 `relayCookies(true)` 推送给 VSCode

```
检测到凭证失效
    │
    ├─ Chrome 116+ ?
    │   ├─ Yes → loadViaOffscreen(url, cookieUrl, cookieNames)
    │   │         ├─ fetch(url) → 检查 Cookie 是否变化
    │   │         └─ 未变化 → 创建 iframe → 等待加载 → 再检查
    │   └─ No  → loadViaMinimizedWindow(url)
    │             └─ 创建最小化 popup 窗口 → 等待加载 → 关闭
    │
    └─ 验证刷新结果 → relayCookies(true) → 推送给 VSCode
```

### 消息协议（Popup ↔ Background）

| 消息方向 | action | 说明 |
|---------|--------|------|
| Popup → Background | `relayNow` | 手动触发推送全部凭证到 VSCode |
| Popup → Background | `getStatus` | 获取 Bridge 连接状态 + 诊断信息 |
| Popup → Background | `configUpdated` | 配置变更通知（添加/删除/保存服务后发送） |
| Popup → Background | `checkCredentials` | 手动触发凭证检测 + 自动刷新 |
| Background → Popup/Dashboard | `cookieChanged` | Cookie 变化即时通知（含服务类型，触发单服务刷新） |

`getStatus` 响应：
```javascript
{
  connected: boolean,      // 是否已连接 VSCode Bridge
  port: number | null,     // 当前活跃端口
  activeKinds: string[],   // 当前活跃的服务类型列表（保留字段）
  lastError: string | null, // 最后连接/推送失败的诊断信息
}
```

### Cookie 变化即时刷新

当 Background 检测到目标站点 Cookie 发生变化时，自动广播 `cookieChanged` 消息给所有已打开的 Popup/Dashboard 页面：

1. **触发源**：`chrome.cookies.onChanged` 监听器（处理所有目标站点 Cookie）
2. **消息格式**：`{ action: 'cookieChanged', kind: 'kimi' }`
3. **响应逻辑**：Popup/Dashboard 收到消息后，经 2 秒防抖后调用 `refreshSingleService(kind)` 仅刷新受影响的服务卡片
4. **错误数据缓存**：缓存写入时区分正常/错误数据，错误数据 TTL 为 300 秒（正常 60 秒），避免频繁重试失败请求

### 服务配置数据模型

```javascript
// chrome.storage.local: 'dashboardConfig'
{
  services: [
    {
      id: 'bridge-1714000000000',  // {kind}-{timestamp}
      kind: 'bridge',              // 'bridge' | 'glm' | 'kimi' | 'mimo'
      name: 'Cookie Bridge',       // 显示名称
      enabled: true,
    },
    // ...
  ],
  glmApiKey: 'xxx.xxx.xxx',     // GLM API Key（浏览器扩展本地配置）
  settings: {
    refreshInterval: 600,        // 自动刷新间隔（秒）
    warnThreshold: 0.8,          // 预警阈值
  },
}
```

### Cookie Bridge 推送数据格式

```javascript
// POST http://127.0.0.1:{port}/cookies
{
  source: 'ai-quota-cookie-bridge',
  timestamp: number,
  cookies: [
    { service: 'kimi', name: 'kimi-auth', value: '...', domain: '.kimi.com', path: '/' },
    { service: 'mimo', name: 'api-platform_serviceToken', value: '...', domain: '.xiaomimimo.com', path: '/' },
    { service: 'mimo', name: 'userId', value: '...', domain: '.xiaomimimo.com', path: '/' },
  ],
  kimiAuthToken: '...',         // kimi-auth Cookie 值（方便 VSCode 直接用作 Bearer Token）
  mimoCookie: 'name1=val1; name2=val2',  // MiMo Cookie 组合字符串
  glmApiKey: '...',             // GLM API Key（浏览器扩展推送的 API Key）
  activeKinds: ['kimi', 'mimo', 'glm'],  // 浏览器扩展当前活跃的服务类型，VSCode 据此同步移除已删除服务
}
```

### Popup 仪表盘功能

Popup 打开后直接显示仪表盘（420px 宽弹窗），采用**三个平级 Tab**（仪表盘 / 服务 / 设置）：

- **仪表盘 Tab**：显示所有已启用服务的配额卡片
  - GLM：配额进度条 + 模型/工具用量详情 + SVG 曲线图（支持当日/近7天/近30天 Tab 切换）
  - Kimi：配额进度条 + 会员等级 + 有效期
  - MiMo：套餐用量 + 补偿 Token + 有效期 + 自动续费状态
- **服务 Tab**：
  - 服务管理：添加/删除/保存服务
  - Cookie Bridge 状态：全局连接状态和诊断信息（位于服务列表顶部）
- **设置 Tab**：
  - 全局设置：刷新间隔、预警阈值
  - 数据管理：清除缓存

### 浏览器扩展与 VSCode 扩展的关系

```
浏览器扩展
├── 功能 1：仪表盘（独立工作）
│   └── Popup 中直接调用 API 查看配额，不依赖 VSCode
│
└── 功能 2：Cookie Bridge（需要 VSCode 扩展）
    ├── 将浏览器凭证（Kimi/MiMo Cookie / GLM API Key）转发给 VSCode
    └── VSCode 端自动分发凭证到对应的 AI 服务，并展示连接状态和已接收凭证种类
```

### Chrome 与 Firefox 的差异

| 差异点 | Chrome | Firefox |
|--------|--------|---------|
| Manifest | 标准 V3 + `offscreen` 权限 | V3 + `browser_specific_settings.gecko` |
| Background | `service_worker` | `scripts`（数组） |
| 扩展 ID | 自动生成 | 需在 manifest 中显式声明 |
| Cookie API | `chrome.cookies` | `chrome.cookies`（Firefox 内置兼容） |
| 凭证刷新 | Offscreen API（fetch → iframe 双层策略） | 最小化弹出窗口降级方案 |
| 持久性 | Service Worker 非持久 | 事件页面 |
| 最小版本 | Chrome 116+ | Firefox 116+ |

---

*最后更新: 2026-06-15*
