# 安全策略 (Security Policy)

## 安全模型

本扩展采用**纯本地架构**，所有数据处理和存储均在用户本地机器完成：

- **无云端上传**：配额数据、API Key、Cookie 等敏感信息绝不传输至任何外部服务器
- **本地 HTTP 服务器**：Data Bridge 仅在 `127.0.0.1` 监听，用于浏览器扩展向 VSCode 推送配额数据的本地通信
- **无遥测**：不收集用户使用数据、错误报告或分析信息
- **无第三方依赖风险**：核心功能不依赖外部云服务或 SaaS 平台

## 数据处理

### 凭证存储

- 所有 API Key、JWT Token、Cookie 均存储在 **VSCode Secret Storage** 中
- Secret Storage 由 VSCode 底层使用操作系统级密钥链（Keychain/Keyring）加密保护
- 扩展代码只能通过 `ExtensionContext.secrets.get()` 读取，无直接文件系统访问
- 凭证仅存储于手动配置的服务（`dataSource='manual'`）；Data Bridge 架构下 bridge 数据源服务**不需要也不存储任何 Secret 凭证**（历史遗留凭证由一次性迁移 `migrateBridgeCredentials()` 清理）

### 数据传输（Data Bridge）

浏览器扩展与 VSCode 之间的配额数据同步采用以下安全措施。**Data Bridge 不再传输任何凭证**：浏览器扩展用自身凭证（Kimi 网页令牌 / MiMo Cookie / GLM API Key）在浏览器端调 API 拉取配额数据，HTTP body 仅包含配额数据（`POST /data`，payload 为 `{source, timestamp, data: [{kind, serviceData}], activeKinds, displayNames}`）。Bridge 服务器仅在用户添加了 Data Bridge 服务后启动，详见按需启停：

1. **本地仅限**：HTTP 服务器绑定 `127.0.0.1`，拒绝任何外部网络连接
2. **Host 头白名单校验**：仅放行 `127.0.0.1:<port>` / `localhost:<port>` 形态的 Host 头，拦截恶意网页将自有域名解析到本机地址后发起的 DNS rebinding 攻击
3. **双层 Token 认证**：
   - **探测密钥**（`BRIDGE_PROBE_SECRET`）：打包进扩展的固定密钥，浏览器扩展访问 `/health` 时必须在 `X-Bridge-Probe` 头携带此密钥，通过后才返回会话 authToken。该密钥是纵深防御的第一层门槛（防其它来源误连、辅助防 CSRF）；由于密钥随扩展公开发布，**不防御本地恶意进程**——任何本地进程都可以访问 `/health` 获取 authToken（详见下方「已知限制」）
   - **会话 authToken**：每次 VSCode 启动生成随机 `authToken`（32 字节随机十六进制串），浏览器扩展通过 `/health` 获取，推送数据时必须携带 `X-Auth-Token` 头
4. **CORS 收紧**：仅放行 `chrome-extension://` 和 `moz-extension://` 来源
5. **Content-Type 校验**：`/data` 端点仅接受 `application/json` 请求体（容忍 `; charset=` 后缀），非 JSON 请求返回 415；配合 CORS 预检堵住跨源 HTML 表单（`text/plain` 等表单默认编码）发起的 CSRF
6. **凭证不出浏览器**：Cookie / API Key 等凭证仅由浏览器扩展自身用于调 API，绝不进入推送 payload；bridge 数据源的 AI 服务在 VSCode 端也不需要、不存储任何 Secret 凭证（历史遗留凭证由一次性迁移 `migrateBridgeCredentials()` 清理）
7. **请求大小限制**：POST 请求体限制 1MB，防止 DoS 攻击
8. **请求超时**：所有 POST 请求 5 秒超时，防止挂起连接
9. **防抖机制**：配额数据采集后经防抖推送（默认 1.5s），避免频繁请求

### 端口文件与端口发现

- VSCode Bridge 服务器依次尝试端口 `[37100..37110]`，找到第一个可用端口绑定 `127.0.0.1`
- 端口号写入系统临时目录的 **PID 文件**：`os.tmpdir()/.ai-quota-bridge-port-{pid}`
  - 文件名包含 VSCode 进程 PID 后缀，**避免多 VSCode 实例同时运行时的端口冲突**
  - 文件权限 `0600`（仅属主可读写）
  - VSCode 进程退出时（`dispose`）尝试删除该文件
  - 该文件仅用于**本地进程管理**，浏览器扩展不读取它（Chrome 扩展无法直接访问文件系统）
- **浏览器扩展的端口发现**：通过**探测本地 HTTP 端点**实现
  - 优先尝试上次成功的端口（保存在 `chrome.storage.local` 的 `bridgeLastPort`）
  - 失败后遍历 `[37100..37110]`，对每个端口发起 `GET /health`（携带 `X-Bridge-Probe` 探测密钥，2 秒超时）
  - `/health` 校验探测密钥通过后返回当前 `authToken`，供后续推送认证使用；密钥不匹配则返回 401

## 已知限制

### Webview 设置页回显完整 API Key（接受风险）

