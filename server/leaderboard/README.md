# Ciallo 排行榜服务

该服务使用 Python 标准库和 SQLite，为以下四个游戏分别保存前十名：

- `runner`：丛雨快跑；
- `breakout`：七海打饺；
- `asteroids`：起爆器危机；
- `snake`：柠檬蛇工厂。

同一昵称在同一游戏只保留最高分。排名按照分数降序排列，同分时先达到该分数的玩家在前。数据库中每个游戏最多保存十条记录。

## API

```text
GET  /api/leaderboards/{game}
POST /api/leaderboards/{game}
```

提交示例：

```json
{
    "nickname": "Starling",
    "score": 721
}
```

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
