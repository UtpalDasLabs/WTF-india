"""
Tests for the MoSPI parser.

The pipeline runs on a GitHub runner against a 500-page PDF that this sandbox
cannot reach, so the rules that decide what counts as a project — and what gets
dropped rather than guessed — are tested here against tables written by hand in
the shapes the report actually uses.

Run: python -u scripts/test_ingest_mospi.py
"""

from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "ingest_mospi", Path(__file__).resolve().parent / "ingest-mospi.py"
)
assert spec and spec.loader
ingest = importlib.util.module_from_spec(spec)
sys.modules["ingest_mospi"] = ingest
spec.loader.exec_module(ingest)

CRORE = ingest.CRORE
failures: list[str] = []


def check(label: str, got: object, want: object) -> None:
    if got != want:
        failures.append(f"{label}\n    got:  {got!r}\n    want: {want!r}")


# ------------------------------------------------------------------ money

check("plain crore", ingest.parse_money_crore("1,234.56"), int(round(1234.56 * CRORE)))
check("integer crore", ingest.parse_money_crore("980"), 980 * CRORE)
check("blank is unknown", ingest.parse_money_crore(""), None)
check("dash is unknown", ingest.parse_money_crore("-"), None)
check("NA is unknown", ingest.parse_money_crore("N.A."), None)
# The distinction that matters most: unknown must never become zero, or a
# project with no published cost reads as a free one.
check("unknown is not zero", ingest.parse_money_crore("NA") is None, True)

# ------------------------------------------------------------------ dates

check("mm/yyyy", ingest.parse_month_year("03/2019"), "2019-03-01")
check("mm-yyyy", ingest.parse_month_year("11-2021"), "2021-11-01")
check("Mon-yy", ingest.parse_month_year("Mar-19"), "2019-03-01")
check("Month yyyy", ingest.parse_month_year("March 2019"), "2019-03-01")
check("full date", ingest.parse_month_year("15/08/2022"), "2022-08-15")
check("bare year is not enough", ingest.parse_month_year("2019"), None)
check("blank date", ingest.parse_month_year(""), None)
check("month 13 rejected", ingest.parse_month_year("13/2019"), None)

# ------------------------------------------------------------- report naming

# "_" is a word character, so a \b before the month name never matches a real
# filename and every report sorts as month zero — which silently picks an
# arbitrary report as "newest".
check("May 2024 filename", ingest.report_date("https://x/FlashReport_May_2024.pdf"), (2024, 5))
check("full month name", ingest.report_date("https://x/Flash_Report_January_2026.pdf"), (2026, 1))
check("short month name", ingest.report_date("https://x/FlashReport_Sep_2025.pdf"), (2025, 9))
check("unreadable name", ingest.report_date("https://x/report.pdf"), (0, 0))
check(
    "newest first within one year",
    [
        url.rsplit("/", 1)[-1]
        for url in sorted(
            ["a/FlashReport_Mar_2024.pdf", "a/FlashReport_Dec_2024.pdf", "a/FlashReport_May_2024.pdf"],
            key=ingest.report_date,
            reverse=True,
        )
    ],
    ["FlashReport_Dec_2024.pdf", "FlashReport_May_2024.pdf", "FlashReport_Mar_2024.pdf"],
)

# ------------------------------------------------------------------ columns

header = [
    "Sl. No",
    "Project Name",
    "Original Cost (Rs. crore)",
    "Anticipated Cost (Rs. crore)",
    "Original Date of commissioning",
    "Anticipated Date of Commissioning",
    "Cumulative Expenditure (Rs. crore)",
    "Time Overrun (months)",
]
mapping = ingest.classify(header)
check(
    "columns classified",
    [mapping.get(index) for index in range(len(header))],
    [
        "serial",
        "name",
        "original_cost",
        "revised_cost",
        "original_date",
        "revised_date",
        "expenditure",
        "time_overrun",
    ],
)

# The 2024 reports use a shorter header; position must not be assumed.
short = ["S.No", "Name of Project", "Sanctioned Cost", "Original Date"]
short_map = ingest.classify(short)
check(
    "short header classified",
    [short_map.get(index) for index in range(len(short))],
    ["serial", "name", "original_cost", "original_date"],
)

