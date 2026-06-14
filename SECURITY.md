# 安全策略 (Security Policy)

## 安全模型

本扩展采用**纯本地架构**，所有数据处理和存储均在用户本地机器完成：

- **无云端上传**：配额数据、API Key、Cookie 等敏感信息绝不传输至任何外部服务器
- **本地 HTTP 服务器**：Cookie Bridge 仅在 `127.0.0.1` 监听，用于浏览器扩展与 VSCode 之间的本地通信
- **无遥测**：不收集用户使用数据、错误报告或分析信息
- **无第三方依赖风险**：核心功能不依赖外部云服务或 SaaS 平台

## 数据处理

### 凭证存储

- 所有 API Key、JWT Token、Cookie 均存储在 **VSCode Secret Storage** 中
- Secret Storage 由 VSCode 底层使用操作系统级密钥链（Keychain/Keyring）加密保护
- 扩展代码只能通过 `ExtensionContext.secrets.get()` 读取，无直接文件系统访问
- 无论凭证来自用户手动输入（`dataSource='manual'`）还是浏览器扩展推送（`dataSource='bridge'`），存储方式一致

### Cookie 传输（Cookie Bridge）

浏览器扩展与 VSCode 之间的凭证同步采用以下安全措施。Kimi/MiMo 的 Cookie 和 GLM API Key 都会通过 Bridge 转发至 VSCode，并由 VSCode 自动分发到对应的 AI 服务：

1. **本地仅限**：HTTP 服务器绑定 `127.0.0.1`，拒绝任何外部网络连接
2. **动态 Token 认证**：每次 VSCode 启动生成随机 `authToken`（32 字节随机十六进制串），浏览器扩展通过 `/health` 端点获取，推送数据时必须携带 `X-Auth-Token` 头
3. **CORS 收紧**：仅放行 `chrome-extension://` 和 `moz-extension://` 来源
4. **敏感字段过滤**：推送前自动移除 `httpOnly`、`secure`、`expirationDate` 等浏览器元数据，仅发送必要的 `name` 和 `value`
5. **请求大小限制**：POST 请求体限制 1MB，防止 DoS 攻击
6. **请求超时**：所有 POST 请求 5 秒超时，防止挂起连接
7. **防抖机制**：Cookie 变化后延迟推送（默认 1.5s），避免频繁请求

### 端口文件与端口发现

- VSCode Bridge 服务器依次尝试端口 `[37100..37110]`，找到第一个可用端口绑定 `127.0.0.1`
- 端口号写入系统临时目录的 **PID 文件**：`os.tmpdir()/.ai-quota-bridge-port-{pid}`
  - 文件名包含 VSCode 进程 PID 后缀，**避免多 VSCode 实例同时运行时的端口冲突**
  - 文件权限 `0600`（仅属主可读写）
  - VSCode 进程退出时（`dispose`）尝试删除该文件
  - 该文件仅用于**本地进程管理**，浏览器扩展不读取它（Chrome 扩展无法直接访问文件系统）
- **浏览器扩展的端口发现**：通过**探测本地 HTTP 端点**实现
  - 优先尝试上次成功的端口（保存在 `chrome.storage.local` 的 `bridgeLastPort`）
  - 失败后遍历 `[37100..37110]`，对每个端口发起 `GET /health`（2 秒超时）
  - `/health` 响应中包含当前 `authToken`，供后续推送认证使用

## 已知限制

### `/health` 端点暴露 authToken

Cookie Bridge 的 `/health` 端点会返回当前 `authToken`，这是**预期内的本地设计**：

- **影响范围**：仅本地可访问（`127.0.0.1`）
- **用途**：浏览器扩展发现端口并获取认证 Token
- **风险**：本地其他进程可能读取此 Token，但无法通过网络利用
- **缓解**：`authToken` 每次 VSCode 重启重新生成，生命周期仅限于当前会话；且即便被读取，也只能向本机推送凭证，无法借此窃取已存储的凭证

### Webview XSS 防护

- 浏览器扩展的 Dashboard 和 Popup 页面已全面使用 `createElement`/`textContent` 替代 `innerHTML`
- 所有 HTML 页面均配置了 Content Security Policy (CSP)
- VSCode Webview 仪表盘的服务数据渲染仍使用内联 HTML 字符串拼接，但输入数据来自受信任的本地 API 响应

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
| API Key / Token / Cookie | VSCode Secret Storage | 访问 AI 服务 API（手动输入或 Bridge 推送） |
| 配额数据 | VSCode globalState（本地 JSON 文件） | 仪表盘展示 |
| 历史用量 | VSCode globalState（本地 JSON 文件） | 趋势分析和图表展示 |
| 配置设置 | VSCode globalState + Settings | 用户偏好（刷新间隔、预警阈值、AFK 阈值） |
| Bridge 状态 | VSCode globalState | Bridge 卡片连接状态展示 |

### 数据共享

- **不与第三方共享**：不向任何外部服务、服务器或个人传输数据
- **不上传云端**：所有数据保留在用户本地设备
- **无分析遥测**：不发送使用统计或崩溃报告

### 数据保留

- **历史数据**：最多保留 30 天，按 UTC 日期去重，超期自动清理
- **配置数据**：保留至用户主动删除或卸载扩展
- **Cookie / API Key**：保留至用户切换为手动模式或删除服务；Bridge 来源的凭证会在浏览器扩展下次推送时覆盖更新

### 用户权利

用户始终拥有以下权利：
- **查看**：所有本地存储的数据均可通过 VSCode 设置面板查看
- **删除**：使用命令 `重置所有数据` 清除所有配置、Key 和历史记录；使用 `清除历史数据` 仅清除历史
- **切换认证方式**：在 VSCode 设置页将任意 AI 服务从 `bridge` 切换为 `manual`，切换时会清空旧凭证

---

最后更新：2026-06-14
