# Changelog

> 本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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

[0.2.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.2.0
[0.1.0]: https://github.com/Zheng404/ai_quota_dashboard_vscode/releases/tag/v0.1.0
