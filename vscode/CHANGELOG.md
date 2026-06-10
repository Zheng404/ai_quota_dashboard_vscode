# Changelog

> 本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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

[0.9.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.9.0
[0.3.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.3.0
[0.2.5]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.5
[0.2.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.0
[0.1.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.1.0
