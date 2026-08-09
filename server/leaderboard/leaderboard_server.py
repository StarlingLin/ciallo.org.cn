#!/usr/bin/env python3
"""Small same-origin leaderboard service for ciallo.org.cn.

The service intentionally uses only the Python standard library so it can run
on the existing server without installing an application framework.
"""

from __future__ import print_function

import argparse
import datetime
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import unquote, urlparse


SNAKE_SKINS = (
    ("ena", "惠凪"),
    ("anju", "杏珠"),
    ("tsukimi", "月望"),
    ("ririko", "莉莉子"),
    ("miku", "美玖"),
    ("nayuka", "那优花"),
)
SNAKE_SKIN_NAMES = dict(SNAKE_SKINS)

GAME_RULES = {
    "runner": {"name": "丛雨快跑", "maximum_score": 10000000},
    "breakout": {"name": "七海打饺", "maximum_score": 1000000},
    "asteroids": {"name": "起爆器危机", "maximum_score": 10000000},
    "snake": {"name": "柚子蛇", "maximum_score": 10000000},
}
MAX_NICKNAME_LENGTH = 16
MAX_REQUEST_BYTES = 4096
ENTRY_LIMIT = 10
MAX_SURVIVAL_SECONDS = 86400
CONTACT_PATTERN = re.compile(
    r"(?:https?://|www\.|@|(?:qq|wx|vx|微信|微\s*信)\s*[:：]?\s*\d|\d{7,})",
    re.IGNORECASE,
)
LEET_TRANSLATION = str.maketrans({
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
})


class ValidationError(Exception):
    def __init__(self, code, message, status=400):
        super(ValidationError, self).__init__(message)
        self.code = code
        self.message = message
        self.status = status


def utc_now():
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def compact_key(value):
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = normalized.translate(LEET_TRANSLATION)
    return "".join(character for character in normalized if character.isalnum())


class NicknameFilter(object):
    def __init__(self, blocked_words_path):
        self.blocked_words_path = blocked_words_path
        self.blocked_words = self._load_words()

    def _load_words(self):
        words = set()
        with open(self.blocked_words_path, "r", encoding="utf-8") as source:
            for raw_line in source:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                key = compact_key(line)
                if key:
                    words.add(key)
        if not words:
            raise RuntimeError("blocked words file is empty")
        return words

    def validate(self, value):
        if not isinstance(value, str):
            raise ValidationError("invalid_nickname", "昵称格式不正确。")

        nickname = " ".join(unicodedata.normalize("NFKC", value).strip().split())
        if not nickname:
            raise ValidationError("empty_nickname", "请填写昵称。")
        if len(nickname) > MAX_NICKNAME_LENGTH:
            raise ValidationError(
                "nickname_too_long",
                "昵称不能超过 {} 个字符。".format(MAX_NICKNAME_LENGTH),
            )
        if any(unicodedata.category(character).startswith("C") for character in nickname):
            raise ValidationError("invalid_nickname", "昵称包含不可使用的控制字符。")
        if not any(character.isalnum() for character in nickname):
            raise ValidationError("invalid_nickname", "昵称至少需要包含一个文字或数字。")
        if CONTACT_PATTERN.search(nickname):
            raise ValidationError("contact_not_allowed", "昵称中不能包含网址或联系方式。")

        nickname_key = compact_key(nickname)
        if not nickname_key:
            raise ValidationError("invalid_nickname", "昵称格式不正确。")
        for blocked_word in self.blocked_words:
            if blocked_word in nickname_key:
                raise ValidationError("blocked_nickname", "昵称包含不适合公开显示的内容。")
        return nickname, nickname_key