设置页需回显已配置的 API Key 供用户编辑（`getCurrentSettings` 读取全部 Secret 下发 webview，渲染进输入框 value）。评估结论为**接受的残余风险**：webview 受 CSP 保护（`script-src` 仅限 nonce 保护的 bundle，无第三方脚本注入面），同进程代码均可经 Secret Storage API 读取凭证，webview 回显并未扩大信任边界。若未来收紧，可改为掩码回显（`sk-abc...`）+ 留空保留原值的交互。此条已知悉并记录，非待修复缺陷。

### Data Bridge 认证机制说明

Data Bridge 采用**双层 Token 认证**保护 `/health` 和 `/data` 端点。其防御目标是**恶意网页与其它浏览器扩展**（CSRF / 跨源访问 / DNS rebinding），**不防御本地恶意进程**——本地回环信任模型需要用户知悉：

- **威胁模型（Data Bridge 架构）**：推送内容为**配额数据而非凭证**（凭证不出浏览器），攻击面从「凭证泄露」降为「配额数据伪造」与「本机端口占用/探测」：
  - 即使本地恶意进程绕过双层认证向 `/data` 推送伪造数据，其后果限于**仪表盘/状态栏展示错误的配额数值**，无法窃取或滥用任何 AI 服务凭证
  - 伪造的 `history` 数据会与本地历史按日期去重合并，污染程度有限；`clearHistory` 命令可清除
- **第一层（探测密钥）**：`/health` 端点要求请求头携带打包进扩展的 `BRIDGE_PROBE_SECRET`。该密钥随扩展公开发布、可被逆向提取，任何本地进程都可以访问 `/health` 获取会话 authToken，进而伪造配额数据推送
- **第二层（会话 authToken）**：`/data` 端点要求请求头携带 `X-Auth-Token`，值为 VSCode 启动时随机生成的 32 字节 token（每次 VSCode 重启重新生成，生命周期仅限当前会话）
- **防御边界**：双层认证合并后的信任边界是「请求来自浏览器扩展生态而非任意网页」；对已能在本机访问 `127.0.0.1` 端口的本地进程不设防。若需防御本地进程，需要引入系统级隔离机制（如 per-extension 密钥协商），这超出了本扩展的设计范围

### Webview / 状态栏 XSS 防护

- 浏览器扩展的 Dashboard 和 Popup 页面已全面使用 `createElement`/`textContent` 替代 `innerHTML`
- 所有 HTML 页面均配置了 Content Security Policy (CSP)
- VSCode Webview 仪表盘的服务数据渲染使用内联 HTML 字符串拼接，但所有用户/API 文本均经过 `escapeHtml()` 转义（含单引号）
- 状态栏 tooltip（`MarkdownString`，`isTrusted` + `supportHtml`）对所有动态纯文本（服务名、错误信息、配额标签）经过 `escapeMarkdown()` 转义，防止 Markdown 结构破坏或 HTML 注入

## 报告安全问题

如果您发现安全漏洞或潜在风险，请通过以下方式报告：

1. **GitHub Issues**：创建 Private Security Vulnerability Report（如仓库支持）
2. **邮件联系**：通过 GitHub 个人主页提供的联系方式私信

报告时请包含：
- 漏洞描述和影响范围
- 复现步骤（如有）
- 建议的修复方案（如有）

## 隐私政策摘要

### 收集的数据

**本扩展不收集任何用户数据。** 所有信息均本地存储：

| 数据类型 | 存储位置 | 用途 |
|---------|---------|------|
| API Key / Token / Cookie | VSCode Secret Storage | 访问 AI 服务 API（仅手动输入的 `manual` 来源服务） |
| 配额数据 | VSCode globalState（本地 JSON 文件） | 仪表盘展示 |
| 历史用量 | VSCode globalState（本地 JSON 文件） | 趋势分析和图表展示 |
| 配置设置 | VSCode globalState + Settings | 用户偏好（刷新间隔、预警阈值、AFK 阈值） |
| Bridge 状态 | VSCode globalState | Bridge 卡片连接状态展示（connected / lastPushAt / receivedKinds / lastError） |

### 数据共享

- **不与第三方共享**：不向任何外部服务、服务器或个人传输数据（Data Bridge 推送仅发生在本机回环 `127.0.0.1`）
- **不上传云端**：所有数据保留在用户本地设备
- **无分析遥测**：不发送使用统计或崩溃报告

### 数据保留

- **历史数据**：最多保留 30 天，按本地日期去重，超期自动清理
- **配置数据**：保留至用户主动删除或卸载扩展
- **Cookie / API Key**：保留至用户切换为手动模式或删除服务；`manual` 来源凭证由用户本地保管，Data Bridge 架构下浏览器凭证不出浏览器、VSCode 端 bridge 数据源服务不存储任何凭证

### 用户权利

用户始终拥有以下权利：
- **查看**：所有本地存储的数据均可通过 VSCode 设置面板查看
- **删除**：使用命令 `重置所有数据` 清除所有配置、Key 和历史记录；使用 `清除历史数据` 仅清除历史
- **切换认证方式**：在 VSCode 服务标签页将任意 AI 服务从 `bridge` 切换为 `manual`，切换时会清空旧凭证

---

最后更新：2026-09-22
