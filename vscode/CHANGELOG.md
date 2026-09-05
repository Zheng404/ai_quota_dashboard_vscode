# Changelog

> 本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 共享（浏览器扩展 + VSCode）

- **Cookie Bridge 更名为 Data Bridge，改为推送配额数据、不再传输凭证**（⚠️ 架构级变更）
  - 浏览器扩展不再向 VSCode 推送任何凭证（Cookie / API Key 均不推），改为浏览器端用自身凭证（Kimi 网页令牌 / MiMo Cookie / GLM API Key）调 API 拉取配额数据，把配额数据推送给 VSCode 展示
  - 协议端点由 `POST /cookies` 改为 `POST /data`；`source` 由 `ai-quota-cookie-bridge` 改为 `ai-quota-data-bridge`；payload 结构改为 `{source, timestamp, data: [{kind, serviceData}], activeKinds, displayNames}`（`serviceData` 即各服务的 ServiceData + 扩展字段，不含任何凭证）；端口范围 `[37100..37110]`、`/health` 探测密钥、`X-Auth-Token` 机制不变
  - VSCode 端：`handleCookiePayload()` 重写为 `handleDataPayload()`——更新 Bridge 状态（`connected` / `lastPushAt` / `receivedKinds`）→ 自动创建/更新对应 AI 服务（`dataSource='bridge'`）→ `serviceData` 写入 `bridgeDataStore`（模块级 Map，活到下次推送）→ 热重载 `updateView()`；bridge 数据源的 AI 服务不再发网络请求、不需要也不存储 Secret 凭证
  - **迁移清理**：Secret Storage 中历史遗留的 bridge 凭证由一次性迁移 `migrateBridgeCredentials()` 清理，完成后写入标记 `aiQuotaDashboard.bridgeSecretsCleared`；手动配置（`dataSource='manual'`）服务不受影响
  - 浏览器端：`relay.js` 重写为 `gatherAllQuotaData()`（复用 `api/{glm,kimi,mimo}.js` fetcher）+ `relayData(force)`（保留互斥 / 防抖 / 重试队列）；`chrome.cookies.onChanged` 不再触发推送（保留 `cookieChanged` 广播用于浏览器端单服务刷新）；凭证失效检测 + 自动刷新机制保留（浏览器自身拉数依赖有效 Cookie）
  - Bridge 状态字段 `receivedCredentials` 更名为 `receivedKinds`；内部 kind 仍为 `'bridge'`（无迁移），CSS 类名 `.bridge-*` 未改
  - 已知行为：bridge-fed 服务被移除后，若浏览器仍推送该 kind 会自动重建；推送数据带 `history` 时会与本地历史按日期去重合并
  - **兼容性**：要求浏览器扩展与 VSCode 扩展同步更新，旧版（凭证推送协议）浏览器扩展无法连接新版 VSCode
- **background.js 按职责拆分 + esbuild IIFE 打包链落地**
  - `browser-common/scripts/background.js`（1585 行单文件）拆分为瘦入口（346 行，仅 init 流程 + 事件监听注册 + 跨模块编排）+ `scripts/lib/` 六个子模块：`config-sync.js`（监控目标 / 显示名称 / 刷新间隔，ESM live binding 共享可变状态）、`bridge-client.js`（Bridge 端口发现 / 推送 / 重试队列 / 互斥锁）、`cookie-utils.js`（Cookie 多策略读取 / JWT 挑选 / 凭证 TTL，纯工具层）、`credential.js`（凭证缓存 / TTL / 失效探测 / 后台标签页刷新）、`kimi-relay.js`（Kimi access_token 被动镜像）、`relay.js`（凭证采集 / 推送 / 防抖与频率限制）；依赖单向无循环（relay → credential → config-sync 等），纯剪切-粘贴零行为变更（bundle 多重集合 diff 仅 2 个机械封装函数差异）
  - 新增 `vscode/esbuild.browser.mjs` + npm script `build:browser`：background 入口打包为 IIFE 单文件（target es2020、不 minify 便于审查），lib/ 与 protocol/ 全部内联，产物写入 `build/staging/{chrome,firefox}/scripts/background.js`
  - `build.sh` 重构为 staging 架构：`build/staging/{chrome,firefox}/` = 平台 manifest + icons + rsync(browser-common 全部) + esbuild bundle 覆盖 → 改写 staging manifest version → zip 从 staging 打；源码树 chrome/、firefox/ 全程零接触，彻底消除旧「复制进源码树 → 打包 → 清理」的污染-清理 dance（构建中断不再残留）；zip 显式清单中 `scripts/` 展开为 `scripts/background.js`（IIFE bundle）+ `scripts/kimi-content.js`，`scripts/lib/` 已内联不进包
  - CI `browser` job 同步新流程：npm ci（esbuild）→ `bash build.sh` → `unzip -l` 断言 `scripts/background.js` 与 `protocol/index.js` 在两平台包内；vsce 打包排除 `esbuild.browser.mjs`
  - 开发态零影响：源码树 manifest 仍指向 ESM 源码（`scripts/background.js` 直载 `scripts/lib/*` 与 `protocol/`，两浏览器 `type: module` 均支持），unpacked 加载路径不变；content script（`kimi-content.js`）不拆不动（classic 注入限制）
- **新增 protocol 共享层（`browser-common/protocol/`）**：Data Bridge 推送格式、端口列表、探测密钥、消息 action 名与 relay/重试/超时阈值收敛为单一可信源（纯 JS ESM + JSDoc typedef，`index.js` 唯一入口 + `index.d.ts` 类型出口）
  - 浏览器端接线：`background.js` / `popup.js` / `shared-ui.js` / `api/kimi.js` 改为经 `protocol/index.js` 引用（`dashboard.js` 经扫描无协议字面量，零改动）；`kimi-content.js` 因 content script 只能 classic 注入无法 ESM import，保持自包含并进漂移守卫白名单
  - VSCode 端：凭证校验 `hasBridgeCredentials()` 由 server 内联逻辑上移至 protocol；`server.ts` / `extension.ts` 的运行时常量与类型经 esbuild 管线落地后已直 import 单一可信源（原 `vscode/src/bridge/constants.ts` 镜像仅存在于过渡窗口，见下方「VSCode 端」构建管线条目）
  - 新增 `vscode/src/bridge/protocol.test.ts`：payload 构造与校验契约（空凭证/单凭证/全凭证）、action 名集合完整性、镜像与 protocol JS 模块逐值等价、漂移守卫（fs 扫描双端源码，白名单外断言无裸 `37100` / 探测密钥 / action 字面量）
  - `build.sh` 打包清单补 `protocol/` 目录（zip 为显式清单制，需显式加入方能入包）
  - `vscode/package.json` devDependencies 引入 `esbuild`（浏览器 bundle 已由 background 拆分条目消费；VSCode 侧 bundle 见下方构建管线条目）

