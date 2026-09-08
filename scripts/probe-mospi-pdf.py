"""
Tests whether MoSPI's monthly Flash Report PDFs can be parsed into project rows.

Background: data.gov.in's resource API works and returns clean JSON, but every
route to DISCOVER a resource id is closed — /catalog 404s, the datagovindia
index times out from CI, and the portal's search pages are client-rendered so
they serve zero uuids. Meanwhile the per-project table we actually want, with
original versus revised cost and completion date, is published in these PDFs.

So this asks three questions in order, and stops being useful the moment one
fails: can a runner fetch the PDF, does it contain extractable tables, and do
those tables carry the columns the Hall of Shame needs.

Nothing here writes to the database. It prints and exits.
"""

import io
import sys
import urllib.error
import urllib.request

UA = "Mozilla/5.0 (compatible; wtf-india-probe/1.0)"
BASE = "https://www.mospi.gov.in/sites/default/files/publication_reports"

# The naming has drifted over the years, so try a spread rather than one guess.
CANDIDATES = [
    f"{BASE}/FlashReport_May_2024.pdf",
    f"{BASE}/FlashReport_April_2024.pdf",
    f"{BASE}/FlashReport_Jan_2024.pdf",
    f"{BASE}/Flash_Report_May_2024.pdf",
    f"{BASE}/FlashReport_March_2024.pdf",
]

# Words that would appear in the header row of the table we are looking for.
WANTED = ["project", "original", "revised", "anticipated", "cost", "completion", "date"]


def say(*parts: object) -> None:
    print(*parts, flush=True)


def banner(text: str) -> None:
    say("\n" + "=" * 78)
    say(text)
    say("=" * 78)


def fetch(url: str, timeout: int = 90) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, b""
    except Exception as error:  # noqa: BLE001 - a probe reports, it does not raise
        say(f"    {type(error).__name__}: {error}")
        return 0, b""


banner("STEP 1 — can a runner fetch a Flash Report PDF at all?")
pdf: bytes | None = None
source = ""
for url in CANDIDATES:
    status, body = fetch(url)
    looks_pdf = body[:4] == b"%PDF"
    say(f"  {status:>3}  {len(body):>9,} bytes  pdf={looks_pdf}  {url}")
    if status == 200 and looks_pdf and pdf is None:
        pdf, source = body, url

if pdf is None:
    banner("No PDF retrieved")
    say("Either the URL pattern has changed or mospi.gov.in refuses this client.")
    say("A 403 means the host is picky about headers; a 404 means the filename")
    say("pattern is wrong and we need a real link from the publications page.")
    sys.exit(0)

say(f"\nusing {source} ({len(pdf):,} bytes)")

banner("STEP 2 — does it contain extractable tables?")
try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber is not installed.")

with pdfplumber.open(io.BytesIO(pdf)) as document:
    say(f"pages: {len(document.pages)}")

    # The per-project table sits behind the summary pages, so scan a way in.
    hits = 0
    for index, page in enumerate(document.pages[:40]):
        tables = page.extract_tables()
        if not tables:
            continue
        for table in tables:
            if not table or len(table) < 2:
                continue
            header = [str(c or "").strip().lower().replace("\n", " ") for c in table[0]]
            joined = " | ".join(header)
            matched = [w for w in WANTED if w in joined]
            if len(matched) < 2:
                continue
            hits += 1
            say(f"\n--- page {index + 1}, {len(table)} rows, {len(table[0])} cols")
            say(f"    header: {header}")
            for row in table[1:3]:
                cleaned = [str(c or "").strip().replace("\n", " ")[:40] for c in row]
                say(f"    row: {cleaned}")
            say(f"    header words matched: {matched}")
            if hits >= 4:
                break
        if hits >= 4:
            break

    if hits == 0:
        say("\nNo table matched. Dumping the first table found, whatever it is:")
        for index, page in enumerate(document.pages[:25]):
            tables = page.extract_tables()
            if tables and tables[0] and len(tables[0]) > 1:
                say(f"  page {index + 1} header: {tables[0][0]}")
                say(f"  page {index + 1} row 1:  {tables[0][1]}")
                break
        say("\nIf tables come out empty the PDF is likely scanned images, which")
        say("would mean OCR — a different and much larger job.")

banner("Done")
