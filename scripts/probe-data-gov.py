"""
Finds the datasets we care about on data.gov.in and prints their shape.

This exists because the sandbox this repo is developed in cannot reach
data.gov.in, but GitHub's runners can. Run it from the Actions tab and read the
log: it is a telescope pointed at the catalogue, not part of the build.

Needs DATA_GOV_IN_KEY in the environment. One key covers every dataset.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

KEY = os.environ.get("DATA_GOV_IN_KEY", "").strip()
if not KEY:
    sys.exit("DATA_GOV_IN_KEY is not set. Add it as a repository secret.")

# What we are hunting for: per-project rows with costs and dates, not sector totals.
QUERIES = [
    "central sector infrastructure projects",
    "OCMS project monitoring",
    "cost overrun",
    "time overrun delayed projects",
    "infrastructure projects 150 crore",
    "project monitoring statistics programme implementation",
]

CATALOG = "https://api.data.gov.in/catalog"
RESOURCE = "https://api.data.gov.in/resource"


def get(url: str, params: dict) -> dict | None:
    query = urllib.parse.urlencode({**params, "api-key": KEY, "format": "json"})
    request = urllib.request.Request(
        f"{url}?{query}", headers={"User-Agent": "wtf-india-probe/1.0"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except Exception as error:  # noqa: BLE001 - a probe reports failures, it does not raise
        print(f"    !! {type(error).__name__}: {error}")
        return None


def search(term: str) -> list[dict]:
    """The catalogue endpoint is the only documented way to discover resource ids."""
    payload = get(CATALOG, {"filters[title]": term, "limit": 10})
    if not payload:
        return []
    records = payload.get("records") or payload.get("data") or []
    return records if isinstance(records, list) else []


def describe(resource_id: str) -> None:
    """One row tells us the field names, which is what the ingester needs."""
    payload = get(RESOURCE + "/" + resource_id, {"limit": 1})
    if not payload:
        return
    print(f"    total rows reported: {payload.get('total')}")
    fields = payload.get("field")
    if isinstance(fields, list):
        names = [f.get("id") or f.get("name") for f in fields]
        print(f"    fields ({len(names)}): {', '.join(str(n) for n in names)}")
    records = payload.get("records") or []
    if records:
        print(f"    sample row: {json.dumps(records[0], ensure_ascii=False)[:800]}")


print("=" * 78)
print("data.gov.in catalogue probe")
print("=" * 78)

seen: set[str] = set()
for term in QUERIES:
    print(f"\n### search: {term!r}")
    hits = search(term)
    if not hits:
        print("    (no records returned — the catalogue filter may not support this term)")
        continue
    for hit in hits:
        rid = str(hit.get("index_name") or hit.get("resource_id") or hit.get("id") or "")
        title = str(hit.get("title") or "")[:150]
        org = hit.get("org") or hit.get("organization") or ""
        print(f"  - {title}")
        print(f"    id: {rid}   org: {org}")
        if rid and rid not in seen:
            seen.add(rid)
            describe(rid)

print(f"\nDistinct resource ids inspected: {len(seen)}")
print("Look for one whose fields include a project NAME plus original/revised cost")
print("and original/anticipated completion dates. That is the ingestion target.")
