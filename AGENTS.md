# ai_quota_dashboard_vscode

> 2.0.0：仅 VSCode 扩展，仅支持 GLM Coding Plan (CN) 与 Kimi Membership 的手动 API Key。本文是面向 AI 助手和维护者的当前实现说明；修改代码前先以源码和测试为准。

## 项目定位

AI 配额用量仪表盘，不是行为追踪器。服务配置、Secret 与历史均留在本机；网络请求仅用于向用户配置的 GLM/Kimi 官方 API 查询配额，不包含遥测或向项目开发者上传数据。

| 服务 | 目录 | 认证 | 当前能力 |
|------|------|------|----------|
| GLM Coding Plan (CN) | `vscode/src/services/glm/` | 手动 API Key（Bearer） | 配额、套餐信息、模型/工具详情、SVG 趋势、范围懒加载 |
| Kimi Membership | `vscode/src/services/kimi/` | 手动 Code API Key（`sk-`） | 会员等级徽章、5h、7d 主槽；新版响应存在有效字段时追加月度槽 |

`ServiceProfile` 不再有 `dataSource`。运行时不存在浏览器端、独立数据接收服务或其他认证来源。

## 目录与技术栈

```text
ai_quota_dashboard_vscode/
├── .github/workflows/
│   ├── ci.yml                  # 仅 VSCode：lint/compile/build/test/VSIX
│   └── release.yml             # lint/typecheck/test/build/package 门禁；仅 VSIX 发布
├── .vscode/                    # F5 launch 与 npm watch/compile tasks
├── vscode/
│   ├── src/
│   │   ├── extension.ts        # activate/deactivate、v2 清理、命令、轮询、预警
│   │   ├── core/
│   │   │   ├── types.ts        # 数据模型、API_KEY_MASK、noKey/staleError、新鲜样本判定
│   │   │   ├── config.ts       # globalState + Secret Storage + Settings 唯一可信源
│   │   │   ├── fetch.ts        # Node HTTP(S)、超时、5MB 响应上限、可选重试
│   │   │   ├── cache.ts        # TTL + LRU 内存缓存
│   │   │   ├── afk.ts          # AFK 检测
│   │   │   └── format.ts       # 数字格式化
│   │   ├── services/
│   │   │   ├── registry.ts     # 默认注册表仅 [glmDescriptor, kimiDescriptor]
│   │   │   ├── types.ts        # ProviderLogger、QuotaProvider、DetailProvider、endpoint 元数据
│   │   │   ├── glm/
│   │   │   │   ├── provider.ts # 配额、订阅、当日详情、DetailProvider、详情合并
│   │   │   │   ├── detailRanges.ts # 全局刷新时保留已缓存的其它详情范围
│   │   │   │   ├── types.ts / constants.ts
│   │   │   │   ├── statusBar.ts / styles.ts / settings.ts / index.ts
│   │   │   │   └── provider.test.ts / detailRanges.test.ts
│   │   │   └── kimi/
│   │   │       ├── provider.ts # Code API、新旧响应兼容与可选月度槽
│   │   │       ├── types.ts / constants.ts
│   │   │       ├── statusBar.ts / styles.ts / settings.ts / index.ts
│   │   │       └── provider.test.ts
│   │   ├── storage/
│   │   │   ├── persistence.ts  # 历史保存、合并、30 天清理、全量重置
│   │   │   ├── migrations.ts   # 2.0 一次性清理
│   │   │   └── *.test.ts
│   │   ├── ui/
│   │   │   ├── statusbar.ts    # 每服务一个 StatusBarItem
│   │   │   └── statusBarRenderer.ts # 渲染接口、倒计时、颜色、Markdown 转义
│   │   ├── dashboard/
│   │   │   ├── webviewView.ts  # Webview 宿主、CSP、nonce、bundle 外链、消息路由
│   │   │   └── styles.ts       # 通用样式 + 注册表服务样式聚合
│   │   ├── webview/
│   │   │   ├── main.ts         # 注册 GLM/Kimi 卡片、消息循环、视图调度
│   │   │   ├── shared.ts       # 卡片注册表、renderService、共享渲染工具
│   │   │   ├── settings.ts     # 数据驱动的服务/全局设置页
│   │   │   ├── types.ts        # 前后端消息契约
│   │   │   └── cards/          # glm.ts、kimi.ts
│   │   ├── commands/index.ts   # clearHistory
│   │   └── test/mocks/vscode.ts
│   ├── resources/              # 扩展图标
│   ├── media/dashboard.js      # esbuild 产物，勿手改
│   ├── out/extension.js        # esbuild 产物，勿手改
│   ├── package.json            # 版本 2.0.0、贡献点、npm scripts
│   ├── esbuild.config.mjs      # extension CJS + webview IIFE
│   ├── tsconfig.base.json      # strict/noEmit 公共编译选项
│   ├── tsconfig.json           # Extension 程序，排除 src/webview
│   ├── tsconfig.webview.json   # Webview 独立程序，含 DOM lib
│   ├── vitest.config.ts        # Node 环境、vscode mock alias
│   ├── eslint.config.mjs
│   └── CHANGELOG.md
├── README.md / CONTRIBUTING.md / DEVELOPMENT.md / SECURITY.md / AGENTS.md
└── LICENSE
```

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript strict mode |
| 运行时 | Node.js / VSCode Extension Host |
| UI | WebviewView + 状态栏 + SVG |
| 构建 | `tsc` noEmit 类型检查；esbuild 负责 emit |
| 测试 | vitest，Node 环境，VSCode API mock |
| 存储 | Secret Storage、`globalState`、VSCode Settings |