### VSCode 端

- **Kimi 服务摘除订阅类死字段**：VSCode 端 Kimi 已单路径 Code API（响应不含订阅/会员信息），彻底移除恒为 `undefined` 的 `level` / `membershipTitle` / `currentEndTime` / `nextBillingTime` / `subscriptionStatus` / `subscriptionActive` / `balances` 扩展字段及 `KimiBalance` 类型；同步清理卡片模板（会员等级徽章 / 会员有效期行）、状态栏 tooltip（等级徽章 / 会员有效期）与专属样式中的死渲染分支
- **构建管线：esbuild 打包 + protocol 直切**
  - 新增 `vscode/esbuild.config.mjs` + npm script `build` / `clean` / `watch`：扩展入口 `src/extension.ts` 打包为 `out/extension.js`（cjs 单文件 bundle，`external: ['vscode']`，target node16，不 minify 便于审查，sourcemap 不进包）；webview bundle 段就绪（`src/webview/main.ts` → `media/dashboard.js`，iife），入口落地后自动启用
  - `tsc` 转为纯类型检查（`tsconfig` `noEmit`），解除 rootDir 限制：删除 `vscode/src/bridge/constants.ts` 运行时镜像，`server.ts` / `extension.ts` 直 import `browser-common/protocol/` 单一可信源；契约测试镜像等价段改为基线值锁定，漂移守卫白名单同步收紧
  - `vscode:prepublish` 改为 `clean && compile && build`（vsce 打包前必跑 bundle，杜绝陈旧 emit 文件混入包）；CI `vscode` job 增加 Build bundles 步骤与 `out/extension.js` 存在断言；`.vscodeignore` 排除 `esbuild.config.mjs` 与 `media/**/*.map`
- **Webview 前端 TS 化（构建期编译替代字符串模板）**
  - 新增 `vscode/src/webview/`：`main.ts`（入口：acquireVsCodeApi + updateData/switchToSettings 消息路由 + 渲染调度 + 全局事件绑定）、`shared.ts`（fmtNum/fmtDateTime/escapeHtml/renderSlot/renderService 等）、`settings.ts`（设置页渲染与事件，数据驱动无 kind 硬编码）、`cards/kimi.ts` / `cards/mimo.ts`（卡片模板）——全部 1:1 迁移自字符串版（`dashboard/templates/{shared,settings}.ts` 与 kimi/mimo 的 `template.ts`），函数逻辑与 DOM 输出逐行等价，仅增加类型注解与模块化；消息/payload 契约类型化（`webview/types.ts`，与 extension 侧 postMessage 一致）
  - `webviewView.ts`：`getHtml()` 切换为外链 bundle（`<script nonce src=asWebviewUri(media/dashboard.js)>`）+ 服务设置元数据注入（`window.__AQD_SETTINGS_META__`）+ compat prelude（暴露 GLM 字符串模板依赖的全局 `vscode` / `serviceTemplates` / `escapeHtml` / `fmtNum` / `fmtDateTime`，迁移期临时，C-3.3 随 GLM 卡片迁移一并移除）；CSP `script-src` 改 `'unsafe-inline' ${cspSource}` 双允许（inline 字符串模板 + 外链 bundle）；HTML 骨架与 styles 注入方式不变
  - `renderService` 分发：bundle 内置注册表优先，未命中回退 `window.serviceTemplates`（GLM 字符串卡片经 prelude 注册于此）；kimi/mimo 的 `templateScript` 停止注入，`ServiceDescriptor.templateScript` 字段转为可选（迁移期仅 GLM 保留）；bridge 卡片无模板（仪表盘过滤 kind='bridge'，前序版本已移除）
  - 删除字符串版模板（`dashboard/templates/` 目录与 kimi/mimo 的 `template.ts`）；`tsconfig` lib 补 `DOM`（webview 侧 DOM API 类型）
- **字符串模板体系最终移除（构建期编译收官）**
  - 删除 `services/glm/template.ts`（最后一个字符串模板）与 `ServiceDescriptor.templateScript` 字段——卡片渲染唯一通道为 `src/webview/cards/` 经 esbuild 打包的 `media/dashboard.js`
  - `webviewView.ts` getHtml 收为两段 script：设置元数据注入（`window.__AQD_SETTINGS_META__`，数据通道保留）+ bundle 外链；compat prelude（`vscode` / `serviceTemplates` / `escapeHtml` / `fmtNum` / `fmtDateTime` 全局暴露）整段移除；CSP `script-src` 收紧为 `'nonce-<random>' ${cspSource}`——不再允许 `'unsafe-inline'`，唯一 inline（元数据注入）经 nonce 精确放行
  - bundle 侧收尾：`renderService` 删除 `window.serviceTemplates` 回退分支（内置注册表唯一分发）；`vscodeApi` 改为 bundle 直接 `acquireVsCodeApi()`（prelude 不再代持）；GLM 卡片移除迁移期的 `stopImmediatePropagation` 短路（字符串版重复委托已不存在）；webview `types.ts` 清理 prelude 服务的 `declare global`（仅保留 `__AQD_SETTINGS_META__`）
