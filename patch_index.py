#!/usr/bin/env python3
"""
Patch heydate's index.html to use real Supabase accounts.

Usage:
    python3 patch_index.py index.html            # patch in place (writes index.html.bak)
    python3 patch_index.py index.html --dry-run   # show what would change, write nothing

What it changes (4 required edits + 1 cosmetic):
    1. Removes the hardcoded client-side password gate.
    2. Loads heydate-auth.js in its place.
    3. Stops reading app state from localStorage (the account supplies it).
    4. Adds HD.hydrate() / HD.snapshot() hooks so heydate-auth.js can load
       and save your data.
    5. Updates the footer note (cosmetic; skipped if not found).
"""

import re
import sys
import shutil
from pathlib import Path

AUTH_TAGS = """<!-- ===== heydate accounts (Supabase) =====
     Sign-up / sign-in, profile, and per-user cloud storage.
     Credentials live at the top of heydate-auth.js — see SETUP.md. -->
<script src="heydate-auth.js"></script>
<!-- ===== end heydate accounts ===== -->"""

BRIDGE = """/* ---------------- Account bridge (heydate-auth.js) ----------------
   heydate-auth.js calls HD.hydrate() once you're signed in, and
   HD.snapshot() whenever something changes so it can sync to Supabase. */
window.HD = window.HD || {};
HD.hydrate = function(s){
  s = s || {};
  people         = Array.isArray(s.people) ? s.people : [];
  dismissed      = s.dismissed  || {};
  purchases      = s.purchases  || {};
  dismissedDeals = s.deals_seen || {};
  render();
};
HD.snapshot = function(){
  return {people: people, dismissed: dismissed, purchases: purchases, deals_seen: dismissedDeals};
};
HD.seedDemo = function(){ people = seed(); save(); render(); };
HD.ready = true;
document.dispatchEvent(new Event('hd-app-ready'));

render();"""

# (label, pattern, replacement, required)
EDITS = [
    (
        "remove hardcoded password gate + load heydate-auth.js",
        re.compile(
            r"<!--\s*=+\s*heydate password gate.*?<!--\s*=+\s*end password gate\s*=+\s*-->",
            re.DOTALL,
        ),
        AUTH_TAGS,
        True,
    ),
    (
        "stop reading people/dismissed from localStorage",
        re.compile(
            r"try\s*\{\s*people\s*=\s*JSON\.parse\(localStorage\.getItem\('heydate_people'\)\s*\|\|\s*'null'\)\s*\|\|\s*seed\(\);"
            r"\s*dismissed\s*=\s*JSON\.parse\(localStorage\.getItem\('heydate_dismissed'\)\s*\|\|\s*'\{\}'\);"
            r"\s*\}\s*catch\s*\(e\)\s*\{\s*people\s*=\s*seed\(\);\s*\}",
            re.DOTALL,
        ),
        "/* people + dismissed are loaded from your account by HD.hydrate() below. */",
        True,
    ),
    (
        "stop reading purchases from localStorage",
        re.compile(
            r"try\s*\{\s*purchases\s*=\s*JSON\.parse\(localStorage\.getItem\('heydate_purchases'\)\s*\|\|\s*'\{\}'\);\s*\}\s*catch\s*\(e\)\s*\{\s*\}",
            re.DOTALL,
        ),
        "/* purchases are loaded from your account by HD.hydrate() below. */",
        True,
    ),
    (
        "stop reading deal history from localStorage",
        re.compile(
            r"try\s*\{\s*dismissedDeals\s*=\s*JSON\.parse\(localStorage\.getItem\('heydate_deals_seen'\)\s*\|\|\s*'\{\}'\);\s*\}\s*catch\s*\(e\)\s*\{\s*\}",
            re.DOTALL,
        ),
        "/* deal history is loaded from your account by HD.hydrate() below. */",
        True,
    ),
    (
        "add HD.hydrate()/HD.snapshot() bridge before </script>",
        re.compile(r"render\(\);(\s*)</script>"),
        lambda m: BRIDGE + m.group(1) + "</script>",
        True,
    ),
    (
        "update footer note",
        re.compile(r"heydate prototype · data is saved in this browser"),
        "heydate · your dates are saved to your account",
        False,
    ),
]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry = "--dry-run" in sys.argv or "-n" in sys.argv
    if not args:
        print(__doc__)
        return 1

    path = Path(args[0])
    if not path.is_file():
        print(f"error: {path} not found")
        return 1

    html = original = path.read_text(encoding="utf-8")

    if "heydate-auth.js" in html:
        print("Looks like index.html is already patched (found heydate-auth.js). Nothing to do.")
        return 0

    failures = []
    for label, pattern, repl, required in EDITS:
        html, n = pattern.subn(repl, html, count=1)
        if n:
            print(f"  ok      {label}")
        elif required:
            print(f"  FAILED  {label}")
            failures.append(label)
        else:
            print(f"  skipped {label} (not found — harmless)")

    if failures:
        print(
            "\nStopped without writing anything. The file didn't match "
            f"{len(failures)} expected pattern(s) — most likely index.html has been\n"
            "edited since this script was written. Nothing was changed."
        )
        return 1

    if dry:
        print(f"\nDry run: {len(original)} chars in, {len(html)} chars out. No files written.")
        return 0

    backup = path.with_suffix(path.suffix + ".bak")
    shutil.copy2(path, backup)
    path.write_text(html, encoding="utf-8")
    print(f"\nPatched {path} (backup at {backup}).")
    print("Next: put heydate-auth.js next to index.html and add your Supabase keys to it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