## ServiceDescriptor 注册表

每个服务包含 Provider、设置元数据、样式和可选的状态栏/详情能力。卡片渲染不属于 descriptor，而是独立的 Webview TS 模块。

```typescript
interface ServiceDescriptor {
  kind: ServiceId;                 // 内置仅 'glm' | 'kimi'
  displayName: string;
  defaultName: string;
  badgeLabel: string;
  badgeCssClass: string;
  provider: QuotaProvider;
  styles: string;
  settings: ServiceSettingsDescriptor;
  statusBarRenderer?: StatusBarRenderer;
  detailProvider?: DetailProvider;
  mergeDetailData?(existing: ServiceData, detail: unknown, range: string): void;
  helpCommand?: string;
  helpMessage?: string;
}
```

默认注册表只有：

```typescript
const _defaultRegistry = createRegistry([glmDescriptor, kimiDescriptor]);
```

`kind` 在类型层仍是普通字符串，运行时通过注册表校验。新增服务不能只添加 Provider：还需完成卡片注册、descriptor 和 registry 注册，详见「AI 使用指引」。

## 核心数据模型

```typescript
interface ServiceProfile {
  id: string;
  kind: ServiceId;
  displayName: string;
  endpoint?: string;
}

interface QuotaSlot {
  label: string;
  percent: number;       // 0–100
  used?: number;
  limit?: number;
  resetsAt?: number;     // 毫秒时间戳
}

interface UsagePoint {
  at: number;
  tokens?: number;
  calls?: number;
  kind?: 'percent' | 'tokens'; // 主槽数值语义；旧点可缺失
}

interface ServiceData {
  id: string;
  name: string;
  kind: ServiceId;
  slots: QuotaSlot[];
  history?: UsagePoint[];
  updatedAt: number;
  err?: string;          // 无可保留旧数据时的主错误
  noKey?: boolean;       // 独立未配置态；不缓存、不写历史、不预警
  staleError?: string;   // 保留旧快照时的刷新错误；updatedAt 不更新
}

interface ProviderLogger {
  log(msg: string): void;
}

interface QuotaProvider {
  kind: ServiceId;
  fetch(apiKey: string, endpoint?: string, logger?: ProviderLogger): Promise<ServiceData>;
}

interface DetailProvider {
  fetchDetail(range: string, apiKey: string, endpoint?: string, logger?: ProviderLogger): Promise<unknown | undefined>;
}
```

