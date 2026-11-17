# 开发者指南

> AI Quota Dashboard 2.0.0 只包含 VSCode 扩展。本文覆盖 GLM/Kimi 手动 API Key 服务的开发、测试、Webview 构建、VSIX 打包和 CI。

## 前置要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | 推荐 20 | 编译、测试和构建；CI 固定使用 20 |
| npm | 随 Node.js 安装 | 依赖与脚本 |
| VSCode | 1.80+ | Extension Host 调试 |
| `@vscode/vsce` | 可选全局安装 | 本地创建/发布 VSIX；CI 会自行安装 |

```bash
node --version
npm --version
```

## 项目结构

```text
ai_quota_dashboard_vscode/
├── .github/workflows/
│   ├── ci.yml                  # VSCode 检查、测试和 VSIX Artifact
│   └── release.yml             # 市场发布与仅 VSIX 的 GitHub Release
├── .vscode/
│   ├── extensions.json         # 推荐 ESLint 扩展
│   ├── launch.json             # Run Extension（F5）
│   ├── settings.json           # 工作区编辑器与写作辅助设置
│   └── tasks.json              # 默认 npm watch；另有 compile task
├── vscode/
│   ├── src/
│   │   ├── extension.ts        # 激活、v2 清理、命令、轮询与预警
│   │   ├── core/               # 类型、配置、HTTP、缓存、AFK、格式化
│   │   ├── services/
│   │   │   ├── registry.ts     # 仅 GLM/Kimi
│   │   │   ├── glm/            # Provider、详情、状态栏、样式、设置与测试
│   │   │   └── kimi/           # 新旧响应解析、状态栏、样式、设置与测试
│   │   ├── storage/            # persistence 与 v2 migrations，含测试
│   │   ├── ui/                 # 状态栏调度、渲染器与测试
│   │   ├── dashboard/          # Webview 宿主与样式
│   │   ├── webview/            # 前端 TS、GLM/Kimi 卡片
│   │   ├── commands/           # 清除历史
│   │   └── test/mocks/vscode.ts
│   ├── resources/              # 图标
│   ├── out/                    # extension.js，构建产物
│   ├── media/                  # dashboard.js，构建产物
│   ├── package.json            # 扩展清单与 scripts
│   ├── esbuild.config.mjs      # 两个 bundle 的构建配置
│   ├── tsconfig.base.json      # strict/noEmit 公共配置
│   ├── tsconfig.json           # Extension 侧，排除 Webview
│   ├── tsconfig.webview.json   # Webview 侧，包含 DOM
│   ├── vitest.config.ts
│   └── eslint.config.mjs
└── README.md / CONTRIBUTING.md / AGENTS.md / SECURITY.md / DEVELOPMENT.md
```

## 环境搭建

```bash
cd vscode
npm ci
npm run compile
npm run build
```

`npm ci` 按 lockfile 安装；日常已有依赖的开发环境也可用 `npm install` 同步依赖变更。

## npm scripts

| 命令 | 实际行为 |
|------|----------|
| `npm run compile` | `tsc -p ./`，只检查 Extension 程序，`noEmit` 不产出 JS |
| `npm run typecheck:webview` | `tsc -p ./tsconfig.webview.json`，独立检查 Webview DOM 侧类型 |
| `npm run build` | esbuild 产出 `out/extension.js`（CJS）与 `media/dashboard.js`（IIFE） |
| `npm run watch` | 通过 esbuild context 同时监听两个 bundle |
| `npm run clean` | 删除 `out/` 和 `media/` |
| `npm run lint` | `eslint src` |
| `npm test` | `pretest` 先执行 `npm run compile`，再执行 `vitest run` |
| `npm run test:watch` | `vitest` 监听模式 |
| `npm run vscode:prepublish` | `clean && compile && typecheck:webview && build`，`vsce package/publish` 自动触发 |

常用开发组合：

```bash
# 终端 1：持续构建 Extension 与 Webview
npm run watch

# 终端 2：持续运行测试
npm run test:watch
```

不要手改 `out/extension.js` 或 `media/dashboard.js`。

## F5 调试