- **GLM 卡片 TS 化（构建链 epic Lane C-3.2，字符串模板迁移收尾）**
  - 新增 `vscode/src/webview/cards/glm.ts`（408 行）：1:1 迁移自 `services/glm/template.ts` 字符串版（358 行）——前端状态管理（`glmStates` / `getGlmState`）、头部（等级徽章/会员有效期行）、配额卡（MCP detailLine 分支）、SVG 折线图（grid/单点 circle/全零兜底）、模型·工具汇总、主/子 Tab 渲染与切换、`requestDetailRange` 懒加载、GLM 专属点击委托（并入模块自持 `document` 监听器）；函数逻辑与 DOM 输出逐行等价，仅增加类型注解与模块化（prelude 全局 `escapeHtml`/`fmtNum`/`fmtDateTime`/`vscode` 改为从 `shared.ts` 导入，glm 私有 `formatDateTime`/`fmtTokens` 保持模块私有）；`webview/types.ts` 无需改动（`GlmServiceData` 直 import 服务侧类型）
  - `main.ts` 注册 `registerGlmCard()`（与 kimi/mimo 同模式），GLM 卡片自此走 bundle 内置注册表分发；字符串版模板暂留注入（死重，C-3.3 统一移除 prelude/字符串/`window.serviceTemplates` 回退，本 lane 不动）
  - 点击委托迁移期保护：bundle 监听器先注册先触发，命中 GLM Tab 点击时 `stopImmediatePropagation` 短路后注册的字符串版同款委托——其内部 `state.data` 恒为 `null`（renderCard 已被内置注册表遮蔽），否则 sub-tab 分支会把已渲染详情覆盖为 loading 并重复 `postMessage` 触发多余详情请求；GLM Tab 与帮助/删除按钮目标互斥，短路不影响 main.ts 通用委托，字符串版删除后该调用自然成为无操作
  - 等价性验证：git HEAD 字符串版 vs 新 bundle 同输入输出逐字节对比 80 用例全绿（card 段 29 / svg 段 12 / tabs 段 39，覆盖 XSS 转义、空 series、单点 circle、resetsAt 缺省、MCP detailLine 分支、懒加载分支、多状态序列、模拟点击行为序列）；webview bundle 22192 → 35814 B（+13622 B）

## [1.1.1] - 2026-09-04

### 新增 (Added)

- **Kimi 请求头适配 2026 年 WAF 收紧**（VSCode 端 + 浏览器扩展全链路）
  - `vscode/src/services/kimi/provider.ts`：请求携带完整 Chrome UA（替换原残缺 UA，残缺/默认 UA 会被 WAF 直接拒绝）、`r-timezone` 头（本地 IANA 时区，惰性求值缓存）、`Cookie: kimi-auth=<token>` 与 `Authorization: Bearer` 并存（web 会话要求 Cookie 形态凭证，仅 Bearer 不够）
  - `browser-common/api/kimi.js`：请求补 `r-timezone` 头；UA 与 Cookie 由浏览器 fetch 自动携带（真实浏览器 UA + kimi.com 域 Cookie，手动设置会被浏览器禁止/覆盖）
  - `browser-common/scripts/background.js`：`probeCachedCredential` 与 `checkCredentialValidity` 两处凭证探测同步补 `r-timezone`，避免 WAF 误拒导致误判凭证失效、触发可见标签页刷新死循环
- **Kimi eyJ JWT Cookie 扫描兜底**（浏览器扩展）
  - `kimi-auth` Cookie 缺失/改名时，扫描 `.kimi.com` 域下 value 以 `eyJ` 开头（JWT 头 base64 特征）的 Cookie 作为凭证
  - 新增 `pickJwtCookie()` 二级选择：先过滤 eyJ 形态，再优先取名字匹配 `auth`/`token`/`session`/`jwt` 的 Cookie，无名字匹配时回退取第一个（避免误扫埋点/A-B 实验 cookie）
  - 覆盖采集（`gatherAllCookies`）、本地缓存、推送提取（`relayCookies`）、凭证刷新（`loadCredentialViaBackgroundTab`）全链路；`api/kimi.js` 读取 Cookie 时同样兜底
  - `chrome.cookies.onChanged` 对 Kimi 域新增：Cookie 名字不在监听名单但 value 呈 JWT 形态时，同样视为凭证变化即时触发推送（其它 kind 行为不变）
- **Kimi 401 服务端原因诊断**
  - 401 时从响应体提取 `debug.reason` / `code` 拼入认证错误消息，便于区分凭证过期/风控等服务端原因（VSCode 端 `buildAuthError()` + 浏览器端 `kimiPost`）
- **Kimi 鉴权机制适配（浏览器侧，被动镜像）**：Kimi 已废弃 `kimi-auth` Cookie（停止续期 + 签名密钥轮换），网页端改用 localStorage `access_token`（~15 分钟）/ `refresh_token`（~90 天）令牌对
  - 新增 `scripts/kimi-content.js` content script：注入 kimi.com 页面镜像 localStorage 令牌（启动上报 + storage 事件 + 60s 轮询三重触发），**不调用 RefreshToken 端点**（单消费者，接管会踢网页下线）
  - `background.js`：新增 relay 存储（内存 + storage.local 双写）与按需索取（向打开的 kimi.com 标签页广播询问，2s 超时）；`relayCookies` 供值链改为 relay access_token 优先，legacy cookie 链降为兜底；payload 结构不变（VSCode 端零改动）
  - `api/kimi.js`：popup/dashboard 优先向 background 索取 relay token，legacy cookie 读取保留为兜底；无凭证引导文案更新
  - `chrome`/`firefox` manifest 注册 content_scripts（`https://www.kimi.com/*`）
  - 注入兜底与诊断：新增 `scripting` 权限，relay 为空时自动 `chrome.scripting.executeScript` 编程注入已有标签页（免手动刷新页面）；`tabs.query` 补裸域匹配；content script 空值必应答附 `foundKeys`、上报长度日志，Service Worker 日志可自诊断「脚本未注入 / key 名不符 / token 为空」三类故障
- **浏览器端 — 共享 UI 工厂 `shared-ui.js`**
  - 抽取 popup.js 与 dashboard.js 几乎逐行重复的页面逻辑为 `createSharedUI(options)` 工厂（542 行）；页面差异（Bridge 状态卡、自动刷新开关、空态文案、按钮文字等 13 项）经选项注入，两页既有行为与 DOM 约定完全不变
  - popup.js 754→355 行、dashboard.js 511→117 行；页面专属逻辑保留在各自文件（popup：Bridge 状态检测与服务管理；dashboard：默认服务初始化、GLM 快速添加）
- **浏览器端 — 本地凭证缓存 24h TTL + 手动清除**
  - `glmApiKey`（storage.local 副本改为 `{ value, capturedAt }` 对象）、`kimiTokenRelay`、`mimoCredentialCache` 三处凭证缓存统一附加 24 小时 TTL，过期自动失效并重新采集，避免向 VSCode 推送陈旧凭证
  - popup 设置页新增「清除本地凭证缓存」按钮，一键清除上述三个存储键
- **浏览器端 — Kimi 双模式凭证**（与 VSCode 端单路径决策配套）
  - 模式① 网页 token relay（主路径）：复用 content script 镜像的 localStorage `access_token`，展示频率限制明细 / 本周用量 / 月度权益额度 3 槽全量
  - 模式② Code API Key 手动配置（兜底）：popup 设置页粘贴 `sk-` Key，无网页会话时仍可查看 5h 频限 + 本周用量 2 槽；字段映射与 VSCode 端一致（`usedPercent` 优先、`resetAt` 秒/毫秒/ISO 兼容、`duration === 300 && TIME_UNIT_MINUTE` 精确匹配 5h 窗口，兜底取最短窗口）
