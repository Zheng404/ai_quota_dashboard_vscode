# ai_quota_dashboard_vscode

> VSCode 扩展插件 — AI Coding Plan 配额用量仪表盘。实时追踪 GLM Coding Plan (CN)、Kimi Membership、Xiaomi MiMo Token Plan 等 AI 服务的配额消耗情况，帮助开发者避免超额使用。

## 项目定位

AI 配额用量仪表盘（不是行为追踪器）。所有配额数据本地存储，不上传云端。

### 当前支持的服务

| 服务 | 目录 | 数据来源 | 特色功能 |
|------|------|---------|---------|
| Data Bridge | `vscode/src/services/bridge/` | 浏览器扩展推送配额数据 | 数据接收服务：浏览器扩展用自身凭证调 API 拉取配额并推送过来，VSCode 自动创建/更新对应 AI 服务（`dataSource='bridge'`），同时展示连接状态和已接收数据种类。**不再传输任何凭证** |
| GLM Coding Plan (CN) | `vscode/src/services/glm/` | API Key（手动输入）或 Data Bridge 推送 | 配额卡片 + 模型/工具用量详情 + SVG 曲线图 |
| Kimi Membership | `vscode/src/services/kimi/` | Code API Key（`sk-`，手动输入） | 频率限制明细（5h）+ 本周用量双槽进度条 |
| Xiaomi MiMo Token Plan | `vscode/src/services/mimo/` | Cookie（手动输入）或 Data Bridge 推送 | 套餐用量统计 + 补偿 Token 额度 + 有效期展示 + 自动续费状态 |

---

## 架构总览

