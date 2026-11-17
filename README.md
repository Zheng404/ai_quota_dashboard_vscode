# AI Quota Dashboard

> 仅面向 VSCode 的 AI Coding Plan 配额用量仪表盘。通过手动配置的 API Key，追踪 GLM Coding Plan (CN) 与 Kimi Membership 的配额消耗。

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=Zheng404.ai-quota-dashboard">
    <img src="https://img.shields.io/visual-studio-marketplace/v/Zheng404.ai-quota-dashboard?label=VSCode%20Marketplace&color=blue&style=flat-square" alt="VSCode Marketplace">
  </a>
  <a href="https://open-vsx.org/extension/Zheng404/ai-quota-dashboard">
    <img src="https://img.shields.io/open-vsx/v/Zheng404/ai-quota-dashboard?label=Open%20VSX&color=purple&style=flat-square" alt="Open VSX">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT">
  </a>
</p>

## 功能

| 能力 | 说明 |
|------|------|
| GLM Coding Plan (CN) | 配额进度、套餐信息、模型/工具用量、当日/近 7 天/近 30 天 SVG 趋势图 |
| Kimi Membership | 会员等级徽章、5 小时频率限制、本周用量，以及接口实际返回时的月度总额和 Coding 用量 |
| 状态栏与仪表盘 | 状态栏显示配额和重置倒计时；侧边栏 Webview 提供服务管理与详情 |
| 无缝刷新与错误保留 | 刷新期间保留旧卡片；缺少 Key 显示独立配置态，刷新失败时保留上次正常数据并明确标记过期 |
| 安全配置与诊断 | 设置页仅回显 Key 掩码；Kimi 可编辑官方 CN/Global endpoint；全局设置提供字段级校验反馈 |
| 配额预警 | 任一新鲜槽位达到阈值时显示 VSCode 警告，30 分钟冷却；缺 Key 或过期数据不触发预警 |
| AFK 检测 | 长时间无编辑器活动后跳过自动轮询，恢复活动后继续 |
| 本地历史 | 历史用量保存在 `globalState`，最多保留 30 天 |
| 可扩展服务层 | 通过 `ServiceDescriptor` 注册表组织 Provider、状态栏、样式和设置元数据 |

2.0.0 起项目只交付 VSCode 扩展，认证方式只有手动 API Key。旧版浏览器插件、Data Bridge 和 MiMo 支持已移除，升级清理行为见下文与 [CHANGELOG](vscode/CHANGELOG.md)。

## 安装

### 应用市场

