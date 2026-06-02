# 安全策略 (Security Policy)

## 安全模型

本扩展采用**纯本地架构**，所有数据处理和存储均在用户本地机器完成：

- **无云端上传**：配额数据、API Key、Cookie 等敏感信息绝不传输至任何外部服务器
- **本地 HTTP 服务器**：Cookie Bridge 仅在 `localhost` 监听，用于浏览器扩展与 VSCode 之间的本地通信
- **无遥测**：不收集用户使用数据、错误报告或分析信息
- **无第三方依赖风险**：核心功能不依赖外部云服务或 SaaS 平台

## 数据处理

### API Key 存储

- 所有 API Key、JWT Token、手动输入的 Cookie 均存储在 **VSCode Secret Storage** 中
- Secret Storage 由 VSCode 底层使用操作系统级密钥链（Keychain/Keyring）加密保护
- 扩展代码只能通过 `ExtensionContext.secrets.get()` 读取，无直接文件系统访问

### Cookie 传输（Cookie Bridge）

浏览器扩展与 VSCode 之间的 Cookie 同步采用以下安全措施：

1. **本地仅限**：HTTP 服务器绑定 `127.0.0.1`，拒绝任何外部网络连接
2. **动态 Token 认证**：每次 VSCode 启动生成随机 `authToken`，浏览器扩展必须携带正确 Token 才能推送数据
3. **敏感字段过滤**：推送前自动移除 `httpOnly`、`secure`、`expirationDate` 等浏览器元数据，仅发送必要的 `name` 和 `value`
4. **请求大小限制**：POST 请求体限制 1MB，防止 DoS 攻击
5. **请求超时**：所有 POST 请求 5 秒超时，防止挂起连接
6. **防抖机制**：Cookie 变化后 1.5 秒延迟推送，避免频繁请求

### 端口文件安全

- 端口信息文件存储在系统临时目录（`os.tmpdir()`）
- 文件名包含 VSCode 进程 PID 后缀，防止多实例冲突
- 文件权限遵循操作系统默认临时文件策略

## 已知限制

### `/health` 端点暴露 authToken

Cookie Bridge 的 `/health` 端点会返回当前 `authToken`，这是**预期内的本地调试设计**：

- **影响范围**：仅本地可访问（`127.0.0.1`）
- **用途**：浏览器扩展启动时验证 VSCode 连接状态
- **风险**：本地其他进程可能读取此 Token，但无法通过网络利用
- **缓解**：`authToken` 每次 VSCode 重启重新生成，生命周期仅限于当前会话

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
| API Key / Token | VSCode Secret Storage | 访问 AI 服务 API |
| Cookie | VSCode Secret Storage + 内存缓存 | Kimi/MiMo 服务鉴权 |
| 配额数据 | VSCode globalState (本地 JSON 文件) | 仪表盘展示和历史记录 |
| 历史用量 | VSCode globalState (本地 JSON 文件) | 趋势分析和图表展示 |
| 配置设置 | VSCode globalState (本地 JSON 文件) | 用户偏好和刷新间隔 |

### 数据共享

- **不与第三方共享**：不向任何外部服务、服务器或个人传输数据
- **不上传云端**：所有数据保留在用户本地设备
- **无分析遥测**：不发送使用统计或崩溃报告

### 数据保留

- **历史数据**：最多保留 30 天，自动清理过期条目
- **配置数据**：保留至用户主动删除或卸载扩展
- **Cookie**：浏览器扩展同步的 Cookie 与 VSCode 会话生命周期一致，重启后重新获取

### 用户权利

用户始终拥有以下权利：
- **查看**：所有本地存储的数据均可通过 VSCode 设置面板查看
- **删除**：使用命令 `AI Quota Dashboard: Reset Data` 清除所有配置、Key 和历史记录
- **导出**：历史数据存储在标准 VSCode globalState 位置，可手动备份

---

最后更新：2026-06-02
