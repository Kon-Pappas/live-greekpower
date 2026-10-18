# Known issues and data caveats

Status: **open** (needs action or a decision), **accepted** (understood, no action planned), **watch** (monitor), **closed** (fixed; kept for the record).

| # | Date(s) | Issue | Impact | Status |
|---|---|---|---|---|
| K01 | 2026-10-25 (25-hour day) | Daylight-saving end. Both the page and the records skip any `hr > 24`. What ADMIE returns that day (an `hr = 25`, or 24 hours with one hour merged) has not been checked yet | One hour may be missing from the daily totals and records of 25 Oct; recoverable by re-running the day (D12) | open (after 25 Oct) |
| K02 | since the 15-minute day-ahead market | ADMIE's portal returns an **hourly** `dam_price_eur`; whether it is the mean of the four quarter-hours is not known | The MCP may differ from the ENTSO-E hourly values used in the other dashboards | open (question) |
| K03 | always | Unallocated clean energy (UCE) is clipped at 0 in the page | Hours where physical clean energy exceeds the live figure are hidden instead of shown | open (decide in phase 2) |
| K04 | since 2026-04-01 | `xray_data.json` and `entsoe_ref.json` grow without limit (about 1.3 MB each on 18 Oct); every file is fetched with a cache-busting timestamp | About 3.4 MB downloaded on every visit, never cached; slow on mobile | open (phase 2: monthly files) |
| K05 | always | "All-Time Records" means since tracking began. Records keep the maximum ever seen for an id, so a later **downward** revision by ADMIE never lowers a record | A wrong spike stays in the records until removed by hand | watch |
| K06 | always | The daily leaderboard ranks unlike quantities together (demand, total generation, exports and individual sources) | "#1 Demand, #2 Generation" says little | open (phase 4) |
| K07 | always | The daily chart for today includes hours that have not happened (price present, physical values 0) | The demand line drops to 0 for the rest of the day | open (phase 2) |
| K08 | always | Mixed languages: English tabs, bilingual leaderboard labels, Greek ADMIE keys; no language switch | Inconsistent with the other dashboards | open (phase 3) |
| K09 | always | Hour labels: `hr 1` (00:00–01:00) is shown as "01:00" | Ambiguous for readers expecting hour-beginning labels | open (phase 3) |
| K10 | always | Small code issues: `requests.get` without a timeout; the `co2` endpoint is defined but never called; malformed `xmlns` on the home icon | A hung request blocks the run until the job timeout | open (phase 2) |
| K11 | always | ADMIE names the North Macedonia interconnection `FYROM`; the page shows "North Macedonia" | None (display mapping) | accepted |
| K12 | until 2026-10-18 | The Live hour selector listed hours with no data yet | Empty charts | **closed** (D06) |
| K13 | until 2026-10-18 | The status pill said "Live" whatever the age of the data | A stalled pipeline looked live | **closed** (D07) |
| K14 | until 2026-10-18 | A corrupt `records.json` was silently replaced by records from the last 30 days | History loss | **closed** (D05) |
| K15 | until 2026-10-18 | GitHub cron and cron-job.org both triggered the scrape; the scrape pushed without rebasing | Duplicate runs; occasional failed pushes | **closed** (D02–D04) |
| K16 | until 2026-10-18 | A corrupt `xray_data.json` or `entsoe_ref.json` was silently replaced by the last two days of data | Loss of the whole history since 1 Apr 2026 | **closed** (D14) |
