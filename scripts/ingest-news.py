#!/usr/bin/env python3
"""
Headlines about where public money went, for the places this app covers.

Why a scheduled job and not a fetch from the browser:

  * Google News RSS sends no CORS headers, so a page cannot read it directly.
  * Every news API with a free tier wants a key, and a key in a static site is
    a key you have given away.
  * This app has no server. It has GitHub Actions and a Postgres, which is the
    same pair the MoSPI pipeline already runs on.

So the fetching happens here, on a schedule, and the app reads rows.

What is stored is deliberately thin: a headline, a publisher, a date and a link.
No article text, no images, no summaries. The reader is sent to the publisher to
read the work of the people who did it. This is an index, not a reprint.

Usage:
    python scripts/ingest-news.py --inspect     # fetch and report, write nothing
    python scripts/ingest-news.py               # fetch, write data/news/items.json
    python scripts/ingest-news.py --load        # ...and upsert into Supabase

Loading needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. The
service role key bypasses row level security, so it belongs in a repository
secret and never in the repository.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAZETTEER_SOURCE = ROOT / "src" / "lib" / "wtf.ts"
OUTPUT = ROOT / "data" / "news" / "items.json"

FEED = "https://news.google.com/rss/search"
# India, in English. Without these Google answers as though you were in the US.
FEED_PARAMS = {"hl": "en-IN", "gl": "IN", "ceid": "IN:en"}
USER_AGENT = "we-the-future/1.0 (+https://github.com/UtpalDasLabs/WTF-india)"

# Anything older than this is not news, and keeping it makes the tab look dead.
MAX_AGE_DAYS = 30
# A breath between searches. Thirty in a burst gets throttled, and a throttled
# request costs the full timeout rather than failing fast.
PAUSE_SECONDS = 1.0

# How many stories to keep for one place, so a city with a busy week cannot
# crowd out the rest of the country.
PER_PLACE = 12

# What the search asks for. Kept as phrases rather than single words because
# "audit" on its own returns accountancy firms hiring, and "budget" returns
# budget hotels.
MONEY_TERMS = [
    '"cost overrun"',
    '"time overrun"',
    '"cost escalation"',
    '"tender cancelled"',
    '"tender scam"',
    '"CAG report"',
    '"audit report"',
    '"public money"',
    '"civic budget"',
    '"municipal budget"',
    '"project delayed"',
    '"stalled project"',
    '"road repair"',
    '"contractor blacklisted"',
]

# What a headline has to be about.
#
# The first live run showed why one flat keyword list is not enough. "Two Fake
# Sadhus Arrested; Rs 2.80 Lakh Gold Seized" matched on "lakh"; "525 Candidates
# Complete Document Verification For Ashram School Teacher Posts" matched on
# "school". Both are real news and neither is this app's subject.
#
# So there are two tiers. A strong term is about public money or public works on
# its own. A weak term only counts alongside another one — "crore" and "road" in
# the same headline is probably a road contract; "crore" by itself is any story
# in India.
STRONG = re.compile(
    r"\b("
    r"tender|contract|contractor|sub-?contract\w*|"
    r"audit|cag|comptroller|vigilance|anti-?corruption|"
    r"scam|corrupt\w*|bribe\w*|embezzl\w*|misappropriat\w*|siphon\w*|"
    r"overrun|cost\s+escalation|unspent|undertutilis\w*|diverted|irregularit\w*|"
    r"blacklist\w*|stalled|shelved|"
    r"municipal|corporation|civic|panchayat|nagar\s*nigam|nagar\s*palika|"
    r"smart\s*city|public\s*works|public\s*money|public\s*funds|"
    r"road\s*works|civil\s*works|pwd|nhai|cpwd|"
    r"utilisation\s+certificate|cost\s+overrun|time\s+overrun"
    r")\b",
    re.I,
)

WEAK = re.compile(
    r"\b("
    r"crore|lakh|budget|fund|funds|funding|grant|allocation|"
    r"road|highway|bridge|flyover|metro|drain|sewer|sewage|culvert|"
    r"hospital|school|water\s*supply|street\s*light|"
    r"project|projects|work|works|delay\w*|incomplete|"
    r"ward|municipality|collector|department"
    r")\b",
    re.I,
)

# Never this subject, whatever else the headline says.
NEVER = re.compile(
    r"\b(cricket|ipl|football|film|movie|box\s*office|horoscope|betting|casino|"
    r"share\s*price|stock\s*market|sensex|nifty|ipo|mutual\s*fund|"
    r"gold\s*rate|petrol\s*price)\b",
    re.I,
)

# Usually a different kind of story. These block the weak path but not the
# strong one, because "Contractor arrested over road scam" is exactly the thing
# we are looking for.
UNLIKELY = re.compile(
    r"\b(arrest\w*|theft|stolen|murder|assault|rape|molest\w*|"
    r"recruit\w*|vacanc\w*|admit\s*card|exam|result|merit\s*list|"
    r"horoscope|weather|festival|temple|wedding)\b",
    re.I,
)


def on_subject(title: str) -> bool:
    """Two ways in: one strong term, or two weak ones with nothing odd about it."""
    if NEVER.search(title):
        return False
    if STRONG.search(title):
        return True
    if UNLIKELY.search(title):
        return False
    return len(set(match.group(0).lower() for match in WEAK.finditer(title))) >= 2


@dataclass(frozen=True)
class Place:
    name: str
    state: str
    lat: float
    lng: float


@dataclass
class Item:
    url: str
    title: str
    publisher: str | None
    published_at: str
    state: str | None
    district: str | None
    latitude: float | None
    longitude: float | None
    topic: str


def load_places() -> list[Place]:
    """
    Reads the city list out of the app's own source, so the tab and the map
    agree on what places exist rather than drifting apart. Same loader shape as
    the MoSPI pipeline, for the same reason.
    """
    text = GAZETTEER_SOURCE.read_text(encoding="utf-8")
    block = re.search(
        r"export const INDIAN_CITIES:\s*CityOption\[\]\s*=\s*\[(.*?)\n\];", text, re.S
    )
    if not block:
        sys.exit("Could not find INDIAN_CITIES in src/lib/wtf.ts")

    places: list[Place] = []
    for entry in re.finditer(r"\{(.*?)\}", block.group(1), re.S):
        body = entry.group(1)
        name = re.search(r'name:\s*"([^"]+)"', body)
        state = re.search(r'state:\s*"([^"]+)"', body)
        lat = re.search(r"lat:\s*(-?[\d.]+)", body)
        lng = re.search(r"lng:\s*(-?[\d.]+)", body)
        if not (name and state and lat and lng):
            continue
        places.append(
            Place(name.group(1), state.group(1), float(lat.group(1)), float(lng.group(1)))
        )
    return places


def query_for(place: Place | None) -> str:
    """The search string for one place, or for the country when place is None."""
    terms = " OR ".join(MONEY_TERMS)
    if place is None:
        return f"India government ({terms})"
    return f'"{place.name}" ({terms})'


def feed_url(query: str) -> str:
    params = {"q": query, **FEED_PARAMS}
    return f"{FEED}?{urllib.parse.urlencode(params)}"


def fetch(url: str, timeout: int = 12) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def split_title(raw: str) -> tuple[str, str | None]:
    """
    Google appends the publisher to the headline with a hyphen: "Flyover work
    stalled again - The Hindu". The <source> element usually carries it too, but
    not always, so the tail is split off either way and the headline is stored
    clean.
    """
    text = " ".join(raw.split())
    match = re.match(r"^(.*?)\s+-\s+([^-]{2,60})$", text)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return text, None


def place_named(title: str, place: Place) -> str | None:
    """
    How specifically the headline names this place: "city", "state", or not at
    all.

    The distinction matters on a screen that prints a distance. "Jal Jeevan
    Mission: 50 percent households face water shortfall in Tamil Nadu" reached
    us through the Coimbatore search and is about the whole state; pinning it to
    Coimbatore's coordinates would tell a reader there it is four kilometres
    away. It gets the state and no point at all.

    Word-boundary matched, so "Agra" does not match "Agrawal".
    """
    for level, needle in (("city", place.name), ("state", place.state)):
        if re.search(rf"(?<![A-Za-z]){re.escape(needle)}(?![A-Za-z])", title, re.I):
            return level
    return None


def parse_feed(xml_bytes: bytes, place: Place | None, topic: str, now: datetime) -> list[Item]:
    """
    Turns one RSS response into items, dropping anything stale, off-subject, or
    missing the parts that make it citable.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    items: list[Item] = []

    for node in root.iterfind(".//item"):
        link = (node.findtext("link") or "").strip()
        raw_title = (node.findtext("title") or "").strip()
        if not link.lower().startswith(("http://", "https://")) or len(raw_title) < 8:
            continue

        title, from_title = split_title(raw_title)
        source = node.find("source")
        publisher = (source.text or "").strip() if source is not None and source.text else from_title

        if not on_subject(title):
            continue

        # A search for "Srinagar" returned a Tamil Nadu audit story, and filing
        # it under Srinagar would have put it 0 km from a reader in Kashmir. A
        # place is only claimed as precisely as the headline names it; anything
        # vaguer is kept as a national story, which is what these mostly are.
        named = place_named(title, place) if place else None

        raw_date = (node.findtext("pubDate") or "").strip()
        try:
            published = parsedate_to_datetime(raw_date)
        except (TypeError, ValueError):
            continue
        if published is None:
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        # A story dated in the future is a broken feed, not a scoop.
        if published < cutoff or published > now + timedelta(days=1):
            continue

        items.append(
            Item(
                url=link,
                title=title[:500],
                publisher=publisher[:120] if publisher else None,
                published_at=published.astimezone(timezone.utc).isoformat(),
                state=place.state if named else None,
                district=place.name if named == "city" else None,
                latitude=place.lat if named == "city" else None,
                longitude=place.lng if named == "city" else None,
                topic=topic,
            )
        )

    items.sort(key=lambda item: item.published_at, reverse=True)
    return items[:PER_PLACE]


