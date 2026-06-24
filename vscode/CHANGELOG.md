# Changelog

> 本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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

[1.1.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v1.1.0
[1.0.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v1.0.0
[0.9.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.9.0
[0.3.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.3.0
[0.2.5]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.5
[0.2.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.0
[0.1.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.1.0