```
ai_quota_dashboard_vscode/     # 仓库根
├── vscode/                    # VSCode 扩展
│   ├── src/
│   │   ├── extension.ts       # 扩展入口：activate/deactivate、命令注册、轮询循环
│   │   ├── bridge/
│   │   │   └── server.ts      # DataBridgeServer：本地 HTTP 服务器（监听 37100..37110，接收浏览器扩展推送的配额数据）
│   │   ├── core/              # 核心模块
│   │   │   ├── types.ts       # 基础类型：ServiceProfile、QuotaSlot、ServiceData 等
│   │   │   ├── config.ts      # 配置管理（Settings 唯一可信源 + Secret Storage + globalState）
│   │   │   ├── fetch.ts       # HTTP 客户端（httpRequest + getJson + postJson）
│   │   │   ├── format.ts      # 数字格式化 (fmtNum)
│   │   │   ├── cache.ts       # 内存缓存管理器 (CacheManager, 60s TTL)
│   │   │   ├── afk.ts         # AFK 检测器 (AfkDetector)
│   │   │   └── *.test.ts      # 单元测试（afk/cache/format/types）
│   │   ├── services/          # 服务层（ServiceDescriptor 注册表模式）
│   │   │   ├── registry.ts    # 服务注册表：kind → ServiceDescriptor 映射
│   │   │   ├── types.ts       # QuotaProvider / StatusBarRenderer / DetailProvider 接口
│   │   │   ├── bridge/        # Data Bridge 服务包
│   │   │   │   ├── index.ts         # Bridge ServiceDescriptor 组装
│   │   │   │   ├── provider.ts      # Bridge 状态数据提供者
│   │   │   │   ├── provider.test.ts # Bridge 状态数据提供者单元测试
│   │   │   │   ├── state.ts         # Bridge 状态持久化（globalState）
│   │   │   │   ├── statusBar.ts     # Bridge 状态栏渲染器
│   │   │   │   ├── styles.ts        # Bridge 专属 CSS（类名 .bridge-*）
│   │   │   │   ├── settings.ts      # Bridge 设置表单元数据
│   │   │   │   └── types.ts         # BridgeServiceData 扩展数据类型
│   │   │   ├── glm/           # GLM 服务包
│   │   │   │   ├── index.ts         # GLM ServiceDescriptor 组装
│   │   │   │   ├── provider.ts      # GLM 数据拉取 + 解析 + DetailProvider
│   │   │   │   ├── provider.test.ts # GLM 数据解析单元测试
│   │   │   │   ├── statusBar.ts     # GLM 状态栏渲染器 (StatusBarRenderer)
│   │   │   │   ├── constants.ts     # GLM 配额标签常量
│   │   │   │   ├── types.ts         # GlmServiceData + ModelUsageData + ToolUsageData
│   │   │   │   ├── template.ts      # GLM 仪表盘卡片模板（JS 字符串，含 SVG 图表）
│   │   │   │   ├── styles.ts        # GLM 专属 CSS
│   │   │   │   └── settings.ts      # GLM 设置表单元数据
│   │   │   ├── kimi/          # Kimi 服务包（结构同 GLM）
│   │   │   │   ├── index.ts
│   │   │   │   ├── provider.ts      # Kimi 数据拉取（Code API，仅 sk- Key 单路径）
│   │   │   │   ├── provider.test.ts # Kimi 数据解析单元测试
│   │   │   │   ├── statusBar.ts
│   │   │   │   ├── constants.ts
│   │   │   │   ├── types.ts
│   │   │   │   ├── template.ts
│   │   │   │   ├── styles.ts
│   │   │   │   └── settings.ts
│   │   │   └── mimo/          # MiMo 服务包（结构同 GLM/Kimi，但无 constants.ts）
│   │   │       ├── index.ts
│   │   │       ├── provider.ts
│   │   │       ├── provider.test.ts # MiMo 数据解析单元测试
│   │   │       ├── statusBar.ts
│   │   │       ├── types.ts
│   │   │       ├── template.ts
│   │   │       ├── styles.ts
│   │   │       └── settings.ts
│   │   ├── storage/
│   │   │   ├── persistence.ts      # 历史数据持久化（globalState，30 天保留）
│   │   │   └── persistence.test.ts # 历史数据（加载/保存/合并/清理）单元测试
│   │   ├── ui/
│   │   │   ├── statusbar.ts              # 状态栏通用调度器（通过 ServiceDescriptor 分发）
│   │   │   ├── statusBarRenderer.ts      # StatusBarRenderer 接口 + 共享工具函数
│   │   │   └── statusBarRenderer.test.ts # 倒计时格式化、颜色计算单元测试
│   │   ├── dashboard/          # 侧边栏 Webview 仪表盘
│   │   │   ├── webviewView.ts  # WebviewViewProvider（HTML 骨架 + 消息路由 + bundle 外链注入/nonce/CSP）
│   │   │   └── styles.ts       # 通用 CSS + 聚合各服务样式
│   │   ├── webview/            # Webview 前端源码（TS 模块，构建期编译为 media/dashboard.js IIFE bundle）
│   │   │   ├── main.ts         # 前端入口：卡片显式注册 + 消息循环 + 视图调度
│   │   │   ├── shared.ts       # 内置卡片注册表 + renderService 分发 + vscodeApi 封装
│   │   │   ├── settings.ts     # 设置页渲染 + 事件绑定（数据驱动，无 kind 硬编码）
│   │   │   ├── types.ts        # 前端消息/视图类型定义
│   │   │   └── cards/          # 各服务卡片渲染模块：glm.ts / kimi.ts / mimo.ts（导出 registerXxxCard()）
│   │   ├── commands/
│   │   │   └── index.ts        # clearHistory 命令
│   │   └── test/
│   │       └── mocks/
│   │           └── vscode.ts   # VSCode API mock（供 vitest 使用）
 │   ├── resources/              # 扩展图标（icon.png / icon.svg）
 │   ├── media/                  # Webview 构建产物（dashboard.js，esbuild 生成，勿手改/勿提交思维）
 │   ├── out/                    # 扩展构建产物（extension.js cjs bundle，esbuild 生成，勿手改）
 │   ├── package.json            # 扩展清单（命令、配置、激活事件、构建 scripts）
 │   ├── tsconfig.json           # TypeScript 类型检查配置（strict + noEmit，emit 由 esbuild 承担）
 │   ├── esbuild.config.mjs      # VSCode 扩展打包配置（extension → out/、webview → media/）
 │   ├── esbuild.browser.mjs     # 浏览器扩展 background 打包配置（IIFE → build/staging/）
 │   ├── vitest.config.ts        # vitest 测试配置
 │   ├── eslint.config.mjs       # ESLint 配置
 │   ├── .vscodeignore           # vsce 打包排除清单
 │   └── CHANGELOG.md
├── browser-common/             # 浏览器扩展共享代码（Chrome/Firefox 单一可信源）
│   ├── cache.js                # 基于 storage.local 的带 TTL 缓存（正常 60s / 错误 300s）
│   ├── config.js               # 集中式配置管理（loadConfig/saveConfig）
│   ├── shared-ui.js            # Popup/Dashboard 共享 UI 工厂（createSharedUI，页面差异经选项注入）
│   ├── popup.html / popup.js   # Popup 仪表盘（页面专属逻辑，主体由 shared-ui.js 承载）
│   ├── dashboard.html / dashboard.js  # 独立仪表盘页面（同上）
│   ├── styles.css              # 共享样式表
│   ├── templates.js            # 卡片渲染模板（GLM/Kimi/MiMo + SVG 图表 + Tab 切换）
│   ├── api/                    # API 客户端：glm.js / kimi.js / mimo.js
│   ├── protocol/               # Data Bridge 协议共享层（双端单一可信源：常量/消息/DataPayload 构造与校验）
│   └── scripts/
│       ├── background.js       # Service Worker 瘦入口（init + 事件注册 + 编排；开发态 ESM 直载）
│       ├── lib/                # background 子模块（config-sync / bridge-client / cookie-utils / credential / kimi-relay / relay；发布态经 esbuild 内联进 IIFE bundle）│       └── kimi-content.js     # Kimi content script（镜像 kimi.com localStorage 令牌；classic 注入不参与打包）
├── chrome/                     # Chrome/Edge 专属文件
│   ├── manifest.json           # Manifest V3（service_worker 模式 + content_scripts）
│   └── icons/                  # icon16.png / icon48.png / icon128.png
├── firefox/                    # Firefox 专属文件
│   ├── manifest.json           # Manifest V3（scripts 数组 + browser_specific_settings.gecko）
│   └── icons/                  # icon16.png / icon48.png / icon128.png
├── .github/workflows/          # CI 工作流：ci.yml（构建测试）/ release.yml（发布）
├── .vscode/                    # 编辑器配置：launch.json（F5 调试）/ tasks.json / settings.json / extensions.json
├── build.sh                    # 一键打包脚本（浏览器扩展 zip + VSCode VSIX；版本号以 vscode/package.json 为准）
├── build/                      # 打包产物（chrome/firefox zip + vsix + staging/ 组装目录，由 build.sh 生成；已 gitignore）
├── README.md / DEVELOPMENT.md / SECURITY.md / AGENTS.md  # 项目文档
└── LICENSE
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 运行时 | Node.js (VSCode Extension Host) |
| 框架 | VSCode Extension API |
| 构建 | tsc（类型检查 noEmit）+ esbuild（打包：extension cjs / webview iife / background iife） |
| 代码检查 | ESLint + @typescript-eslint |
| 测试 | vitest |
| 数据存储 | globalState + Secret Storage |
| 可视化 | Webview (HTML + 构建期编译 JS `media/dashboard.js`，SVG 图表) |

### 核心设计模式：ServiceDescriptor 注册表

每个 AI 服务是一个完整的「包」，包含数据提供者、仪表盘模板、样式和设置元数据：

```typescript
interface ServiceDescriptor {
  kind: ServiceId;              // 'bridge' | 'glm' | 'kimi' | 'mimo' | ...
  displayName: string;          // 'Data Bridge' | 'GLM Coding Plan (CN)'
  defaultName: string;          // 添加时的默认名称
  badgeLabel: string;
  badgeCssClass: string;
  provider: QuotaProvider;      // 数据拉取逻辑
  styles: string;               // 专属 CSS
  settings: ServiceSettingsDescriptor;  // 设置表单元数据
  statusBarRenderer?: StatusBarRenderer;  // 状态栏渲染器（可选）
  detailProvider?: DetailProvider;        // 详情数据提供者（可选，用于懒加载）
  mergeDetailData?(existing: ServiceData, detail: unknown, range: string): void;  // 合并详情数据
  helpCommand?: string;         // 帮助命令标识
  helpMessage?: string;         // 帮助提示内容
}
```

> 注：早期版本含 `templateScript: string` 字段（服务包向 Webview 注入 JS 字符串模板），已随构建链 epic 移除——卡片渲染迁移至 `src/webview/cards/{kind}.ts` TS 模块，经 `main.ts` 显式注册（见「Webview 前端架构」章），具备完整类型检查。

新增服务只需在 `src/services/` 新建目录，实现上述结构，然后在 `src/services/registry.ts` 注册即可。`bridge` 服务（Data Bridge）负责接收浏览器扩展推送的配额数据，并自动创建/更新对应的 AI 服务（标记 `dataSource='bridge'`）。bridge 数据源的 AI 服务**不再发网络请求、不需要也不存储任何凭证**，数据完全来自浏览器推送。同一 kind 可同时存在 manual 与 bridge-fed 服务互不干扰：分发只接管 `dataSource='bridge'` 的服务，若该 kind 已存在 manual 服务则**另行新建** bridge-fed 服务并存，绝不修改 manual profile、绝不删除其 Secret。bridge-fed 服务**不在服务标签页单独展示**（连接状态、已接收数据种类整合在 Data Bridge 条目内）；移除 Data Bridge 服务时**级联移除**全部 bridge-fed 服务（纯派生、无用户凭证，浏览器下次推送自动重建），改为手动输入的路径是「移除 Data Bridge 服务 → 手动添加同 kind 服务」。

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

Data Bridge（独立数据流，仅当用户添加了 Data Bridge 服务后启动）：
syncBridgeLifecycle() 按需启停：
    ├─ 有 kind='bridge' profile → ensureBridgeRunning()（启动 DataBridgeServer 监听 37100）
    └─ 无 kind='bridge' profile → stopBridgeIfIdle()（关闭端口、释放资源）

浏览器扩展 → POST /data → DataBridgeServer → handleDataPayload()
    │
    ├─ 更新 Bridge 服务状态（connected、lastPushAt、receivedKinds）
    ├─ 自动创建/更新对应 AI 服务（dataSource='bridge'，无需凭证）
    ├─ 推送的 serviceData 写入 bridgeDataStore（模块级 Map，活到下次推送）
    ├─ 标记 Bridge profile 为已连接
    └─ 热重载：保留旧数据 + 标记 refreshingIds + updateView()（卡片不中断）

注意：bridge 数据源的 AI 服务数据完全来自浏览器扩展推送（浏览器端用自身凭证调 API 拉取），
VSCode 端不再为其发网络请求、也不存储任何 Secret 凭证。Secret Storage 中历史遗留的 bridge
凭证由一次性迁移 migrateBridgeCredentials() 清理（标记 aiQuotaDashboard.bridgeSecretsCleared）。
手动配置（dataSource='manual'）服务不受影响。Bridge 服务器仅当用户添加了 Data Bridge 服务后
才会启动监听。已知行为：bridge-fed 服务被移除后，若浏览器仍推送该 kind 会自动重建；
推送数据带 history 时会与本地历史按日期去重合并。
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
  dataSource?: 'manual' | 'bridge';  // 认证方式：手动输入或 Data Bridge 推送
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

// Kimi 专属扩展（浏览器端网页 token relay 模式使用；VSCode 端 Code API 路径无订阅信息，以下字段留 undefined）
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

1. **标记刷新态**：`pullService` / `doPullAll` / `afterConfigChange` / `handleDataPayload` 在拉取前把服务 ID 加入 `refreshingIds`
2. **推旧数据**：立即 `updateView()`，此时前端拿到旧数据 + refreshingIds，对应服务刷新按钮旋转（`.spinning svg` 动画），卡片内容不中断
3. **拉取完成**：逐个清除 `refreshingIds` 标记，再次 `updateView()` 推送新数据
4. **加载骨架卡**：首次添加/无数据的服务显示轻量 `renderLoadingCard`（卡片框架 + 旋转圆环），不再用红色错误卡占位

```typescript
const refreshingIds = new Set<string>();  // extension.ts 模块级
// updateView 把 refreshingIds 作为第三参数传给 webview
dashboardViewProvider.update(serviceData, settings, Array.from(refreshingIds));
```

### Data Bridge 按需生命周期

Bridge 服务器**仅在用户添加了 Data Bridge 服务后启动**，而非扩展激活即启动。生命周期由三个函数管理：

| 函数 | 职责 |
|------|------|
| `syncBridgeLifecycle(bar, ctx)` | 入口：有 `kind='bridge'` profile 则 `ensureBridgeRunning`，否则 `stopBridgeIfIdle`。在 `activate()` 和每次 `afterConfigChange()` 后调用 |
| `ensureBridgeRunning(bar, ctx)` | 幂等：若服务器已运行直接返回；否则新建 `DataBridgeServer`、`start(37100)`、**成功后才**赋值给模块级 `bridge` 并 push subscriptions、注册回调 `handleDataPayload`（接收浏览器推送的配额数据）。失败时 dispose 候选实例，允许下次重试 |
| `stopBridgeIfIdle(ctx)` | 若当前无 Bridge profile，则 `bridge.dispose()`、从 subscriptions 移除、置 `bridge = undefined` |

---

## 配置存储

| 数据 | 存储位置 | Key |
|------|---------|-----|
| 服务列表 | `globalState` | `services` |
| API Keys | `Secret Storage` | `apiKeys.{serviceId}` |
| Bridge 状态 | `globalState` | `aiQuotaDashboard.bridgeState`（connected / lastPushAt / receivedKinds / lastError） |
| 迁移标记 | `globalState` | `aiQuotaDashboard.bridgeSecretsCleared`（bridge 凭证一次性迁移清理完成后写入） |
| 迁移标记 | `globalState` | `aiQuotaDashboard.configMigrated`（globalState → Settings 一次性迁移完成后写入） |
| 刷新间隔 | VSCode Settings（唯一可信源） | `aiQuotaDashboard.refreshInterval` (默认 600s) |
| 预警阈值 | VSCode Settings（唯一可信源） | `aiQuotaDashboard.warnThreshold` (默认 0.8) |
| AFK 阈值 | VSCode Settings（唯一可信源） | `aiQuotaDashboard.afkThreshold` (默认 3600s) |
| 历史数据 | `globalState` | `aiQuotaDashboard.history` |

**注意**：全局三项设置以 VSCode Settings 为**唯一可信源**；读取时 Settings 无值则回退 `globalState` 旧值（历史版本双写残留），并在回退时触发一次性迁移把旧值搬入 Settings。防重复迁移采用双闸门：会话内存闸门（迁移失败自动重试）+ `aiQuotaDashboard.configMigrated` 持久标记（跨会话生效）。

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

## Webview 前端架构（构建期编译）

Webview 前端为**构建期编译的 TS 模块**（无 inline script、无字符串模板），整体链路：

```
src/webview/（TS 源码，类型安全）
    ├── main.ts        # 入口：registerXxxCard() 显式注册卡片 + 消息循环 + 视图调度
    ├── shared.ts      # 内置卡片注册表 + renderService(data) 分发 + vscodeApi 封装
    ├── settings.ts    # 设置页渲染 + 事件绑定（数据驱动，无 kind 硬编码）
    ├── types.ts       # 前端消息/视图类型定义
    └── cards/*.ts     # 各服务卡片渲染模块（glm / kimi / mimo）
        │
        ▼ esbuild（npm run build，iife、es2020、不 minify）
media/dashboard.js（IIFE 单文件 bundle）
        │
        ▼ webviewView.ts 经 asWebviewUri + nonce 外链注入
Webview 运行（CSP: script-src 仅 ${webview.cspSource}，无 'unsafe-inline'）
```

**关键设计**：

1. **显式注册**：卡片经 `main.ts` 顶部显式调用 `registerXxxCard()` 注册进 `shared.ts` 的内置注册表（模块作用域，类型安全）——`window.serviceTemplates` 全局注册表已废弃，早期 compat prelude（`vscode`/`escapeHtml`/`fmtNum`/`fmtDateTime` 全局暴露）已删除
2. **单一分发**：`shared.ts` 的 `renderService(data)` 按 `data.kind` 从内置注册表分发；未注册 kind 显式报错（强制每个服务实现专属卡片）
3. **无 inline script**：全部 JS 经 `media/dashboard.js` 外链加载；宿主侧仅保留 settings 元数据注入通道 `window.__AQD_SETTINGS_META__`（nonce 保护的 meta 直传，非代码）
4. **消息协议不变**：Extension ↔ Webview 仍走 `postMessage`（见「Webview 通信协议」章），前端类型定义在 `src/webview/types.ts`

```typescript
// 卡片注册示例（src/webview/cards/glm.ts，main.ts 中 registerGlmCard() 启用）
export function registerGlmCard() {
  registerCard('glm', (data: WebviewServiceData) => {
    // 返回 HTML 字符串（模块内 import 共享渲染工具，类型安全）
  });
}
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

> Data Bridge 服务卡片**不在仪表盘显示**（仪表盘通过 `filter(p => p.kind !== 'bridge')` 过滤）。Bridge 的连接状态（连接徽章、最后同步时间、已接收数据种类标签、诊断信息）整合在「服务」标签页的 Bridge 服务条目内（`settings.ts` 的 `renderServiceItem` 的 `isBridgeService` 分支）。

### GLM 详情分析

GLM 仪表盘卡片包含多层结构：

1. **头部**：用户名称 + 等级徽章 / 刷新按钮 + 服务名 + 更新时间
2. **配额区域**：3 个配额卡片（每5小时/每周/MCP每月），含进度条和重置时间
3. **详情区域**：
   - 主 Tab：「模型用量」/「工具用量」
   - 子 Tab：「当日」/「近7天」/「近30天」
   - 内容：SVG 平滑曲线图（二次贝塞尔）+ 汇总统计标签

**懒加载机制**：首次只拉取当日数据，切换时间范围时通过 `requestDetailRange` 命令按需拉取并缓存。bridge 数据源（`dataSource='bridge'`）的 GLM 服务仅提供当日详情，近7天/近30天懒加载会被拦截并提示「该服务数据由 Data Bridge 推送，仅提供当日详情」。

### Kimi 详情分析

Kimi 仪表盘卡片结构（VSCode 端，Code API 路径）：

1. **头部**：用户自定义名称 / 刷新按钮 + 服务名 + 更新时间
2. **配额区域**：2 个配额卡片垂直排列
   - **频率限制明细 (5h)**：基于 `limits` 数组精确匹配 5h 窗口（`duration === 300 && TIME_UNIT_MINUTE`，兜底取最短窗口），含子限额详情
   - **本周用量**：基于 `usage` 主窗口（`usedPercent` 优先，缺失回退 `used/limit` 计算）

VSCode 端无订阅信息（`level` / 会员有效期 / 月度权益额度等字段留空，仅浏览器端网页 token relay 模式展示）。Kimi 不涉及详情懒加载，所有数据在 `provider.ts` 中通过单个请求拉取：

- `GET https://api.kimi.com/coding/v1/usages`（Bearer `sk-` Key）：频率限制明细 + 本周用量

> 浏览器扩展端为双模式：① 网页 token relay（主路径，3 槽全量，含月度权益额度）② Code API Key 手动配置（兜底，2 槽，字段映射与 VSCode 端一致）。

### MiMo 详情分析

MiMo 仪表盘卡片结构：

1. **头部**：用户名称 + 套餐徽章 + 刷新按钮 / 服务名 + 更新时间 / 有效期至
2. **配额区域**：配额卡片垂直排列（当前套餐用量），含进度条；当存在补偿 Token 时额外显示补偿额度卡片

MiMo 不涉及详情懒加载，所有数据在 provider 中一次性拉取（用量 + 套餐详情并行请求）。

---

## 运行与开发

```bash
# ---- VSCode 扩展（在 vscode/ 目录）----
npm run compile      # tsc 纯类型检查（noEmit，不产出文件）
npm run build        # esbuild 打包：extension → out/extension.js、webview → media/dashboard.js
npm run watch        # esbuild 监听模式（extension/webview 两个 bundle 同时监听）
npm run clean        # 清理 out/ 与 media/ 构建产物
npm run lint         # ESLint 检查
npm run test         # 运行 vitest 测试套件
npm run test:watch   # 监听模式运行测试
npm run build:browser # esbuild 打包浏览器扩展 background → build/staging/{chrome,firefox}/scripts/background.js

# ---- 浏览器扩展（仓库根）----
bash build.sh        # staging 组装 + 两平台 zip + VSIX 一键打包
```

> F5 调试 VSCode 扩展前需先 `npm run build`（out/extension.js 与 media/dashboard.js 为 esbuild 产物，`compile` 不再产出）。日常开发用 `npm run watch` 自动重建。

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
| `src/core/config.test.ts` | 配置管理（saveServiceAtomic 原子化、Settings 唯一可信源、一次性迁移双闸门） |
| `src/bridge/server.test.ts` | Bridge 服务器安全校验（Host 白名单/401/415/413/1MB 上限） |
| `src/services/glm/provider.test.ts` | GLM 数据解析逻辑 |
| `src/services/kimi/provider.test.ts` | Kimi 数据解析逻辑（Code API Key 判定、5h 窗口匹配、用量槽解析） |
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

> 注 0：早期「Webview JS 为字符串拼接」的债务已解决（构建链落地）——Webview 前端源码迁移至 `src/webview/` TS 模块，经 esbuild 构建期编译为 `media/dashboard.js` IIFE bundle，具备完整类型检查。
> 注 1：早期「配置未完全接入 VSCode Settings API」的债务已解决（1.1.1）——全局三项设置现以 Settings 为唯一可信源，`globalState` 旧值经一次性迁移（双闸门防重复）后仅作回退。
> 注 2：早期版本中 `warnThreshold` 声明但未使用，现已实现 `checkQuotaWarnings()`（`extension.ts`），超阈值弹出 VSCode 警告通知（30 分钟冷却），不再属于技术债务。

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
  4. 编写 Webview 卡片渲染模块（`src/webview/cards/{kind}.ts`，导出 `registerXxxCard()`），并在 `src/webview/main.ts` 顶部显式调用注册
  5. 编写专属样式（`styles.ts`）
  6. 编写设置元数据（`settings.ts`）
  7. 可选：实现 `StatusBarRenderer` 接口（`statusBar.ts`），否则状态栏显示 `?`
  8. 可选：实现 `DetailProvider` 接口（`provider.ts`）+ `mergeDetailData`（`index.ts`），支持仪表盘详情懒加载。两者需同时提供
  9. 组装 ServiceDescriptor（`index.ts`）
  10. 在 `src/services/registry.ts` 注册

- **修改仪表盘样式**: 编辑对应服务的 `styles.ts`（通用样式在 `src/dashboard/styles.ts`）
- **修改仪表盘渲染**: 编辑对应服务的 `src/webview/cards/{kind}.ts`（注册表与分发逻辑在 `src/webview/shared.ts`）
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

**VSCode 端用量统计（Code API，唯一路径）**
```
GET https://api.kimi.com/coding/v1/usages
Authorization: Bearer {API_KEY}    # Kimi Code API Key（sk- 前缀，长期有效；国际站为 https://api.kimi.ai）
```

**响应结构示例**

- `usage`: 每周主用量窗口（`usedPercent` / `used` / `limit` / `resetAt`）→ 「本周用量」槽位
- `limits`: 频率限制窗口列表，精确匹配 `duration === 300 && TIME_UNIT_MINUTE`（5h）窗口，兜底取换算后最短窗口 → 「频率限制明细 (5h)」槽位
- `resetAt` 兼容 ISO 字符串与 Unix 时间戳（秒/毫秒自动判别）

**浏览器端网页接口（网页 token relay 模式）**

**用量统计（频限 + 本周）**
```
POST https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages
Authorization: Bearer {access_token}
User-Agent: {完整浏览器 UA}
r-timezone: {IANA 时区，如 Asia/Shanghai}
Content-Type: application/json
connect-protocol-version: 1

{"scope": ["FEATURE_CODING"]}
```

**会员等级与月权益**
```
POST https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscription
Authorization: Bearer {access_token}
User-Agent: {完整浏览器 UA}
r-timezone: {IANA 时区，如 Asia/Shanghai}
Content-Type: application/json
connect-protocol-version: 1

{}
```

> 鉴权背景：2026 年 8~9 月 Kimi 废弃 `kimi-auth` Cookie（停止续期 + 签名密钥轮换），网页端改用 localStorage `access_token`（~15 分钟）/ `refresh_token`（~90 天）令牌对。浏览器扩展通过 content script（`kimi-content.js`）被动镜像 `access_token` 发起上述请求（**不调用** RefreshToken 端点，避免踢网页下线）；UA 与 Cookie 由浏览器 fetch 自动携带，仅需手动补 `r-timezone`。

**双端差异**：

- VSCode 端：仅支持 Code API Key（`sk-` 前缀静态 Key，Kimi Code 控制台获取）。非 `sk-` 凭证（如网页 JWT）直接抛引导错误、不发起请求；Data Bridge 架构下浏览器扩展不再推送任何凭证，bridge 数据源的 Kimi 服务数据完全来自浏览器端网页 token relay 拉取后推送
- 浏览器端：双模式——① 网页 token relay（主路径，3 槽全量，含月度权益额度）② Code API Key 手动配置（兜底，2 槽，字段映射与 VSCode 端一致：`usedPercent` 优先、`resetAt` 秒/毫秒/ISO 兼容、5h 窗口精确匹配）

> 注意：`api/kimi.js` 与 `provider.ts` 为两份独立实现，修改任一端时需手动同步另一端（代码内已有注释互指，此处文档化）。

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

浏览器扩展同时提供 **Data Bridge**（配额数据推送）和 **仪表盘**（配额监控）两个功能。浏览器扩展**不再向 VSCode 推送任何凭证**（Cookie / API Key 均不推），改为浏览器端用自身凭证调 API 拉取配额数据，把配额数据推送给 VSCode 展示。

### 目录结构

项目采用「共享代码 + 浏览器差异文件」架构，Chrome/Firefox 共用 `browser-common/` 中的代码：

```
browser-common/                # 共享代码（单一可信源）
├── cache.js                   # 基于 storage.local 的带 TTL 缓存（正常 60s / 错误 300s）
├── config.js                  # 集中式配置管理（loadConfig/saveConfig）
├── shared-ui.js               # Popup/Dashboard 共享 UI 工厂（createSharedUI，页面差异经选项注入）
├── popup.html                 # Popup 仪表盘 HTML
├── popup.js                   # Popup 页面专属逻辑（主体由 shared-ui.js 承载）
├── dashboard.html             # 独立仪表盘页面 HTML
├── dashboard.js               # 独立仪表盘页面专属逻辑（同上）
├── styles.css                 # 共享样式表
├── templates.js               # 卡片渲染模板（GLM/Kimi/MiMo + SVG 图表 + Tab 切换）
├── api/
│   ├── glm.js                 # GLM API 客户端（Bearer Token 认证）
│   ├── kimi.js                # Kimi API 客户端（双模式：网页 token relay 主路径 / Code API Key 兜底）
│   └── mimo.js                # MiMo API 客户端（Cookie 认证）
├── protocol/                  # Data Bridge 协议共享层（双端单一可信源：常量/消息/DataPayload 构造与校验；popup/dashboard 运行时 import，background 侧经打包内联）
└── scripts/
    ├── background.js          # Service Worker 瘦入口（init 流程 + 事件监听注册 + 编排调用）
    ├── lib/                   # background 子模块（发布态经 esbuild 内联进 IIFE bundle，不进 zip）
    │   ├── config-sync.js     # 监控目标 / 显示名称 / 刷新间隔配置（live binding 共享状态）
    │   ├── bridge-client.js   # Bridge 端口发现 / 推送 / 重试队列 / 互斥锁
    │   ├── cookie-utils.js    # Cookie 多策略读取 / JWT 挑选 / 凭证 TTL（纯工具层）
    │   ├── credential.js      # 凭证缓存 / TTL / 失效探测 / 后台标签页刷新
    │   ├── kimi-relay.js      # Kimi access_token 被动镜像
    │   └── relay.js           # 配额数据采集（gatherAllQuotaData，复用 api/ 各 fetcher）/ 推送 / 防抖与频率限制
    └── kimi-content.js        # Kimi content script（镜像 kimi.com localStorage 令牌；classic 注入不参与打包）

chrome/                         # Chrome/Edge 专属文件
├── manifest.json               # Manifest V3（service_worker 模式 + content_scripts）
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

`build.sh` 采用 **staging 架构**（源码树与打包目录自然隔离，无清理段），版本号唯一可信源为 `vscode/package.json`：

1. `VERSION` 从 `vscode/package.json` 读取（消除多处手工同步版本号）
2. 组装 staging：`build/staging/{chrome,firefox}/` = 平台 `manifest.json` + `icons/` + rsync(`browser-common/` 全部，排除 manifest/icons 仅作防御，不可用时回退 cp)
3. `npm --prefix vscode run build:browser`：esbuild 将 background 入口（瘦入口 + `scripts/lib/` + `protocol/`）打包为 IIFE 单文件，覆盖 staging 内的 `scripts/background.js`（不 minify，便于发布包审查）
4. 改写 staging manifest 的 version 后从 staging 打 zip（源码树 `chrome/`、`firefox/` 全程零接触）；zip 为显式清单制：`scripts/` 展开为 `background.js`（IIFE bundle）+ `kimi-content.js`，`scripts/lib/` 已内联不进包，`protocol/` 因 popup/dashboard 运行时 import 保留进包
5. 产出 `ai-quota-dashboard-chrome-v{VERSION}.zip` / `ai-quota-dashboard-firefox-v{VERSION}.zip`
6. 打包 VSCode 扩展（`vsce package`，内部触发 `vscode:prepublish = clean && compile && build`）

开发态零影响：源码树 manifest 仍指向 ESM 源码（`scripts/background.js` 直载 `scripts/lib/*` 与 `protocol/`，两浏览器 `type: module` 均支持），unpacked 调试路径不变；CI（`ci.yml` browser job）跑同一 `build.sh` 并以 `unzip -l` 断言 `scripts/background.js` 与 `protocol/index.js` 在包内。

### 共享模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 共享 UI 工厂 | `shared-ui.js` | `createSharedUI(options)` 承载 Popup/Dashboard 共享页面逻辑，页面差异（Bridge 状态卡、自动刷新开关、空态文案等 13 项）经选项注入 |
| 缓存 | `cache.js` | 基于 `chrome.storage.local` 的带 TTL 缓存（正常 60s / 错误 300s） |
| 配置管理 | `config.js` | 集中式 `loadConfig()` / `saveConfig()` |
| Popup 页面逻辑 | `popup.js` | Bridge 状态检测、服务管理（添加/删除/开站开关）等页面专属逻辑 |
| 卡片模板 | `templates.js` | GLM / Kimi / MiMo 配额卡片和 SVG 图表模板 |
| 样式表 | `styles.css` | Popup 和卡片样式 |

### Data Bridge 推送机制

**核心逻辑**：浏览器扩展作为统一配额数据推送端，用自身凭证（Kimi 网页令牌 / MiMo Cookie / GLM API Key）调 API 拉取配额数据，把**配额数据**（而非凭证）推送给 VSCode。VSCode 端收到后会自动创建/更新对应的 AI 服务（标记 `dataSource='bridge'`），无需手动配置。**不再传输任何凭证**。

1. `popup.js` 维护 `config.services` 列表，保存在 `chrome.storage.local`（key: `dashboardConfig`）
2. `background.js` 启动后总是尝试发现 VSCode Bridge 端口并推送配额数据
3. `chrome.cookies.onChanged` 不再触发推送（凭证仅浏览器端自用），但保留 `cookieChanged` 广播用于单服务刷新
4. 添加/删除服务或配置变更时，popup 发送 `configUpdated` 消息通知 background 重新推送
5. 浏览器自身拉数依赖有效 Cookie，凭证失效检测 + 自动刷新机制保留（见下节）

```
浏览器扩展启动
    │
    ├─ discoverPort() → 扫描 37100..37110，连接 VSCode Bridge
    ├─ relayData(true) → 采集全部配额数据
    │     ├─ gatherAllQuotaData() → 复用 api/{glm,kimi,mimo}.js fetcher，用自身凭证调 API
    │     └─ POST /data → VSCode Bridge（DataPayload）
    │
    ├─ VSCode Bridge 更新 Bridge 服务状态
    ├─ VSCode 自动创建/更新对应 AI 服务（dataSource='bridge'，无需凭证）
    └─ 热重载 updateView() 刷新所有服务卡片（不中断）
```

### Data Bridge 端口发现

VSCode Bridge 服务器启动时通过以下机制让浏览器扩展自动发现端口：

1. **端口范围**：预定义 fallback 端口列表 `[37100..37110]`，顺序尝试直到找到可用端口绑定 `127.0.0.1`
2. **PID 端口文件**：VSCode 端写入 `os.tmpdir()/.ai-quota-bridge-port-{pid}`（权限 0600），仅用于本地进程管理、避免多 VSCode 实例冲突
3. **浏览器扩展发现**：Chrome 扩展无法读文件系统，改用**探测 `/health` 端点**——优先尝试上次成功的端口（`storage.local` 的 `bridgeLastPort`），失败后遍历 `[37100..37110]` 逐个 `GET /health`（请求头携带打包进扩展的 `X-Bridge-Probe` 探测密钥），密钥校验通过后从响应获取 `authToken`

### 凭证失效检测 + 自动刷新

**检测机制**（随刷新间隔执行，下限每 5 分钟）：

1. **Cookie 存在性检查**：`chrome.cookies.get()` 确认 Cookie 存在
2. **过期时间检查**：非 session cookie 检查 `expirationDate`
3. **API 探测**：
   - GLM：`GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`（Bearer Token 认证）
   - Kimi：`GET https://www.kimi.com/api-user/user/info`（Bearer Token 认证）
   - MiMo：`GET https://platform.xiaomimimo.com/api/v1/tokenPlan/detail`（Cookie 认证）
   - 返回 401/403 或业务码非 0 = 凭证失效

**自动刷新机制（后台标签页单路径）**：

凭证刷新采用 `loadCredentialViaBackgroundTab(kind)` 单一路径（Cookie 类凭证 Kimi/MiMo 共用；GLM 为 storage 类静态 API Key，无刷新载体直接跳过）。原 Offscreen API 双层刷新（`loadViaOffscreen`）与最小化弹出窗口降级（`loadViaMinimizedWindow`）方案已于 1.1.1 随 `offscreen.html` 一并移除：

1. `chrome.tabs.create({ active: false, url })` 创建后台非激活标签页访问目标站点，触发 session cookie 生成（携带用户 same-site 登录态）
2. 等待页面加载完成后关闭标签页
3. **刷新后验证**：重新检测 Cookie 是否更新，成功后自动 `relayData(true)` 重新推送配额数据

```
检测到凭证失效（Cookie 类：Kimi / MiMo）
    │
    ├─ 自动刷新开关开启 ?
    │   ├─ No  → 跳过（日志提示）
    │   └─ Yes → loadCredentialViaBackgroundTab(kind)
    │             └─ 创建后台非激活标签页 → 等待加载 → 关闭
    │
    └─ 验证刷新结果 → relayData(true) → 推送配额数据给 VSCode
```

### 消息协议（Popup ↔ Background）

| 消息方向 | action | 说明 |
|---------|--------|------|
| Popup → Background | `relayNow` | 手动触发推送全部配额数据到 VSCode |
| Popup → Background | `getStatus` | 获取 Bridge 连接状态 + 诊断信息 |
| Popup → Background | `configUpdated` | 配置变更通知（添加/删除/保存服务后发送） |
| Popup → Background | `checkCredentials` | 手动触发凭证检测 + 自动刷新 |
| Background → Popup/Dashboard | `cookieChanged` | Cookie 变化即时通知（含服务类型，触发单服务刷新） |

`getStatus` 响应：
```javascript
{
  connected: boolean,      // 是否已连接 VSCode Bridge
  port: number | null,     // 当前活跃端口
  receivedKinds: string[],   // 已接收配额数据的服务种类列表
  lastError: string | null, // 最后连接/推送失败的诊断信息
}
```

### Cookie 变化即时刷新（浏览器端单服务刷新）

当 Background 检测到目标站点 Cookie 发生变化时，自动广播 `cookieChanged` 消息给所有已打开的 Popup/Dashboard 页面：

1. **触发源**：`chrome.cookies.onChanged` 监听器（处理所有目标站点 Cookie）；Cookie 变化**不再触发 Data Bridge 推送**（凭证仅浏览器端自用），仅广播消息触发浏览器端单服务刷新
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
      name: 'Data Bridge',         // 显示名称
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

### Data Bridge 推送数据格式

```javascript
// POST http://127.0.0.1:{port}/data（需携带 X-Auth-Token 头）
{
  source: 'ai-quota-data-bridge',
  timestamp: number,
  data: [
    {
      kind: 'glm',                 // 'glm' | 'kimi' | 'mimo'
      serviceData: { ... },        // 该服务的 ServiceData + 扩展字段（GLM: GlmServiceData；Kimi: KimiServiceData；MiMo: MimoServiceData）
    },
    // ...
  ],
  activeKinds: ['glm', 'kimi', 'mimo'],  // 浏览器扩展当前活跃的服务类型，VSCode 据此同步移除已删除服务
  displayNames: { glm: '我的 GLM', kimi: 'Kimi 会员' },  // 各服务自定义显示名称（可选）
}
```

> 注意：payload 中**不含任何凭证**（Cookie / API Key 均不推送）。浏览器端用自身凭证调 API 拉取配额，`serviceData` 即各服务的完整配额数据（含 slots、history、扩展字段）。

### Popup 仪表盘功能

Popup 打开后直接显示仪表盘（420px 宽弹窗），采用**三个平级 Tab**（仪表盘 / 服务 / 设置）：

- **仪表盘 Tab**：显示所有已启用服务的配额卡片
  - GLM：配额进度条 + 模型/工具用量详情 + SVG 曲线图（支持当日/近7天/近30天 Tab 切换）
  - Kimi：配额进度条 + 会员等级 + 有效期
  - MiMo：套餐用量 + 补偿 Token + 有效期 + 自动续费状态
- **服务 Tab**：
  - 服务管理：添加/删除/保存服务
  - Data Bridge 状态：全局连接状态和诊断信息（位于服务列表顶部）
- **设置 Tab**：
  - 全局设置：刷新间隔、预警阈值
  - 数据管理：清除缓存

### 浏览器扩展与 VSCode 扩展的关系

```
浏览器扩展
├── 功能 1：仪表盘（独立工作）
│   └── Popup 中直接调用 API 查看配额，不依赖 VSCode
│
└── 功能 2：Data Bridge（需要 VSCode 扩展）
    ├── 浏览器端用自身凭证（Kimi 网页令牌 / MiMo Cookie / GLM API Key）调 API 拉取配额数据
    └── 将配额数据（而非凭证）推送给 VSCode；VSCode 端自动创建/更新对应的 AI 服务，并展示连接状态和已接收数据种类
```

### Chrome 与 Firefox 的差异

| 差异点 | Chrome | Firefox |
|--------|--------|---------|
| Manifest | 标准 V3（permissions + content_scripts） | V3 + `browser_specific_settings.gecko` |
| Background | `service_worker` | `scripts`（数组） |
| 扩展 ID | 自动生成 | 需在 manifest 中显式声明 |
| Cookie API | `chrome.cookies` | `chrome.cookies`（Firefox 内置兼容） |
| 凭证刷新 | 后台标签页（`loadCredentialViaBackgroundTab`，两端一致） | 同左 |
| 持久性 | Service Worker 非持久 | 事件页面 |
| 最小版本 | Chrome 116+ | Firefox 116+ |

---

*最后更新: 2026-09-04*
