# 贡献说明

感谢你愿意改进 ciallo.org.cn。

## 开始之前

1. Bug、功能建议和游戏提案请使用对应的 Issue 表单。
2. 新游戏或大规模改造建议先建立“游戏投稿/改造提案”Issue，确认范围后再开始。
3. 投稿小游戏必须完整阅读并遵守 [小游戏 Pull Request 投稿规范](docs/CONTRIBUTING_GAMES.md)。
4. 提交素材前确认你有权公开、修改并授权本站使用；不接受来源不明的商业素材打包上传。

## 基本流程

1. Fork 本仓库，从最新 `main` 创建分支。
2. 每个 Pull Request 只处理一个小游戏或一个清晰问题。
3. 在本地运行 README 中的检查并完成桌面端测试；移动端和触屏适配为可选加分项。
4. 按 Pull Request 模板填写游戏目录、代码许可证、文件体积和测试结果。
5. 等待自动检查与人工审核；根据 Review 意见继续在原分支更新。

## 提交信息

格式：

```text
<修改类型>(<相对仓库根的文件路径>): <修改内容>
```

允许的修改类型：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。

路径应使用 `/`，并选择该提交最有代表性的具体文件；不要填写绝对路径、目录穿越路径或 Windows 反斜杠。

## 行为要求

参与讨论和 Review 时请保持友善、具体并聚焦作品本身。详见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
