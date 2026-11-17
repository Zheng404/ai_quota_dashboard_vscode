# 安全策略（Security Policy）

## 安全模型

AI Quota Dashboard 2.0.0 是仅 VSCode 的本地配额查看器：

- 用户手动添加 GLM/Kimi 服务并提供 API Key。
- 扩展在 Extension Host 内读取对应 Key，向 GLM/Kimi 官方 API 查询配额。
- 服务配置、Secret 和历史保存在本机 VSCode 存储中。
- 不包含遥测、广告、崩溃上报或项目开发者服务器。
- 不在本机开启 HTTP 监听，也不需要其他组件提供数据。

「本地存储」不等于「没有网络请求」：查询配额必须把认证信息发送给相应 AI 服务。除这些用户配置服务的官方 API 请求外，扩展不会把 Key、配置或历史发送给项目开发者或分析服务。

## 凭证与配置存储

| 数据 | 存储位置 | 说明 |
|------|----------|------|
| GLM/Kimi API Key | VSCode Secret Storage：`apiKeys.{serviceId}` | 每个服务实例独立存储 |
| 服务列表 | `globalState`：`services` | id、kind、displayName、可选 endpoint，不含 Key |
| 历史用量 | `globalState`：`aiQuotaDashboard.history` | 最多保留 30 天 |
| 刷新/预警/AFK 设置 | VSCode Settings：`aiQuotaDashboard.*` | 唯一可信源 |
| 迁移标记 | `globalState` | `configMigrated`、`v2CleanupDone` |

Secret Storage 由 VSCode 管理，并在平台支持时使用操作系统密钥链等安全存储能力。**明文 Secret 只在 Extension Host 内读取，并用于构造对应 Provider 的 API 请求**；不会写入 `services`、源码、VSCode Settings，也不会作为设置数据发送到 Webview。

服务保存使用 `saveServiceAtomic()`：先按需写 Secret，再按需写 profile。删除服务会删除对应 Secret；「重置所有数据」删除当前 profiles 的 Secret 和全部扩展 `globalState`，但不会清除 VSCode Settings 中的三项全局设置。

### Key 掩码不是加密

设置页的 `API_KEY_MASK = '••••••••'` 只是「当前存在 Secret」的显示标记，**不是密文、哈希、真实 Key 的一部分，也不能用于认证或还原凭证**。Webview 收到的 `settings.keys[id]` 只有掩码或空字符串，明文 Key 不再通过 `updateData` 发送。

保存语义必须保持为三态：

| 输入 | 结果 |
|------|------|
| 保持掩码、字段缺失或非 string | 映射为 `undefined`，保留原 Secret；掩码本身绝不写入 Secret Storage |
| 明确清空为空字符串 | 删除原 Secret，卡片进入独立未配置态 |
| 输入其他新字符串 | 替换原 Secret |

endpoint 也采用 `undefined` 保留、空串删除、新值更新的三态。只有实际渲染 endpoint 控件时才提交该字段；GLM 当前未渲染此控件，因此保存名称或 Key 不会意外清除已有 endpoint。

## 网络边界

内置请求地址：

| 服务 | 官方 origin 与路径 | 认证 |
|------|--------------------|------|
| GLM | 默认 `https://open.bigmodel.cn` 下的配额、订阅、模型与工具用量端点 | `Authorization: Bearer {API_KEY}` |
| Kimi CN（默认） | `https://api.kimi.com/coding/v1/usages` 与 `/coding/v1/me` | `Authorization: Bearer {API_KEY}` |
| Kimi Global | `https://api.kimi.ai/coding/v1/usages` 与 `/coding/v1/me` | `Authorization: Bearer {API_KEY}` |

Kimi 非 `sk-` 凭证会在请求前被拒绝。Kimi endpoint 可在设置中编辑，但 Provider 只接受上述两个官方 HTTPS origin；路径会被忽略，HTTP、非官方主机、非默认端口、形似官方的其它主机或非法 URL 都回退 CN 默认站。usages 与 me 始终使用同一归一化 origin，不能分别指向不同站点。

GLM 支持既有 endpoint 覆盖；如通过配置自定义该值，应使用可信主机，因为 Key 会随请求发送到该主机。Kimi 的 origin 白名单不适用于 GLM。

HTTP 客户端提供：

- 请求总时长上限（默认 30 秒；当前 Provider 请求使用 15 秒）。
- 响应体默认 5MB 上限，超出即中止。
- HTTP 错误与 JSON 解析错误显式抛出。
- 可选网络/5xx 重试能力；默认重试次数为 0。
- 对 2xx 响应强制校验 JSON Content-Type：缺失或不含 `json`（HTML、纯文本等）时抛出安全错误；兼容 charset 与 `+json`。

缺少/非 JSON Content-Type 的错误不包含响应正文，也不设置 `responseBody`；非法 JSON 的错误 message 同样不包含正文，避免把登录页、网关错误或潜在敏感内容带入 UI 和日志。

凭证不会拼入 URL 查询参数。排查问题时仍应避免在 Issue、日志或截图中公开真实 Key、请求头或完整 API 响应。

## 日志安全

