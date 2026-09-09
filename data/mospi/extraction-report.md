# MoSPI extraction report

- Source: https://www.mospi.gov.in/sites/default/files/publication_reports/FlashReport_August_2024.pdf
- Run: 2026-09-09
- Pages: 248
- Tables seen: 243 (matched the project shape: 242)
- Rows seen: 2,326
- Rows kept: 2,049
- Dropped, no project name: 277
- Dropped, no cost and no date: 0

## Placement

- Matched to a city, with coordinates: 434
- Matched to a state only: 121
- Not placed: 1,494

Projects are placed only when their own name says where they are. Anything
unplaced is left without coordinates rather than being put somewhere near.

## Where rows are being lost

Table shapes that produced dropped rows, worst first. A shape losing
most of its rows is a layout the parser does not understand yet.


## Table headers encountered

- `state | sector | sl no | project name (agency name) (projec | date of approval (mm/yyyy) | date of commissioning original (re | cost original (revised) {anticipat | cumulative expenditure in rs. cror | physical progress (%)` × 25
- ` | agency_name |  | agency_name_short | ` × 4
- `sl. no. | state | projects | cost original (revised)* {anticipa | cumulative expenditure in rs. cror` × 3
- `sector | sl. no. | project name (agency name) (projec | original cost in rs. crore | date of commissioning original (mm | cumulative expenditure in rs. cror` × 3
- `sl. no. | sector | projects | cost original (revised)* {anticipa | cumulative expenditure in rs. cror` × 2
- `sector | sl. no. | project name (agency name) (projec | date of approval (mm/yyyy) | cost original (revised) {anticipat | date of commissioning original (re` × 2
- `sector | sl. no. | project name (agency name) (projec | original cost in rs. crore | date of commissioning original (mm | cumulative expenditure in rs. cror | progress (%)` × 2
- `` × 1
- ` | 9 | ajantha to buldhana (morth) (n2400 | 2/2017 | 7/2019 (n.a.) {12/2023} | 401.00 (401.00) {401.00} | 260.08 | 97` × 1
- ` | 18 | revamping of facilities at vizag t | 4/2018 | 4/2022 (mar-25) {3/2025} | 355.00 (n.a.) {355.00} | 238.15 | 76.8` × 1
- `27 | vijayawada-gudur (rvnl) (n22000369 | 4/2015 | 12/2023 (n.a.) {12/2024} | 3,246.26 (n.a.) {6,238.67} | 5,614.60 | 84` × 1
- `37 | 6l of pondavakkam to kannigaipair  | 2/2021 | 1/2025 (n.a.) {1/2025} | 818.73 (n.a.) {1,105.00} | 313.61 | 15.05` × 1

## First three rows kept

```json
[
  {
    "external_ref": "mospi:1000:chikali-to-dhad",
    "name": "Chikali to Dhad",
    "plain_summary": "Sanctioned at ₹189 crore. Promised by 2019-12, now expected 2024-03.",
    "department": "MoRTH",
    "sector": null,
    "state": null,
    "district": null,
    "latitude": null,
    "longitude": null,
    "budget_inr": 1894600000,
    "original_cost_inr": 1894600000,
    "revised_cost_inr": 1894600000,
    "original_end_date": "2019-12-01",
    "revised_end_date": "2024-03-01",
    "planned_end_date": "2019-12-01",
    "time_overrun_months": null,
    "status": "delayed",
    "source_origin": "official",
    "verification_status": "verified",
    "confidence": 0.9,
    "published": true,
    "source_url": "https://www.mospi.gov.in/sites/default/files/publication_reports/FlashReport_August_2024.pdf",
    "source_page": 154
  },
  {
    "external_ref": "mospi:1001:dhad-bhokardan-to-bhokardhan-sillod",
    "name": "Dhad Bhokardan to Bhokardhan Sillod",
    "plain_summary": "Sanctioned at ₹336 crore. Promised by 2019-12, now expected 2024-03.",
    "department": "MoRTH",
    "sector": null,
    "state": null,
    "district": null,
    "latitude": null,
    "longitude": null,
    "budget_inr": 3362100000,
    "original_cost_inr": 3362100000,
    "revised_cost_inr": 3362100000,
    "original_end_date": "2019-12-01",
    "revised_end_date": "2024-03-01",
    "planned_end_date": "2019-12-01",
    "time_overrun_months": null,
    "status": "delayed",
    "source_origin": "official",
    "verification_status": "verified",
    "confidence": 0.9,
    "published": true,
    "source_url": "https://www.mospi.gov.in/sites/default/files/publication_reports/FlashReport_August_2024.pdf",
    "source_page": 154
  },
  {
    "external_ref": "mospi:1002:parbhani-to-gangkhed",
    "name": "Parbhani to Gangkhed",
    "plain_summary": "Sanctioned at ₹238 crore. Promised by 2019-12, now expected 2023-10.",
    "department": "MoRTH",
    "sector": null,
    "state": null,
    "district": null,
    "latitude": null,
    "longitude": null,
    "budget_inr": 2381900000,
    "original_cost_inr": 2381900000,
    "revised_cost_inr": 2381900000,
    "original_end_date": "2019-12-01",
    "revised_end_date": "2023-10-01",
    "planned_end_date": "2019-12-01",
    "time_overrun_months": null,
    "status": "delayed",
    "source_origin": "official",
    "verification_status": "verified",
    "confidence": 0.9,
    "published": true,
    "source_url": "https://www.mospi.gov.in/sites/default/files/publication_reports/FlashReport_August_2024.pdf",
    "source_page": 154
  }
]
```