1. 用 VSCode 打开仓库根目录。
2. 确保依赖已安装。首次调试可先执行 `npm run build`。
3. 按 F5，选择「Run Extension」。`preLaunchTask` 会启动默认 `npm run watch` task。
4. 在 Extension Development Host 中打开「AI 配额」，添加 GLM 或 Kimi 服务。
5. 使用测试 Key 时自行遵守凭证安全要求；自动化测试和文档示例不需要也不应包含真实 Key。

排错：

- 扩展未加载：检查 `out/extension.js` 是否存在，以及 `npm run compile` 是否通过。
- 仪表盘空白或卡片未更新：确认 `media/dashboard.js` 已重建，并打开 Webview 开发者工具查看 Console。
- 未注册服务卡片：检查 `src/webview/main.ts` 是否显式调用对应 `registerXxxCard()`。
- API 401/403：检查对应服务的 API Key；Kimi 只接受 `sk-` 前缀 Code API Key。
- 状态栏显示不符合预期：检查 descriptor 的 `statusBarRenderer` 与服务实现。

## 架构要点

### ServiceDescriptor

`src/services/registry.ts` 的默认注册表只有 `[glmDescriptor, kimiDescriptor]`。Descriptor 组织：

- `provider`：配额 API 拉取与解析。
- `settings`：服务设置表单元数据。
- `styles`：服务 CSS，由仪表盘样式聚合器收集。
- `statusBarRenderer`：可选状态栏定制。
- `detailProvider` + `mergeDetailData`：可选详情懒加载，两者必须同时存在。
- `helpCommand` + `helpMessage`：可选帮助按钮。

卡片不属于 descriptor。`src/webview/cards/glm.ts` 和 `kimi.ts` 在 `src/webview/main.ts` 显式注册，由 `shared.ts` 按 `kind` 分发。

### 激活与轮询

`activate()` 在读取 profiles 或启动轮询前等待 `runV2CleanupMigration()`。随后注册命令、Webview、状态栏和活动监听，后台启动首次拉取并创建定时器；激活不等待首轮网络完成。

`pullAll()` 先检查 AFK，再通过串行 `refreshQueue` 执行；`isLoopRunning` 防止轮询重入。每个服务从 Secret Storage 读取 Key 并 trim，缓存未命中时调用 Provider，并传入可选安全 logger。普通数据缓存 60 秒，主错误和 stale 数据缓存 300 秒；空白或缺失 Key 的 `noKey` 数据不缓存也不发请求。

`refreshingIds` 随 `updateData` 发送给前端，使刷新期间保留旧卡片并显示按钮加载态。配置变更与手动刷新只清缓存、保留旧数据并重新拉取。若已有正常快照而刷新失败，`staleError` 保留旧 slots、详情、历史与原 `updatedAt`，前端显示过期提示和重试；没有旧快照时才生成 `err` 主错误卡。`isFreshServiceData()` 统一排除 `err`、`noKey` 和 `staleError`，历史保存与预警都不得把旧快照当新鲜样本，预警通知另有 30 分钟冷却。

GLM 全局刷新通过 `src/services/glm/detailRanges.ts` 的 `mergeDetailRanges()` 保留已加载的 week/month 详情与 `detailStates`；`provider.ts` 中的 `mergeGlmDetailData()` 负责把一次懒加载结果写入指定范围，不要混淆两个函数。`requestDetailRange` 按 `serviceId:range` 去重，写入 `loading`/`ok`/`error` 状态；空详情、模型与工具用量同时缺失、请求异常都进入可重试错误终态。配额与详情网络完成后都必须基于最新 `serviceData` 快照合并，避免覆盖并发新配额、详情或 stale 状态；等待期间服务已删除时丢弃回写，late detail 不得复活卡片或缓存。

### v2 清理迁移

`src/storage/migrations.ts` 使用 `aiQuotaDashboard.v2CleanupDone`：

- 清除旧 Data Bridge、MiMo、bridge-fed GLM/Kimi 的 profile 和对应 Secret。
- 保留手动 GLM/Kimi（含无 `dataSource` 的旧手动数据），剥离遗留 `dataSource`。
- 历史只保留现存 profile，顺便清理孤儿历史。
- 清除旧 Bridge 状态与旧迁移标记，最后写完成标记。
- 失败不写完成标记，下次激活重试；未知 kind 与来源不明的早期 GLM/Kimi 保守保留。

