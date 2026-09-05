# Kimi 鉴权机制迁移 · 决策文档

> 状态：**已批准（三端已实施/实现中）**　|　日期：2026-09-04　|　影响面：VSCode 扩展 + 浏览器扩展（Kimi 服务全链路）

---

## 1. 背景与问题

2026 年 8~9 月，Kimi（kimi.com）更换了 web 端鉴权机制，导致本项目双端 Kimi 配额仪表盘集体失效（401 `unauthenticated`）。此前两轮基于「WAF 收紧请求头」的修复（完整 UA + r-timezone + Bearer/Cookie 双形态）**已部署但无效**——因为根因不是请求头，而是**凭证体系整体更换**。

## 2. 证据链（全部经实测或一手来源核实）

| # | 证据 | 来源 |
|---|------|------|
| E1 | 用户提供的真实 kimi-auth：HS512 JWT，iat=2026-07-16，**exp=2026-08-15（已过期 20 天）**，结构完整 | 用户实贴 + 本地解码 |
| E2 | 用该 token 调 GetSubscription/GetUsages（全要素头）：返回 `invalid user token: token signature is invalid` —— **签名无效而非"已过期"** | 浮浮酱 curl 实测 |
| E3 | 伪 JWT 探测：HS256 → `signing method HS256 is invalid`，证明服务端只收 HS512 且验签逻辑存活 | 浮浮酱 curl 实测 |
| E4 | kimi-auth 维护代码已**从网页前端 bundle 彻底移除**（30 天 JWT，永不再续期）；替代品为 localStorage `access_token`（~15 分钟）/ `refresh_token`（~90 天）令牌对 | [token-monitor PR #525](https://github.com/Javis603/token-monitor/pull/525)（2026-08-27，真机验证） |
| E5 | 用户侧佐证：Kimi 控制台 Cookie 中已无 kimi-auth 字段 | [token-monitor issue #539](https://github.com/Javis603/token-monitor/issues/539)（2026-08-28） |
| E6 | 社区集体迁移中：区分"过期桌面 JWT"与"浏览器会话"双凭证路径 | [CodexBar PR #3414](https://github.com/steipete/CodexBar/pull/3414)（2026-09-04） |
| E7 | 参考项目 `FarmerJohnLYH/kimi-usage-simplified`：完全绕开 web 凭证，改用 Kimi Code 静态 API Key | 源码解剖（0 star，仅作模式参考） |

**结论**：kimi-auth 已死，签名密钥已轮换。任何持有旧 kimi-auth 的实现（含本项目的 eyJ JWT 扫描兜底）都无法恢复。

## 3. 新鉴权机制事实

```
凭证存放：kimi.com 页面 localStorage
  ├── access_token   —— ~15 分钟有效的 JWT（业务请求直接用它做 Bearer）
  └── refresh_token  —— ~90 天有效的 JWT（续期种子）

续期端点：POST https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken
  （Connect RPC，携带 refresh_token → 返回新 access_token + 新 refresh_token）

业务端点：不变（GetSubscription / GetUsages / GetSubscriptionStats）
  仅替换 Authorization: Bearer {access_token}；Cookie 形态不再需要

关键语义：refresh_token 单消费者 + 使用即轮换
  ——谁接管刷新权，kimi.com 网页端会话在下次刷新时被登出
```

## 4. 候选架构对比

| 维度 | ① 被动镜像 | ② 接管刷新 | ③ 仅 VSCode 手动 refresh_token | ④ Code API Key 为主 |
|---|---|---|---|---|
| 踢网页下线 | ❌ 永不 | ✅ 会 | ✅ 会 | ❌ 永不 |
| 凭证维护成本 | 零（惰性直读） | 高（状态机+加密存储） | 中（90 天续期） | 一次粘贴永久有效 |
| 月度会员槽 | ✅ 有 | ✅ 有 | ✅ 有 | ❌ 无（仅 5h+每周） |
| 数据持续性 | 网页闲置 >15min 后 VSCode 侧停滞；浏览器 popup 永远新鲜 | 双端永远新鲜 | VSCode 侧新鲜；浏览器端无凭证 | 双端稳定（2/3 槽） |
| 实现复杂度 | 中 | 高 | 低 | 极低 |
| 接口性质 | 网页内部接口 | 网页内部接口 | 网页内部接口 | **官方文档接口**（`api.kimi.com/coding/v1/usages`，`sk-` key） |

## 5. 推荐方案

### 阶段 1（推荐立即实施）：被动镜像

**核心原则**：扩展**只读不写**——网页保持 refresh_token 唯一消费者，永不接管轮换，因此永不踢网页下线。

```
浏览器扩展侧：
  content script 注入 kimi.com 页面上下文
    ├─ 每次 popup/dashboard 拉取时惰性直读 localStorage.access_token（永远新鲜）
    └─ storage 事件监听：access_token 变化 → 经 Bridge 推送 VSCode
  （refresh_token 只读取、不调用 RefreshToken 端点）

VSCode 侧：
  ├─ Kimi 凭证存储兼容令牌对（Secret Storage 新增 refresh_token 字段，预留阶段 2）
  ├─ provider 用 Bridge 推送的最新 access_token 发请求
  └─ access_token 过期且网页闲置：卡片提示「数据过期，请打开一次 kimi.com」
```

**改动面**：`browser-common/manifest.json`（content_scripts 声明）+ 新 content script + `background.js`（推送链路）+ `vscode/src/services/kimi/provider.ts`（凭证读取）+ `config.ts`（Secret 字段）+ 设置页文案。

### 阶段 2（可选增强）：Code API Key 降级源

新增「Kimi Code API」凭证类型（手动粘贴 `sk-` key，走 Secret Storage），网页令牌不可用时补 5h/每周两槽，仪表盘永不断粮。月度槽缺失需 UI 明示。

### 明确不选

- **② 接管刷新 / ③ 手动 refresh_token**：单消费者会踢用户自己的网页会话，用户体验不可接受，且网页内部接口长期脆弱。
- **全量押注 ④**：丢失月度会员共享额度槽，数据不完整。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Kimi 再次更换机制（内部接口无契约保障） | 401 诊断已带服务端 reason；Code API Key 已成为 VSCode 端唯一路径（官方文档接口），天然对冲 |
| 网页闲置时 VSCode 侧停滞 | 已随 VSCode 单路径决策消解——VSCode 端不再消费网页 token（仅认长期有效的 Code API Key），无停滞场景；网页闲置仅影响浏览器端主路径，可切 Code API Key 兜底 |
| content script 读取 localStorage 需页面上下文 | 标准 `content_scripts` + `world: "MAIN"` 或 DOM 事件桥，权限仅 `kimi.com` |
| refresh_token 经 Bridge 传输 | 沿用现有回环 + authToken 机制；阶段 1 甚至可不传 refresh_token |

## 7. 决策状态

- [x] **阶段 1（被动镜像）浏览器侧已实施并实机验证通过**（2026-09-04）：content script 镜像 + relay 供值链 + 双 manifest 注册 + 编程式注入兜底（`scripting` 权限，免手动刷新页面）+ 三处自诊断日志，VSCode 端经 Bridge 推送零改动即受益（网页活跃期 VSCode 侧同步恢复）
- [x] **阶段 2 已完成，并升级为终态决策**（2026-09-04，随 1.1.1 发布）：决策从原「Code API Key 降级源」演进为「三端各就其位」——
  - **VSCode 端单路径 Code API（已落地）**：Kimi 服务仅接受 `sk-` Code API Key（`GET https://api.kimi.com/coding/v1/usages`，2 槽：5h 频限 + 本周用量）；原网页三要素（UA / `r-timezone` / `kimi-auth` Cookie）路径已从 VSCode provider 删除；非 `sk-` 凭证直接抛引导错误、不发起请求
  - **浏览器端双模式（实现中，随 1.1.1 发布随附）**：① 网页 token relay（主路径，3 槽全量，含月度权益额度）② Code API Key 手动配置（兜底，2 槽；`usedPercent` 优先、`resetAt` 秒/毫秒/ISO 兼容、5h 窗口精确匹配，字段映射与 VSCode 端一致）
  - **Cookie Bridge 维持**：GLM API Key 与 MiMo Cookie 分发不变；Kimi 网页令牌（`kimiAuthToken`）推送保留（浏览器端自用），VSCode 端仅落盘 Secret Storage、不再消费
- [x] 阶段 1 残留：VSCode 侧 access_token 停滞期的卡片提示文案优化——已随单路径决策消解（VSCode 不再消费网页 token，无停滞场景）
- [x] 用户手动模式的引导文案更新——已更新为「粘贴 Kimi Code API Key（`sk-` 开头，Kimi Code 控制台获取，长期有效）」

### 最终架构（三端形态）

| 端 | 凭证形态 | 槽位 | 数据源 |
|----|---------|------|--------|
| **VSCode 扩展** | Code API Key（`sk-`，用户手动粘贴，长期有效） | 2（频率限制明细 5h + 本周用量） | `api.kimi.com/coding/v1/usages`（官方文档接口，国际站 `api.kimi.ai`） |
| **浏览器扩展 · 主路径** | 网页 token relay（kimi.com localStorage `access_token`，content script 被动镜像，不接管刷新） | 3（5h 频限 + 本周用量 + 月度权益额度） | `www.kimi.com/apiv2` 网页内部接口（GetUsages / GetSubscription） |
| **浏览器扩展 · 兜底** | Code API Key（`sk-`，popup 手动配置，无网页会话时使用） | 2（5h 频限 + 本周用量） | 同 VSCode 端（字段映射一致） |
| **Cookie Bridge** | Kimi 网页令牌照常推送（浏览器端自用），VSCode 仅落盘 Secret Storage、不消费 | — | `POST /cookies` payload 的 `kimiAuthToken` 字段 |

**决策依据**：网页内部接口无契约保障（Kimi 已两度更换鉴权机制），VSCode 端切换到官方文档接口的 Code API Key 换取长期稳定；月度会员槽的信息损失由浏览器扩展主路径补全（网页会话在场时 3 槽全量），双端各取所长。`refresh_token` 全链路只读不写，永不踢网页下线。

## 8. 参考来源

- token-monitor PR #525（最完整开源适配实现，含 RefreshToken 状态机参考）：https://github.com/Javis603/token-monitor/pull/525
- token-monitor issue #539：https://github.com/Javis603/token-monitor/issues/539
- CodexBar PR #3414：https://github.com/steipete/CodexBar/pull/3414
- kimi-usage-simplified（Code API Key 模式参考）：https://github.com/FarmerJohnLYH/kimi-usage-simplified
- Kimi Code 会员共享额度官方说明：https://www.kimi.com/code/docs/kimi-code/membership.html
