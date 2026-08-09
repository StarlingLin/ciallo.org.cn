# Ciallo 排行榜服务

该服务使用 Python 标准库和 SQLite，为以下四个游戏分别保存前十名：

- `runner`：丛雨快跑；
- `breakout`：七海打饺；
- `asteroids`：起爆器危机；
- `snake`：柚子蛇；玩家总榜会记录角色皮肤和存活时长，另统计各角色累计总分。

同一昵称在同一游戏只保留最高分；柚子蛇同分时会保留存活更久的那一局。排名按照分数降序排列，柚子蛇以存活时长作为同分时的第一顺位，之后再按成绩达成时间排序。玩家榜每个游戏最多保存十条记录，角色累计总分表固定保留六个角色的汇总数据。

## API

```text
GET  /api/leaderboards/{game}
POST /api/leaderboards/{game}

GET  /api/leaderboards/snake/totals
POST /api/leaderboards/snake/totals
```

提交示例：

```json
{
    "nickname": "Starling",
    "score": 721
}
```

柚子蛇的玩家成绩还需包含本局角色与存活秒数：

```json
{
    "nickname": "Starling",
    "score": 721,
    "skin_id": "ena",
    "survival_seconds": 88
}
```

每局结束时，网页会独立向 `snake/totals` 提交角色、得分和存活秒数。该接口只累计六个角色的总得分、对局数和总存活时间，不保存昵称，也不受玩家成绩是否进入前十影响。

昵称会在服务端执行长度、控制字符、网址、联系方式和屏蔽词检查。`blocked_words.txt` 可继续追加词条，修改后重启服务生效。

## 本地启动

```bash
python3 leaderboard_server.py \
    --host 127.0.0.1 \
    --port 18181 \
    --database ./leaderboard.sqlite3
```

生产环境由 `ciallo-leaderboard.service` 启动，只监听 `127.0.0.1:18181`，通过 Nginx 同源代理访问。SQLite 数据库位于 `/var/lib/ciallo-leaderboard/`，不放在 Web 根目录中。

排行榜只能阻止明显超出范围的分数、刷接口和不合规昵称。游戏逻辑仍运行在浏览器中，因此不能提供竞技平台级的防作弊保证。