修改此处必须同步更新 `migrations.test.ts`，覆盖 manual 保留、删除集合、幂等、失败重试与历史清理。

## Webview 构建

构建链：

```text
src/webview/main.ts
  ├─ cards/glm.ts / cards/kimi.ts
  ├─ shared.ts / settings.ts / types.ts
  └─ esbuild IIFE（ES2020）
       ↓
media/dashboard.js
       ↓ asWebviewUri + nonce
Webview
```

宿主 `dashboard/webviewView.ts` 负责 HTML 骨架、样式、CSP、消息路由和设置元数据注入。业务代码全部由 bundle 外链加载；唯一内联脚本是 nonce 保护的 `window.__AQD_SETTINGS_META__` 数据注入。CSP 的 `script-src` 不允许 `unsafe-inline`。

Extension 与 Webview 是两个独立 TypeScript 程序：

- `tsconfig.json`：Node/VSCode 类型，无 DOM lib，排除 `src/webview/**`。
- `tsconfig.webview.json`：DOM lib，包含 `src/webview/**/*`。

因此 `npm run compile` 并不替代 Webview 独立类型检查；修改前端后建议同时运行：

```bash
npm run compile
npm run typecheck:webview
npm run build
```

设置面板采用数据指纹、编辑焦点与确认面板守卫，避免轮询重渲染冲掉输入或确认状态；已删除服务的前端卡片状态按当前 profiles 清理。未知 kind 只显示转义后的只读配置与删除入口，不渲染凭证或编辑表单。新增动态文本必须继续经过 HTML/Markdown 转义。

Key 设置不再把明文发送到 Webview：`settings.keys[id]` 只有 `API_KEY_MASK` 或空串。保存消息中 `key` 的 `undefined`（含 mask、缺失或非 string）表示保留 Secret，空串表示删除，新字符串表示替换；`endpoint` 同样遵循 `undefined` 保留、空串删除、新值更新。前端只在 endpoint 控件实际渲染时提交该字段，因此 GLM 当前未开放编辑时不会误删旧 endpoint。掩码只是 UI 标记，不是加密值，绝不能写入 Secret Storage。公开保存/新增命令拒绝非法 kind；保存目标 profile 已删除时返回失败，不写 Secret 或配置，也不触发刷新。

全局设置由 `webview/compute.ts` 做空值、有限数字、范围和步长预检，Extension 再做三项全量范围校验，全部通过后才写 Settings。宿主将命令结果以 `saveGlobalResult` 回发，设置页按 `field` 显示字段错误、焦点和保存状态，不能静默填默认值或发生部分校验失败后才开始写入。

GLM 详情面板使用复合 ARIA：`aria-labelledby` 同时指向当前模型/工具主 tab 与时间范围子 tab，并同步 `aria-selected`、roving tabindex、`aria-busy`；详情错误必须提供重试入口。

## 配置与隐私边界

| 数据 | 位置 |
|------|------|
| profiles | `globalState.services` |
| API Key | Secret Storage `apiKeys.{serviceId}` |
| 历史 | `globalState` 的 `aiQuotaDashboard.history`，最多 30 天 |
| 刷新/预警/AFK | VSCode Settings 的 `aiQuotaDashboard.*` |
| Settings 迁移标记 | `aiQuotaDashboard.configMigrated` |
| v2 清理标记 | `aiQuotaDashboard.v2CleanupDone` |

全局三项设置只写 Settings；旧 `globalState` 值通过一次性迁移搬入 Settings。`clearAllData()` 清除 profiles 对应 Secret 与全部 `globalState`，不会清除 VSCode Settings。历史读取与持久化合并会清洗损坏条目，保存前按当前 profiles 的 `activeIds` 排除已删除服务。

网络请求只发往 GLM/Kimi API 以查询配额。Kimi 的 endpoint 可在服务设置中选择 `https://api.kimi.com` 或 `https://api.kimi.ai`，Provider 只接受这两个官方 HTTPS origin，`/coding/v1/usages` 与 `/coding/v1/me` 共用归一化结果；非法或非官方值回退 CN 默认站。GLM 仍支持既有 endpoint 覆盖，修改保存逻辑时不得因未渲染输入框而清除它。

