# Greek Power Live — hourly balance of the Greek power system

**Live:** https://kon-pappas.github.io/live-greekpower/  ·  **Hub:** https://kon-pappas.github.io/

Hourly analytics of the Greek electricity system from public ADMIE/IPTO and ENTSO-E data: where each hour's
energy came from and where it went, the day-ahead price, cross-border flows, a two-day-later cross-check of clean
generation, and all-time records.

*Ελληνικά, σύντομα:* ωριαία ανάλυση του ελληνικού συστήματος ηλεκτρικής ενέργειας από δημόσια δεδομένα ΑΔΜΗΕ και
ENTSO-E: από πού ήρθε η ενέργεια κάθε ώρας και πού πήγε, τιμή επόμενης ημέρας, διασυνοριακές ροές, διασταύρωση της
καθαρής παραγωγής με τα εκ των υστέρων αρχεία και ρεκόρ. Όλη η τεκμηρίωση είναι στον φάκελο `docs/`.

## What the page shows
| Tab | Content |
|---|---|
| Live (hour) | Generation ledger (lignite + gas + hydro + RES = total, with clean and fossil shares), two donuts with labelled slices (sources, uses), cross-border flows per country, system-balance ledger (generation + imports − exports + BESS discharge − BESS charge − pumping = demand, checked against ADMIE's total load) and the hour's day-ahead price |
| Daily | Where the day's energy came from and where it went, with shares; 24-hour stacked dispatch with demand and the day-ahead price |
| Clean energy | Metered clean generation (ADMIE ex-post SCADA + medium-voltage RESMV, cogeneration excluded) against ADMIE's live RES + hydro (cogeneration removed as well); the difference is the unallocated clean energy (UCE, signed): distribution-level generation ADMIE estimates but does not meter. ADMIE vs ENTSO-E for solar and wind, the day's ADMIE–ENTSO-E comparison (clean share, RES, solar revision, load) and total load |
| Records | The #1 hourly and daily value per category since tracking began; each opens its progression and the top five; new records are flagged |

On the Live and Daily tabs, "RES" is ADMIE's figure, which includes cogeneration (CHP).

Greek and English (the choice is shared across the hub's dashboards). Methodology and sources are in the page's
*Methodology & Sources* window.

## How it works (one paragraph)
`scraper.py` runs every hour at minute 5 and fetches ADMIE's market portal (generation mix and load, day-ahead
market, SCADA interconnection flows) for yesterday and today. `xray_builder.py` (ADMIE ex-post SCADA and RESMV files)
and `entsoe_builder.py` (ENTSO-E actual generation per type) run daily at 10:15, with a 13:30 fallback, for the two
previous days. All three write through `contract.py`, which defines the data files (one per day and per source) and
computes demand, totals, UCE, the records and the manifest; the page only draws. Both workflows are triggered by an
external cron service (cron-job.org) through `workflow_dispatch`. Details and reasons: [docs/DECISIONS.md](docs/DECISIONS.md).

## Repository map
```
index.html                    the page (Tailwind + Chart.js, pinned versions; accent colour set in one place at the top)
js/dashboard.js               all page logic; reads only the data files below
scraper.py                    hourly: ADMIE market portal → data/live/, records, manifest
xray_builder.py               daily: ADMIE ex-post files → data/xray/ (with UCE)
entsoe_builder.py             daily: ENTSO-E A75 generation + A65 load → data/entsoe/ (first and latest version kept)
recompute_uce.py              recomputes UCE in stored X-Ray files (local only, no download)
contract.py                   data contract (schema v1): file layout, derived values, records, manifest
jsonio.py                     safe JSON reading (stop on a corrupt file) and atomic writing
data/manifest.json            latest hour, next update, available days
data/live/YYYY-MM-DD.json     hourly live balance and day totals (written by scraper only)
data/xray/YYYY-MM-DD.json     hourly ex-post clean generation, UCE, Crete flows, SCADA net load (written by xray_builder only)
data/entsoe/YYYY-MM-DD.json   hourly ENTSO-E generation and load, first and latest version (written by entsoe_builder only)
data/records.json             top-three records
data/live_raw.json            scraper's merge memory for yesterday and today (not read by the page)
.github/workflows/            scrape.yml (hourly), xray.yml (daily), backfill.yml (manual: history + UCE recompute), entsoe_refresh.yml (manual: ENTSO-E history), xray_refresh.yml (manual: SCADA/RESMV history)
docs/                         DECISIONS, KNOWN_ISSUES, ROADMAP
```

## Conventions
- All times are Greek local time. ADMIE numbers hours 1–24 (hour 1 = 00:00–01:00); the page labels hours by their start.
- Values are MWh in one hour (equal to the average MW). `null` means "no value", `0` means "measured zero".
- Every data file has exactly one writer, so the two workflows never touch the same file.

## Data sources
ADMIE/IPTO (Independent Power Transmission Operator) market portal and operation-market files;
ENTSO-E Transparency Platform. The data belong to their publishers; this repository only processes and displays them.

---
Konstantinos Pappas · Energy Market Analyst