`isFreshServiceData()` 统一排除 `err`、`noKey` 与 `staleError`，历史保存和配额预警都必须使用该判定。`API_KEY_MASK = '••••••••'` 仅是设置页的显示标记，不是凭证或加密结果。

GLM 的 `GlmServiceData` 额外包含 `level`、`nextRenewTime`、当日 `modelUsage`/`toolUsage`、`modelUsageByRange`/`toolUsageByRange`，以及 `detailStates?: Partial<Record<TimeRange, { status: 'loading' | 'ok' | 'error'; message?: string }>>`（`TimeRange = 'day' | 'week' | 'month'`）。Kimi 的 `KimiServiceData` 额外包含可选 `level`，仅来自 `/coding/v1/me` 的 `user_level_name`，用于卡片头部会员徽章；不包含其他个人资料。

## 激活、轮询与刷新

`activate()` 的关键顺序不可颠倒：

1. 初始化 `ConfigManager` context。
2. `await runV2CleanupMigration(ctx)`，必须在任何 profile 读取与轮询之前完成。
3. 初始化状态栏、命令、Webview、活动监听和 Settings 变更监听。
4. 后台启动首次轮询，不等待首轮网络完成；随后按 `refreshInterval` 创建定时器。

数据流：

```text
pullAll()
  ├─ AFK 检查（仅自动/全局轮询入口；人工刷新先更新活动时间）
  ├─ refreshQueue 串行化，isLoopRunning 防止轮询重入
  ├─ 读取 profiles；未命中缓存的服务加入 refreshingIds
  ├─ updateView() 先推旧数据 + refreshingIds
  ├─ 逐服务：
  │   ├─ 缓存命中：附加历史后复用
  │   └─ 未命中：Secret Storage 取 Key 并 trim
  │        ├─ 空白或无 Key：生成 noKey 数据，不发请求、不写 cache
  │        └─ 有 Key：resolveProvider(kind).fetch(key, endpoint, { log })
  │             ├─ GLM：网络返回后基于最新快照 mergeDetailRanges(new, old)，保留其它范围与 detailStates
  │             ├─ 成功：attachHistory() → serviceData / StatusBar / 60 秒 cache
  │             └─ 异常：有旧正常快照则附加 staleError 并保留 updatedAt；否则生成 err
  │                  └─ staleError / err 均使用 300 秒 cache
  ├─ 清理已删除服务的内存与状态栏项
  ├─ flush 状态栏、updateData 到 Webview（Key 仅回传 mask/空串）
  ├─ saveHistory() 只保存 isFreshServiceData() 数据
  └─ checkQuotaWarnings() 只检查新鲜数据，30 分钟冷却
```

- 普通缓存 TTL 60 秒，`staleError`/`err` 为 300 秒，`noKey` 不缓存；LRU 默认最多 100 项，每 5 分钟清理过期项。
- `refreshingIds` 让刷新期间旧卡片保持可见，按钮显示加载态；无数据的新服务显示骨架卡，`noKey` 显示独立配置卡。
- 手动刷新与设置变更均只清缓存、不清空旧 `serviceData`。失败时 `staleError` 保留旧 slots、GLM 详情、历史和原 `updatedAt`，不写历史、不预警；成功时清除 `noKey`/`staleError`。
- GLM 范围合并函数当前位置是 `src/services/glm/detailRanges.ts`，由 `extension.ts` 导入；它同时保留 `detailStates`。`mergeGlmDetailData` 仍在 `services/glm/provider.ts`，只负责把一次详情结果写入范围缓存，二者职责不同。
- GLM 详情范围只接受 `day`、`week`、`month`；descriptor 必须同时提供 `detailProvider` 与 `mergeDetailData`。请求按 `serviceId:range` 在 `detailRequests` Map 中去重，完成或失败后清理，可再次重试。
- 详情开始写 `loading`，有效结果写 `ok`；异常、空响应或同时缺少模型/工具用量写 `error` 并显示重试，不能永久停留在 loading。配额与详情的网络等待后都必须重新读取 `serviceData` 最新快照再合并，避免覆盖并发产生的新 slots、详情或 `staleError`；等待期间服务已删除时按最新 profiles 丢弃回写，late detail 不得复活卡片或缓存。