`getJson`/`postJson` 对 2xx 非 JSON Content-Type 和缺失 Content-Type 抛出不含响应正文的安全错误，兼容 charset 与 `+json`。Provider 的 fetch/detail logger 为可选参数；GLM 订阅、模型、工具以及 Kimi 会员等级降级只记录安全 message，不记录 Key、请求头、`responseBody` 或个人资料。Kimi `/me` 失败不阻断 `/usages`，正常卡显示会员等级不可用提示。

没有遥测或开发者服务器。详细威胁模型、掩码和 stale 历史边界见 [SECURITY.md](SECURITY.md)。

## 测试

### 运行

```bash
cd vscode

npm test
npm run test:watch

# 指定文件
npx vitest run src/services/kimi/provider.test.ts
npx vitest run src/storage/migrations.test.ts
```

### 当前测试布局

| 测试文件 | 覆盖重点 |
|----------|----------|
| `src/extension.test.ts` | 公开命令、凭证规范化、刷新/删除/详情并发、激活与异常收敛 |
| `src/core/cache.test.ts` | 缓存 TTL、清空、LRU 访问/更新顺序与生命周期 |
| `src/core/afk.test.ts` | 活动检测 |
| `src/core/config.test.ts` | 配置写锁、缺失 profile、Key/endpoint 三态原子保存、Settings 唯一可信源与迁移 |
| `src/core/fetch.test.ts` | HTTP 状态、总超时、响应体上限、2xx 非 JSON/缺 Content-Type 与安全错误 |
| `src/core/format.test.ts` | 数字格式化 |
| `src/core/types.test.ts` | 颜色阈值 |
| `src/services/glm/provider.test.ts` | GLM 配额、订阅、详情、时间解析、并行编排与安全 logger |
| `src/services/glm/detailRanges.test.ts` | 范围缓存与 detailStates 合并 |
| `src/services/kimi/provider.test.ts` | CN/Global 共用 origin、空值与有效窗口回退、旧 usage/limits、window/detail/resetTime、新 ratio 池、可选月度、会员降级与安全日志 |
| `src/storage/persistence.test.ts` | 损坏历史恢复与条目清洗、保存/合并、语义、保留策略、activeIds 与 noKey/staleError 过滤 |
| `src/storage/migrations.test.ts` | v2 清理、manual 保留、幂等与失败重试 |
| `src/ui/statusbar.test.ts` | 状态栏项生命周期、改名命令、staleError 提示与转义 |
| `src/ui/statusBarRenderer.test.ts` | 倒计时、颜色与转义 |
| `src/webview/compute.test.ts` | 服务可见性/骨架、设置校验、面板重渲染守卫与已删服务状态清理 |
| `src/webview/settings.test.ts` | 未知 kind 只读/转义与正常表单 |
| `src/webview/shared.test.ts` | 转义、fmtNum、渲染分发防御 |

约定：

- 测试与源码同目录，命名 `{source}.test.ts`。
- vitest 使用 Node 环境；`vscode` 模块 alias 到 `src/test/mocks/vscode.ts`。
- 解析、迁移和存储修改必须补充对应 fixture/单元测试。
- 测试 fixture 不证明服务端对所有账号返回相同字段，尤其不能据此声称 Kimi 月度配额必现。
- 自动测试不覆盖完整 Webview DOM 交互；Extension 内详情请求去重/并发回写和复合 ARIA 也不等同于已完成屏幕阅读器或 F5 验证。真实 API、Secret Storage 实机行为和线上字段可用性不能由 fixture 推断。

## 添加新服务

1. 在 `src/services/` 参考 GLM/Kimi 创建服务包，实现 Provider、类型、设置和样式。
2. 可选实现 `StatusBarRenderer`；需要详情时同时实现 DetailProvider 与合并函数。
3. 在 `index.ts` 组装 descriptor，并在 `services/registry.ts` 注册。
4. 新建 `src/webview/cards/{kind}.ts`，在 `src/webview/main.ts` 显式注册。
5. 添加同目录 vitest 测试。
6. 运行相关测试、lint、Extension/Webview 类型检查与 build。