class LeaderboardStore(object):
    def __init__(self, database_path, nickname_filter):
        self.database_path = database_path
        self.nickname_filter = nickname_filter
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _initialize(self):
        parent = os.path.dirname(os.path.abspath(self.database_path))
        if parent and not os.path.isdir(parent):
            os.makedirs(parent)
        connection = self._connect()
        try:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS leaderboard_entries
                (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_key TEXT NOT NULL,
                    nickname TEXT NOT NULL,
                    nickname_key TEXT NOT NULL,
                    score INTEGER NOT NULL CHECK(score > 0),
                    achieved_at TEXT NOT NULL,
                    UNIQUE(game_key, nickname_key)
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(leaderboard_entries)")
            }
            if "skin_id" not in columns:
                connection.execute(
                    "ALTER TABLE leaderboard_entries ADD COLUMN skin_id TEXT"
                )
            if "survival_seconds" not in columns:
                connection.execute(
                    "ALTER TABLE leaderboard_entries ADD COLUMN survival_seconds INTEGER"
                )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS leaderboard_rank_index
                ON leaderboard_entries(game_key, score DESC, achieved_at ASC, id ASC)
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS leaderboard_rank_v2_index
                ON leaderboard_entries(
                    game_key,
                    score DESC,
                    survival_seconds DESC,
                    achieved_at ASC,
                    id ASC
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS snake_character_totals
                (
                    skin_id TEXT PRIMARY KEY,
                    total_score INTEGER NOT NULL DEFAULT 0,
                    total_survival_seconds INTEGER NOT NULL DEFAULT 0,
                    play_count INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def _validate_game(game_key):
        if game_key not in GAME_RULES:
            raise ValidationError("unknown_game", "未知的排行榜。", 404)

    @staticmethod
    def _validate_score(game_key, score):
        if isinstance(score, bool) or not isinstance(score, int):
            raise ValidationError("invalid_score", "分数必须是整数。")
        maximum = GAME_RULES[game_key]["maximum_score"]
        if score <= 0 or score > maximum:
            raise ValidationError("invalid_score", "分数超出允许范围。")
        return score

    @staticmethod
    def _validate_snake_details(
        game_key,
        skin_id,
        survival_seconds,
        required=False,
    ):
        if game_key != "snake":
            return None, None
        if not required and skin_id is None and survival_seconds is None:
            return None, None
        if not isinstance(skin_id, str) or skin_id not in SNAKE_SKIN_NAMES:
            raise ValidationError("invalid_skin", "角色皮肤不在允许范围内。")
        if (
            isinstance(survival_seconds, bool)
            or not isinstance(survival_seconds, int)
            or survival_seconds < 0
            or survival_seconds > MAX_SURVIVAL_SECONDS
        ):
            raise ValidationError("invalid_survival_time", "存活时长超出允许范围。")
        return skin_id, survival_seconds

    @staticmethod
    def _rows_to_entries(rows):
        entries = []
        for index, row in enumerate(rows):
            skin_id = row["skin_id"]
            entry = {
                "rank": index + 1,
                "nickname": row["nickname"],
                "score": row["score"],
                "achieved_at": row["achieved_at"],
            }
            if skin_id in SNAKE_SKIN_NAMES:
                entry["skin_id"] = skin_id
                entry["skin_name"] = SNAKE_SKIN_NAMES[skin_id]
            if row["survival_seconds"] is not None:
                entry["survival_seconds"] = row["survival_seconds"]
            entries.append(entry)
        return entries

    def get_entries(self, game_key):
        self._validate_game(game_key)
        connection = self._connect()
        try:
            rows = connection.execute(
                """
                SELECT nickname, score, achieved_at, skin_id, survival_seconds
                FROM leaderboard_entries
                WHERE game_key = ?
                ORDER BY
                    score DESC,
                    COALESCE(survival_seconds, -1) DESC,
                    achieved_at ASC,
                    id ASC
                LIMIT ?
                """,
                (game_key, ENTRY_LIMIT),
            ).fetchall()
            return self._rows_to_entries(rows)
        finally:
            connection.close()

    def submit(
        self,
        game_key,
        nickname_value,
        score_value,
        skin_id=None,
        survival_seconds=None,
    ):
        self._validate_game(game_key)
        score = self._validate_score(game_key, score_value)
        skin_id, survival_seconds = self._validate_snake_details(
            game_key,
            skin_id,
            survival_seconds,
        )
        nickname, nickname_key = self.nickname_filter.validate(nickname_value)
        now = utc_now()
        connection = self._connect()
        accepted = False
        reason = "not_qualified"

        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT id, score, survival_seconds
                FROM leaderboard_entries
                WHERE game_key = ? AND nickname_key = ?
                """,
                (game_key, nickname_key),
            ).fetchone()

            if existing is not None:
                improved = score > existing["score"]
                if (
                    score == existing["score"]
                    and survival_seconds is not None
                    and survival_seconds > (existing["survival_seconds"] or -1)
                ):
                    improved = True
                if improved:
                    connection.execute(
                        """
                        UPDATE leaderboard_entries
                        SET nickname = ?, score = ?, achieved_at = ?,
                            skin_id = ?, survival_seconds = ?
                        WHERE id = ?
                        """,
                        (
                            nickname,
                            score,
                            now,
                            skin_id,
                            survival_seconds,
                            existing["id"],
                        ),
                    )
                    accepted = True
                    reason = "improved"
                else:
                    reason = "not_improved"
            else:
                tenth = connection.execute(
                    """
                    SELECT score, survival_seconds
                    FROM leaderboard_entries
                    WHERE game_key = ?
                    ORDER BY
                        score DESC,
                        COALESCE(survival_seconds, -1) DESC,
                        achieved_at ASC,
                        id ASC
                    LIMIT 1 OFFSET ?
                    """,
                    (game_key, ENTRY_LIMIT - 1),
                ).fetchone()
                qualifies = tenth is None or score > tenth["score"]
                if (
                    tenth is not None
                    and score == tenth["score"]
                    and survival_seconds is not None
                    and survival_seconds > (tenth["survival_seconds"] or -1)
                ):
                    qualifies = True
                if qualifies:
                    connection.execute(
                        """
                        INSERT INTO leaderboard_entries
                            (
                                game_key,
                                nickname,
                                nickname_key,
                                score,
                                achieved_at,
                                skin_id,
                                survival_seconds
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            game_key,
                            nickname,
                            nickname_key,
                            score,
                            now,
                            skin_id,
                            survival_seconds,
                        ),
                    )
                    accepted = True
                    reason = "entered"

            connection.execute(
                """
                DELETE FROM leaderboard_entries
                WHERE game_key = ?
                  AND id NOT IN
                  (
                      SELECT id
                      FROM leaderboard_entries
                      WHERE game_key = ?
                       ORDER BY
                           score DESC,
                           COALESCE(survival_seconds, -1) DESC,
                           achieved_at ASC,
                           id ASC
                      LIMIT ?
                  )
                """,
                (game_key, game_key, ENTRY_LIMIT),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        entries = self.get_entries(game_key)
        rank = None
        for entry in entries:
            if compact_key(entry["nickname"]) == nickname_key:
                rank = entry["rank"]
                break
        return {
            "accepted": accepted,
            "reason": reason,
            "rank": rank,
            "entries": entries,
        }

    def get_character_totals(self):
        connection = self._connect()
        try:
            rows = connection.execute(
                """
                SELECT skin_id, total_score, total_survival_seconds, play_count
                FROM snake_character_totals
                """
            ).fetchall()
        finally:
            connection.close()

        stored = {row["skin_id"]: row for row in rows}
        totals = []
        for order, (skin_id, skin_name) in enumerate(SNAKE_SKINS):
            row = stored.get(skin_id)
            totals.append({
                "skin_id": skin_id,
                "skin_name": skin_name,
                "total_score": row["total_score"] if row else 0,
                "total_survival_seconds": row["total_survival_seconds"] if row else 0,
                "play_count": row["play_count"] if row else 0,
                "_order": order,
            })
        totals.sort(key=lambda item: (-item["total_score"], item["_order"]))
        for rank, item in enumerate(totals, 1):
            item["rank"] = rank
            del item["_order"]
        return totals

    def record_character_score(self, skin_id, score_value, survival_seconds):
        score = self._validate_score("snake", score_value)
        skin_id, survival_seconds = self._validate_snake_details(
            "snake",
            skin_id,
            survival_seconds,
            required=True,
        )
        now = utc_now()
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT skin_id FROM snake_character_totals WHERE skin_id = ?",
                (skin_id,),
            ).fetchone()
            if existing is None:
                connection.execute(
                    """
                    INSERT INTO snake_character_totals
                        (
                            skin_id,
                            total_score,
                            total_survival_seconds,
                            play_count,
                            updated_at
                        )
                    VALUES (?, ?, ?, 1, ?)
                    """,
                    (skin_id, score, survival_seconds, now),
                )
            else:
                connection.execute(
                    """
                    UPDATE snake_character_totals
                    SET total_score = total_score + ?,
                        total_survival_seconds = total_survival_seconds + ?,
                        play_count = play_count + 1,
                        updated_at = ?
                    WHERE skin_id = ?
                    """,
                    (score, survival_seconds, now, skin_id),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return self.get_character_totals()


class SlidingWindowRateLimiter(object):
    def __init__(self):
        self._events = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key, maximum, seconds):
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and events[0] <= now - seconds:
                events.popleft()
            if len(events) >= maximum:
                return False
            events.append(now)
            return True


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class LeaderboardHandler(BaseHTTPRequestHandler):
    server_version = "CialloLeaderboard/1.0"

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _client_key(self):
        forwarded = self.headers.get("X-Real-IP", "").strip()
        return forwarded or self.client_address[0]

    def _rate_limit(self, action):
        maximum = {"post": 10, "total": 30, "get": 120}.get(action, 10)
        key = (action, self._client_key())
        if not self.server.rate_limiter.allow(key, maximum, 60):
            raise ValidationError("rate_limited", "请求过于频繁，请稍后再试。", 429)

    @staticmethod
    def _leaderboard_route(path):
        prefix = "/api/leaderboards/"
        if not path.startswith(prefix):
            return None, None
        parts = [
            part
            for part in unquote(path[len(prefix):]).strip("/").split("/")
            if part
        ]
        if len(parts) == 1:
            return parts[0], None
        if parts == ["snake", "totals"]:
            return "snake", "totals"
        return None, None

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/healthz":
                self._send_json(200, {"ok": True, "games": sorted(GAME_RULES.keys())})
                return
            game_key, action = self._leaderboard_route(parsed.path)
            if game_key is None:
                raise ValidationError("not_found", "接口不存在。", 404)
            self._rate_limit("get")
            if action == "totals":
                self._send_json(200, {
                    "game": "snake",
                    "game_name": GAME_RULES["snake"]["name"],
                    "character_totals": self.server.store.get_character_totals(),
                })
                return
            entries = self.server.store.get_entries(game_key)
            payload = {
                "game": game_key,
                "game_name": GAME_RULES[game_key]["name"],
                "entries": entries,
            }
            if game_key == "snake":
                payload["character_totals"] = self.server.store.get_character_totals()
            self._send_json(200, payload)
        except ValidationError as error:
            self._send_json(error.status, {"error": error.code, "message": error.message})
        except Exception:
            self._send_json(500, {"error": "server_error", "message": "排行榜服务暂时不可用。"})

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            game_key, action = self._leaderboard_route(parsed.path)
            if game_key is None:
                raise ValidationError("not_found", "接口不存在。", 404)
            self._rate_limit("total" if action == "totals" else "post")

            content_type = self.headers.get("Content-Type", "").lower()
            if not content_type.startswith("application/json"):
                raise ValidationError(
                    "unsupported_media_type",
                    "提交排行榜必须使用 application/json。",
                    415,
                )

            raw_length = self.headers.get("Content-Length")
            try:
                content_length = int(raw_length or "0")
            except ValueError:
                raise ValidationError("invalid_body", "请求内容长度不正确。")
            if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
                raise ValidationError("invalid_body", "请求内容为空或过大。", 413)

            try:
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                raise ValidationError("invalid_json", "请求内容不是有效 JSON。")
            if not isinstance(payload, dict):
                raise ValidationError("invalid_json", "请求内容格式不正确。")

            if action == "totals":
                totals = self.server.store.record_character_score(
                    payload.get("skin_id"),
                    payload.get("score"),
                    payload.get("survival_seconds"),
                )
                self._send_json(200, {
                    "accepted": True,
                    "game": "snake",
                    "character_totals": totals,
                })
                return

            result = self.server.store.submit(
                game_key,
                payload.get("nickname"),
                payload.get("score"),
                payload.get("skin_id"),
                payload.get("survival_seconds"),
            )
            result["game"] = game_key
            self._send_json(200, result)
        except ValidationError as error:
            self._send_json(error.status, {"error": error.code, "message": error.message})
        except sqlite3.Error:
            self._send_json(503, {"error": "database_error", "message": "排行榜数据库暂时不可用。"})
        except Exception:
            self._send_json(500, {"error": "server_error", "message": "排行榜服务暂时不可用。"})

    def log_message(self, message_format, *args):
        print("{} {} {}".format(utc_now(), self.address_string(), message_format % args))


def parse_arguments():
    directory = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Ciallo webgame leaderboard service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18181)
    parser.add_argument("--database", default=os.path.join(directory, "leaderboard.sqlite3"))
    parser.add_argument("--blocked-words", default=os.path.join(directory, "blocked_words.txt"))
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    nickname_filter = NicknameFilter(arguments.blocked_words)
    store = LeaderboardStore(arguments.database, nickname_filter)
    server = ThreadedHTTPServer((arguments.host, arguments.port), LeaderboardHandler)
    server.store = store
    server.rate_limiter = SlidingWindowRateLimiter()
    print("Leaderboard listening on {}:{}".format(arguments.host, arguments.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
