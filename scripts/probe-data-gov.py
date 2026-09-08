"""
Finds the datasets we care about on data.gov.in and prints their shape.

This exists because the sandbox this repo is developed in cannot reach
data.gov.in, but GitHub's runners can. Run it from the Actions tab and read the
log: it is a telescope pointed at the catalogue, not part of the build.

Three things learned the hard way, each encoded here so we do not repeat them:

  1. api.data.gov.in/catalog does not exist. Every call 404s.
  2. Python buffers stdout off a TTY, so a cancelled run loses everything. Runs
     under python -u and every print flushes.
  3. The datagovindia client cannot build its index from a GitHub runner: its
     sync gave up after 180s with a ReadTimeout, leaving an empty local db and
     every search raising "Could not find tables". So no third-party index.

What is left is the plain documented resource endpoint plus the portal's own
search page, which a runner can read even though this sandbox cannot. Step 1
proves the key and endpoint work at all against a resource id known to exist;
step 2 harvests ids out of the search HTML; step 3 opens each one.

Needs DATA_GOV_IN_KEY in the environment. One key covers every dataset.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

KEY = os.environ.get("DATA_GOV_IN_KEY", "").strip()
if not KEY:
    sys.exit("DATA_GOV_IN_KEY is not set. Add it as a repository secret.")

# Widely published in data.gov.in tutorials; used only to prove the plumbing.
CONTROL_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"

TERMS = [
    "central sector projects",
    "infrastructure projects cost overrun",
    "project monitoring",
    "time overrun",
]

UA = "Mozilla/5.0 (compatible; wtf-india-probe/1.0)"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def say(*parts: object) -> None:
    print(*parts, flush=True)


def banner(text: str) -> None:
    say("\n" + "=" * 78)
    say(text)
    say("=" * 78)


def fetch(url: str, timeout: int = 45) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")[:400]
    except Exception as error:  # noqa: BLE001 - a probe reports, it does not raise
        return 0, f"{type(error).__name__}: {error}"


def resource_url(resource_id: str, limit: int = 2) -> str:
    query = urllib.parse.urlencode(
        {"api-key": KEY, "format": "json", "limit": limit}
    )
    return f"https://api.data.gov.in/resource/{resource_id}?{query}"


def describe(resource_id: str, label: str = "") -> bool:
    """Print a resource's columns and one row. True if it returned rows."""
    status, body = fetch(resource_url(resource_id))
    say(f"    HTTP {status}")
    if status != 200:
        say(f"    body: {body[:300]}")
        return False
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        say(f"    not JSON: {body[:300]}")
        return False

    say(f"    title: {payload.get('title')}")
    say(f"    total rows: {payload.get('total')}")
    fields = payload.get("field")
    if isinstance(fields, list):
        names = [str(f.get("id") or f.get("name")) for f in fields]
        say(f"    columns ({len(names)}): {names}")
    records = payload.get("records") or []
    if records:
        say(f"    row 0: {json.dumps(records[0], ensure_ascii=False)[:900]}")
        return True
    say("    (no rows)")
    return False


banner("STEP 1 — does the key and the resource endpoint work at all?")
say(f"control resource {CONTROL_RESOURCE}")
plumbing_ok = describe(CONTROL_RESOURCE)
say(f"\nplumbing works: {plumbing_ok}")

banner("STEP 2 — harvest resource ids from the portal's own search pages")
# The portal's search is HTML, not an API. A runner can read it; this sandbox
# cannot. Several URL shapes are tried because the portal has changed layout.
found: dict[str, str] = {}
for term in TERMS:
    quoted = urllib.parse.quote_plus(term)
    for shape in (
        f"https://www.data.gov.in/search?title={quoted}",
        f"https://www.data.gov.in/catalogs?q={quoted}",
        f"https://www.data.gov.in/search/site/{quoted}",
    ):
        status, body = fetch(shape)
        ids = set(UUID_RE.findall(body)) if status == 200 else set()
        say(f"  {status:>3}  {len(ids):>3} uuid(s)  {shape}")
        for rid in ids:
            found.setdefault(rid, term)
        if ids:
            break

say(f"\ndistinct resource ids harvested: {len(found)}")

banner("STEP 3 — open each harvested id")
if not found:
    say("Nothing harvested. The portal search is likely rendered client-side,")
    say("so the ids are not in the served HTML. Next move is the MoSPI flash")
    say("report PDFs, which carry the per-project table we actually want.")
for rid, term in list(found.items())[:15]:
    say(f"\n--- {rid}   (from search {term!r})")
    describe(rid)

banner("Done")
say("Want: columns with a project NAME plus original and revised COST,")
say("and original and anticipated COMPLETION DATE.")
