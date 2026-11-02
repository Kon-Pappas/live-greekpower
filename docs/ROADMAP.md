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

## Phase 3d: ADMIE and ENTSO-E (code done 18 Oct 2026, D33–D35)
- Run *ENTSO-E history refresh* once (1 Apr – 15 days ago): load and final values for the whole history.
- Then check K19: is ENTSO-E load lower than ADMIE load by about the low-voltage estimate?

## Phase 3e: The load gap (code done 18 Oct 2026, D36–D37)
- Run *X-Ray history refresh* once (1 Apr – 3 days ago); then test K19: does the Crete flow explain the night/evening part of the ADMIE–ENTSO-E load gap?

## Phase 3f: UI/UX round (done 18 Oct 2026, D38–D40)
Live layout, donut callouts, clean/fossil shares, MCP card, daily ribbon, short intros with methodology links, record cards with progression modal, footer rule.

## Phase 3g: Crete and the layers of load (done 19 Oct 2026, D41–D42; K19 confirmed on 1 Apr–3 Oct)
- Live backfill (1 Apr–17 Oct) and X-Ray refresh (1 Apr–17 Jun) run on 19 Oct 2026; K19 re-tested and closed.

## Phase 4: Analysis tab (code done 19 Oct 2026, D46)
- Run *Analysis history refresh* once (1 Apr – 3 days ago), not near 10:15 / 13:30.
- From then on the X-Ray workflow adds the day before yesterday and yesterday every morning.

## Phase 4c: Live source change (1 Nov 2026, D50, K21)
1. Upload batch23. 2. Run *Probe live source* (date 20261028) → all ✓. 3. Next hourly scrape resumes from admie.gr. 4. *Backfill live history* 29 Oct → yesterday. 5. *Analysis history refresh* for the same days.
- Later: use `RES_SYSTEM` / `RES_NETWORK` (transmission / distribution RES, live, hourly) in the analysis.

## Phase 4b: Further content
- Leaderboard split done early (D24).
- Decomposition of UCE on the page (unmetered solar ≈ k × MV solar, distribution wind, rest), once K18 is confirmed on the full history.
- Further ideas for the page, to be discussed.

## Phase 5: Documentation
`ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODS.md`; `METHODS` also feeds the methodology modal (D11).

## Family-wide (separate thread)
Pin CDN versions in every dashboard; replace the Tailwind play CDN, which is not meant for production.

## Ideas to study (not on the page)
- **Curtailment of transmission solar, seen live in the RES split (study, 2 Nov 2026; not on the page yet).**
  - *Idea (owner):* transmission-connected RES is curtailed in midday surplus hours; ADMIE's RES line shows a dip.
  - *Method:* transmission solar ≈ `res_system` − transmission wind (SCADA, X-Ray); distribution ≈ `res_network` (mostly solar at midday). Without curtailment their ratio is nearly stable within a day (same sun); a curtailment of transmission solar lowers it.
  - *Against prices (Jun–Oct, 1 Apr–2 Nov data):* at midday the ratio is 12–25 % lower in hours with a day-ahead price ≤ 0 € than in hours > 20 € **of the same month**; on sunny days it falls by an extra 18 % at midday when the whole midday is ≤ 0 € (0.78 vs 0.95, the latter being the normal midday dip of tracker parks). Rough lower bound of missing transmission solar Jun–Oct ≈ 200 GWh.
  - *Against ADMIE's official curtailment orders* (monthly reports "περιορισμοί έγχυσης σταθμών ΑΠΕ ΕΣΜΗΕ ανά 15λεπτο", admie.gr → Σύστημα → Λειτουργία → Περιορισμοί ΑΠΕ; Aug and Sep 2026 as xlsx, earlier months as html; transmission stations only): clear dose–response between the depth of the order for PV (1 − Σ max allowed / Σ reference power) and the drop of our live ratio, 425 midday hours: no order −2 %, depth 20–40 % +3 %, **40–60 % +17 %**, **60–100 % +21 %**; correlation +0.42. Shallow orders barely bind (PV at noon already runs at ≈70–80 % of its rating). When our drop exceeds 15 %, ≈77 % of those hours had an order; it catches ≈30 % of all order hours, i.e. the deep ones. Only half of the order hours had a price ≤ 0 €, so price is a poor guide.
  - *Caveats:* under RAAEY decision E-52/2025 orders also go to distribution stations > 400 kW (through HEDNO's virtual station), so the ratio measures how much **more** transmission is cut than distribution, not total curtailment (market estimates from ISP, e.g. Green Tank: Jun 298 GWh, Jan–Aug 1,905 GWh, are 3–4 × our lower bound). Part of a dip may be economic self-curtailment at negative prices. Clouds over large parks can also cause a dip.
  - *Next:* extend the check to Jun–Jul (owner downloads the html reports); then discuss and mock up an on-page indication "possible curtailment of transmission solar" (live, midday, drop > 15 %), clearly labelled as an indication, not an official figure.
