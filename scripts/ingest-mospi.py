"""
Turns MoSPI's monthly Flash Report into project rows.

The report is the only public, per-project, machine-readable-ish record of what
central infrastructure projects were sanctioned to cost and finish by, and what
they are now expected to cost and finish by. That pair of numbers is the whole
argument this app makes, so this is the pipeline that makes the app real rather
than a demo with eight hand-typed rows in it.

It runs on a GitHub runner because the development sandbox cannot reach
mospi.gov.in, and it writes its output into the repository rather than straight
into the database. That is deliberate: for a product whose claim is "every
figure comes from an official record", the extraction itself should be a
reviewable diff. You can see exactly which rows a run added, changed or dropped
before any of it reaches the site.

Nothing here guesses. A row with no readable cost and no readable date is
dropped and counted, not filled in; a project whose location cannot be matched
against the gazetteer gets no coordinates rather than approximate ones.

Usage:
    python -u scripts/ingest-mospi.py            # fetch newest, write data/mospi/
    python -u scripts/ingest-mospi.py --inspect  # print structure, write nothing
    python -u scripts/ingest-mospi.py --url URL  # parse one specific report
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

UA = "Mozilla/5.0 (compatible; wtf-india-ingest/1.0; +https://github.com/UtpalDasLabs/WTF-india)"
BASE = "https://www.mospi.gov.in/sites/default/files/publication_reports"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "mospi"
GAZETTEER_SOURCE = ROOT / "src" / "lib" / "wtf.ts"

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_INDEX = {name.lower()[:3]: number for number, name in enumerate(MONTHS, start=1)}

# One crore rupees. The report is denominated in crore throughout.
CRORE = 10_000_000


def say(*parts: object) -> None:
    print(*parts, flush=True)


def banner(text: str) -> None:
    say("\n" + "=" * 78)
    say(text)
    say("=" * 78)


# ---------------------------------------------------------------- fetching


def fetch(url: str, timeout: int = 120) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, b""
    except Exception as error:  # noqa: BLE001 - a fetch failure is a result, not a crash
        say(f"    {type(error).__name__}: {error}")
        return 0, b""


def candidate_urls(limit: int = 18) -> list[str]:
    """Newest first. The filename pattern has drifted, so try both spellings."""
    today = date.today()
    urls: list[str] = []
    year, month = today.year, today.month
    for _ in range(limit):
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        name = MONTHS[month - 1]
        urls.append(f"{BASE}/FlashReport_{name}_{year}.pdf")
        urls.append(f"{BASE}/FlashReport_{name[:3]}_{year}.pdf")
        urls.append(f"{BASE}/Flash_Report_{name}_{year}.pdf")
    return urls


def newest_report(explicit: str | None) -> tuple[bytes, str]:
    if explicit:
        status, body = fetch(explicit)
        if status == 200 and body[:4] == b"%PDF":
            return body, explicit
        sys.exit(f"Could not fetch {explicit} (status {status}).")

    for url in candidate_urls():
        status, body = fetch(url, timeout=60)
        if status == 200 and body[:4] == b"%PDF":
            say(f"  found {url} ({len(body):,} bytes)")
            return body, url
        say(f"  {status:>3}  {url}")
    sys.exit("No Flash Report could be fetched. The URL pattern has probably changed.")


# ---------------------------------------------------------------- gazetteer


@dataclass
class Place:
    name: str
    state: str
    lat: float
    lng: float
    needles: list[str]


def load_gazetteer() -> tuple[list[Place], dict[str, str]]:
    """
    Reads the city list out of the app's own source so there is one gazetteer,
    not two that drift apart. A city here is only used to place a project when
    its name is actually mentioned in the project's name.
    """
    text = GAZETTEER_SOURCE.read_text(encoding="utf-8")
    block = re.search(
        r"export const INDIAN_CITIES:\s*CityOption\[\]\s*=\s*\[(.*?)\n\];",
        text,
        re.S,
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
        alias_block = re.search(r"aliases:\s*\[(.*?)\]", body, re.S)
        aliases = re.findall(r'"([^"]+)"', alias_block.group(1)) if alias_block else []
        needles = [name.group(1).lower()] + [alias.lower() for alias in aliases]
        places.append(
            Place(name.group(1), state.group(1), float(lat.group(1)), float(lng.group(1)), needles)
        )

    states = {place.state.lower(): place.state for place in places}
    # States with no city in the list still deserve to be recognised by name.
    for extra in [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
        "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
        "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
        "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
        "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
        "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
        "Chandigarh", "Andaman and Nicobar Islands", "Lakshadweep",
    ]:
        states.setdefault(extra.lower(), extra)
    return places, states


def locate(name: str, places: list[Place], states: dict[str, str]):
    """
    Places a project only when its own name says where it is. Longest match
    wins, so "New Delhi" is not matched as "Delhi" inside another word.
    """
    haystack = f" {re.sub(r'[^a-z0-9 ]+', ' ', name.lower())} "
    best: Place | None = None
    for place in places:
        for needle in place.needles:
            if f" {needle} " in haystack and (best is None or len(needle) > len(best.name)):
                best = place
    if best:
        return best.name, best.state, best.lat, best.lng

    for key, proper in sorted(states.items(), key=lambda item: -len(item[0])):
        if f" {key} " in haystack:
            return None, proper, None, None
    return None, None, None, None


# ---------------------------------------------------------------- parsing


def clean(cell: object) -> str:
    return re.sub(r"\s+", " ", str(cell or "")).strip()


def parse_money_crore(value: str) -> int | None:
    """'1,234.56' crore -> rupees. Returns None for blanks and dashes."""
    text = clean(value).replace(",", "")
    if not text or text in {"-", "--", "NA", "N.A.", "N/A", "nil", "Nil"}:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return int(round(float(match.group(0)) * CRORE))
    except ValueError:
        return None


def parse_month_year(value: str) -> str | None:
    """
    MoSPI writes commissioning dates as a month, in several shapes:
    '03/2019', '03-2019', 'Mar-19', 'March 2019', '2019'. Anything that resolves
    to a month becomes the first of that month; a bare year is not enough to be
    useful and is dropped rather than assumed to be January.
    """
    text = clean(value)
    if not text or text in {"-", "--", "NA", "N.A.", "N/A"}:
        return None

    # Most specific first: "15/08/2022" also contains "08/2022", so testing the
    # month-and-year pattern first would silently throw the day away.
    match = re.search(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b", text)
    if match:
        day, month, year = (int(part) for part in match.groups())
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}"

    match = re.search(r"\b(\d{1,2})[/\-.](\d{4})\b", text)
    if match:
        month, year = int(match.group(1)), int(match.group(2))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}-01"

    match = re.search(r"\b([A-Za-z]{3,9})[\s\-.]*(\d{2,4})\b", text)
    if match:
        month = MONTH_INDEX.get(match.group(1).lower()[:3])
        if month:
            year = int(match.group(2))
            if year < 100:
                year += 2000 if year < 70 else 1900
            return f"{year:04d}-{month:02d}-01"
    return None


def parse_int(value: str) -> int | None:
    text = clean(value).replace(",", "")
    match = re.search(r"-?\d+", text)
    return int(match.group(0)) if match else None


# Column classification. The report's headers are not stable between years, so
# columns are identified by what the words mean rather than by position.
COLUMN_RULES: list[tuple[str, list[str], list[str]]] = [
    # (field, must contain any of, must not contain any of)
    ("serial", ["sl. no", "sl.no", "sl no", "s. no", "s.no", "serial"], []),
    ("name", ["project name", "name of project", "name of the project", "project"], ["cost", "date", "status"]),
    ("original_cost", ["original cost", "orig. cost", "sanctioned cost", "approved cost"], []),
    ("revised_cost", ["anticipated cost", "revised cost", "latest cost", "current cost"], []),
    ("original_date", ["original date", "original commissioning", "original schedule", "orig. date"], []),
    ("revised_date", ["anticipated date", "revised date", "latest date", "anticipated commissioning"], []),
    ("expenditure", ["cumulative expenditure", "expenditure", "expdr"], []),
    ("cost_overrun", ["cost overrun"], []),
    ("time_overrun", ["time overrun", "delay (in months)", "delay in months"], []),
    ("status_text", ["status"], []),
    ("agency", ["agency", "ministry", "department", "implementing"], []),
]


def classify(header: list[str]) -> dict[int, str]:
    mapping: dict[int, str] = {}
    used: set[str] = set()
    for index, cell in enumerate(header):
        text = clean(cell).lower()
        if not text:
            continue
        for field_name, wanted, forbidden in COLUMN_RULES:
            if field_name in used:
                continue
            if any(word in text for word in wanted) and not any(bad in text for bad in forbidden):
                mapping[index] = field_name
                used.add(field_name)
                break
    return mapping


def header_signature(header: list[str]) -> str:
    return " | ".join(clean(cell).lower()[:34] for cell in header)


@dataclass
class Stats:
    pages: int = 0
    tables: int = 0
    matched_tables: int = 0
    rows_seen: int = 0
    rows_kept: int = 0
    dropped_no_name: int = 0
    dropped_no_figures: int = 0
    headers: dict[str, int] = field(default_factory=dict)
    located_city: int = 0
    located_state: int = 0
    unlocated: int = 0


def slug(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:80]


def rows_from_table(
    table: list[list[object]],
    sector: str | None,
    page_number: int,
    places: list[Place],
    states: dict[str, str],
    stats: Stats,
    seen_refs: set[str],
) -> list[dict]:
    """
    One table to zero or more project rows. Split out of the PDF walk so the
    part that decides what counts as a project can be tested without a 500-page
    document, and so a change to the rules is reviewable on its own.
    """
    if not table or len(table) < 2:
        return []

    header = [clean(cell) for cell in table[0]]
    signature = header_signature(header)
    stats.headers[signature] = stats.headers.get(signature, 0) + 1
    mapping = classify(header)
    if "name" not in mapping.values():
        return []
    stats.matched_tables += 1

    out: list[dict] = []
    for raw in table[1:]:
        stats.rows_seen += 1
        values = {
            field_name: clean(raw[index]) if index < len(raw) else ""
            for index, field_name in mapping.items()
        }

        name = values.get("name", "")
        # Continuation and subtotal lines carry no usable project name.
        if len(name) < 8 or name.lower().startswith(("total", "sub total", "grand total")):
            stats.dropped_no_name += 1
            continue

        original_cost = parse_money_crore(values.get("original_cost", ""))
        revised_cost = parse_money_crore(values.get("revised_cost", ""))
        original_date = parse_month_year(values.get("original_date", ""))
        revised_date = parse_month_year(values.get("revised_date", ""))

        # A row with neither money nor a date says nothing we can use, and
        # inventing either is the one thing this must never do.
        if original_cost is None and original_date is None and revised_date is None:
            stats.dropped_no_figures += 1
            continue

        serial = values.get("serial", "") or str(stats.rows_kept + 1)
        ref = f"mospi:{slug(serial)}:{slug(name)}"
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        district, state, lat, lng = locate(name, places, states)
        if lat is not None:
            stats.located_city += 1
        elif state:
            stats.located_state += 1
        else:
            stats.unlocated += 1

        out.append(
            {
                "external_ref": ref,
                "name": name,
                "sector": sector,
                "department": values.get("agency") or None,
                "state": state,
                "district": district,
                "latitude": lat,
                "longitude": lng,
                "original_cost_inr": original_cost,
                "revised_cost_inr": revised_cost,
                "original_end_date": original_date,
                "revised_end_date": revised_date,
                "time_overrun_months": parse_int(values.get("time_overrun", "")),
                "expenditure_inr": parse_money_crore(values.get("expenditure", "")),
                "source_page": page_number,
            }
        )
        stats.rows_kept += 1
    return out


SECTOR_PATTERN = re.compile(
    r"\b(Railways?|Road Transport|Highways?|Petroleum|Power|Coal|Steel|Shipping|Ports?|"
    r"Civil Aviation|Telecommunications?|Urban Development|Water Resources|Health|"
    r"Fertilizers?|Mines|Atomic Energy|Space|Defence|Textiles?|Heavy Industry)\b",
    re.I,
)


def extract(pdf: bytes, inspect: bool) -> tuple[list[dict], Stats]:
    import pdfplumber

    places, states = load_gazetteer()
    stats = Stats()
    rows: list[dict] = []
    seen_refs: set[str] = set()
    # Sector headings sit above the tables as running text, so the nearest
    # heading above a row is that row's sector.
    sector: str | None = None

    with pdfplumber.open(io.BytesIO(pdf)) as document:
        stats.pages = len(document.pages)
        say(f"pages: {stats.pages}")

        for page_number, page in enumerate(document.pages, start=1):
            found = SECTOR_PATTERN.search(page.extract_text() or "")
            if found:
                sector = found.group(1).title()

            for table in page.extract_tables():
                stats.tables += 1
                rows.extend(
                    rows_from_table(table, sector, page_number, places, states, stats, seen_refs)
                )

            if inspect and page_number >= 60:
                say("(--inspect stops after 60 pages)")
                break

    say(f"kept {stats.rows_kept:,} rows from {stats.matched_tables:,} matching tables")
    return rows, stats


# ---------------------------------------------------------------- shaping


def status_for(row: dict, today: date) -> str:
    """
    Derived only from dates the report itself published. A project is never
    called finished here: the flash report tracks projects that are still on the
    books, and claiming a completion we have not seen evidence for is exactly the
    kind of thing that would make the whole product untrustworthy.
    """
    due = row.get("revised_end_date") or row.get("original_end_date")
    if not due:
        return "ongoing"
    when = datetime.strptime(due, "%Y-%m-%d").date()
    if when < today:
        return "delayed"
    return "ongoing"


def summarise(row: dict) -> str:
    parts: list[str] = []
    if row.get("original_cost_inr"):
        parts.append(f"Sanctioned at ₹{row['original_cost_inr'] / CRORE:,.0f} crore")
    if row.get("revised_cost_inr") and row.get("original_cost_inr"):
        overrun = row["revised_cost_inr"] - row["original_cost_inr"]
        if overrun > 0:
            parts.append(f"now expected to cost ₹{row['revised_cost_inr'] / CRORE:,.0f} crore")
    if row.get("original_end_date"):
        parts.append(f"originally due {row['original_end_date'][:7]}")
    if row.get("revised_end_date") and row.get("revised_end_date") != row.get("original_end_date"):
        parts.append(f"now expected {row['revised_end_date'][:7]}")
    place = row.get("district") or row.get("state")
    if place:
        parts.append(f"in {place}")
    return ". ".join(parts) + "." if parts else "Listed in MoSPI's monthly flash report."


def shape(rows: list[dict], source_url: str, today: date) -> list[dict]:
    shaped: list[dict] = []
    for row in rows:
        shaped.append(
            {
                "external_ref": row["external_ref"],
                "name": row["name"],
                "plain_summary": summarise(row),
                "department": row["department"],
                "sector": row["sector"],
                "state": row["state"],
                "district": row["district"],
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "budget_inr": row["revised_cost_inr"] or row["original_cost_inr"],
                "original_cost_inr": row["original_cost_inr"],
                "revised_cost_inr": row["revised_cost_inr"],
                "original_end_date": row["original_end_date"],
                "revised_end_date": row["revised_end_date"],
                "planned_end_date": row["original_end_date"],
                "time_overrun_months": row["time_overrun_months"],
                "status": status_for(row, today),
                "source_origin": "official",
                "verification_status": "verified",
                "confidence": 0.9,
                "published": True,
                "source_url": source_url,
                "source_page": row["source_page"],
            }
        )
    shaped.sort(key=lambda item: item["external_ref"])
    return shaped


def write_report(stats: Stats, rows: list[dict], source_url: str) -> str:
    top_headers = sorted(stats.headers.items(), key=lambda item: -item[1])[:12]
    lines = [
        "# MoSPI extraction report",
        "",
        f"- Source: {source_url}",
        f"- Run: {datetime.now().date().isoformat()}",
        f"- Pages: {stats.pages:,}",
        f"- Tables seen: {stats.tables:,} (matched the project shape: {stats.matched_tables:,})",
        f"- Rows seen: {stats.rows_seen:,}",
        f"- Rows kept: {stats.rows_kept:,}",
        f"- Dropped, no project name: {stats.dropped_no_name:,}",
        f"- Dropped, no cost and no date: {stats.dropped_no_figures:,}",
        "",
        "## Placement",
        "",
        f"- Matched to a city, with coordinates: {stats.located_city:,}",
        f"- Matched to a state only: {stats.located_state:,}",
        f"- Not placed: {stats.unlocated:,}",
        "",
        "Projects are placed only when their own name says where they are. Anything",
        "unplaced is left without coordinates rather than being put somewhere near.",
        "",
        "## Table headers encountered",
        "",
    ]
    for signature, count in top_headers:
        lines.append(f"- `{signature}` × {count}")
    if rows:
        lines += ["", "## First three rows kept", "", "```json",
                  json.dumps(rows[:3], indent=2, ensure_ascii=False), "```"]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true", help="print structure, write nothing")
    parser.add_argument("--url", help="parse one specific report URL")
    args = parser.parse_args()

    banner("Fetching the newest Flash Report")
    pdf, source_url = newest_report(args.url)

    banner("Extracting project rows")
    rows, stats = extract(pdf, args.inspect)

    banner("What the tables looked like")
    for signature, count in sorted(stats.headers.items(), key=lambda item: -item[1])[:15]:
        say(f"  ×{count:<4} {signature}")

    shaped = shape(rows, source_url, date.today())
    report = write_report(stats, shaped, source_url)
    say("\n" + report)

    if args.inspect:
        banner("--inspect: nothing written")
        return

    if not shaped:
        sys.exit("No rows extracted; refusing to write an empty dataset over a good one.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "projects.json").write_text(
        json.dumps(shaped, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "extraction-report.md").write_text(report, encoding="utf-8")
    banner(f"Wrote {len(shaped):,} rows to data/mospi/projects.json")


if __name__ == "__main__":
    main()
