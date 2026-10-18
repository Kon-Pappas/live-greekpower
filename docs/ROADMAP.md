# Roadmap

Order of work: safety first, then the data contract, then the new interface on top of stable, ready-made data.

## Phase 1: Safety fixes (done, 18 Oct 2026)
Future hours removed from the Live selector, freshness-aware status pill, strict JSON loading with atomic writes, external-only scheduling, per-workflow concurrency and push retries. See D02–D08.

## Phase 1b: Daylight saving (after 25 Oct 2026)
Check what ADMIE returned for 25 Oct, handle a 25-hour (and 23-hour) day in the scraper, the records and the page, then re-run 25 Oct (K01).

## Phase 2: Data contract (code done 18 Oct 2026, D15–D20; migration to run once)
- The builders compute what the page now computes in the browser: demand, UCE (signed, K03), daily totals. The records then use exactly the numbers the visitor sees.
- `xray_data.json` and `entsoe_ref.json` split into monthly files (K04).
- A small `manifest.json`: last update, next update, available dates. It drives the Last/Next Update row.
- Cache-busting only on the live file and the manifest.
- Timeouts on every request; drop or use the `co2` endpoint (K10).
- Today's future hours handled in the daily view (K07).
- Small tests for the demand formula and the records.

## Phase 3: Interface port
- Tailwind + Chart.js, with pinned library versions (D01).
- House shell: breadcrumb to the hub, title in the amber accent (D09), Last/Next Update row, date picker, Methodology button, GR | EN switch with `kp_lang` (D10).
- Start-up loading overlay paced step by step; methodology modal with fixed header (title and boxed ×), scrolling body and fixed footer (boxed Close), on desktop and mobile.
- Tabs as a 2×2 grid on mobile.
- The Live "ledger" (sources = SUM, balance = NET) is kept.
- One place for colour tokens instead of values repeated in JS and CSS.
- Hour labels made unambiguous (K09).

## Phase 4: Content
- Leaderboard split into supply and sinks (K06).
- Presentation of UCE and of the records ("since tracking began", K05).

## Phase 5: Documentation
`ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODS.md`; `METHODS` also feeds the methodology modal (D11).

## Family-wide (separate thread)
Pin CDN versions in every dashboard; replace the Tailwind play CDN, which is not meant for production.
