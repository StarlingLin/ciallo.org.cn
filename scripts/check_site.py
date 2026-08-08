#!/usr/bin/env python3
"""Validate the public site and game contribution contract using stdlib only."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


PUBLIC_ENTRIES = (
    "index.html",
    "404.html",
    "maintenance.html",
    "assets",
    "games",
)

FORBIDDEN_SUFFIXES = {
    ".7z",
    ".db",
    ".env",
    ".key",
    ".pem",
    ".psd",
    ".rar",
    ".sqlite",
    ".sqlite3",
    ".tar",
    ".wav",
    ".zip",
}

IMAGE_SUFFIXES = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
AUDIO_SUFFIXES = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".opus"}
FONT_SUFFIXES = {".otf", ".ttf", ".woff", ".woff2"}
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".sh", ".svg", ".txt", ".yml", ".yaml"}

MAX_FILE = 5 * 1024 * 1024
MAX_IMAGE = 2 * 1024 * 1024
MAX_AUDIO = 3 * 1024 * 1024
MAX_FONT = 1 * 1024 * 1024
MAX_GAME = 10 * 1024 * 1024
MAX_DATA_URI = 32 * 1024

SAFE_GAME_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
SAFE_GAME_FILE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
GAME_METADATA_FILES = {"ASSET_NOTICE.md", "LICENSE", "README.md", "README_CUSTOMIZE.md", "UPSTREAM_NOTICE.md"}
CSS_URL = re.compile(r"url\(\s*([\"']?)(.*?)\1\s*\)", re.IGNORECASE)
EXTERNAL_JS = re.compile(
    r"(?:fetch|WebSocket|EventSource)\s*\(\s*[\"'](?:https?:)?//|"
    r"\.open\s*\(\s*[\"'][A-Z]+[\"']\s*,\s*[\"'](?:https?:)?//",
    re.IGNORECASE,
)
OBFUSCATION = re.compile(r"\beval\s*\(|\bnew\s+Function\s*\(", re.IGNORECASE)
SECRET_MARKERS = (
    "-----BEGIN " + "OPENSSH PRIVATE KEY-----",
    "-----BEGIN " + "RSA PRIVATE KEY-----",
    "-----BEGIN " + "EC PRIVATE KEY-----",
)
SECRET_NAME_SUFFIXES = {".db", ".key", ".pem", ".sqlite", ".sqlite3"}
SECRET_FILE_NAMES = {".env", "id_ed25519", "id_rsa"}


class ResourceParser(HTMLParser):
    """Collect URLs that make the browser load content, not ordinary links."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.resources: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()

        if tag in {"script", "img", "iframe", "audio", "video", "source", "track", "embed"}:
            if values.get("src"):
                self.resources.append((f"{tag}[src]", values["src"]))

        if tag == "object" and values.get("data"):
            self.resources.append(("object[data]", values["data"]))

        if tag == "link" and values.get("href"):
            rel = {item.lower() for item in values.get("rel", "").split()}
            if rel & {"stylesheet", "icon", "preload", "modulepreload", "manifest"}:
                self.resources.append(("link[href]", values["href"]))

        for attribute in ("srcset",):
            if values.get(attribute):
                for candidate in values[attribute].split(","):
                    url = candidate.strip().split()[0]
                    if url:
                        self.resources.append((f"{tag}[{attribute}]", url))


def relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def iter_public_files(root: Path):
    for name in PUBLIC_ENTRIES:
        path = root / name
        if path.is_file():
            yield path
        elif path.is_dir():
            yield from (item for item in path.rglob("*") if item.is_file() or item.is_symlink())


def validate_resource(root: Path, document: Path, label: str, raw_url: str, errors: list[str]) -> None:
    value = raw_url.strip()
    if not value or value.startswith("#"):
        return

    lower = value.lower()
    if lower.startswith(("http://", "https://", "//")):
        errors.append(f"{relative(document, root)}: {label} 不得加载外部资源：{value}")
        return
    if lower.startswith("data:"):
        if len(value.encode("utf-8")) > MAX_DATA_URI:
            errors.append(f"{relative(document, root)}: 内嵌 data URI 超过 {MAX_DATA_URI // 1024} KiB")
        return
    if lower.startswith(("blob:", "javascript:", "mailto:", "tel:")):
        errors.append(f"{relative(document, root)}: {label} 使用了不允许的资源协议：{value}")
        return

    parsed = urlsplit(value)
    resource_path = unquote(parsed.path)
    if not resource_path:
        return
    if resource_path.startswith("/"):
        target = root / resource_path.lstrip("/")
    else:
        target = document.parent / resource_path

    if resource_path.endswith("/"):
        target = target / "index.html"

    try:
        target.resolve().relative_to(root.resolve())
    except ValueError:
        errors.append(f"{relative(document, root)}: 资源路径越出站点根目录：{value}")
        return

    if not target.is_file():
        errors.append(f"{relative(document, root)}: 找不到 {label} 引用的资源：{value}")


