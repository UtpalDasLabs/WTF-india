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

# How many report URLs to probe before giving up, so a throttling host cannot
# keep a runner busy until the job times out.
MAX_PROBES = 120

# One crore rupees. The report is denominated in crore throughout.
CRORE = 10_000_000


def say(*parts: object) -> None:
    print(*parts, flush=True)


def banner(text: str) -> None:
    say("\n" + "=" * 78)
    say(text)
    say("=" * 78)


# ---------------------------------------------------------------- fetching


def head(url: str, timeout: int = 20) -> int:
    """
    Is this report there? Asking with HEAD keeps a wrong guess cheap.

    It matters because the fallback list is long: probing each candidate with a
    full GET on a slow or throttling host turns a handful of 404s into minutes
    of dead waiting, and a run that should take two minutes into one that hits
    the job timeout.
    """
    request = urllib.request.Request(url, headers={"User-Agent": UA}, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:  # noqa: BLE001 - unreachable is just "not this one"
        return 0


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


# Pages that list the flash reports. Guessing filenames is how the data.gov.in
# attempt died, so links are read out of MoSPI's own pages first and the guesses
# are only a fallback.
LISTING_URLS = [
    "https://www.mospi.gov.in/publication/flash-report-central-sector-projects",
    "https://www.mospi.gov.in/flash-report-central-sector-projects",
    "https://www.mospi.gov.in/infrastructure-and-project-monitoring",
    "https://www.mospi.gov.in/publication",
    "https://www.mospi.gov.in/archive/publications",
]

PDF_LINK = re.compile(rb'href="([^"]+\.pdf)"', re.I)

# Reports this pipeline has actually downloaded and parsed. They are tried last,
# after everything newer, so a run always ends with real data rather than
# nothing — the alternative is an empty database because a guess ran out of
# attempts three months short of a report that exists.
KNOWN_REPORTS = [
    f"{BASE}/FlashReport_September_2024.pdf",
    f"{BASE}/FlashReport_May_2024.pdf",
]


def report_date(url: str) -> tuple[int, int]:
    """Sort key from a report filename: (year, month), zero when unreadable."""
    name = url.rsplit("/", 1)[-1]
    year = re.search(r"(20\d{2})", name)
    month = 0
    for index, full in enumerate(MONTHS, start=1):
        # Not \b: filenames separate words with "_", which is a word character,
        # so "\bMay" never matches "FlashReport_May_2024" and every report
        # sorts as month zero.
        if re.search(rf"(?<![A-Za-z]){full[:3]}", name, re.I):
            month = index
            break
    return (int(year.group(1)) if year else 0, month)


def discover_urls() -> list[str]:
    """Flash-report PDFs linked from MoSPI's own listing pages, newest first."""
    found: set[str] = set()
    for listing in LISTING_URLS:
        status, body = fetch(listing, timeout=45)
        if status != 200 or not body:
            say(f"  {status:>3}  {listing}")
            continue
        links = [link.decode("utf-8", "ignore") for link in PDF_LINK.findall(body)]
        flash = [link for link in links if "flash" in link.lower()]
        say(f"  200  {listing} — {len(links)} pdf links, {len(flash)} look like flash reports")
        for link in flash:
            if link.startswith("//"):
                link = f"https:{link}"
            elif link.startswith("/"):
                link = f"https://www.mospi.gov.in{link}"
            elif not link.startswith("http"):
                continue
            found.add(link)
    return sorted(found, key=report_date, reverse=True)


def guessed_urls(months_back: int = 44) -> list[str]:
    """
    Fallback when the listing pages give nothing. Reaches back far enough to
    cover the reports we already know exist: a run in 2026 that only tried the
    previous eighteen months found nothing at all, while May 2024 fetches fine.
    """
    urls: list[str] = []
    year, month = date.today().year, date.today().month
    for _ in range(months_back):
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        name = MONTHS[month - 1]
        urls += [
            f"{BASE}/FlashReport_{name}_{year}.pdf",
            f"{BASE}/FlashReport_{name[:3]}_{year}.pdf",
            f"{BASE}/Flash_Report_{name}_{year}.pdf",
        ]
    return urls


def candidate_list(discovered: list[str], cap: int = MAX_PROBES) -> list[str]:
    """
    What to probe, in order: links MoSPI published, then guesses newest-first,
    then the reports we have already downloaded successfully.

    The cap applies to the speculative part only. A previous run gave up three
    months short of a report that exists because the guess list was capped as a
    whole, so the anchors sit outside the cap by construction.
    """
    speculative = [url for url in [*discovered, *guessed_urls()] if url not in KNOWN_REPORTS]
    return [*speculative[:cap], *KNOWN_REPORTS]


def newest_report(explicit: str | None) -> tuple[bytes, str]:
    if explicit:
        status, body = fetch(explicit)
        if status == 200 and body[:4] == b"%PDF":
            return body, explicit
        sys.exit(f"Could not fetch {explicit} (status {status}).")

    say("Reading MoSPI's listing pages for flash report links:")
    discovered = discover_urls()
    if discovered:
        say(f"\n  {len(discovered)} linked reports, newest first:")
        for url in discovered[:6]:
            say(f"    {url}")
    else:
        say("\n  No links found; falling back to filename patterns.")

    # Cheap HEAD probes first, then one real download. Capped so a host that has
    # started refusing us cannot keep the runner busy until the job times out.
    for url in candidate_list(discovered):
        status = head(url)
        if status != 200:
            say(f"  {status:>3}  {url}")
            continue
        code, body = fetch(url, timeout=180)
        if code == 200 and body[:4] == b"%PDF":
            say(f"\n  using {url} ({len(body):,} bytes)")
            return body, url
        say(f"  {code:>3}  (HEAD said 200 but the body was not a PDF)  {url}")

    sys.exit(
        "No Flash Report could be fetched from either the listing pages or the "
        "filename patterns. Pass one explicitly with --url."
    )


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


def split_combined(value: str) -> tuple[str, str]:
    """
    MoSPI packs two figures into one cell: "Cost Original (Revised) {Anticipated}"
    and "Date of Commissioning Original (Revised/Anticipated)". The bare figure is
    the original promise; the bracketed one is what the agency now expects.

    Returns (original_text, latest_text). Anticipated wins over revised when both
    are printed, because anticipated is the more recent of the two.
    """
    text = clean(value)
    anticipated = re.findall(r"\{([^}]*)\}", text)
    revised = re.findall(r"\(([^)]*)\)", text)
    original = re.sub(r"\{[^}]*\}|\([^)]*\)", " ", text)
    latest = (anticipated[-1] if anticipated else "") or (revised[-1] if revised else "")
    return original, latest


PROJECT_CODE = re.compile(r"^[A-Z]{1,3}\d{5,}$")

# Organisation acronyms only: two to ten letters, no digits. "MoRTH" and
# "NHIDCL" pass; "PKG- 2A" and "old Ch KM 108.600 to KM 144" do not.
AGENCY_SHAPE = re.compile(r"^[A-Za-z][A-Za-z.&/ -]{1,9}$")

# Tokens that are acronyms or measurements, not words, and must not be title-cased.
KEEP_AS_IS = {
    "NH", "SH", "KM", "PKG", "MW", "KV", "LNG", "CGD", "STPP", "TPS", "HEP", "RCC",
    "MORTH", "NHIDCL", "NHAI", "BRO", "CPWD", "RVNL", "DFCCIL", "NTPC", "ONGC",
    "GAIL", "IOCL", "BPCL", "HPCL", "SAIL", "DMRC", "MRVC", "IRCON", "BSNL", "ISRO",
    "NEEPCO", "THDC", "SJVN", "NPCIL", "DVC", "KRCL", "MMRDA", "CIDCO", "II", "III", "IV",
}
SMALL_WORDS = {
    "and", "of", "to", "from", "the", "for", "in", "on", "at", "with", "by", "a", "an",
    "via", "near", "into", "over", "under", "between",
}


def title_case(text: str) -> str:
    """
    The report is set entirely in capitals, which reads as shouting on a page that
    is trying to be believed. This restores sentence case without flattening the
    acronyms and chainages that carry the meaning — NH 111, KM 163.400, MoRTH.
    """
    letters = [character for character in text if character.isalpha()]
    # Not .isupper(): "NH 111 SECTION (MoRTH)" is plainly shouting, but the one
    # lowercase letter in the agency's name makes .isupper() false.
    if not letters or sum(character.isupper() for character in letters) / len(letters) < 0.8:
        return text
    words: list[str] = []
    for index, token in enumerate(text.split()):
        core = token.strip("(),.;:-")
        if re.search(r"\d", token) or core.upper() in KEEP_AS_IS:
            words.append(token)
        elif index > 0 and core.lower() in SMALL_WORDS:
            words.append(token.lower())
        else:
            words.append(token.capitalize())
    return " ".join(words)


def split_name(raw: str, states: dict[str, str]) -> tuple[str, str | None]:
    """
    "NAME (AGENCY) (CODE) (STATE)" -> a readable name, and the agency.

    The trailing brackets are metadata the report appends to every row; leaving
    them in a headline makes every project look like a filing reference rather
    than a road somebody drives on.

    Only the trailing groups count. Project names contain brackets of their own
    ("(old Ch KM 108.600 to KM 144)", "(PKG-II)"), and reading the first bracket
    anywhere in the string filed those as the responsible agency — the field
    came out as "OLD CH KM 108.600 TO KM 144 KM 158.419 TO KM 173.300 PKG-II".
    """
    name = clean(raw)
    trailing: list[str] = []
    while True:
        match = re.search(r"\s*\(([^()]*)\)\s*$", name)
        if not match:
            break
        trailing.append(clean(match.group(1)))
        name = name[: match.start()].strip()

    agency: str | None = None
    # Innermost trailing group first: the report writes (AGENCY) (CODE) (STATE).
    for candidate in reversed(trailing):
        if not candidate or PROJECT_CODE.match(candidate) or candidate.lower() in states:
            continue
        # An agency is an organisation's short name — NHIDCL, MoRTH, ONGC.
        # Anything else in a trailing bracket is package or chainage metadata,
        # and letting it through produced departments like "PKG- 2A".
        if not AGENCY_SHAPE.match(candidate):
            continue
        agency = candidate
        break

    return title_case(name), agency


def parse_int(value: str) -> int | None:
    text = clean(value).replace(",", "")
    match = re.search(r"-?\d+", text)
    return int(match.group(0)) if match else None


# Column classification. The report's headers are not stable between years, so
# columns are identified by what the words mean rather than by position.
COLUMN_RULES: list[tuple[str, list[str], list[str]]] = [
    # (field, header must contain any of, and none of)
    #
    # Order matters: the combined columns are checked before the plain ones,
    # because "cost original (revised) {anticipated}" contains the word "cost"
    # and would otherwise be read as a single figure — which is how the first
    # real run threw away 417 of 505 rows.
    ("serial", ["sl. no", "sl.no", "sl no", "s. no", "s.no", "serial"], []),
    # Checked before "name" so a standalone code column is consumed rather than
    # mistaken for the project's name. It cannot swallow the real name column,
    # which says "name" — as in "Project Name (Agency Name) (Project Code)".
    ("code", ["project code", "project id"], ["name"]),
    ("name", ["project name", "name of project", "projects", "project"], ["cost", "date", "status"]),
    # Matched on the bracket that holds the revision, not merely on the word
    # "cost": "Original Cost (Rs. crore)" is a single figure and must not be
    # split, while "Cost Original (Revised) {Anticipated}" holds two.
    ("cost_combined", ["cost original (", "cost original{", "original cost (revised"], []),
    ("date_combined", ["commissioning original ("], []),
    ("original_cost", ["original cost", "orig. cost", "sanctioned cost", "approved cost"], []),
    ("revised_cost", ["anticipated cost", "revised cost", "latest cost", "current cost"], []),
    ("original_date", ["original date", "original schedule", "orig. date"], []),
    ("revised_date", ["anticipated date", "revised date", "latest date"], []),
    ("expenditure", ["cumulative expenditure", "expenditure", "expdr"], []),
    ("time_overrun", ["time overrun", "delay (in months)", "delay in months"], []),
    ("state_col", ["state"], []),
    ("sector_col", ["sector"], []),
    ("agency", ["agency", "ministry", "department", "implementing"], ["project name"]),
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
    # header signature -> [kept, dropped]; and a couple of dropped rows verbatim.
    per_shape: dict[str, list[int]] = field(default_factory=dict)
    samples: dict[str, list[list[str]]] = field(default_factory=dict)
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
    carry: dict[str, str] | None = None,
    reuse: tuple[dict[int, str], int] | None = None,
) -> list[dict]:
    """
    One table to zero or more project rows. Split out of the PDF walk so the
    part that decides what counts as a project can be tested without a 500-page
    document, and so a change to the rules is reviewable on its own.
    """
    if not table:
        return []

    carry = carry if carry is not None else {}
    header = [clean(cell) for cell in table[0]]
    stats.headers[header_signature(header)] = stats.headers.get(header_signature(header), 0) + 1
    mapping = classify(header)

    signature = header_signature(header)
    tally = stats.per_shape.setdefault(signature, [0, 0])

    if "name" in mapping.values():
        body = table[1:]
    elif reuse is not None and len(header) == reuse[1]:
        # A long table continues onto the next page without repeating its
        # header, so this table's first row is data, not a header. Matching on
        # the column count is what tells the two apart. Without this those
        # continuation pages are dropped whole — 17 of the 56 tables in the
        # August 2024 report.
        mapping = reuse[0]
        body = table
    else:
        return []

    if not body:
        return []
    stats.matched_tables += 1

    out: list[dict] = []
    for raw in body:
        stats.rows_seen += 1
        values = {
            field_name: clean(raw[index]) if index < len(raw) else ""
            for index, field_name in mapping.items()
        }

        raw_name = values.get("name", "")
        # Continuation and subtotal lines carry no usable project name.
        if len(raw_name) < 8 or raw_name.lower().startswith(("total", "sub total", "grand total")):
            stats.dropped_no_name += 1
            continue

        name, agency = split_name(raw_name, states)

        # The report prints original and latest in one cell far more often than
        # it gives them separate columns, so read the combined form first and
        # fall back to any single-purpose columns.
        cost_original, cost_latest = split_combined(values.get("cost_combined", ""))
        date_original, date_latest = split_combined(values.get("date_combined", ""))

        original_cost = parse_money_crore(cost_original) or parse_money_crore(
            values.get("original_cost", "")
        )
        revised_cost = parse_money_crore(cost_latest) or parse_money_crore(
            values.get("revised_cost", "")
        )
        original_date = parse_month_year(date_original) or parse_month_year(
            values.get("original_date", "")
        )
        revised_date = parse_month_year(date_latest) or parse_month_year(
            values.get("revised_date", "")
        )

        # A row with neither money nor a date says nothing we can use, and
        # inventing either is the one thing this must never do.
        if original_cost is None and original_date is None and revised_date is None:
            stats.dropped_no_figures += 1
            tally[1] += 1
            kept_samples = stats.samples.setdefault(signature, [])
            if len(kept_samples) < 2:
                kept_samples.append([clean(cell)[:38] for cell in raw])
            continue

        serial = values.get("serial", "") or str(stats.rows_kept + 1)
        ref = f"mospi:{slug(serial)}:{slug(name)}"
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        # State and sector are printed once and left blank down the rest of the
        # block, so a blank cell means "same as above" rather than "unknown".
        # Reading it as unknown left three quarters of the rows unplaced and put
        # a Manipur road under "Railways" from a stale page-level guess.
        for column in ("state_col", "sector_col"):
            value = clean(values.get(column, ""))
            if value:
                carry[column] = value

        district, state, lat, lng = locate(raw_name, places, states)
        column_state = states.get(carry.get("state_col", "").lower())
        if column_state:
            state = column_state
            if lat is None:
                # The state is known even when the exact place is not.
                district = None
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
                # Deliberately not set. The report has a sector column, but it
                # is printed once per block and blank thereafter, and its tables
                # run across pages, so a row's sector cannot be tied to it
                # reliably: two runs put NHIDCL highways under "Railways" and
                # ONGC refineries under "Health And". A field that is wrong is
                # worse than a field that is missing on a page asking to be
                # believed, so it stays empty until there is a way to get it
                # right — the agency and the project's own name carry the
                # meaning in the meantime.
                "sector": None,
                "department": agency or values.get("agency") or None,
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
        tally[0] += 1
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
    # A blank state or sector cell means "same as the row above", so the last
    # seen value carries down the document.
    carry: dict[str, str] = {}
    # The header of the last real header row, reused for continuation pages.
    reuse: tuple[dict[int, str], int] | None = None
    # Only a last resort now that the report's own sector column is read.
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
                if not table:
                    continue
                mapping = classify([clean(cell) for cell in table[0]])
                if "name" in mapping.values():
                    reuse = (mapping, len(table[0]))
                    # A new header starts a new section, so the carried state and
                    # sector stop here. Letting them run on filed ONGC refineries
                    # under "Health And" and NHIDCL roads under "Railways",
                    # because the last value seen simply never expired.
                    carry.clear()
                rows.extend(
                    rows_from_table(
                        table, sector, page_number, places, states, stats, seen_refs, carry, reuse
                    )
                )

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
    """
    One plain sentence a person can read without knowing what a flash report is.
    Built only from figures the report published, so it says less about a
    thinly-documented project rather than padding it out.
    """
    place = row.get("district") or row.get("state")
    where = f" in {place}" if place else ""

    original = row.get("original_cost_inr")
    revised = row.get("revised_cost_inr")
    due = row.get("original_end_date")
    now_due = row.get("revised_end_date")

    parts: list[str] = []
    if original:
        opening = f"Sanctioned at ₹{original / CRORE:,.0f} crore{where}"
        if revised and revised > original:
            opening += f", now expected to cost ₹{revised / CRORE:,.0f} crore"
        parts.append(opening)
    elif where:
        parts.append(f"A central government project{where}")

    if due:
        promised = f"Promised by {due[:7]}"
        if now_due and now_due != due:
            promised += f", now expected {now_due[:7]}"
        parts.append(promised)
    elif now_due:
        parts.append(f"Expected {now_due[:7]}")

    if not parts:
        return "Listed in MoSPI's monthly flash report on central sector projects."
    return ". ".join(parts) + "."


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
        "## Where rows are being lost",
        "",
        "Table shapes that produced dropped rows, worst first. A shape losing",
        "most of its rows is a layout the parser does not understand yet.",
        "",
    ]
    for signature, (kept, dropped) in sorted(
        stats.per_shape.items(), key=lambda item: -item[1][1]
    )[:10]:
        if dropped == 0:
            continue
        lines.append(f"- **{dropped:,} dropped, {kept:,} kept** — `{signature}`")
        for sample in stats.samples.get(signature, []):
            lines.append(f"    - sample row: `{sample}`")
    lines += [
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
