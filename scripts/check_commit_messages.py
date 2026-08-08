#!/usr/bin/env python3
"""Check PR commit subjects against the repository's path-scoped format."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys


PATTERN = re.compile(
    r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)"
    r"\(([^()]+)\): (\S.*)$"
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    args = parser.parse_args()

    result = subprocess.run(
        ["git", "log", "--format=%H%x00%s", f"{args.base}..{args.head}"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    failures: list[str] = []
    for line in result.stdout.splitlines():
        commit, subject = line.split("\x00", 1)
        match = PATTERN.fullmatch(subject)
        if not match:
            failures.append(f"{commit[:12]} {subject}")
            continue

        scope = match.group(2)
        if scope.startswith(("/", "\\")) or "\\" in scope or any(part == ".." for part in scope.split("/")):
            failures.append(f"{commit[:12]} 路径范围无效：{scope}")

    if failures:
        print("提交信息检查失败：", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        print("格式：<类型>(<相对仓库根的文件路径>): <修改内容>", file=sys.stderr)
        return 1

    print("提交信息检查通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