## 2.0 清理迁移

实现：`src/storage/migrations.ts`；完成标记：`aiQuotaDashboard.v2CleanupDone`。

算法：

1. 标记已为 `true` 时直接返回。
2. 读取原始 `services`，删除 `kind='bridge'`、`kind='mimo'`，以及 `dataSource='bridge'` 的 GLM/Kimi。
3. 保留手动 GLM/Kimi（缺失 `dataSource` 也按手动保留），剥离所有保留 profile 的遗留 `dataSource` 字段。未明确列入删除范围的未知 kind 保守保留。
4. 删除被移除 profile 的 `apiKeys.{id}` Secret。
5. 重写 `aiQuotaDashboard.history`，只保留现存 profile 的历史，同时清理孤儿历史。
6. 写回 services/history，删除 `aiQuotaDashboard.bridgeState` 与 `aiQuotaDashboard.bridgeSecretsCleared`。
7. **最后**写完成标记。任一步失败，下次激活重跑；各步骤幂等。

安全边界：早期没有 `dataSource` 的 GLM/Kimi 无法可靠判断来源，因此宁可保留并要求用户重配，也不能冒删手动数据的风险。修改迁移时必须保留「清理先于轮询」「标记最后写」「失败可重试」「manual 全保」这些不变量。

## 配置与历史

| 数据 | 存储位置 | Key / 默认值 |
|------|----------|--------------|
| 服务列表 | `globalState` | `services` |
| API Key | Secret Storage | `apiKeys.{serviceId}` |
| 历史 | `globalState` | `aiQuotaDashboard.history` |
| 自动刷新 | VSCode Settings | `aiQuotaDashboard.refreshInterval`，默认 60 秒 |
| 预警阈值 | VSCode Settings | `aiQuotaDashboard.warnThreshold`，默认 0.8 |
| AFK 阈值 | VSCode Settings | `aiQuotaDashboard.afkThreshold`，默认 3600 秒 |
| Settings 迁移标记 | `globalState` | `aiQuotaDashboard.configMigrated` |
| 2.0 清理标记 | `globalState` | `aiQuotaDashboard.v2CleanupDone` |

三项全局设置以 VSCode Settings 为唯一可信源。读取时若 Settings 无值，可回退旧 `globalState` 值并触发一次性迁移；写入只更新 Settings，并清除对应旧值。防重复迁移使用会话内 Promise 闸门和持久标记，失败后允许重试。

`ConfigManager` 的整表读-改-写由进程内写锁串行化；`saveServiceAtomic()` 先写 Secret，再按需写 profile，避免多步更新的部分中间态。目标 profile 缺失时返回 `false`，不写 Secret 或 profiles；`saveService`/`addService` 对非法 kind 直接拒绝，不回退默认 GLM。保存契约具有明确三态：

| 字段 | `undefined` / 缺字段 | 空字符串 | 其他字符串 |
|------|----------------------|----------|------------|
| `key` | 保留原 Secret | 删除 Secret | 替换 Secret |
| `endpoint` | 保留原 profile endpoint | 删除 endpoint，使用默认值 | 更新 endpoint |

`getCurrentSettings()` 只在 Extension 内读取 Secret，并向 Webview 回传 `API_KEY_MASK` 或空串，不明文发送 Key。`saveService` 将缺失、非 string 和 `API_KEY_MASK` 都映射为 `undefined`，掩码绝不能写入 Secret Storage。Webview 只有实际渲染 endpoint 控件时才提交该字段；GLM 当前 `endpointEditable: false`，所以未渲染控件不会意外清除既有 endpoint。Kimi 开放官方 origin 编辑。

