#!/usr/bin/env python3
"""Capture BlueYard assets into this repository without GitHub Actions.

Run from the orb-lab checkout: python3 capture-blueyard.py
Requires only Python 3 standard library and network access.
The original blueyard-orbs.html is preserved as blueyard-orbs.remote.html.
"""
from __future__ import annotations
import json
import re
import shutil
import sys
from collections import deque
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
HTML = ROOT / "blueyard-orbs.html"
BACKUP = ROOT / "blueyard-orbs.remote.html"
BASE = "/orb-lab/"
ALLOWED = {"blueyard.com", "www.blueyard.com", "cdn.sanity.io"}
MAX_FILES = 1500
MAX_BYTES = 35 * 1024 * 1024
URL_RX = re.compile(
    r"""https?://(?:www\.)?blueyard\.com/[^\s"'<>`)]+"
    r"""|https?://cdn\.sanity\.io/[^\s"'<>`)]+"
    r"""|/(?:orb-lab/)?(?:_nuxt|countries|cdn\.sanity\.io)/[^\s"'<>`)]+"
    r"""|/(?:orb-lab/)?_payload\.json(?:\?[^\s"'<>`)] +)?""".replace("] +", "]+")
)
CSS_URL_RX = re.compile(r"""url\(\s*['"]?([^)'" ]+)""")
IMPORT_RX = re.compile(r"""(?:from\s*|import\s*\(|import\s*)['"]([^'"]+)['"]""")
FAILURES = []
queue = deque()
seen = set()

def remote_url(raw: str, parent: str = "https://blueyard.com/") -> str | None:
    raw = raw.replace("&amp;", "&").strip()
    if raw.startswith("data:") or raw.startswith("#"):
        return None
    if raw.startswith("/orb-lab/"):
        raw = raw[len("/orb-lab"):]
    if raw.startswith("/cdn.sanity.io/"):
        raw = "https:/"+raw
    url = urljoin(parent, raw)
    parts = urlsplit(url)
    if parts.hostname not in ALLOWED:
        return None
    if not (parts.path.startswith(("/_nuxt/", "/countries/", "/images/", "/_payload.json")) or parts.hostname == "cdn.sanity.io"):
        return None
    return url

def local_path(url: str) -> Path:
    parts = urlsplit(url)
    if parts.hostname == "cdn.sanity.io":
        key = "cdn.sanity.io" + parts.path
    else:
        key = parts.path.lstrip("/")
    return ROOT / key

def public_url(url: str) -> str:
    p = local_path(url).relative_to(ROOT).as_posix()
    # For CDN URLs including a query, local asset files are downloaded without query.
    return BASE + p

def enqueue(url: str | None):
    if url and url not in seen:
        seen.add(url)
        queue.append(url)

def scan(content: str, parent: str):
    for m in URL_RX.finditer(content):
        enqueue(remote_url(m.group(0), parent))
    for rx in (CSS_URL_RX, IMPORT_RX):
        for m in rx.finditer(content):
            item = m.group(1)
            if item.startswith((".", "/")):
                enqueue(remote_url(item, parent))

def replace_urls(content: str, parent: str) -> str:
    def fix(m):
        u = remote_url(m.group(0), parent)
        return public_url(u) if u is not None else m.group(0)
    return URL_RX.sub(fix, content)

def main():
    if not HTML.exists():
        sys.exit("blueyard-orbs.html not found")
    if not BACKUP.exists():
        shutil.copy2(HTML, BACKUP)
    html = BACKUP.read_text(encoding="utf-8")
    scan(html, "https://blueyard.com/")
    downloaded = 0
    while queue and len(seen) <= MAX_FILES:
        url = queue.popleft()
        dest = local_path(url)
        if dest.exists() and dest.stat().st_size > 0:
            data = dest.read_bytes()
        else:
            try:
                req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; orb-lab asset capture)"})
                with urlopen(req, timeout=25) as response:
                    length = response.headers.get("Content-Length")
                    if length and int(length) > MAX_BYTES:
                        raise ValueError("Asset too large")
                    data = response.read(MAX_BYTES + 1)
                    if len(data) > MAX_BYTES:
                        raise ValueError("Asset too large")
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                downloaded += 1
                print("OK", dest.relative_to(ROOT))
            except (HTTPError, URLError, OSError, ValueError) as exc:
                FAILURES.append({"url": url, "error": str(exc)})
                print("FAILED", url, str(exc), file=sys.stderr)
                continue
        if dest.suffix.lower() in {".js", ".css", ".json"}:
            source = data.decode("utf-8", errors="replace")
            scan(source, url)
            # Relative JS chunk paths remain relative to their sibling _nuxt folder.
            # Absolute BlueYard/CDN paths should resolve within the GitHub Pages site.
            updated = replace_urls(source, url)
            if updated != source:
                dest.write_text(updated, encoding="utf-8")
    if queue:
        FAILURES.append({"error": "File limit reached; capture incomplete"})
    html = replace_urls(html, "https://blueyard.com/")
    html = html.replace('baseURL:"https://blueyard.com/"', 'baseURL:"/orb-lab/"')
    html = html.replace('buildAssetsDir:"/_nuxt/"', 'buildAssetsDir:"/_nuxt/"')
    # The HTML itself must use the local Nuxt entrypoint and locally downloaded images.
    if FAILURES:
        (ROOT / "blueyard-capture-report.json").write_text(
            json.dumps({"downloaded": downloaded, "failures": FAILURES}, indent=2), encoding="utf-8")
        print(f"Capture incomplete: {len(FAILURES)} errors. HTML not replaced.")
        sys.exit(1)
    HTML.write_text(html, encoding="utf-8")
    report = ROOT / "blueyard-capture-report.json"
    report.write_text(json.dumps({"downloaded": downloaded, "failures": []}, indent=2), encoding="utf-8")
    print(f"Completed: {downloaded} downloaded. Commit blueyard-orbs.html and asset directories.")

if __name__ == "__main__":
    main()