`QuotaProvider.fetch()` 与 `DetailProvider.fetchDetail()` 接受可选 `ProviderLogger`，Extension 统一传入 OutputChannel logger。GLM 订阅、模型、工具用量和 Kimi `/me` 的可降级失败会记录安全错误 message，便于发现静默降级。

Provider 降级日志不得包含完整 API Key、Authorization 或其他请求头、`responseBody`、Kimi `/me` 原始响应或个人资料。Kimi 只从 `/me` 提取可选 `user_level_name` 作为会员徽章，失败原因进入安全日志；不会把原始个人资料响应转发到 Webview。新增 Provider、错误处理或日志时不得扩大这一边界。

## Webview 与渲染安全

- Webview 业务 JS 从 `src/webview/` 构建为 `media/dashboard.js`，通过 `asWebviewUri` 外链加载。
- CSP 为 `default-src 'none'`；`script-src` 仅允许随机 nonce 与当前 Webview 的 `cspSource`，不允许 `unsafe-inline` 脚本。
- 唯一内联脚本是 nonce 保护的设置元数据注入 `window.__AQD_SETTINGS_META__`。
- 卡片和设置页的动态 HTML 文本必须经过 `escapeHtml()`。
- 状态栏 Markdown tooltip 的动态文本必须经过 `escapeMarkdown()`，避免结构破坏或 HTML 注入。
- 新增服务、错误文本或 API 字段时，不得绕过上述转义边界。
- 设置页掩码仅用于交互显示，不构成对已经控制 Extension Host 或本机 VSCode 存储的攻击者的安全边界。

## 缺 Key、stale 数据与历史边界

未配置 Key 时，Extension 生成独立 `noKey` 数据，不发起 API 请求、不进入缓存，并显示「尚未配置 API Key」配置卡，而不是持续加载或伪造空配额。

若刷新失败且已有正常快照，`staleError` 会保留旧 slots、GLM 详情、历史与原 `updatedAt`，UI 明确显示「数据过期 · 刷新失败」。这类数据仍可用于阅读上次结果，但**不是新鲜样本**：

- 不把 stale 快照写成新的历史点，也不更新其旧时间戳。
- 不用 stale 快照触发新的配额预警。
- stale 错误使用 300 秒错误缓存 TTL；成功刷新后清除 `staleError`。
- `noKey`、主 `err` 与 `staleError` 都由 `isFreshServiceData()` 排除；`saveHistory()` 内部和调用方过滤点都执行该边界。

已有历史在保留期内不会因一次刷新失败而伪造新点或凭空增加用量；这与「清除历史」是不同操作。

## 升级与数据清理

2.0.0 首次激活时，在读取 profiles 和启动轮询前执行 `runV2CleanupMigration()`：

- 保留手动 GLM/Kimi 的 profile、Secret 和历史。
- 删除旧 Data Bridge、MiMo 和 bridge-fed GLM/Kimi 的 profile、对应 Secret 与历史。
- 清理孤儿历史及旧 Bridge 状态、旧迁移标记。
- 清理完成后才写 `aiQuotaDashboard.v2CleanupDone`；中途失败可在下次激活幂等重试。

对于缺少来源标记的早期 GLM/Kimi 数据，迁移采取保守保留策略，避免误删用户手动配置。迁移不会把任何待清理数据发送到外部。

## 隐私摘要

### 数据使用

| 场景 | 数据流向 |
|------|----------|
| 查询 GLM 配额 | API Key → GLM API；响应解析 → 内存、Webview/状态栏，必要历史 → `globalState` |
| 查询 Kimi 配额与等级 | Code API Key → 同一官方 origin 的 usages/me；配额及可选等级 → 内存、Webview/状态栏，必要历史 → `globalState` |
| 自动轮询 | 与手动刷新相同；AFK 时跳过 |
| 历史展示 | 本地 `globalState` → Webview；stale/noKey 不产生新点 |
| 设置编辑 | Secret 仅在 Extension 内读取；Webview 只接收 mask/空串、profile 与 Settings，保存后按三态写回本地存储 |

Kimi `/me` 请求失败或等级为空时显示「会员等级暂不可用，配额不受影响」，不影响 usages。月度槽只解析接口实际返回的有效可选字段，缺失时不生成月度数据；解析 fixture 不构成对线上账号字段的保证。

### 数据保留与删除

- 历史最多保留 30 天，超期自动清理。
- 配置和 Key 保留至用户删除服务、清除 Key、重置数据或由 VSCode 清理扩展存储。
- `清除历史数据` 只删除历史。
- `重置所有数据` 删除服务、Key、历史和扩展 `globalState`；VSCode Settings 中的刷新、预警、AFK 值需在 VSCode 设置中另行恢复或修改。

### 不执行的处理

- 不收集使用统计或行为画像。
- 不向项目开发者上传配额、Key、配置或历史。
- 不集成第三方分析或广告 SDK。
- 不调用其他本地服务来中转凭证或配额。

## 报告安全问题

请优先使用仓库的 Private Security Vulnerability Report（如已启用）；也可通过 GitHub 个人主页提供的联系方式私下报告。

报告建议包含：

- 漏洞描述、影响范围与受影响版本。
- 最小复现步骤。
- 可能的修复方向。

**不要在公开 Issue 或报告中附带真实 API Key、完整响应中的敏感信息或可复用凭证。**

---

最后更新：2026-11-17
