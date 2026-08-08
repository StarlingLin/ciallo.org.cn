#!/usr/bin/env python3

import os
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
        self.assertEqual(300, self.store.get_entries("runner")[0]["score"])
        self.assertEqual(900, self.store.get_entries("asteroids")[0]["score"])


if __name__ == "__main__":
    unittest.main()
