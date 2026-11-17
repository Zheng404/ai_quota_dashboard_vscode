# 贡献指南

感谢参与 AI Quota Dashboard！欢迎提交 Issue 和 Pull Request。较大变更建议先创建 Issue 讨论目标与方案，避免重复工作。

## 环境与本地检查

环境搭建和调试说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。首次安装依赖：

```bash
cd vscode
npm ci
```

提交 PR 前，请在 `vscode/` 目录按 CI 顺序运行本地门禁：

```bash
npm run lint
npm run compile
npm run typecheck:webview
npm run build
npm test
```

## 修改约定

- 修改解析、配置或迁移逻辑时，补充同目录的 vitest 测试。
- 使用 TypeScript strict mode，注释使用中文，提交信息遵循 Conventional Commits。
- 不要手改 `out/` 或 `media/` 中的构建产物；修改源文件后重新构建。
- 行为变更应同步更新相关文档，避免文档与实现不一致。
- 完整实现与维护约定见 [AGENTS.md](AGENTS.md)。

## 报告问题

Bug 报告请包含扩展版本、VSCode 版本、操作系统平台、复现步骤，以及脱敏后的错误信息。

严禁在 Issue、PR、日志或截图中公开真实 API Key、Authorization、可复用凭证、敏感响应内容或 Kimi 个人资料。

安全问题不要提交公开 Issue，请按 [SECURITY.md](SECURITY.md) 中的现有渠道私下报告。
