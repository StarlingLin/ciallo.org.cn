#!/usr/bin/env python3
"""Build the exact public artifact without repository or server-only files."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from check_site import PUBLIC_ENTRIES, run


def copy_entry(source: Path, output: Path, name: str) -> None:
    src = source / name
    dst = output / name
    if src.is_dir():
        shutil.copytree(src, dst, copy_function=shutil.copy2)
    else:
        shutil.copy2(src, dst)


def main() -> int:
    parser = argparse.ArgumentParser(description="构建 ciallo.org.cn 公开静态文件")
    parser.add_argument("--source", default=".")
    parser.add_argument("--output", default="_site")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    output = Path(args.output).resolve()

    if output == source or source in output.parents and output.name in PUBLIC_ENTRIES:
        raise SystemExit("输出目录不能覆盖公开源目录")

    source_errors = run(source)
    if source_errors:
        for error in source_errors:
            print(f"- {error}")
        raise SystemExit("源站点检查失败，未构建")

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for name in PUBLIC_ENTRIES:
        copy_entry(source, output, name)

    output_errors = run(output)
    if output_errors:
        for error in output_errors:
            print(f"- {error}")
        raise SystemExit("构建产物检查失败")

    print(f"公开站点已构建到 {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