- **VSCode 端 — Kimi Code API Key 单路径支持**
  - Kimi 服务仅接受 Kimi Code API Key（`sk-` 前缀，Kimi Code 控制台获取，长期有效）：`GET https://api.kimi.com/coding/v1/usages`（国际站 `api.kimi.ai`）→ 「频率限制明细 (5h)」+「本周用量」2 槽；无订阅信息，`level` / 有效期等扩展字段留空
  - 非 `sk-` 凭证（如网页 JWT Token）直接抛引导错误、不发起任何请求；原网页三要素（完整 UA / `r-timezone` / `kimi-auth` Cookie）请求路径已从 VSCode provider 移除
- **VSCode 端 — 测试扩充（68→114 用例全绿）**
  - 新增 `src/bridge/server.test.ts`（9 用例：Host 白名单、401 未认证、415 Content-Type、413 超限、1MB 请求体上限等）
  - 新增 `src/core/config.test.ts`（14 用例：`saveServiceAtomic` 原子化、Settings 唯一可信源读取、一次性迁移双闸门）
  - `src/storage/persistence.test.ts` 补 4 用例

### 变更 (Changed)

- **历史持久化过滤错误数据点**：`doPullAll` 保存历史前剔除 `err` 态服务数据，避免错误结果污染 30 天历史曲线
- **删除 Bridge 仪表盘死代码模板**：Bridge 卡片本就不在仪表盘渲染（仪表盘过滤 `kind === 'bridge'`），移除 `services/bridge/template.ts`，`templateScript` 置空
- **浏览器端 — 移除 Offscreen 刷新链路与死代码**
  - 整文件删除：`offscreen.html`（Offscreen 刷新文档）、`constants.js`（探测密钥 `BRIDGE_PROBE_SECRET` 收敛回 `background.js` 内定义，与 VSCode 端 `server.ts` 对齐）、`browser-api.js`（预留未用的 API 兼容层）
  - background.js 移除 `loadViaOffscreen` / `loadViaMinimizedWindow` / `loadInvisiblePage` / `refreshCredential` 死链函数；Cookie 类凭证（Kimi/MiMo）自动刷新收敛为 `loadCredentialViaBackgroundTab`（后台非激活标签页）单一路径，GLM 为静态 API Key 无刷新载体
  - Chrome manifest 移除 `offscreen` 权限；build.sh 打包 / 清理清单同步更新
- **浏览器端 — build.sh 版本号自动化**
  - `VERSION` 改从 `vscode/package.json` 读取（唯一可信源，消除多处手工同步）；打包时临时改写打包副本的 manifest version（备份 → 改写 → zip → 恢复），源码树零污染
  - 公共代码同步改用 rsync（排除 `manifest.json` / `icons/`，避免覆盖浏览器专属文件；不可用时回退 cp）
- **VSCode 端 — saveService 原子化**
  - Webview `saveService` 消息处理收敛为 `config.saveServiceAtomic()`：先计算目标终态，再按「Secret Storage 成功 → globalState 落盘」顺序两次写入，杜绝「Key 已换、服务配置未更新」（或反之）的半更新不一致状态（取舍论证见 `config.ts` 注释）
- **VSCode 端 — 全局配置收敛为 Settings 唯一可信源**
  - 刷新间隔 / 预警阈值 / AFK 阈值三项改为从 VSCode Settings 读取（唯一可信源）；`globalState` 旧值仅作回退，并在回退时触发一次性迁移（把旧值搬入 Settings）
  - 防重复迁移双闸门：会话内存闸门（迁移失败自动重试）+ `aiQuotaDashboard.configMigrated` 持久标记（跨会话生效）
- **VSCode 端 — Cookie Bridge 不再消费 Kimi 网页凭证**
  - 浏览器扩展推送的 `kimiAuthToken`（网页 relay token）仍保留在 payload 中（浏览器端自用），Bridge 分发链路照旧写入 Secret Storage，但 Kimi provider 不再使用网页凭证发请求（非 `sk-` 凭证直接引导错误）；GLM API Key 与 MiMo Cookie 分发行为不变

### 修复 (Fixed)

- **请求日志状态码失真**：`fetch.ts` 的 `doRequest` 返回 `{ result, statusCode }` 结构，请求日志不再对成功响应硬编码 `200`，如实记录真实 HTTP 状态码；同时修正该代码块的缩进错位

### 安全 (Security)

- **Bridge 服务器 Host 头白名单校验**：仅放行 `127.0.0.1:<port>` / `localhost:<port>` 形态的 Host 头，拦截恶意网页将自有域名解析到本机地址后发起的 DNS rebinding 攻击
- **`/cookies` 端点 Content-Type 校验**：仅接受 `application/json` 请求体（容忍 `; charset=` 后缀），配合 CORS 预检堵住跨源 HTML 表单 CSRF
- **CORS 允许头补 `X-Bridge-Probe`**：`Access-Control-Allow-Headers` 显式包含自定义探测头，避免未来扩展权限收紧后 `/health` 预检静默失效（当前靠 host_permissions 绕过）
- **澄清 Bridge 威胁模型**：`server.ts` 头部新增诚实声明——探测密钥随扩展公开发布，双层认证的防御边界是恶意网页与其它浏览器扩展（CSRF / 跨源访问 / DNS rebinding），**不防御本地恶意进程**（任何本地进程可访问 `/health` 获取 authToken 伪造凭证推送）；1.0.0 引入探测密钥时隐含的本地进程防护表述以本条澄清为准

## [1.1.0] - 2026-06-24

### 新增 (Added)

- **浏览器扩展支持自定义服务显示名称**
  - popup.js / dashboard.js 设置页服务名称从只读 span 改为可编辑 input
  - 保存时读取输入框值写回 `svc.name` 并持久化，空值回退默认标签
  - dashboard.js `loadService` 补上 `name` 覆盖，修复独立仪表盘页面服务名丢失的 bug
- **Cookie Bridge 双向显示名称同步**
  - 浏览器扩展推送凭证时新增 `displayNames` 字段，携带各 AI 服务的自定义显示名称（kind -> displayName）
  - VSCode 端收到后，对 bridge 数据源的服务自动更新 `displayName`，并在自动创建服务时优先使用浏览器扩展提供的名称

