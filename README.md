# ciallo.org.cn

[![站点检查](https://github.com/StarlingLin/ciallo.org.cn/actions/workflows/ci.yml/badge.svg)](https://github.com/StarlingLin/ciallo.org.cn/actions/workflows/ci.yml)
[![自动部署](https://github.com/StarlingLin/ciallo.org.cn/actions/workflows/deploy.yml/badge.svg)](https://github.com/StarlingLin/ciallo.org.cn/actions/workflows/deploy.yml)

这是 [ciallo.org.cn](https://ciallo.org.cn/) 的站点仓库：一个由 Starling 与 ChatGPT 制作、以柚子社角色换皮小游戏为主的非商业 HTML 小游戏聚合站。

## 当前游戏

| 游戏 | 类型 | 目录 |
| --- | --- | --- |
| 丛雨快跑 | 横版跑酷 | `games/runner/` |
| 起爆器危机 | 太空射击 | `games/asteroids/` |
| 七海打饺 | 打砖块 | `games/breakout/` |
| 柚子蛇 | AI 竞速贪吃蛇 | `games/snake/` |

四款游戏均为本地静态资源运行；排行榜由独立的 Python 服务提供，并由 Nginx 通过同源 `/api/leaderboards/` 转发。

## 本地预览

仓库根目录启动静态服务器：

```bash
python -m http.server 8768
```

然后访问 <http://127.0.0.1:8768/>。纯静态预览时，页面和游戏可以运行，但排行榜接口需要另行启动 `server/leaderboard/` 中的本地服务。

提交前运行：

```bash
python scripts/check_site.py .
python -m unittest discover -s server/leaderboard -p "test_*.py"
```

## 参与贡献

欢迎提交原创静态小游戏、现有游戏换皮、Bug 修复和无障碍改进。

- [小游戏 Pull Request 规范](docs/CONTRIBUTING_GAMES.md)
- [通用贡献说明](CONTRIBUTING.md)
- [素材与许可证边界](docs/LEGAL_AND_ASSETS.md)
- [安全问题报告方式](SECURITY.md)

所有 Commit 信息使用以下格式：

```text
<修改类型>(<相对仓库根的文件路径>): <修改内容>
```

示例：

```text
feat(games/my-game/index.html): 添加小游戏入口
fix(assets/js/site.js): 修复移动端标签切换
docs(docs/CONTRIBUTING_GAMES.md): 补充音频压缩要求
```

## 自动检查

- Pull Request 会执行站点结构、内部资源、文件体积、外部请求、JavaScript 语法、提交信息和排行榜单元测试检查。
- `main` 分支通过检查并收到 push 后，由维护者配置的 GitHub Actions 发布站点。

## 目录

```text
.
├── .github/
├── assets/               # 主站公共样式、脚本、图标和图片
├── deploy/server/        # 自动部署的服务器端脚本
├── docs/                 # 投稿与许可说明
├── games/                # 每款游戏的独立目录
├── nginx/                # Nginx 正式/维护/预览配置
├── scripts/              # CI 检查与静态发布构建
└── server/leaderboard/   # 排行榜服务
```

## 版权与许可

本仓库包含多种来源和不同许可范围的代码、图片与音频，**不适用单一的仓库级开源许可证**。每款游戏的上游许可与新增素材说明以其目录中的 `LICENSE`、`UPSTREAM_NOTICE.md` 和 `ASSET_NOTICE.md` 为准。仓库可见不等于素材可自由复制或再分发。