`saveGlobal` 在 Extension 内先验证 `refreshInterval`/`warnThreshold`/`afkThreshold` 三项均为有限数字且范围合法，**全部通过后才写 Settings**；失败返回 `{ ok:false, field?, message? }`，成功返回 `{ ok:true }`，宿主通过 `saveGlobalResult` 回发。Webview 另做空值、范围与步长预检和字段级反馈，但不替代后端校验。

历史最多保留 30 天。`loadHistory()` 将损坏存储按空历史恢复，持久化历史读取与合并会过滤非数组值和 `at` 非有限数字的条目。`saveHistory()` 先按当前 profiles 的 `activeIds` 排除已删除服务，其内部及两个调用方过滤点都通过 `isFreshServiceData()` 跳过 `err`、`noKey`、`staleError` 或无槽位数据；stale 快照即使仍带旧 slots 也绝不是新历史样本。主槽有 `used` 时标记为 `tokens`，否则记录百分比并标记 `percent`。`attachHistory()` 合并 API 与本地历史时按**本地日期**去重。`clearHistory()` 只清历史；`clearAllData()` 删除当前 profile 的 Secret 和全部 `globalState`，但不会清除 VSCode Settings。

## Webview 构建与通信

```text
src/webview/main.ts + cards/glm.ts + cards/kimi.ts
                  │ esbuild（IIFE、ES2020、sourcemap、不 minify）
                  ▼
           media/dashboard.js
                  │ asWebviewUri + nonce 外链
                  ▼
       dashboard/webviewView.ts 宿主
```

- `main.ts` 显式调用 `registerGlmCard()` 与 `registerKimiCard()`；`shared.ts` 按 `data.kind` 分发，未注册 kind 渲染转义后的防御性错误卡，不进入其他服务模板。
- 业务 JS 不使用内联字符串模板。宿主唯一的内联脚本是 `window.__AQD_SETTINGS_META__` 数据注入，使用随机 nonce；CSP `script-src` 允许该 nonce 和 `${webview.cspSource}`，不包含 `unsafe-inline`。
- `tsconfig.json` 只检查 Extension 侧并排除 `src/webview/**`；Webview 的 DOM 类型检查使用 `npm run typecheck:webview`。`npm run build` 负责两个 bundle 的 esbuild 打包。
- 服务和全局设置面板按数据指纹条件重渲染，输入控件聚焦或确认面板展开时跳过，避免轮询冲掉正在编辑的 Key 或确认状态；已删除服务的前端卡片状态按当前 profiles 清理。
- 未知 kind 的设置项只显示转义后的只读配置与删除入口，不渲染 Key/endpoint 编辑或保存控件。
- GLM 详情 `tabpanel` 的 `aria-labelledby` 同时引用当前模型/工具主 tab 与时间范围子 tab，切换时同步更新；加载写 `aria-busy`，错误提供可重试控件。

Extension → Webview：

| command | 数据 |
|---------|------|
| `updateData` | `{ services, settings, refreshingIds }`；`settings.keys[id]` 仅为 mask 或空串 |
| `switchToSettings` | `{ subtab: 'services' \| 'global' }` |
| `saveGlobalResult` | `{ ok, field?, message? }`，用于全局保存与字段级校验反馈 |

Webview → Extension：

| command | 数据 |
|---------|------|
| `requestInitialData` | 无 |
| `refresh` | 无 |
| `refreshService` | `{ id }` |
| `requestDetailRange` | `{ serviceId, range }` |
| `saveService` | `{ id, name, kind, key?, endpoint? }`；三态语义见配置契约 |
| `addService` | `{ kind }` |
| `removeService` | `{ id }` |
| `saveGlobal` | `{ refreshInterval, warnThreshold, afkThreshold }` |
| `resetData` | 无 |
| `{helpCommand}` | 由 descriptor 帮助元数据匹配，如 `showGlmHelp`、`showKimiHelp` |