### 修复 (Fixed)

- **浏览器扩展设置页服务名不可编辑**：之前用户无法修改服务在卡片/设置页中的显示名称，现在可直接在「服务」标签页编辑

## [1.0.0] - 2026-06-15

### 新增 (Added)

- **仪表盘无缝刷新**
  - 引入 `refreshingIds`（正在刷新的服务 ID 集合），随 `updateData` 推送给前端
  - 刷新时保留旧数据，对应服务卡片的刷新按钮旋转；不再全屏"数据加载中"占位
  - 首次加载/新增服务时显示轻量加载骨架卡（`renderLoadingCard`）
- **Cookie Bridge 状态整合进「服务」标签页**
  - Bridge 连接徽章、最后同步时间、已连接服务标签（Kimi/MiMo/GLM）、诊断信息整合进「服务」标签页的 Bridge 服务条目
  - 仪表盘不再单独显示 Bridge 卡片（`filter(p => p.kind !== 'bridge')`）
- **独立的 Cookie Bridge 服务卡片**
  - VSCode 扩展新增 `kind='bridge'` 服务，作为独立的状态监控卡片
  - 显示浏览器扩展连接状态、最后同步时间、已接收凭证种类（Kimi/MiMo/GLM）
  - Bridge 状态持久化到 `globalState`（`aiQuotaDashboard.bridgeState`），支持跨会话保留
- **Cookie Bridge 自动分发凭证**
  - 浏览器扩展推送的凭证（`kimiAuthToken` / `mimoCookie` / `glmApiKey`）由 `handleCookiePayload()` **自动分发到对应的 AI 服务**：写入 Secret Storage 并标记 `dataSource='bridge'`
  - 若对应 AI 服务不存在，**自动创建**；并对同一 kind 去重（优先保留 bridge 来源），避免重复卡片
  - 同步移除浏览器扩展已删除的 bridge 来源服务（基于推送的 `activeKinds`）
  - 用户可在 VSCode 服务标签页把任意 AI 服务从 `bridge` 切换回 `manual` 手动输入
- **配额预警通知**
  - `checkQuotaWarnings()` 在配额使用率超过 `warnThreshold` 时弹出 VSCode 警告通知，列出所有超阈值的服务
  - 30 分钟冷却期，避免每次轮询都弹通知
- **VSCode 扩展激活失败保护**
  - `activate()` 增加顶层 try-catch，激活失败时显示错误通知并记录日志
  - Bridge 服务器启动失败时更新 Bridge 状态并记录诊断信息

### 变更 (Changed)

- **Cookie Bridge 按需启停**
  - Bridge 服务器从"扩展激活即无条件启动"改为"仅当用户添加 Cookie Bridge 服务后才启动"
  - 新增 `syncBridgeLifecycle` / `ensureBridgeRunning` / `stopBridgeIfIdle` 管理生命周期；用户移除 Bridge 服务后自动关闭端口
- **tab 结构扁平化（VSCode + 浏览器扩展）**
  - 从两级 tab（仪表盘/设置，设置下含服务列表+全局设置子标签）改为三个平级标签：仪表盘 / 服务 / 设置
- **卡片服务名改用官方名称**
  - GLM Coding Plan (CN) / Kimi Membership / Xiaomi MiMo Token Plan（原为中文翻译）
- **Kimi / MiMo 凭证文案按认证机制区分**（浏览器扩展）
  - Kimi：`kimi-auth` Cookie（JWT 令牌）作 Bearer 认证
  - MiMo：`serviceToken` Cookie 认证
- **浏览器扩展统一凭证推送**
  - `background.js` 不再依赖 `activeKinds` 选择性转发凭证
  - 总是采集并推送全部凭证：`kimiAuthToken` + `mimoCookie` + `glmApiKey`
  - Cookie 变化监听关注所有目标站点 Cookie，不再受服务启用状态限制
  - `init()` / `configUpdated` / 启动后总是尝试连接并推送全部凭证
- **全局设置同步到 VSCode Settings**
  - `config.ts` 的 `setState()` 对刷新间隔、预警阈值、AFK 阈值三项额外调用 `workspace.getConfiguration().update()`，使其在 VSCode 设置面板中可编辑
- **端口发现改为 `/health` 探测**
  - VSCode 端写入 PID 端口文件 `os.tmpdir()/.ai-quota-bridge-port-{pid}`（权限 0600），仅用于本地进程管理
  - 浏览器扩展优先尝试上次成功的端口（`storage.local` 的 `bridgeLastPort`），失败后遍历 `[37100..37110]` 逐个 `GET /health` 探测
- **MiMo 凭证检测增强**
  - `checkCredentialValidity('mimo')` 增加 API 探测，识别服务端 session 过期但客户端 Cookie 仍存在的场景
  - API 返回 401/403 或业务码非 0 时返回 `invalid`，触发强制刷新
- **Bridge 连接诊断增强**
  - `BRIDGE.lastError` 记录端口发现/推送失败的最后错误信息
  - `getStatus` 在 `connected=false` 时主动触发 `discoverPort()` 并返回诊断
  - popup 设置页显示红色诊断信息
- **MiMo 错误提示优化**
  - 401 和业务级未登录统一提示"MiMo 登录凭证已过期，请重新登录 MiMo 网站"
  - VSCode 端和浏览器扩展端提示文案保持一致
- **资源生命周期管理**
  - `outputChannel` 和 `afkDetector` 纳入 `ctx.subscriptions`，由 VSCode 统一释放；`deactivate` 不再手动 dispose `outputChannel`
- **状态栏分隔符判断可读性**
  - `q.dividerBefore ?? i > 0` 加括号 `(i > 0)` 消除 `??` 与 `>` 优先级歧义

### 安全 (Security)

- **Cookie Bridge `/health` 端点探测密钥校验**（⚠️ 破坏性变更）
  - `/health` 端点原先无条件返回 `authToken`，任何能访问 `127.0.0.1:37100-37110` 的本地进程均可获取 token 伪造凭证推送
  - 改为校验打包进扩展的探测密钥（`X-Bridge-Probe` 头），通过后才返回会话 authToken
  - **兼容性**：要求浏览器扩展与 VSCode 扩展同步更新到 1.0.0，旧版浏览器扩展无法连接新版 VSCode
