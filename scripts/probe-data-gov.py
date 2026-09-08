"""
Finds the datasets we care about on data.gov.in and prints their shape.

This exists because the sandbox this repo is developed in cannot reach
data.gov.in, but GitHub's runners can. Run it from the Actions tab and read the
log: it is a telescope pointed at the catalogue, not part of the build.

Discovery goes through the `datagovindia` client rather than a hand-rolled
catalogue call. A first attempt hit /catalog directly and got 404 for every
term — that endpoint does not exist. The client keeps its own index of the
platform's ~180k resources, which is the documented way to find a resource id.

Needs DATA_GOV_IN_KEY in the environment. One key covers every dataset.
"""

import os
import sys
import traceback

KEY = os.environ.get("DATA_GOV_IN_KEY", "").strip()
if not KEY:
    sys.exit("DATA_GOV_IN_KEY is not set. Add it as a repository secret.")

# What we are hunting: per-project rows with costs and dates, not sector totals.
QUERIES = [
    "central sector projects",
    "infrastructure projects",
    "cost overrun",
    "time overrun",
    "project monitoring",
    "OCMS",
    "programme implementation",
]

MAX_PER_QUERY = 8


def banner(text: str) -> None:
    print("\n" + "=" * 78)
    print(text)
    print("=" * 78)


banner("Connecting to the data.gov.in index")
try:
    import pandas as pd
    from datagovindia import DataGovIndia

    pd.set_option("display.max_colwidth", 120)
    dgi = DataGovIndia()
    # The index is cached locally; on a cold runner it has to be pulled first.
    try:
        dgi.sync_metadata()
        print("metadata synced")
    except Exception as error:  # noqa: BLE001
        print(f"sync_metadata said: {type(error).__name__}: {error} (continuing)")
except Exception:  # noqa: BLE001
    traceback.print_exc()
    sys.exit("Could not initialise the datagovindia client.")

candidates: dict[str, str] = {}

for term in QUERIES:
    banner(f"search: {term!r}")
    try:
        found = dgi.search(term, search_fields=["title", "description"])
    except Exception as error:  # noqa: BLE001
        print(f"  !! {type(error).__name__}: {error}")
        continue
    if found is None or len(found) == 0:
        print("  (nothing)")
        continue
    print(f"  {len(found)} hit(s); showing up to {MAX_PER_QUERY}")
    for _, row in found.head(MAX_PER_QUERY).iterrows():
        rid = str(row.get("index_name", ""))
        title = str(row.get("title", ""))[:130]
        org = str(row.get("org_type", "") or row.get("source", ""))[:60]
        print(f"  - {title}")
        print(f"    id={rid}  org={org}")
        # Anything mentioning both a project and money or a date is worth opening.
        low = title.lower()
        if rid and any(w in low for w in ("project", "overrun", "monitor")):
            candidates[rid] = title

banner(f"Opening {len(candidates)} candidate(s) to read their columns")
for rid, title in list(candidates.items())[:12]:
    print(f"\n--- {title}\n    id={rid}")
    try:
        info = dgi.get_api_info(rid)
        print(f"    info: {str(info)[:400]}")
    except Exception as error:  # noqa: BLE001
        print(f"    get_api_info: {type(error).__name__}: {error}")
    try:
        data = dgi.get_data(rid, api_key=KEY, num_results=2)
        if data is not None and len(data):
            print(f"    columns: {list(data.columns)}")
            print(f"    row 0: {data.iloc[0].to_dict()}")
        else:
            print("    (no rows returned)")
    except Exception as error:  # noqa: BLE001
        print(f"    get_data: {type(error).__name__}: {error}")

banner("Done")
print("Want: a resource whose columns include a project NAME plus original and")
print("revised COST, and original and anticipated COMPLETION DATE.")
