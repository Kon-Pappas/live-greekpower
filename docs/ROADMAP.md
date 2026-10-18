# Roadmap

Order of work: safety first, then the data contract, then the new interface on top of stable, ready-made data.

## Phase 1: Safety fixes (done, 18 Oct 2026)
Future hours removed from the Live selector, freshness-aware status pill, strict JSON loading with atomic writes, external-only scheduling, per-workflow concurrency and push retries. See D02–D08.

## Phase 1b: Daylight saving (after 25 Oct 2026)
Check what ADMIE returned for 25 Oct, handle a 25-hour (and 23-hour) day in the scraper, the records and the page, then re-run 25 Oct (K01).

## Phase 2: Data contract (done 18 Oct 2026, D15–D20)
- The builders compute what the page now computes in the browser: demand, UCE (signed, K03), daily totals. The records then use exactly the numbers the visitor sees.
- `xray_data.json` and `entsoe_ref.json` split into monthly files (K04).
- A small `manifest.json`: last update, next update, available dates. It drives the Last/Next Update row.
- Cache-busting only on the live file and the manifest.
- Timeouts on every request; drop or use the `co2` endpoint (K10).
- Today's future hours handled in the daily view (K07).
- Small tests for the demand formula and the records.

## Phase 3: Interface port (done 18 Oct 2026, D21–D25)
- Tailwind + Chart.js, with pinned library versions (D01).
- House shell: breadcrumb to the hub, title in the amber accent (D09), Last/Next Update row, date picker, Methodology button, GR | EN switch with `kp_lang` (D10).
- Start-up loading overlay paced step by step; methodology modal with fixed header (title and boxed ×), scrolling body and fixed footer (boxed Close), on desktop and mobile.
- Tabs as a 2×2 grid on mobile.
- The Live "ledger" (sources = SUM, balance = NET) is kept.
- One place for colour tokens instead of values repeated in JS and CSS.
- Hour labels made unambiguous (K09).

## Phase 3b: Clean-up (done 18 Oct 2026, D29)
- Stop writing the old files (`live_data.json`, `xray_data.json`, `entsoe_ref.json`) and delete them, together with `css/styles.css` and `migrate_v2.py` / its workflow (D20).

## Phase 3c: Full history (code done 18 Oct 2026, D30–D32)
- Run *Backfill live history* once (1 Apr–17 Sep), then let the hourly scrape rebuild records and manifest.
- Re-check the UCE findings of K18 on 6.5 months.

## Phase 4: Content
- Leaderboard split done early (D24).
- Decomposition of UCE on the page (unmetered solar ≈ k × MV solar, distribution wind, rest), once K18 is confirmed on the full history.
- Further ideas for the page, to be discussed.

## Phase 5: Documentation
`ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODS.md`; `METHODS` also feeds the methodology modal (D11).

## Family-wide (separate thread)
Pin CDN versions in every dashboard; replace the Tailwind play CDN, which is not meant for production.
