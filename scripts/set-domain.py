"""Move the site from siba-p.github.io/lattent to a custom domain in one step: every page,
canonical and Open Graph URL, the sitemap, citation, sign-in redirect URLs, the backend's
allowed origins, the 404 page's absolute paths, and the CNAME file GitHub Pages needs.

    python3 scripts/set-domain.py --domain lattent.app [--dry-run]

Afterwards:
  1. At your DNS provider, point the domain at GitHub Pages (Settings → Pages → Custom domain
     shows the records) and tick "Enforce HTTPS" once the certificate is issued.
  2. Run scripts/setup-backend.sh again so Supabase accepts sign-in links for the new domain
     and the Edge Functions accept requests from it.
  3. Update the Lemon Squeezy confirmation-button links and both webhook settings if needed.

Browsers keep saved work per site, so drafts stored at the old address do not move: tell
existing users to download their projects first, or do this before launch.
"""
import argparse
import os
import re

ap = argparse.ArgumentParser()
ap.add_argument("--domain", required=True, help="bare host name, e.g. lattent.app")
ap.add_argument("--old", default="siba-p.github.io/lattent")
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
a = ap.parse_args()

domain = a.domain.strip().lower().removeprefix("https://").removeprefix("http://").strip("/")
if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", domain):
    raise SystemExit("--domain should be a bare host name such as lattent.app")
old_host, _, old_path = a.old.partition("/")
old_prefix = "/" + old_path + "/" if old_path else "/"

SKIP_DIRS = {".git", "node_modules", "img", "models", "candidates", "bench"}
TEXT = (".html", ".js", ".css", ".md", ".py", ".sh", ".toml", ".ts", ".mjs", ".cff", ".xml")
SELF = os.path.abspath(__file__)
# the bare origin (CORS defaults), but not longer URLs such as the author's home page
origin = re.compile(r"https://" + re.escape(old_host) + r"(?![\w./-])")

changed = []
for d, dirs, files in os.walk(a.root):
    dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
    for f in files:
        p = os.path.join(d, f)
        if not f.endswith(TEXT) or os.path.abspath(p) == SELF:
            continue
        s = open(p, encoding="utf-8").read()
        t = s.replace(a.old, domain)
        t = origin.sub("https://" + domain, t)
        if f == "404.html" and old_prefix != "/":
            # GitHub Pages serves 404.html at any depth, so its links are absolute
            t = t.replace('"' + old_prefix, '"/')
        if t != s:
            changed.append(os.path.relpath(p, a.root))
            if not a.dry_run:
                open(p, "w", encoding="utf-8").write(t)

if not a.dry_run:
    open(os.path.join(a.root, "CNAME"), "w").write(domain + "\n")
print(("Would update" if a.dry_run else "Updated") + f" {len(changed)} files for https://{domain}/" + ("" if a.dry_run else " and wrote CNAME"))
for c in sorted(changed):
    print("  " + c)