def validate_html(root: Path, path: Path, errors: list[str]) -> None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"{relative(path, root)}: HTML 不是 UTF-8")
        return

    parser = ResourceParser()
    try:
        parser.feed(text)
    except Exception as exc:  # HTMLParser is permissive; keep any exceptional parse failure visible.
        errors.append(f"{relative(path, root)}: HTML 解析失败：{exc}")
        return

    for label, url in parser.resources:
        validate_resource(root, path, label, url, errors)


def validate_css(root: Path, path: Path, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    for _, url in CSS_URL.findall(text):
        validate_resource(root, path, "CSS url()", url, errors)


def validate_text_security(root: Path, path: Path, errors: list[str]) -> None:
    if path.suffix.lower() not in TEXT_SUFFIXES:
        return
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"{relative(path, root)}: 文本文件不是 UTF-8")
        return

    for marker in SECRET_MARKERS:
        if marker in text:
            errors.append(f"{relative(path, root)}: 检测到私钥内容")

    if path.suffix.lower() in {".js", ".mjs"}:
        if EXTERNAL_JS.search(text):
            errors.append(f"{relative(path, root)}: JavaScript 包含外部网络请求")
        if OBFUSCATION.search(text):
            errors.append(f"{relative(path, root)}: JavaScript 包含 eval 或 new Function")


def validate_game_contract(root: Path, errors: list[str]) -> None:
    games_root = root / "games"
    if not games_root.is_dir():
        return

    for game in sorted(item for item in games_root.iterdir() if item.is_dir()):
        if not SAFE_GAME_ID.fullmatch(game.name):
            errors.append(f"games/{game.name}: game-id 只能使用小写字母、数字和连字符")

        for required in ("index.html", "UPSTREAM_NOTICE.md", "ASSET_NOTICE.md", "README_CUSTOMIZE.md"):
            if not (game / required).is_file():
                errors.append(f"games/{game.name}: 缺少 {required}")

        total = 0
        for path in game.rglob("*"):
            if path.is_file():
                total += path.stat().st_size
                if path.name not in GAME_METADATA_FILES and (
                    not SAFE_GAME_FILE.fullmatch(path.name) or path.name != path.name.lower()
                ):
                    errors.append(f"{relative(path, root)}: 游戏文件名须使用小写英文、数字、点、下划线或连字符")
        if total > MAX_GAME:
            errors.append(f"games/{game.name}: 总体积 {total / 1024 / 1024:.2f} MiB，超过 10 MiB")


def validate_repository_security(root: Path, errors: list[str]) -> None:
    ignored_parts = {".git", "__pycache__", "_site", "dist", "node_modules"}
    for path in root.rglob("*"):
        if not path.is_file() or any(part in ignored_parts for part in path.relative_to(root).parts):
            continue
        if path.name in SECRET_FILE_NAMES or path.suffix.lower() in SECRET_NAME_SUFFIXES:
            errors.append(f"{relative(path, root)}: 仓库中不允许提交运行数据、私钥或环境文件")
        validate_text_security(root, path, errors)


def run(root: Path) -> list[str]:
    errors: list[str] = []

    for name in PUBLIC_ENTRIES:
        if not (root / name).exists():
            errors.append(f"缺少公开站点入口：{name}")

    seen: set[Path] = set()
    for path in iter_public_files(root):
        if path in seen:
            continue
        seen.add(path)

        rel = relative(path, root)
        if path.is_symlink():
            errors.append(f"{rel}: 公开站点不允许符号链接")
            continue

        suffix = path.suffix.lower()
        size = path.stat().st_size
        if suffix in FORBIDDEN_SUFFIXES:
            errors.append(f"{rel}: 公开站点不允许 {suffix or '该'} 文件")
        if size > MAX_FILE:
            errors.append(f"{rel}: {size / 1024 / 1024:.2f} MiB，超过单文件 5 MiB")
        if suffix in IMAGE_SUFFIXES and size > MAX_IMAGE:
            errors.append(f"{rel}: 图片超过 2 MiB")
        if suffix in AUDIO_SUFFIXES and size > MAX_AUDIO:
            errors.append(f"{rel}: 音频超过 3 MiB")
        if suffix in FONT_SUFFIXES and size > MAX_FONT:
            errors.append(f"{rel}: 字体超过 1 MiB")

        validate_text_security(root, path, errors)
        if suffix == ".html":
            validate_html(root, path, errors)
        elif suffix == ".css":
            validate_css(root, path, errors)

    validate_game_contract(root, errors)
    if (root / ".github").is_dir() or (root / ".git").is_dir():
        validate_repository_security(root, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 ciallo.org.cn 静态站点")
    parser.add_argument("root", nargs="?", default=".", help="仓库或构建输出目录")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    errors = run(root)
    if errors:
        print(f"站点检查失败，共 {len(errors)} 项：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    file_count = sum(1 for _ in iter_public_files(root))
    print(f"站点检查通过：{file_count} 个公开文件，{len(list((root / 'games').iterdir()))} 个游戏目录。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
