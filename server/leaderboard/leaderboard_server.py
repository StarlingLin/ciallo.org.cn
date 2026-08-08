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


GAME_RULES = {
    "runner": {"name": "丛雨快跑", "maximum_score": 10000000},
    "breakout": {"name": "七海打饺", "maximum_score": 1000000},
    "asteroids": {"name": "起爆器危机", "maximum_score": 10000000},
    "snake": {"name": "柠檬蛇工厂", "maximum_score": 10000000},
}
MAX_NICKNAME_LENGTH = 16
MAX_REQUEST_BYTES = 4096
ENTRY_LIMIT = 10
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
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS leaderboard_rank_index
                ON leaderboard_entries(game_key, score DESC, achieved_at ASC, id ASC)
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
    def _rows_to_entries(rows):
        return [
            {
                "rank": index + 1,
                "nickname": row["nickname"],
                "score": row["score"],
                "achieved_at": row["achieved_at"],
            }
            for index, row in enumerate(rows)
        ]

    def get_entries(self, game_key):
        self._validate_game(game_key)
        connection = self._connect()
        try:
            rows = connection.execute(
                """
                SELECT nickname, score, achieved_at
                FROM leaderboard_entries
                WHERE game_key = ?
                ORDER BY score DESC, achieved_at ASC, id ASC
                LIMIT ?
                """,
                (game_key, ENTRY_LIMIT),
            ).fetchall()
            return self._rows_to_entries(rows)
        finally:
            connection.close()

    def submit(self, game_key, nickname_value, score_value):
        self._validate_game(game_key)
        score = self._validate_score(game_key, score_value)
        nickname, nickname_key = self.nickname_filter.validate(nickname_value)
        now = utc_now()
        connection = self._connect()
        accepted = False
        reason = "not_qualified"

        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT id, score
                FROM leaderboard_entries
                WHERE game_key = ? AND nickname_key = ?
                """,
                (game_key, nickname_key),
            ).fetchone()

            if existing is not None:
                if score > existing["score"]:
                    connection.execute(
                        """
                        UPDATE leaderboard_entries
                        SET nickname = ?, score = ?, achieved_at = ?
                        WHERE id = ?
                        """,
                        (nickname, score, now, existing["id"]),
                    )
                    accepted = True
                    reason = "improved"
                else:
                    reason = "not_improved"
            else:
                tenth = connection.execute(
                    """
                    SELECT score
                    FROM leaderboard_entries
                    WHERE game_key = ?
                    ORDER BY score DESC, achieved_at ASC, id ASC
                    LIMIT 1 OFFSET ?
                    """,
                    (game_key, ENTRY_LIMIT - 1),
                ).fetchone()
                if tenth is None or score > tenth["score"]:
                    connection.execute(
                        """
                        INSERT INTO leaderboard_entries
                            (game_key, nickname, nickname_key, score, achieved_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (game_key, nickname, nickname_key, score, now),
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
                      ORDER BY score DESC, achieved_at ASC, id ASC
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
        maximum = 10 if action == "post" else 120
        key = (action, self._client_key())
        if not self.server.rate_limiter.allow(key, maximum, 60):
            raise ValidationError("rate_limited", "请求过于频繁，请稍后再试。", 429)

    @staticmethod
    def _game_from_path(path):
        prefix = "/api/leaderboards/"
        if not path.startswith(prefix):
            return None
        game_key = unquote(path[len(prefix):]).strip("/")
        return game_key or None

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/healthz":
                self._send_json(200, {"ok": True, "games": sorted(GAME_RULES.keys())})
                return
            game_key = self._game_from_path(parsed.path)
            if game_key is None:
                raise ValidationError("not_found", "接口不存在。", 404)
            self._rate_limit("get")
            entries = self.server.store.get_entries(game_key)
            self._send_json(200, {
                "game": game_key,
                "game_name": GAME_RULES[game_key]["name"],
                "entries": entries,
            })
        except ValidationError as error:
            self._send_json(error.status, {"error": error.code, "message": error.message})
        except Exception:
            self._send_json(500, {"error": "server_error", "message": "排行榜服务暂时不可用。"})

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            game_key = self._game_from_path(parsed.path)
            if game_key is None:
                raise ValidationError("not_found", "接口不存在。", 404)
            self._rate_limit("post")

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

            result = self.server.store.submit(
                game_key,
                payload.get("nickname"),
                payload.get("score"),
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