- **状态栏 tooltip Markdown 注入防护**
  - 状态栏 tooltip 此前将用户/API 文本（服务名、错误信息、配额标签）直接拼入 MarkdownString（`isTrusted` + `supportHtml`），存在注入风险
  - 新增 `escapeMarkdown()` 工具函数，对所有动态纯文本做 Markdown 特殊字符转义

### 修复 (Fixed)

- **刷新按钮 CSS**：`.btn-refresh-svc.spinning .icon` 选择器找不到元素（SVG 无 `.icon` class），刷新图标实际不旋转；改为 `.spinning svg`
- **浏览器扩展 Kimi / MiMo 卡片边框缺失**：`.kimi-card` / `.mimo-card` 缺少样式定义（仅 `.glm-card` 有），补全后三个卡片视觉统一
- **浏览器扩展刷新按钮文字旋转**：`<span class="spin">刷新</span>` 导致文字跟随旋转；文字移出 spin span，新增加载圆环指示器
- **dashboard.js 致命 bug**：DOM 引用替换时遗留重复 `const` 声明导致 SyntaxError，独立仪表盘页面完全瘫痪；同时修复既有 id 不匹配 bug（`getElementById('settings-services')` vs HTML 的 `subpanel-services`）
- **dashboard.js 服务过滤一致性**：`s.enabled` → `s.enabled !== false`，与 popup.js 对齐，避免缺少 `enabled` 字段时漏显服务
- **VSCode `/cookies` 端点 GLM 推送问题**
  - 修复了仅当 `cookies` 数组非空时才触发回调的问题
  - 现在只要有 `cookies` / `kimiAuthToken` / `mimoCookie` / `glmApiKey` 任意凭证即触发 Bridge 状态更新和分发
- **旧数据 `dataSource` 兼容**
  - `initDefaults()` 后调用 `migrateBridgeDataSource()`，将缺失 `dataSource` 的旧 profile 默认设为 `manual`
- **Bridge 服务器启动失败后无法自愈**：`ensureBridgeRunning` 此前在 `start()` 前就把实例赋值给模块级变量，端口全被占用时后续重试永远命中「已运行」直接返回；改为成功后才赋值并 push subscriptions，失败时 dispose 候选实例，允许下次重试
- **Cookie Bridge 去重误删用户手动配置的服务**：`deduplicateAiProfiles` 此前同一 kind 存在 manual + bridge 时会删除 manual 服务（连同 Secret Storage 凭证），用户手动输入的 API Key 被静默清空；改为 manual 服务永远不参与去重，仅清理重复的 bridge 服务
- **GLM 详情懒加载数据被全局刷新覆盖**：用户点了「近7天/近30天」后，若触发一次全局自动刷新，`modelUsageByRange` 被 `{ day }` 整体覆盖，已加载的 week/month 数据丢失，Tab 切回时又变回「数据加载中」；新增 `mergeDetailRanges` 在刷新时保留旧的非 day 范围数据
- **浏览器扩展连续 401 清空整个重传队列**：VSCode 重启生成新 token 时，扩展持有的旧 token 连续 401 会触发 `pendingPayloads.length = 0`，丢弃队列中尚未推送的有效凭证；移除整队清空逻辑，由单包 `retries>=3` 机制负责丢弃
- **浏览器扩展配置变更双重推送**：popup 保存配置时 `storage.onChanged` 监听和 `configUpdated` 消息都会触发 `relayCookies`，产生冗余的两次 HTTP POST；`configUpdated` 消息不再重复 relayCookies，仅兜底 discoverPort
- **GLM 配额百分比未校验导致 NaN 传播**：`parseLimits` 此前直接透传 API 的 `percentage`/`nextResetTime`，未做有限性校验和 clamp；新增 `clampPercent()`（规范化为 [0,100]）和 `sanitizeTimestamp()`（过滤非法时间戳），`checkQuotaWarnings()` 同步过滤非有限值
- **`requestDetailRange` range 未做白名单校验**：任意字符串会作为 key 污染 `modelUsageByRange` 状态对象；增加 `['day','week','month']` 白名单
- **`escapeHtml` 未转义单引号**：VSCode 端和浏览器扩展端的 `escapeHtml` 补充 `'` → `&#39;` 转义
- **GLM Token 用量格式不统一**：`fmtTokens`（带空格 + 2 位小数）与全局 `fmtNum`（无空格 + 1 位小数）格式不一致，同一卡片内单位显示混乱；`fmtTokens` 改为直接复用 `fmtNum`

## [0.9.0] - 2026-06-10

### 新增 (Added)

- **浏览器扩展 — Cookie Bridge**
  - Chrome/Edge 和 Firefox 双平台支持（Manifest V3）
  - 按需监控：仅监控已添加服务卡片对应的 Cookie，避免全局监听
  - 通过本地 HTTP 服务器安全推送凭证至 VSCode（动态 Token 认证 + PID 端口文件）
  - 防抖推送（1.5s 延迟）+ 失败重试队列（最多 50 条，连接恢复后自动重试）
  - 请求体大小限制（1MB），防止 DoS
  - 支持 GLM API Key 推送：三个服务（GLM/Kimi/MiMo）均支持通过浏览器扩展自动同步凭证
- **浏览器扩展 — Popup 仪表盘**
  - 420px 宽弹窗，直接查看 GLM / Kimi / MiMo 配额状态
  - 仪表盘 / 设置 双标签切换
  - 服务管理：添加 / 删除 / 保存服务，按服务显示 Cookie Bridge 连接状态
  - GLM 支持 API Key 输入，Kimi / MiMo 凭证自动从浏览器 Cookie 获取
- **浏览器扩展 — 独立 Dashboard 页面**
  - 全宽页面展示配额卡片和用量详情
  - GLM：配额进度条 + 模型/工具用量详情 + SVG 曲线图（当日/近7天/近30天 Tab 切换）
  - Kimi：配额进度条 + 会员等级 + 有效期
  - MiMo：套餐用量 + 补偿 Token + 有效期 + 自动续费状态
- **凭证失效检测 + 自动刷新**（浏览器扩展 background.js）
  - 每 30 分钟自动检查 Cookie 有效性（存在性、过期时间、API 探测）
  - 检测到失效时后台打开临时标签页访问目标网站刷新 Cookie
  - 刷新完成后自动推送给 VSCode，全程无感知
- **Bridge 端口发现增强**
  - 预定义 fallback 端口列表 `[37100..37110]`，顺序尝试可用端口
  - 新增通用端口文件 `.ai-quota-bridge-port`，方便浏览器扩展快速发现