## 状态栏

每个服务对应独立 `StatusBarItem`，由服务的 `StatusBarRenderer` 筛选槽位和构建 tooltip。GLM 状态栏排除 MCP 槽，Kimi 使用全部可用槽。颜色按使用率分为 success/warning/danger；`staleError` 时保留正常配额并提示当前显示上次成功数据及刷新失败原因，动态 tooltip 文本必须经 `escapeMarkdown()`。

## 服务解析契约

### 公共 HTTP 与日志边界

`getJson`/`postJson` 对 2xx 响应要求 Content-Type 包含 `json`（兼容 charset 与 `+json`）。缺失 Content-Type、HTML/纯文本等非 JSON Content-Type 会抛出安全错误；非法 JSON 的 message 也不包含响应正文，前两类错误不设置 `responseBody`，避免登录页或网关响应被误当业务数据或泄漏到日志。

`QuotaProvider.fetch()` 与 `DetailProvider.fetchDetail()` 均接受可选 `ProviderLogger`，Extension 统一传 `{ log }`。GLM 订阅/模型/工具降级及 Kimi `/me` 降级会记录错误 message；不得记录完整 Key、Authorization/请求头、`responseBody` 或 Kimi 个人资料。新增日志必须保持这一边界。

### GLM Coding Plan (CN)

默认 endpoint：`https://open.bigmodel.cn`。`ServiceProfile.endpoint` 可覆盖协议和主机；`extractDomain()` 会忽略其中的路径。

```text
GET /api/monitor/usage/quota/limit       Authorization: Bearer {API_KEY}
GET /api/biz/subscription/list           Authorization: Bearer {API_KEY}
GET /api/monitor/usage/model-usage?...   Authorization: Bearer {API_KEY}
GET /api/monitor/usage/tool-usage?...    Authorization: Bearer {API_KEY}
```

配额解析依据 `type`/`unit`/`number`，不依赖数组顺序；百分比 clamp 到 0–100，`nextResetTime` 兼容秒和毫秒。首次同时拉取配额、订阅（失败可缺省）和当日模型/工具详情；week/month 通过 DetailProvider 懒加载。

### Kimi Membership

唯一凭证路径：`sk-` 前缀 Code API Key。非 `sk-` 输入直接抛引导错误，不发请求。

```text
GET {origin}/coding/v1/usages
GET {origin}/coding/v1/me
Authorization: Bearer {API_KEY}
origin = https://api.kimi.com（CN，默认）或 https://api.kimi.ai（Global）
```

`ServiceProfile.endpoint` 可在设置页编辑，Provider 归一化为官方 HTTPS origin，并确保 usages 与 me 共用同一 origin。路径被忽略；非官方 origin、HTTP、非默认端口、形似官方的其它主机及非法 URL 均回退 CN 默认站，Kimi 不依赖 GLM 的 endpoint 工具。

两个请求并行发起。`/me` 仅用于读取 `user_level_name` 并生成「会员 · 等级」头部徽章；请求失败或字段为空时，正常配额卡显示「会员等级暂不可用，配额不受影响」，不影响 `/usages` 配额解析，也不读取其他个人资料。加载骨架、缺 Key 和主错误卡不叠加该提示。

旧响应：

- `usage` → 本周槽。`usedPercent`（0–100）优先，否则用 `used/limit`；`resetAt` 与 `resetTime` 均可，兼容 ISO 字符串、秒/毫秒时间戳及数字字符串。
- `limits[]` → 频率限制槽。扁平字段与 `window`/`detail` 嵌套均支持；扁平字段优先。优先 300 分钟窗口，否则选择可换算的最短窗口。

新响应 `usages` 比例池：

| 字段 | 用途 |
|------|------|
| `limit_5h` | 旧 5h 窗口不可用时的回退 |
| `limit_7d` | 旧 `usage` 不可用时的回退 |
| `limit_month_total` | 可选「本月总额度用量」 |
| `limit_month_code` | 可选「本月 Coding 用量（含于总额）」 |

