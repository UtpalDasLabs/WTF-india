"""
Finds the datasets we care about on data.gov.in and prints their shape.

This exists because the sandbox this repo is developed in cannot reach
data.gov.in, but GitHub's runners can. Run it from the Actions tab and read the
log: it is a telescope pointed at the catalogue, not part of the build.

Two things learned the hard way and encoded here:
  - api.data.gov.in/catalog does not exist; every call 404s. Discovery has to go
    through the datagovindia client's own index of the platform's resources.
  - That client's sync_metadata() pulls a very large index and can sit there for
    a long time, so it runs under a hard alarm and the script keeps going without
    it rather than hanging a runner.

Needs DATA_GOV_IN_KEY in the environment. One key covers every dataset.
"""

import os
import signal
import sys
import traceback

KEY = os.environ.get("DATA_GOV_IN_KEY", "").strip()
if not KEY:
    sys.exit("DATA_GOV_IN_KEY is not set. Add it as a repository secret.")

SYNC_SECONDS = int(os.environ.get("SYNC_SECONDS", "420"))

# What we are hunting: per-project rows with costs and dates, not sector totals.
QUERIES = [
    "central sector projects",
    "infrastructure projects",
    "cost overrun",
    "time overrun",
    "project monitoring",
    "programme implementation",
]

# Searched first purely to tell "the index is empty" apart from "our words are wrong".
CONTROL = "rainfall"

MAX_PER_QUERY = 8


def say(*parts: object) -> None:
    print(*parts, flush=True)


def banner(text: str) -> None:
    say("\n" + "=" * 78)
    say(text)
    say("=" * 78)


class Timeout(Exception):
    pass


def _alarm(_signum: int, _frame: object) -> None:
    raise Timeout()


banner("Connecting to the data.gov.in index")
try:
    import pandas as pd
    from datagovindia import DataGovIndia

    pd.set_option("display.max_colwidth", 120)
    dgi = DataGovIndia()
    say("client constructed")
except Exception:  # noqa: BLE001
    traceback.print_exc()
    sys.exit("Could not initialise the datagovindia client.")


def try_search(term: str):
    try:
        return dgi.search(term, search_fields=["title", "description"])
    except Exception as error:  # noqa: BLE001
        say(f"  !! search({term!r}): {type(error).__name__}: {error}")
        return None


# Does the client already have a usable index, or must we pay for the sync?
say(f"\ncontrol search for {CONTROL!r} before syncing…")
control = try_search(CONTROL)
have_index = control is not None and len(control) > 0
say(f"control hits before sync: {0 if control is None else len(control)}")

if not have_index:
    banner(f"Index looks empty — syncing metadata (hard limit {SYNC_SECONDS}s)")
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(SYNC_SECONDS)
    try:
        dgi.sync_metadata()
        say("metadata synced")
    except Timeout:
        say(f"!! sync_metadata exceeded {SYNC_SECONDS}s — abandoning it")
    except Exception as error:  # noqa: BLE001
        say(f"!! sync_metadata: {type(error).__name__}: {error}")
    finally:
        signal.alarm(0)
    control = try_search(CONTROL)
    say(f"control hits after sync: {0 if control is None else len(control)}")

candidates: dict[str, str] = {}

for term in QUERIES:
    banner(f"search: {term!r}")
    found = try_search(term)
    if found is None or len(found) == 0:
        say("  (nothing)")
        continue
    say(f"  {len(found)} hit(s); showing up to {MAX_PER_QUERY}")
    for _, row in found.head(MAX_PER_QUERY).iterrows():
        rid = str(row.get("index_name", ""))
        title = str(row.get("title", ""))[:130]
        say(f"  - {title}")
        say(f"    id={rid}")
        low = title.lower()
        if rid and any(word in low for word in ("project", "overrun", "monitor")):
            candidates[rid] = title

banner(f"Opening {len(candidates)} candidate(s) to read their columns")
for rid, title in list(candidates.items())[:12]:
    say(f"\n--- {title}\n    id={rid}")
    try:
        data = dgi.get_data(rid, api_key=KEY, num_results=2)
        if data is not None and len(data):
            say(f"    columns: {list(data.columns)}")
            say(f"    row 0: {data.iloc[0].to_dict()}")
        else:
            say("    (no rows returned)")
    except Exception as error:  # noqa: BLE001
        say(f"    get_data: {type(error).__name__}: {error}")

banner("Done")
say("Want: a resource whose columns include a project NAME plus original and")
say("revised COST, and original and anticipated COMPLETION DATE.")
