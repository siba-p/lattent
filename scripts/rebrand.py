"""Rename the product across the site in one step: name in every page, script and doc,
the logo mark in the header and Studio, and the favicon.

    python3 scripts/rebrand.py --name Facetry --mark assets/brand/candidates/facetry.svg [--root DIR]

Internal identifiers (localStorage keys, project-file ids, the /benchfit/ URL path) are left
alone so existing users keep their work; the URL changes only when the repository is renamed.
"""
import argparse
import os
import re

ap = argparse.ArgumentParser()
ap.add_argument("--name", required=True)
ap.add_argument("--mark", required=True)
ap.add_argument("--old", default="Benchfit")
ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
a = ap.parse_args()

SKIP_DIRS = {".git", "node_modules", "img", "models", "candidates"}
TEXT = (".html", ".js", ".css", ".md", ".py", ".sh", ".toml", ".sql", ".ts", ".mjs", ".json", ".svg")
mark = open(os.path.join(a.root, a.mark) if not os.path.isabs(a.mark) else a.mark).read().strip()
inline = mark.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">', '<svg viewBox="0 0 64 64" aria-hidden="true">', 1)
old_logo = re.compile(r'<svg viewBox="0 0 64 64" aria-hidden="true">(<defs>.*?</defs>)?<rect width="64" height="64" rx="15".*?</svg>', re.S)

changed = 0
for d, dirs, files in os.walk(a.root):
    dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
    for f in files:
        if not f.endswith(TEXT) or f in ("package-lock.json", "parity.json", "rebrand.py"):
            continue
        p = os.path.join(d, f)
        s = open(p, encoding="utf-8").read()
        t = s.replace(a.old, a.name).replace(a.old.upper(), a.name.upper())
        t = old_logo.sub(inline, t)
        if t != s:
            open(p, "w", encoding="utf-8").write(t)
            changed += 1
open(os.path.join(a.root, "favicon.svg"), "w").write(mark + "\n")
print(f"{a.old} → {a.name}: {changed} files updated, favicon replaced")