`used_ratio` 契约固定为 0–1，接受有限数字或数字字符串，乘 100 后 clamp；不猜测 0–100 双量纲。`reset_time` 复用时间解析，非法时间只省略重置时间，不丢弃有效比例。旧窗口保持主选是为了延续计数口径并避免 ratio 精度差异改变既有显示；只有旧窗口缺失或无效才回退。

槽位按可用的 5h、7d、month total、month code 排列。**月度完全取决于新字段是否存在且有效；缺失时不展示，不伪造 0%，也不能假设所有账号都有月度。** 全部窗口均缺失或无效才抛结构异常。测试 fixture 只证明解析兼容性，不证明线上字段对所有账号必现。

## 运行、测试与 CI

在 `vscode/` 目录：

```bash
npm ci
npm run compile      # Extension 侧 tsc noEmit
npm run typecheck:webview  # Webview 独立类型检查
npm run lint
npm test             # pretest 先跑 compile，再 vitest run
npm run test:watch
npm run build        # out/extension.js + media/dashboard.js
npm run watch
npm run clean
```

运行指定测试：

```bash
npx vitest run src/services/kimi/provider.test.ts
```

当前测试文件：

| 文件 | 重点 |
|------|------|
| `src/extension.test.ts` | 公开命令、凭证规范化、刷新/删除/详情并发、激活与异常收敛 |
| `src/core/cache.test.ts` | TTL、清空、LRU 访问/更新顺序、dispose |
| `src/core/afk.test.ts` | 活动与 AFK 判定 |
| `src/core/config.test.ts` | 写锁、缺失 profile、Key/endpoint 三态原子保存、Settings 与旧值迁移 |
| `src/core/fetch.test.ts` | HTTP 错误、总超时、响应上限、2xx 非 JSON/缺 Content-Type、安全错误 |
| `src/core/format.test.ts` | 数字缩写 |
| `src/core/types.test.ts` | 颜色等级 |
| `src/services/glm/provider.test.ts` | GLM 配额、详情、时间解析、并行编排与安全降级 logger |
| `src/services/glm/detailRanges.test.ts` | 详情范围及 detailStates 保留、新值优先 |
| `src/services/kimi/provider.test.ts` | 凭证路由、CN/Global 共用 origin、空值与有效窗口回退、新旧窗口、嵌套/resetTime、ratio 回退、可选月度、会员降级与安全日志 |
| `src/storage/persistence.test.ts` | 损坏历史恢复与条目清洗、读写/合并、语义、本地日期、activeIds 与 noKey/staleError 过滤 |
| `src/storage/migrations.test.ts` | v2 保留/清理、幂等、失败重试、孤儿历史 |
| `src/ui/statusbar.test.ts` | 状态栏项更新/删除、改名命令、dispose、staleError 提示与转义 |
| `src/ui/statusBarRenderer.test.ts` | 倒计时、颜色、转义等 |
| `src/webview/compute.test.ts` | 可见服务/骨架顺序、设置校验、面板重渲染守卫、已删服务状态清理 |
| `src/webview/settings.test.ts` | 未知 kind 只读/转义与正常表单 |
| `src/webview/shared.test.ts` | 转义、fmtNum、渲染分发防御 |

测试与源码同目录，命名 `{source}.test.ts`，统一使用 `src/test/mocks/vscode.ts`。单元测试聚焦解析、纯函数和存储逻辑，不代替 Webview DOM 测试、真实 API 联调或 F5 人工冒烟。

CI（`.github/workflows/ci.yml`）只有 `vscode` job：Node 20、`npm ci`、lint、compile、typecheck:webview、build、断言扩展 bundle、test、非阻断生产依赖 audit、VSIX 打包与 7 天 Artifact。Release 由 `v*.*.*` tag 触发，只有 VSCode 与 GitHub Release 两个 job；VSCode job 先 compile，再按 **lint → typecheck:webview → test → build → package** 设置阻断门禁，全部成功后才上传 Artifact 和发布。发布资产只有 VSIX。`VSCE_PAT` 或 `OPENVSX_PAT` 为空时跳过对应市场发布。