def dedupe(items: list[Item]) -> list[Item]:
    """
    One row per link, and one row per headline: the same story reaches several
    city searches at once when it is about a highway between two of them, and
    the same story is syndicated under slightly different links.
    """
    by_url: dict[str, Item] = {}
    seen_titles: set[str] = set()
    out: list[Item] = []
    for item in sorted(items, key=lambda entry: entry.published_at, reverse=True):
        if item.url in by_url:
            continue
        fingerprint = re.sub(r"[^a-z0-9]+", " ", item.title.lower()).strip()
        if fingerprint in seen_titles:
            continue
        by_url[item.url] = item
        seen_titles.add(fingerprint)
        out.append(item)
    return out


def upsert(items: list[Item]) -> None:
    """
    Writes into Supabase over PostgREST. `merge-duplicates` on the unique url
    means a story reached twice updates rather than erroring, and because the
    payload never mentions `hidden`, a headline a reviewer has taken down stays
    down through every later run.
    """
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set to load.")

    payload = json.dumps([asdict(item) for item in items]).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/rest/v1/news_items?on_conflict=url",
        data=payload,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response.read()
    except urllib.error.HTTPError as error:
        sys.exit(f"Upsert failed: {error.code} {error.read().decode('utf-8', 'replace')[:400]}")

    # Old headlines are not history, they are clutter, and the free tier is not
    # large. Anything past the window goes on every run.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).isoformat()
    delete = urllib.request.Request(
        f"{base}/rest/v1/news_items?published_at=lt.{urllib.parse.quote(cutoff)}",
        method="DELETE",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "return=minimal",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(delete, timeout=60) as response:
            response.read()
    except urllib.error.HTTPError as error:
        print(f"  note: pruning old rows failed ({error.code})", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inspect", action="store_true", help="fetch and report, write nothing")
    parser.add_argument("--load", action="store_true", help="upsert into Supabase as well")
    parser.add_argument("--limit-places", type=int, default=0, help="only the first N cities")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    places = load_places()
    if args.limit_places > 0:
        places = places[: args.limit_places]

    # The country-wide search first, then each city.
    targets: list[Place | None] = [None, *places]
    collected: list[Item] = []
    failures = 0

    for index, place in enumerate(targets):
        label = place.name if place else "India"
        query = query_for(place)
        # Thirty requests as fast as the runner can make them gets throttled,
        # and a throttled request costs the whole timeout. A breath between
        # them is cheaper than the stall.
        if index > 0:
            time.sleep(PAUSE_SECONDS)
        try:
            body = fetch(feed_url(query))
        except (urllib.error.URLError, TimeoutError) as error:
            failures += 1
            print(f"  {label:<16} could not be fetched: {error}", file=sys.stderr)
            continue
        found = parse_feed(body, place, label, now)
        collected.extend(found)
        print(f"  {label:<16} {len(found):>3} kept")

    items = dedupe(collected)
    print(f"\n{len(items)} headlines after de-duplication, {failures} searches failed")

    if items:
        newest = max(item.published_at for item in items)
        oldest = min(item.published_at for item in items)
        print(f"  {oldest[:10]} to {newest[:10]}")
        publishers = sorted({item.publisher for item in items if item.publisher})
        print(f"  {len(publishers)} publishers")

    if args.inspect:
        for item in items[:15]:
            print(f"  · [{item.district or 'India'}] {item.title}  — {item.publisher}")
        return 0

    if not items:
        # Writing an empty file would blank the tab on a bad network day.
        print("Nothing came back; leaving the existing data alone.", file=sys.stderr)
        return 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps([asdict(item) for item in items], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")

    if args.load:
        upsert(items)
        print(f"Upserted {len(items)} rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