- VSCode / VSCode Insiders：在扩展面板搜索 **AI Quota Dashboard**，或访问 [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=Zheng404.ai-quota-dashboard)。
- 使用 Open VSX 的编辑器：访问 [Open VSX](https://open-vsx.org/extension/Zheng404/ai-quota-dashboard)。

### VSIX

从 [GitHub Releases](https://github.com/Zheng404/ai_quota_dashboard_vscode/releases) 下载 `.vsix`。以下以 2.0.0 为例，在下载目录执行，或替换为实际文件路径：

```bash
code --install-extension ai-quota-dashboard-2.0.0.vsix
```

也可以在 VSCode 扩展面板选择「从 VSIX 安装」。

## 快速开始

1. 安装扩展并打开活动栏中的「AI 配额」。
2. 切换到「服务」标签，点击「添加服务」。
3. 选择 GLM 或 Kimi，填写显示名称和 API Key，然后保存。Kimi 还可在「API 地址」中选择官方国内站或国际站 origin。
4. 返回「仪表盘」查看配额。尚未配置 Key 的服务会显示「去配置」，不会持续显示加载动画。

| 服务 | 凭证 | 获取位置 |
|------|------|----------|
| GLM Coding Plan (CN) | API Key，作为 Bearer Token 使用 | [GLM 开放平台 API Key](https://open.bigmodel.cn/usercenter/apikey) |
| Kimi Membership | `sk-` 开头的 Kimi Code API Key | [Kimi Code 控制台](https://www.kimi.com/code/) |

Kimi 仅接受 Code API Key。网页 Cookie、网页 JWT 等非 `sk-` 凭证不会被用于发起请求。

API Key 保存在 VSCode Secret Storage，且只在 Extension Host 内读取和用于官方 API 请求；服务列表保存在 `globalState`。设置页只收到 `API_KEY_MASK` 掩码，不接收明文 Key：保持掩码不变会保留原 Key，清空后保存会删除 Key，输入新值会替换 Key。掩码只是显示标记，不是加密后的凭证，也不会写回 Secret Storage。

为查询配额，扩展会携带 Key 向对应服务的官方 API 发起请求，不会把凭证发送给项目开发者或遥测服务。Provider 的降级日志只记录安全错误消息，不记录 Key、Authorization、`responseBody` 或 Kimi 个人资料。

## 使用

### 命令面板

| 命令 | 功能 |
|------|------|
| `刷新配额数据` | 清空缓存并重新拉取全部服务 |
| `打开配额面板` | 聚焦侧边栏仪表盘 |
| `打开设置面板` | 聚焦面板并切换到服务设置 |
| `清除历史数据` | 清除历史用量，保留服务和 API Key |
| `重置所有数据` | 删除服务、API Key、`globalState` 中的历史与状态；不会重置 VSCode Settings 中的三项全局设置 |

### 全局设置

可在扩展「设置」标签或 VSCode Settings 中修改。VSCode Settings 是唯一可信源。设置页会校验空值、有限数字、范围和步长，并在对应字段下显示错误；Extension 在写入前再次完整验证三项，全部通过后才保存，再通过 `saveGlobalResult` 返回成功或字段级失败结果，不会把空值静默替换为默认值。

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `aiQuotaDashboard.refreshInterval` | `60` 秒 | 自动刷新间隔；`0` 禁用 |
| `aiQuotaDashboard.warnThreshold` | `0.8` | 配额使用率达到或超过阈值时预警（默认 80%）；`0` 或 `1` 不触发阈值通知 |
| `aiQuotaDashboard.afkThreshold` | `3600` 秒 | 无活动超过该时长后跳过自动刷新；`0` 禁用 AFK 检测 |

### GLM 展示

- 每 5 小时、每周及 MCP 每月等接口返回的配额槽。
- 套餐等级与可用的续费时间。
- 模型用量和工具用量两个详情标签，均支持当日、近 7 天、近 30 天。
- 首次拉取当日详情，其他范围通过 `requestDetailRange` 懒加载；全局刷新时保留已缓存的其他范围及其 `detailStates`。
- 同一服务与范围的并发请求会按 `serviceId:range` 去重。空响应、模型与工具用量同时缺失或请求失败会进入可重试错误态，不会清空其他范围；完成时基于最新服务快照合并，避免覆盖并发刷新的配额或过期状态。
- 模型/工具主标签与时间范围子标签共享详情面板，面板通过复合 `aria-labelledby` 同时关联当前两级标签，并提供加载状态、错误提示和重试按钮。

### Kimi 展示与响应兼容

Kimi Provider 使用同一 API Key 并行请求 `GET /coding/v1/usages` 与 `GET /coding/v1/me`，两个请求始终共用同一官方 HTTPS origin。设置中的 endpoint 可编辑为 `https://api.kimi.com`（CN，默认）或 `https://api.kimi.ai`（Global）；路径会被忽略，非官方 origin、非 HTTPS、非默认端口或非法 URL 均回退到 CN 默认站，不会把 Key 发往自定义第三方主机。

`/me` 返回的 `user_level_name` 用于头部「会员 · 等级」徽章；会员请求失败或字段为空时显示「会员等级暂不可用，配额不受影响」，不影响配额展示，降级原因只写入安全日志。用量响应同时兼容两类结构：

- 旧字段：`usage` 与 `limits[]`。支持 `usedPercent`、`used`/`limit`、`resetAt`/`resetTime`，也兼容 `limits[]` 中的 `window`/`detail` 嵌套结构。5 小时窗口优先精确匹配 300 分钟，缺失时取可换算的最短窗口。
- 新字段：`usages.limit_5h`、`limit_7d`、`limit_month_total`、`limit_month_code`。`used_ratio` 是 0–1 比例，接受有限数字或数字字符串；`reset_time` 用于重置时间。

旧 `limits[]` 是 5 小时槽的主选，旧 `usage` 是本周槽的主选；对应旧窗口不可用时才回退到新比例池。可用槽位按 5 小时、本周、本月总额、本月 Coding 的顺序展示。

**月度字段是可选的。** 只有接口返回有效 `limit_month_total` 或 `limit_month_code` 时才显示相应槽位；字段缺失或非法时直接省略，不显示伪造的 0%。并非所有账号都会返回月度配额。所有窗口均缺失或无效时，卡片显示响应结构错误。

## 常见问题与排障

### Kimi 提示 API Key 无效怎么办？

Kimi 仅接受 `sk-` 开头的 Kimi Code API Key，网页 Cookie、网页 JWT 等凭证不可用。请在 [Kimi Code 控制台](https://www.kimi.com/code/) 获取正确的 Key 后重新配置。

### 为什么没有显示 Kimi 月度配额？

月度槽仅在接口返回有效月度字段时显示，并非所有账号都有月度配额；字段缺失或无效时不会显示伪造的 0%。

### Kimi 会员等级暂不可用会影响配额吗？

不会。会员等级请求失败或字段为空时，仅显示「会员等级暂不可用，配额不受影响」，配额仍按用量接口结果展示。

### GLM 查询失败怎么办？

请检查 GLM API Key 是否正确、网络能否访问 GLM 官方 API，然后点击刷新重试。

### 「数据过期 · 刷新失败」是什么意思？

表示本次刷新失败，卡片仍在展示上次成功获取的数据。请检查网络和 API Key 后重试，成功刷新后会更新数据并清除过期提示。

### 未配置 Key 时如何开始？

点击未配置服务卡片上的「去配置」，填写对应服务的 API Key 并保存，即可查询配额。

## 架构概览

```text
ai_quota_dashboard_vscode/
├── vscode/
│   ├── src/
│   │   ├── extension.ts          # 激活、v2 清理、命令、轮询、预警
│   │   ├── core/                 # 类型、配置、HTTP、缓存、AFK、格式化
│   │   ├── services/
│   │   │   ├── registry.ts       # 仅注册 glm / kimi
│   │   │   ├── glm/              # Provider、详情、状态栏、样式、设置
│   │   │   └── kimi/             # Provider、状态栏、样式、设置
│   │   ├── storage/              # 30 天历史与 v2 一次性清理迁移
│   │   ├── ui/                   # 状态栏调度与渲染接口
│   │   ├── dashboard/            # Webview 宿主、消息路由与通用样式
│   │   ├── webview/              # 前端 TS；卡片为 cards/glm.ts、kimi.ts
│   │   └── commands/             # 清除历史命令
│   ├── media/dashboard.js        # esbuild 生成的 Webview IIFE
│   ├── out/extension.js          # esbuild 生成的扩展 CJS bundle
│   └── package.json              # 扩展清单与开发脚本
└── .github/workflows/            # 仅 VSCode 的 CI 与 VSIX 发布
```

扩展激活后先等待 `runV2CleanupMigration()` 完成，再读取服务并启动轮询。轮询经过 AFK 检查和串行队列，按服务读取 Secret、调用 Provider、更新状态栏和 Webview，并保存有效数据的历史。普通数据缓存 60 秒，错误及过期数据缓存 300 秒。

未配置 Key 时生成独立 `noKey` 视图结果，不发 API 请求也不进入缓存。若刷新失败且已有正常快照，则以 `staleError` 保留旧配额、详情、历史和原 `updatedAt`，同时显示「数据过期 · 刷新失败」；没有旧数据时才显示主错误卡。`noKey`、`staleError` 与主错误数据都不会写入新历史或触发配额预警，成功刷新后自动清除临时状态。

Webview 业务代码从 `src/webview/` 构建为 `media/dashboard.js`，由宿主通过 `asWebviewUri` 外链加载；卡片在 `main.ts` 中显式注册。CSP 不开放 `unsafe-inline` 脚本，设置元数据内联注入与 bundle 均使用 nonce。

详细开发约定见 [AGENTS.md](AGENTS.md) 与 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 配置与隐私

| 数据 | 位置 / Key |
|------|------------|
| 服务列表 | `globalState`：`services` |
| API Key | Secret Storage：`apiKeys.{serviceId}` |
| 历史用量 | `globalState`：`aiQuotaDashboard.history`，最多 30 天 |
| 刷新、预警、AFK 设置 | VSCode Settings：`aiQuotaDashboard.*` |
| Settings 旧值迁移标记 | `globalState`：`aiQuotaDashboard.configMigrated` |
| 2.0 清理完成标记 | `globalState`：`aiQuotaDashboard.v2CleanupDone` |

扩展不包含分析、广告或崩溃上报。网络请求只用于向 GLM/Kimi 官方 API 查询配额；本地历史与配置不会上传给项目开发者。HTTP 客户端会拒绝缺少 JSON Content-Type 或 Content-Type 非 JSON 的 2xx 响应，相关错误消息不包含响应正文。掩码边界、日志安全和过期历史边界见 [SECURITY.md](SECURITY.md)。

## 从 1.x 升级到 2.0.0

首次激活 2.0.0 时，扩展在读取服务和轮询前执行一次性、幂等清理：

- 保留手动 GLM/Kimi profile、对应 Secret 和历史，并移除遗留的 `dataSource` 字段。
- 删除旧 Data Bridge、MiMo 及 bridge-fed GLM/Kimi profile，同时删除这些 profile 的 Secret 和历史。
- 清理无对应 profile 的孤儿历史，以及旧 Bridge 状态和迁移标记。
- 最后写入 `aiQuotaDashboard.v2CleanupDone`；中途失败则下次激活重试。

无法可靠区分来源的更早期 GLM/Kimi 数据会保守保留，以免误删手动配置。不再需要的服务可在「服务」标签中移除并重新添加。

## 开发

环境：推荐 Node.js 20（与 CI 一致）、VSCode 1.80+。

```bash
cd vscode
npm ci
npm run compile   # Extension 侧 TypeScript 类型检查（noEmit）
npm run typecheck:webview  # Webview DOM 侧独立类型检查
npm run lint      # ESLint
npm test          # vitest；pretest 会先执行 compile
npm run build     # 生成 out/extension.js 与 media/dashboard.js
npm run watch     # 同时监听两个 bundle
```

完整测试清单、Webview 独立类型检查、VSIX 打包和 CI 说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。CI 只构建、测试并上传 VSCode VSIX；Release 在打包前强制执行 compile、lint、`typecheck:webview`、test、build，任一失败都会阻止 VSIX 打包与后续发布，发布资产只有 VSIX。

## 贡献与许可证

欢迎 Issue 和 Pull Request，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。代码使用 TypeScript strict mode，注释使用中文，提交遵循 Conventional Commits；修改解析、配置或迁移逻辑时应补充同目录 vitest 测试。

[MIT](LICENSE) © [Zheng404](https://github.com/Zheng404)