- **浏览器扩展快捷键**：`Alt+Q` 打开弹窗，`Alt+Shift+Q` 打开 Dashboard 页面
- **浏览器扩展共享模块**
  - `browser-api.js`：浏览器 API 兼容层（统一 Chrome/Firefox API 差异）
  - `cache.js`：基于 `chrome.storage.local` 的带 TTL 缓存（60s）
  - `config.js`：集中式配置管理（`loadConfig()` / `saveConfig()`）

### 重构 (Changed)

- **浏览器扩展代码统一**：Chrome/Firefox 重复代码合并为 `browser-common/` 共享目录
  - Chrome/Firefox 目录仅保留 `manifest.json` 和 `icons/`
  - `build.sh` 改为「复制 → 打包 → 清理」三段式流程
- **项目目录重组**：VSCode 扩展源码迁入 `vscode/` 子目录，浏览器扩展独立为顶层目录
  - `vscode/`：VSCode 扩展源码和构建产物
  - `chrome/`：Chrome/Edge 浏览器扩展
  - `firefox/`：Firefox 浏览器扩展
  - `browser-common/`：浏览器扩展共享代码
  - `build.sh`：一键打包三个平台的扩展
- **UI 文本全面中文化**
  - 服务名称："GLM Coding Plan (CN)" → "GLM 编码计划"、"Kimi Membership" → "Kimi 会员"、"Xiaomi MiMo Token Plan" → "小米 MiMo Token 计划"
  - 命令标题去除 "AI Quota Dashboard:" 前缀
  - 状态栏 / Tooltip 移除所有 emoji 和特殊字符，改用中文括号标注
  - 术语统一："鉴权" → "认证"、"频限明细" → "频率限制明细"、"月权益额度" → "月度权益额度"、"Token 总量" → "Token 消耗总量"
- **错误信息优化**：三个服务 Provider 的错误提示更具体友好
- **Bridge 服务器增强**（`vscode/src/bridge/server.ts`）
  - 端口尝试逻辑从"首选或随机"改为顺序遍历 fallback 端口列表
  - `CookiePayload` 接口新增 `glmApiKey` 字段
  - `extension.ts` 新增 GLM 凭证更新逻辑（`dataSource === 'bridge'` 的 GLM 服务自动更新 key）
- **GLM Provider 增强**：新增套餐有效期查询、模型/工具用量详情、懒加载按时间范围拉取
- **Kimi Provider 增强**：Connect 协议双请求并行拉取（GetSubscription + GetUsages），支持会员等级和余额
- **MiMo Provider 增强**：套餐用量和详情并行请求，支持补偿 Token 额度和自动续费状态
- **ConfigManager 类封装**：消除模块级可变状态，增加输入校验
- **fetch.ts 重试机制**：指数退避（`retryDelay * 2^attempt`），网络错误和服务端 5xx 自动重试
- **fetch.ts 请求日志**：集成 VSCode OutputChannel，记录请求/响应状态码和耗时
- **LRU 内存缓存**：限制最大 100 条目，防止无界增长
- **AsyncQueue 并发控制**：Promise-based 串行队列，消除 pullAll/pullService/afterConfigChange 竞态条件

### 安全 (Security)

- **XSS 防护**：浏览器扩展所有页面使用 `createElement`/`textContent` 替代 `innerHTML`
- **Content Security Policy**：为所有 HTML 页面添加 CSP 策略
- **敏感字段过滤**：Cookie 推送时移除 `httpOnly`/`secure`/`expirationDate`，仅发送必要字段
- **PID 后缀端口文件**：避免多 VSCode 实例同时启动时的端口文件冲突
- **请求超时**：Bridge 服务器 POST 请求增加 5s 超时
- **Mutex 保护**：Promise-based mutex 保护 BRIDGE 状态，防止并发竞态

### 修复 (Fixed)

- **Provider 错误处理**：统一不静默吞错，增加 `console.warn` 日志
- **Kimi NaN 防御**：`parseInt` 失败时回退到 0，避免 `NaN` 污染百分比计算
- **Kimi 错误码**：`subData.code` 检查增加 `'ok'` 白名单，避免误判成功响应
- **MiMo 数据校验**：`code === 0` 后检查 `data` 存在性，空数据时抛出明确错误
- **MiMo 401 分支**：增加 `Unauthorized` 字符串检测，覆盖更多认证失败场景
- **GLM 日期解析**：`new Date(t).getTime()` 返回 `NaN` 时跳过该数据点
- **GLM 订阅解析**：`nextRenewTime` 无效时返回 `undefined` 而非无效日期
- **afterConfigChange 死锁**：提取 `doPullAll` 内部逻辑，避免 `enqueue` 嵌套调用
- **AFK Detector dispose**：符合扩展生命周期规范，销毁后调用无效果
- **WebviewView dispose**：消息监听器正确清理，防止内存泄漏
- **persistence.ts UTC 日期**：历史数据去重改用 UTC 日期，消除时区偏移问题

## [0.3.0] - 2026-06-02

### 新增 (Added)

- **浏览器扩展（Cookie Bridge）**
  - Chrome/Edge 和 Firefox 双平台支持（Manifest V3）
  - 自动监控 `kimi.com` (`kimi-auth`) 和 `xiaomimimo.com` Cookie 变化
  - 通过本地 HTTP 服务器安全推送至 VSCode（动态 Token 认证）
  - 独立 Dashboard 页面：查看 Kimi/MiMo 配额状态、VSCode 连接状态
  - 弹窗面板：显示 Cookie 登录状态、手动触发同步
  - 快捷键支持：`Alt+Q` 打开弹窗，`Alt+Shift+Q` 打开 Dashboard
  - 防抖推送（1.5s 延迟）+ 失败重试队列（最多 3 次）
  - 请求体大小限制（1MB），防止 DoS
- **双模式认证**
  - `manual`：手动输入 Token（API Key / JWT / Cookie）
  - `bridge`：浏览器扩展自动同步（无需手动复制粘贴）
- **LRU 内存缓存** — 限制最大 100 条目，防止无界增长
- **AsyncQueue 并发控制** — Promise-based 串行队列，消除 pullAll/pullService/afterConfigChange 竞态条件

### 安全 (Security)