# ------------------------------------------------------------------ rows

places, states = ingest.load_gazetteer()
check("gazetteer loaded", len(places) > 40, True)

stats = ingest.Stats()
table = [
    header,
    ["1", "Jaipur Metro Rail Phase 1C", "980.00", "1,450.00", "03/2019", "06/2026", "760.00", "87"],
    # No name: a continuation line.
    ["", "", "", "", "", "", "", ""],
    # A total line must never become a project.
    ["", "Total of Railways sector", "5,000.00", "6,000.00", "", "", "", ""],
    # Neither cost nor date: nothing usable, so it is dropped rather than filled.
    ["4", "Some Unnamed Bridge Project", "-", "NA", "-", "", "", ""],
    ["5", "Chennai Port Connectivity Road", "300.00", "", "07/2020", "", "150.00", ""],
]
rows = ingest.rows_from_table(table, "Railways", 42, places, states, stats, set())

check("two rows kept", len(rows), 2)
check("subtotal dropped", stats.dropped_no_name, 2)
check("no-figures row dropped", stats.dropped_no_figures, 1)

first = rows[0]
check("name", first["name"], "Jaipur Metro Rail Phase 1C")
check("original cost", first["original_cost_inr"], 980 * CRORE)
check("revised cost", first["revised_cost_inr"], 1450 * CRORE)
check("original date", first["original_end_date"], "2019-03-01")
check("revised date", first["revised_end_date"], "2026-06-01")
check("time overrun", first["time_overrun_months"], 87)
check("sector carried down", first["sector"], "Railways")
check("page recorded", first["source_page"], 42)
check("located to Jaipur", first["district"], "Jaipur")
check("state from city", first["state"], "Rajasthan")
check("has coordinates", first["latitude"] is not None, True)
check("stable ref", first["external_ref"], "mospi:1:jaipur-metro-rail-phase-1c")

second = rows[1]
check("missing revised cost stays unknown", second["revised_cost_inr"], None)
check("located to Chennai", second["district"], "Chennai")

# A project whose name says nothing about where it is gets no coordinates.
placeless = ingest.rows_from_table(
    [header, ["9", "National Fertiliser Plant Expansion Unit", "500.00", "", "01/2018", "", "", ""]],
    None,
    1,
    places,
    states,
    ingest.Stats(),
    set(),
)
check("unplaced has no coordinates", placeless[0]["latitude"], None)
check("unplaced has no district", placeless[0]["district"], None)

# ------------------------------------------------------------------ status

check(
    "overdue reads as delayed",
    ingest.status_for({"original_end_date": "2019-03-01", "revised_end_date": None}, date(2026, 9, 8)),
    "delayed",
)
check(
    "future revised date reads as ongoing",
    ingest.status_for({"original_end_date": "2019-03-01", "revised_end_date": "2027-01-01"}, date(2026, 9, 8)),
    "ongoing",
)
check(
    "no date reads as ongoing, never completed",
    ingest.status_for({"original_end_date": None, "revised_end_date": None}, date(2026, 9, 8)),
    "ongoing",
)

# ------------------------------------------------------------------ shaping

shaped = ingest.shape(rows, "https://example.gov/report.pdf", date(2026, 9, 8))
check("shaped count", len(shaped), 2)
check("budget prefers the revised figure", shaped[0]["budget_inr"], 1450 * CRORE)
check("planned_end_date is the original promise", shaped[0]["planned_end_date"], "2019-03-01")
check("marked official", shaped[0]["source_origin"], "official")
check("sorted by ref", [row["external_ref"] for row in shaped], sorted(row["external_ref"] for row in shaped))
check("summary mentions the overrun", "1,450 crore" in shaped[0]["plain_summary"], True)
check("no project is claimed finished", [row for row in shaped if row["status"] == "completed"], [])

# ------------------------------------------------------------------ result

if failures:
    print(f"\n{len(failures)} FAILED\n")
    for failure in failures:
        print(f"  {failure}\n")
    sys.exit(1)
print("all parser tests passed")
