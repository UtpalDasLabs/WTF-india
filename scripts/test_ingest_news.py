#!/usr/bin/env python3
"""
Checks the news parser against RSS written by hand.

This sandbox cannot reach news.google.com, and the pipeline runs unattended on a
schedule, so the parts that can be wrong quietly are pinned here: what counts as
on-subject, what counts as too old, how a publisher is split off a headline, and
whether the same story reaching two city searches turns into two rows.

Run: python scripts/test_ingest_news.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import importlib.util

spec = importlib.util.spec_from_file_location(
    "ingest_news", Path(__file__).resolve().parent / "ingest-news.py"
)
assert spec and spec.loader
ingest = importlib.util.module_from_spec(spec)
# dataclasses looks the module up in sys.modules while it builds the class, so
# registering it first is not optional for a module loaded by path.
sys.modules["ingest_news"] = ingest
spec.loader.exec_module(ingest)

NOW = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
MUMBAI = ingest.Place("Mumbai", "Maharashtra", 19.076, 72.8777)


def rss(entries: list[dict]) -> bytes:
    """Builds the shape Google News actually returns."""
    body = []
    for entry in entries:
        when = entry.get("when", NOW - timedelta(days=1))
        source = (
            f'<source url="https://example.com">{entry["source"]}</source>'
            if entry.get("source")
            else ""
        )
        body.append(
            f"<item>"
            f"<title>{entry['title']}</title>"
            f"<link>{entry.get('link', 'https://news.google.com/rss/articles/abc')}</link>"
            f"<pubDate>{format_datetime(when)}</pubDate>"
            f"{source}"
            f"</item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
        + "".join(body)
        + "</channel></rss>"
    ).encode("utf-8")


tests: list[tuple[str, callable]] = []


def test(name):
    def register(fn):
        tests.append((name, fn))
        return fn

    return register


@test("keeps a story about a stalled civic project")
def _():
    feed = rss([{"title": "Mumbai: Andheri flyover work stalled, cost overrun of Rs 40 crore",
                 "source": "The Hindu", "link": "https://news.google.com/a"}])
    items = ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW)
    assert len(items) == 1, items
    assert items[0].district == "Mumbai"
    assert items[0].state == "Maharashtra"
    assert items[0].latitude == 19.076


@test("drops a story that matched the search but is not about public money")
def _():
    feed = rss([{"title": "Mumbai Indians confirm squad for the new season",
                 "source": "Sport Desk", "link": "https://news.google.com/b"}])
    assert ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW) == []


# The next four are headlines the first live run actually returned. They are the
# reason the filter has two tiers rather than one keyword list.

@test("drops a gold theft story that only matched on the word lakh")
def _():
    assert not ingest.on_subject(
        "Mumbai: Two Fake Sadhus Arrested In Gold Theft Case; Rs 2.80 Lakh Gold Seized"
    )


@test("drops a teaching-vacancy story that only matched on the word school")
def _():
    assert not ingest.on_subject(
        "Mumbai: 525 Candidates Complete Document Verification For Ashram School Teacher Posts"
    )


@test("keeps a road-works inspection")
def _():
    assert ingest.on_subject("IIT Bombay Team Inspects Kumbh Road Works, Conducts Core-Cut Tests")


@test("keeps an arrest that is about a contract, despite the word arrested")
def _():
    assert ingest.on_subject("Contractor arrested over Rs 4 crore road tender scam")


@test("keeps a headline with two weak terms and nothing odd about it")
def _():
    assert ingest.on_subject("Rs 200 crore road project still incomplete after four years")


@test("does not claim a place the headline never names")
def _():
    # A Tamil Nadu story that the Srinagar search returned, which is exactly
    # what happened on the first live run.
    srinagar = ingest.Place("Srinagar", "Jammu and Kashmir", 34.08, 74.79)
    feed = rss([{"title": "Tamil Nadu: CAG report flags government vehicles transferred to private owners",
                 "link": "https://news.google.com/tn"}])
    items = ingest.parse_feed(feed, srinagar, "Srinagar", NOW)
    assert len(items) == 1, items
    assert items[0].district is None, items[0].district
    assert items[0].latitude is None


@test("claims the place when the headline names the state rather than the city")
def _():
    feed = rss([{"title": "Maharashtra civic bodies leave road repair funds unspent",
                 "link": "https://news.google.com/mh"}])
    items = ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW)
    assert items[0].district == "Mumbai" and items[0].state == "Maharashtra"


@test("matches a place on whole words only")
def _():
    agra = ingest.Place("Agra", "Uttar Pradesh", 27.18, 78.02)
    assert not ingest.place_named("Agrawal firm wins municipal contract", agra)
    assert ingest.place_named("Agra municipal contract cancelled", agra)


@test("drops a share-price story even though it mentions a contractor")
def _():
    feed = rss([{"title": "Contractor share price jumps after order win",
                 "source": "Markets", "link": "https://news.google.com/c"}])
    assert ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW) == []


@test("drops anything older than the window")
def _():
    feed = rss([{"title": "Mumbai ward budget audit finds missing funds",
                 "when": NOW - timedelta(days=ingest.MAX_AGE_DAYS + 2),
                 "link": "https://news.google.com/d"}])
    assert ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW) == []


@test("drops a story dated in the future rather than floating it to the top")
def _():
    feed = rss([{"title": "Mumbai metro tender cancelled by the corporation",
                 "when": NOW + timedelta(days=5), "link": "https://news.google.com/e"}])
    assert ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW) == []


@test("splits the publisher off the headline")
def _():
    title, publisher = ingest.split_title("Flyover work stalled again - The Indian Express")
    assert title == "Flyover work stalled again", title
    assert publisher == "The Indian Express", publisher


@test("leaves a hyphenated headline with no publisher alone")
def _():
    title, publisher = ingest.split_title("Pune-Nashik highway audit ordered")
    assert title == "Pune-Nashik highway audit ordered", title
    assert publisher is None


@test("prefers the source element over the tail of the title")
def _():
    feed = rss([{"title": "Mumbai civic budget audit ordered - Wire Copy", "source": "Deccan Herald",
                 "link": "https://news.google.com/f"}])
    items = ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW)
    assert items[0].publisher == "Deccan Herald", items[0].publisher
    assert items[0].title == "Mumbai civic budget audit ordered", items[0].title


@test("a national search leaves the place columns empty rather than guessing")
def _():
    feed = rss([{"title": "CAG report flags Rs 900 crore in stalled highway projects",
                 "link": "https://news.google.com/g"}])
    items = ingest.parse_feed(feed, None, "India", NOW)
    assert items[0].state is None and items[0].district is None
    assert items[0].latitude is None


@test("the same story reaching two city searches becomes one row")
def _():
    pune = ingest.Place("Pune", "Maharashtra", 18.52, 73.85)
    one = ingest.parse_feed(
        rss([{"title": "Mumbai-Pune expressway repair contract under audit",
              "link": "https://news.google.com/same"}]), MUMBAI, "Mumbai", NOW)
    two = ingest.parse_feed(
        rss([{"title": "Mumbai-Pune expressway repair contract under audit",
              "link": "https://news.google.com/same"}]), pune, "Pune", NOW)
    assert len(ingest.dedupe(one + two)) == 1


@test("the same headline under two links also becomes one row")
def _():
    a = ingest.parse_feed(rss([{"title": "Mumbai ward road repair funds unspent, says audit",
                                "link": "https://news.google.com/h1"}]), MUMBAI, "Mumbai", NOW)
    b = ingest.parse_feed(rss([{"title": "Mumbai ward road repair funds unspent, says audit!",
                                "link": "https://news.google.com/h2"}]), MUMBAI, "Mumbai", NOW)
    assert len(ingest.dedupe(a + b)) == 1


@test("a relative or malformed link is skipped rather than stored")
def _():
    feed = rss([{"title": "Mumbai municipal budget audit ordered", "link": "/rss/articles/relative"}])
    assert ingest.parse_feed(feed, MUMBAI, "Mumbai", NOW) == []


@test("junk XML comes back empty instead of throwing")
def _():
    assert ingest.parse_feed(b"<rss><channel><item>", MUMBAI, "Mumbai", NOW) == []


@test("no more than PER_PLACE stories survive one search")
def _():
    entries = [
        {"title": f"Mumbai ward {n} road repair contract audit ordered",
         "link": f"https://news.google.com/many{n}",
         "when": NOW - timedelta(hours=n)}
        for n in range(ingest.PER_PLACE + 8)
    ]
    assert len(ingest.parse_feed(rss(entries), MUMBAI, "Mumbai", NOW)) == ingest.PER_PLACE


@test("the query names the place and asks about money")
def _():
    query = ingest.query_for(MUMBAI)
    assert '"Mumbai"' in query
    assert "cost overrun" in query
    assert "news.google.com" in ingest.feed_url(query)
    assert "hl=en-IN" in ingest.feed_url(query)


@test("the gazetteer is the app's own city list")
def _():
    places = ingest.load_places()
    assert len(places) >= 20, len(places)
    assert any(place.name == "Mumbai" for place in places)
    assert all(-90 <= place.lat <= 90 and -180 <= place.lng <= 180 for place in places)


failed = 0
for name, run in tests:
    try:
        run()
        print(f"  ok   {name}")
    except AssertionError as error:
        failed += 1
        print(f"  FAIL {name}")
        print(f"       {error}")

print(f"\n{len(tests) - failed}/{len(tests)} passed")
raise SystemExit(0 if failed == 0 else 1)