## AI 使用指引

### 关键约束

1. 当前是 VSCode Extension（WebviewViewProvider 侧边栏），不是多平台项目。
2. 配额仪表盘不追踪用户行为；不得加入遥测或向项目开发者上传配置、Key、历史。
3. 新服务遵循 ServiceDescriptor 模式，内置 registry 当前只有 GLM/Kimi。
4. 轮询与活动监听必须轻量，避免影响编辑器性能。
5. 不索取真实 API Key，不用真实账号联调来替代 fixture。
6. 修改 Kimi 解析时保持旧窗口主选、新 ratio 回退、月度可选和槽位顺序；不得把可选月度写成账号必有能力。
7. 修改存储时保留 Secret/globalState/Settings 边界与迁移失败重试语义。
8. 不手改 `out/` 或 `media/`；修改源文件后重新构建。
9. 明文 Key 只在 Extension Host 内读取并用于对应 API；Webview 仅接收 mask/空串。保存时 `undefined` 保留、空串清除、新值替换，mask 永不落 Secret。
10. 修改轮询时保留 noKey 独立态和 stale-while-error 边界：stale 不改 `updatedAt`、不写历史、不预警；配额与 GLM 详情回写均使用最新快照，已删除服务的 late detail 必须丢弃，并保持范围请求去重。
11. 修改 HTTP/Provider 降级时保持安全错误与 logger 边界，不把响应正文、凭证或个人资料写入日志；Kimi usages/me 必须共用官方 CN/Global origin。
12. 修改 Release 时不得绕过 lint、Webview 类型检查、测试、build 和 package 的阻断门禁。

### 常见任务

新增 AI 服务：

1. 在 `vscode/src/services/` 新建服务目录，参考 `glm/` 或 `kimi/`。
2. 实现 `QuotaProvider`（`provider.ts`），需要时定义扩展 `ServiceData`。
3. 实现 `styles.ts`、`settings.ts`，可选实现 `statusBar.ts`。
4. 如需详情懒加载，同时实现 `DetailProvider` 与 `mergeDetailData`。
5. 在 `index.ts` 组装 `ServiceDescriptor`，并在 `services/registry.ts` 注册。
6. 新建 `src/webview/cards/{kind}.ts`，导出 `registerXxxCard()`，在 `src/webview/main.ts` 显式调用。
7. 添加解析/合并测试，并运行相关测试、lint、两套 TypeScript 检查和 build。

其他任务：

- 修改仪表盘渲染：编辑 `src/webview/cards/{kind}.ts`；分发与共享工具在 `src/webview/shared.ts`。
- 修改设置页：编辑 `src/webview/settings.ts` 和服务的 `settings.ts`，保持元数据驱动。
- 修改样式：编辑服务的 `styles.ts` 或通用 `dashboard/styles.ts`；descriptor 样式由聚合器收集。
- 添加命令：在 `extension.ts` 或 `commands/index.ts` 注册，并在 `package.json` 声明用户可见命令与必要激活事件。
- 修改 GLM 刷新详情保留：检查 `services/glm/detailRanges.ts`，不要与 `mergeGlmDetailData` 混淆。
- 修改迁移：在 `storage/migrations.test.ts` 覆盖保留集合、删除集合、幂等、失败重试和孤儿历史。

## 编码规范

- TypeScript `strict: true`，Extension 与 Webview 的 lib 边界不可混用。
- PascalCase（类/接口）、camelCase（函数/变量）、UPPER_SNAKE_CASE（常量）。
- ESLint + `@typescript-eslint`；注释使用中文。
- 测试与源码同目录，以 `.test.ts` 结尾，使用 vitest。
- 提交信息遵循 Conventional Commits：`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`。
- 构建产物由 esbuild 生成，不手工编辑。

---

最后更新：2026-11-17
