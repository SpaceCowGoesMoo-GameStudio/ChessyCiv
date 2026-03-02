#!/usr/bin/env python3
"""
Compute a single SHA-256 hash of the entire CivChess project source and
write it to <project-root>/hash/index.html (served at /hash/).

Usage:
    python tools/generate-hash.py
"""

import hashlib
import os
import re
import sys

# Directories/files to skip (relative to project root)
SKIP_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    "civchess-trainer/checkpoints",  # large binary model files
    "draws-export",                  # large analysed data dumps
    "hash",                          # output directory — exclude from its own hash
}

# Extensions considered binary — skip their contents but still hash their paths
BINARY_EXTENSIONS = {
    ".pt", ".onnx",          # model files
    ".webm", ".mp4",         # video
    ".mp3", ".ogg", ".wav",  # audio
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",  # images
    ".zip", ".gz", ".tar",   # archives
}

# Extensions to include (everything else is skipped)
TEXT_EXTENSIONS = {
    ".html", ".css", ".js", ".json",
    ".py", ".md", ".txt",
    ".svg", ".xml",
}


def should_skip_dir(rel_dir: str) -> bool:
    for skip in SKIP_DIRS:
        if rel_dir == skip or rel_dir.startswith(skip + os.sep):
            return True
    return False


def collect_files(root: str) -> list[str]:
    """Return sorted list of relative file paths to hash."""
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir == ".":
            rel_dir = ""

        if should_skip_dir(rel_dir):
            dirnames.clear()
            continue

        # Prune skipped subdirs in-place so os.walk doesn't descend
        dirnames[:] = [
            d for d in dirnames
            if not should_skip_dir(os.path.join(rel_dir, d) if rel_dir else d)
        ]
        dirnames.sort()

        for filename in sorted(filenames):
            ext = os.path.splitext(filename)[1].lower()
            if ext in TEXT_EXTENSIONS or ext in BINARY_EXTENSIONS:
                rel_path = os.path.join(rel_dir, filename) if rel_dir else filename
                result.append(rel_path)

    return result


def _strip_v_param(url: str) -> str:
    """Remove ?v=... or &v=... from a URL, keeping other query params intact."""
    if "?" not in url:
        return url
    base, query = url.split("?", 1)
    kept = [p for p in query.split("&") if not p.startswith("v=")]
    return (base + "?" + "&".join(kept)) if kept else base


def _normalize_service_worker(raw: bytes) -> bytes:
    """Strip the stamped SW_VERSION value before hashing so the hash is stable
    between successive generate-hash.py runs (same pattern as index.html)."""
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"const SW_VERSION = '[^']*';", "const SW_VERSION = '';", text)
    return text.encode("utf-8")


def _normalize_index_html(raw: bytes) -> bytes:
    """Strip injected ?v= params from index.html before hashing so the hash
    is stable across successive generate-hash.py runs.

    Applies the same filter as stamp_version_in_index — only local .js/.css
    URLs are touched; external URLs (http/https//) are left unchanged.
    """
    text = raw.decode("utf-8", errors="replace")
    def remove_v(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
            return m.group(0)
        ext = os.path.splitext(url.split("?")[0])[1].lower()
        if ext not in {".js", ".css"}:
            return m.group(0)
        return f'{attr}="{_strip_v_param(url)}"'
    return re.sub(r'\b(src|href)="([^"]+)"', remove_v, text).encode("utf-8")


def compute_hash(root: str, files: list[str]) -> str:
    h = hashlib.sha256()
    for rel_path in files:
        # Include path so renames change the hash
        h.update(rel_path.encode())
        ext = os.path.splitext(rel_path)[1].lower()
        if ext in BINARY_EXTENSIONS:
            # Binary files: hash path only (content is large / not text-diffable)
            continue
        with open(os.path.join(root, rel_path), "rb") as f:
            raw = f.read()
        # Normalize files so the hash is stable between runs:
        # - index.html: strip stamped ?v= params
        # - service-worker.js: strip stamped SW_VERSION value
        if rel_path == "index.html":
            raw = _normalize_index_html(raw)
        elif rel_path == "service-worker.js":
            raw = _normalize_service_worker(raw)
        h.update(raw)
    return h.hexdigest()


def stamp_version_in_index(root: str, digest: str) -> None:
    """Rewrite local .js/.css src/href attributes in index.html with ?v=digest.

    This ensures the browser performs a cache miss for every script and
    stylesheet when the project hash changes and the page is hard-reloaded.
    External URLs (http/https//) are left untouched.
    """
    index_path = os.path.join(root, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    def replace_url(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
            return m.group(0)
        ext = os.path.splitext(url.split("?")[0])[1].lower()
        if ext not in {".js", ".css"}:
            return m.group(0)
        return f'{attr}="{_strip_v_param(url)}?v={digest}"'

    new_content = re.sub(r'\b(src|href)="([^"]+)"', replace_url, content)
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(new_content)


def stamp_version_in_service_worker(root: str, digest: str) -> None:
    """Replace SW_VERSION placeholder in service-worker.js with the digest."""
    sw_path = os.path.join(root, "service-worker.js")
    with open(sw_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r"const SW_VERSION = '[^']*';", f"const SW_VERSION = '{digest}';", content)
    with open(sw_path, "w", encoding="utf-8") as f:
        f.write(content)


def write_hash_page(root: str, digest: str) -> str:
    out_dir = os.path.join(root, "hash")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "index.html")
    content = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Project Hash</title></head>
<body>{digest}</body>
</html>
"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    return out_path


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    print("Collecting files…")
    files = collect_files(project_root)
    print(f"  {len(files)} files found")

    print("Computing SHA-256…")
    digest = compute_hash(project_root, files)
    print(f"  {digest}")

    out_path = write_hash_page(project_root, digest)
    print(f"Written → {os.path.relpath(out_path, project_root)}")

    stamp_version_in_index(project_root, digest)
    print(f"Stamped ?v={digest[:8]}… into index.html script/stylesheet URLs")

    stamp_version_in_service_worker(project_root, digest)
    print(f"Stamped SW_VERSION={digest[:8]}… into service-worker.js")


if __name__ == "__main__":
    main()
