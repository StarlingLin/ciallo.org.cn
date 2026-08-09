#!/usr/bin/env python3

import os
import sqlite3
import tempfile
import unittest

from leaderboard_server import LeaderboardStore, NicknameFilter, ValidationError


DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class LeaderboardTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database_path = os.path.join(self.temporary_directory.name, "test.sqlite3")
        nickname_filter = NicknameFilter(os.path.join(DIRECTORY, "blocked_words.txt"))
        self.store = LeaderboardStore(self.database_path, nickname_filter)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_keeps_only_top_ten_players(self):
        for index in range(12):
            result = self.store.submit("runner", "玩家{}".format(index), (index + 1) * 10)
            self.assertIn("entries", result)

        entries = self.store.get_entries("runner")
        self.assertEqual(10, len(entries))
        self.assertEqual(120, entries[0]["score"])
        self.assertEqual(30, entries[-1]["score"])
        self.assertEqual(list(range(1, 11)), [entry["rank"] for entry in entries])

    def test_same_nickname_only_keeps_personal_best(self):
        first = self.store.submit("breakout", "Starling", 100)
        lower = self.store.submit("breakout", "Ｓｔａｒｌｉｎｇ", 80)
        higher = self.store.submit("breakout", "Starling", 180)

        self.assertTrue(first["accepted"])
        self.assertFalse(lower["accepted"])
        self.assertEqual("not_improved", lower["reason"])
        self.assertTrue(higher["accepted"])
        self.assertEqual("improved", higher["reason"])
        entries = self.store.get_entries("breakout")
        self.assertEqual(1, len(entries))
        self.assertEqual(180, entries[0]["score"])

    def test_rejects_score_outside_game_range(self):
        with self.assertRaises(ValidationError):
            self.store.submit("asteroids", "玩家", 0)
        with self.assertRaises(ValidationError):
            self.store.submit("breakout", "玩家", 1000001)
        with self.assertRaises(ValidationError):
            self.store.submit("unknown", "玩家", 100)

    def test_rejects_obfuscated_blocked_words(self):
        for nickname in ("傻-逼", "F.U.C.K", "f0ck", "草 泥 马"):
            with self.subTest(nickname=nickname):
                with self.assertRaises(ValidationError) as context:
                    self.store.submit("runner", nickname, 100)
                self.assertEqual("blocked_nickname", context.exception.code)

    def test_rejects_contact_details_and_invalid_names(self):
        for nickname in ("QQ1234567", "www.example.com", "12345678", "***"):
            with self.subTest(nickname=nickname):
                with self.assertRaises(ValidationError):
                    self.store.submit("runner", nickname, 100)

    def test_games_have_independent_rankings(self):
        self.store.submit("runner", "同名玩家", 300)
        self.store.submit("asteroids", "同名玩家", 900)
        self.store.submit("snake", "同名玩家", 721, "ena", 88)
        self.assertEqual(300, self.store.get_entries("runner")[0]["score"])
        self.assertEqual(900, self.store.get_entries("asteroids")[0]["score"])
        self.assertEqual(721, self.store.get_entries("snake")[0]["score"])

    def test_snake_ranking_records_skin_and_survival_time(self):
        first = self.store.submit("snake", "Starling", 721, "ena", 65)
        longer = self.store.submit("snake", "Starling", 721, "miku", 72)

        self.assertTrue(first["accepted"])
        self.assertTrue(longer["accepted"])
        self.assertEqual("improved", longer["reason"])
        entry = self.store.get_entries("snake")[0]
        self.assertEqual("miku", entry["skin_id"])
        self.assertEqual("美玖", entry["skin_name"])
        self.assertEqual(72, entry["survival_seconds"])

    def test_snake_accepts_legacy_submission_without_details(self):
        result = self.store.submit("snake", "旧版页面玩家", 500)
        self.assertTrue(result["accepted"])
        entry = self.store.get_entries("snake")[0]
        self.assertEqual("旧版页面玩家", entry["nickname"])
        self.assertNotIn("skin_id", entry)
        self.assertNotIn("survival_seconds", entry)

    def test_snake_rejects_invalid_skin_and_survival_time(self):
        for skin_id, survival_seconds in (("unknown", 10), ("ena", -1), ("ena", 86401)):
            with self.subTest(skin_id=skin_id, survival_seconds=survival_seconds):
                with self.assertRaises(ValidationError):
                    self.store.submit(
                        "snake",
                        "玩家",
                        100,
                        skin_id,
                        survival_seconds,
                    )

    def test_snake_character_totals_accumulate_every_round(self):
        self.store.record_character_score("ena", 120, 30)
        self.store.record_character_score("ena", 80, 20)
        self.store.record_character_score("anju", 350, 45)

        totals = self.store.get_character_totals()
        self.assertEqual(6, len(totals))
        self.assertEqual("anju", totals[0]["skin_id"])
        self.assertEqual(350, totals[0]["total_score"])
        ena = next(item for item in totals if item["skin_id"] == "ena")
        self.assertEqual(200, ena["total_score"])
        self.assertEqual(50, ena["total_survival_seconds"])
        self.assertEqual(2, ena["play_count"])

    def test_existing_database_is_upgraded_without_losing_scores(self):
        legacy_path = os.path.join(self.temporary_directory.name, "legacy.sqlite3")
        connection = sqlite3.connect(legacy_path)
        try:
            connection.execute(
                """
                CREATE TABLE leaderboard_entries
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
                INSERT INTO leaderboard_entries
                    (game_key, nickname, nickname_key, score, achieved_at)
                VALUES ('snake', '旧玩家', '旧玩家', 600, '2026-08-01T00:00:00Z')
                """
            )
            connection.commit()
        finally:
            connection.close()

        nickname_filter = NicknameFilter(os.path.join(DIRECTORY, "blocked_words.txt"))
        migrated = LeaderboardStore(legacy_path, nickname_filter)
        entry = migrated.get_entries("snake")[0]
        self.assertEqual("旧玩家", entry["nickname"])
        self.assertEqual(600, entry["score"])
        self.assertNotIn("skin_id", entry)
        self.assertNotIn("survival_seconds", entry)


if __name__ == "__main__":
    unittest.main()