完整 AI 维护约定见 [AGENTS.md](AGENTS.md)。

## VSIX 打包与安装

```bash
cd vscode

# 可选：本地没有 vsce 时安装
npm install -g @vscode/vsce

# 自动执行 vscode:prepublish（clean + compile + typecheck:webview + build）
vsce package

# 或指定输出文件
vsce package --out ai-quota-dashboard-2.0.0.vsix
```

安装：

```bash
code --install-extension ai-quota-dashboard-2.0.0.vsix
```

也可在 VSCode 扩展面板选择「从 VSIX 安装」。打包后应检查 VSIX 包含 `out/extension.js`、`media/dashboard.js`、资源和清单，不包含源码、测试、node_modules 或 sourcemap。

## 发布前人工冒烟

以下实机路径不能由 vitest 或 fixture 替代；联调结果应与解析测试分开记录。仅使用可撤销的测试 Key，不在日志、截图或文档中记录真实 Key。

- [ ] 按 F5 激活扩展，添加并删除 GLM/Kimi 服务，确认仪表盘与状态栏同步更新。
- [ ] 验证 Key 三态：保留掩码后保存不更换 Secret，清空后删除 Secret，输入新值后替换 Secret。
- [ ] 未配置 Key 时显示独立 `noKey` 配置卡，而非持续加载或伪造配额。
- [ ] 正常刷新后更新配额、刷新时间与状态栏，刷新期间保留可见旧卡片并显示加载态。
- [ ] 无旧数据时刷新失败显示主错误卡；有旧数据时保留旧配额、详情和原时间并显示 stale 提示，重试成功后恢复正常。
- [ ] GLM 分别加载 day/week/month 详情，检查加载态、错误重试；全局刷新后确认其他已加载范围仍保留。
- [ ] Kimi 分别验证 CN/Global 官方 origin；会员等级不可用时配额仍正常。仅在测试账号实际返回有效月度字段时核对月度槽，未返回时确认不伪造槽位，不要求月度能力必现。
- [ ] 全局设置输入合法值可保存；空值、非数字、越界或步长不符时显示字段错误，且不发生部分写入。
- [ ] 检查 VSIX 内容符合上述边界，并从 VSIX 安装后完成一次激活与基本刷新。
- [ ] 如需验证危险的重置操作，只在隔离的 Extension Development Host 中进行，不在日常工作实例执行。

## CI/CD

### CI：`.github/workflows/ci.yml`

触发：`main` push、指向 `main` 的 pull request、`workflow_dispatch`。

唯一 job `vscode` 在 Node 20 下执行：

1. `npm ci`
2. `npm run lint`
3. `npm run compile`
4. `npm run typecheck:webview`
5. `npm run build` 并断言 `out/extension.js`
6. `npm test`
7. 非阻断的生产依赖 `npm audit`
8. 安装 vsce，打带短 SHA 的 VSIX
9. 上传保留 7 天的 VSIX Artifact

Extension 与 Webview 类型检查均已进入 CI；`vscode:prepublish` 也会执行这两项检查，发布路径不会绕过前端类型门禁。

### Release：`.github/workflows/release.yml`

由 `v*.*.*` tag 触发：

- `vscode` job 对齐 tag 与 package 版本并执行 compile，随后按 **lint → `typecheck:webview` → test → build → package** 顺序设置阻断门禁；任一步失败都不会生成/上传发布 VSIX。成功后上传 90 天 Artifact，并在凭证存在时发布到 VSCode Marketplace 和 Open VSX。
- `github-release` job 只依赖 `vscode`，下载已通过上述门禁的 VSIX 并创建 GitHub Release，发布资产只有 VSIX。
- `VSCE_PAT` 控制 Marketplace 发布，`OPENVSX_PAT` 控制 Open VSX 发布；对应 Secret 为空时跳过该发布步骤。

## 代码风格

- TypeScript strict mode；Extension 与 Webview 的宿主 API 不混用。
- 注释使用中文。
- PascalCase（类/接口）、camelCase（函数/变量）、UPPER_SNAKE_CASE（常量）。
- 提交遵循 Conventional Commits：`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`。

---

最后更新：2026-11-17