- **XSS 防护**：浏览器扩展所有页面（Dashboard、Popup）全部使用 `createElement`/`textContent` 替代 `innerHTML`
- **Content Security Policy**：为所有 HTML 页面添加 CSP 策略
- **敏感字段过滤**：Cookie 推送时移除 `httpOnly`/`secure`/`expirationDate`，仅发送必要字段
- **PID 后缀端口文件**：避免多 VSCode 实例同时启动时的端口文件冲突
- **请求超时**：Bridge 服务器 POST 请求增加 5s 超时
- **Mutex 保护**：Promise-based mutex 保护 BRIDGE 状态，防止并发竞态

### 改进 (Changed)

- **项目重组**：
  - `vscode/`：VSCode 扩展源码和构建产物
  - `chrome/`：Chrome/Edge 浏览器扩展
  - `firefox/`：Firefox 浏览器扩展
  - `build.sh`：一键打包三个平台的扩展
- **ConfigManager 类封装**：消除模块级可变状态 `let ctx`，增加 `displayName`/`pollInterval`/`warnThreshold`/`afkThreshold` 输入校验
- **fetch.ts 重试机制**：指数退避（`retryDelay * 2^attempt`），网络错误和服务端 5xx 自动重试
- **fetch.ts 请求日志**：集成 VSCode OutputChannel，记录请求/响应状态码和耗时
- **AFK Detector dispose**：符合扩展生命周期规范，销毁后调用无效果
- **WebviewView dispose**：消息监听器正确清理，防止内存泄漏
- **persistence.ts UTC 日期**：历史数据去重改用 UTC 日期，消除时区偏移问题
- **registry.ts 显式初始化**：`createRegistry()` 工厂函数，重复注册时 `console.warn` 而非 `throw`
- **GLM 帮助提示**：补充 `helpCommand` + `helpMessage`，引导用户获取 Bearer Token
- **MiMo resetsAt**：从 `currentPeriodEnd` 解析倒计时，状态栏统一显示

### 修复 (Fixed)

- **Provider 错误处理**：统一不静默吞错，增加 `console.warn` 日志
- **Kimi NaN 防御**：`parseInt` 失败时回退到 0，避免 `NaN` 污染百分比计算
- **Kimi 错误码**：`subData.code` 检查增加 `'ok'` 白名单，避免误判成功响应
- **MiMo 数据校验**：`code === 0` 后检查 `data` 存在性，空数据时抛出明确错误
- **MiMo 401 分支**：增加 `Unauthorized` 字符串检测，覆盖更多鉴权失败场景
- **GLM 日期解析**：`new Date(t).getTime()` 返回 `NaN` 时跳过该数据点
- **GLM 订阅解析**：`nextRenewTime` 无效时返回 `undefined` 而非无效日期
- **afterConfigChange 死锁**：提取 `doPullAll` 内部逻辑，避免 `enqueue` 嵌套调用

## [0.2.5] - 2026-05-27

### 变更 (Changed)

- **MiMo 配额数据源切换**：从 `monthUsage`（月度汇总）改为 `usage`（明细分类），支持分别展示套餐用量（`plan_total_token`）和补偿 Token 额度（`compensation_total_token`）
  - 当补偿积分 `limit > 0` 时自动显示额外的补偿额度卡片；无补偿时不显示

## [0.2.0] - 2026-04-30

### 新增 (Added)

- **Xiaomi MiMo Token Plan 支持**
  - 新增 `mimo` 服务包，完整实现 ServiceDescriptor 注册表模式
  - 配额用量查询：当前套餐 Token 用量、补偿 Token 额度
  - 套餐详情展示：套餐名称、有效期、过期状态、自动续费状态
  - Cookie 鉴权（浏览器登录态），支持自定义 endpoint
  - 状态栏渲染：显示配额百分比和 Token 用量详情
  - 仪表盘卡片：头部信息（名称+套餐徽章+有效期）+ 配额进度卡片
  - 帮助提示：Cookie 获取方式引导

### 变更 (Changed)

- 扩展显示名称从 "AI Usage Monitor" 正式更名为 "AI Quota Dashboard"
- 所有内部标识符统一从 `aiUsageMonitor` 重命名为 `aiQuotaDashboard`

## [0.1.0] - 2026-04-29

### 新增 (Added)

- **ServiceDescriptor 注册表架构** — 新增 AI 服务只需实现 ServiceDescriptor 接口并在 `registry.ts` 注册即可扩展
- **GLM Coding Plan (CN) 支持**
  - 配额限额查询（每5小时额度、每周额度、MCP 每月额度）
  - 模型用量详情：按日/近7天/近30天切换，SVG 平滑曲线图展示
  - 工具用量详情：网络搜索、WebRead MCP、ZRead MCP 用量统计
  - 套餐订阅信息：等级徽章、会员有效期展示
  - 懒加载机制：详情数据按需拉取，切换时间范围时缓存复用
- **Kimi Membership 支持**
  - Connect 协议 (JSON over HTTP) 数据拉取
  - JWT Token 鉴权（浏览器 Cookie 模式）
  - 频限明细、本周用量、月权益额度三个配额维度
  - 会员等级与有效期展示
- **侧边栏 Webview 仪表盘**
  - 仪表盘 / 设置 双标签切换
  - 设置页：服务列表管理（添加/编辑/删除/启用切换）+ 全局设置
  - 数据驱动渲染：无 kind 硬编码，通过 `serviceTemplates` 注册表调度
  - 刷新按钮使用内联 SVG 图标
- **状态栏实时监控**
  - 每服务独立 StatusBarItem，独立着色
  - GLM：显示非 MCP 配额百分比 + 倒计时
  - Kimi：显示所有配额百分比 + 倒计时
  - Tooltip：配额进度条 + 操作按钮（仪表盘 / 设置 / 刷新）
  - 颜色预警：green → yellow → red
- **AFK 智能检测** — 用户无操作超阈值后自动暂停轮询，节省资源
- **内存缓存** — 60 秒 TTL，避免频繁请求 API
- **历史数据持久化** — 30 天保留，globalState 存储
- **命令面板** — 刷新、打开仪表盘、打开设置、清除历史、重置数据

### 技术细节

- TypeScript strict mode
- ESLint + @typescript-eslint 代码检查
- 内联 HTML/CSS/JS Webview（VSCode 扩展限制）
- 二次贝塞尔 SVG 曲线图
- 所有配额数据本地存储，不上传云端

### 已知问题

- Webview JS 为字符串拼接，无类型检查
- `warnThreshold` 配置声明但未实际触发警告通知

[1.1.1]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v1.1.1
[1.1.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v1.1.0
[1.0.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v1.0.0
[0.9.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.9.0
[0.3.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.3.0
[0.2.5]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.5
[0.2.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.0
[0.1.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.1.0
