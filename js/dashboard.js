'use strict';
/* =====================================================================
   Greek Power Live — dashboard (φάση 3)
   Διαβάζει ΜΟΝΟ τη νέα δομή δεδομένων (schema v1, βλ. contract.py):
     data/manifest.json, data/live|xray|entsoe/YYYY-MM-DD.json, data/records.json
   Όλοι οι υπολογισμοί (ζήτηση, σύνολα, UCE, ρεκόρ) γίνονται στο Python·
   εδώ μόνο σχεδιάζουμε.
   ===================================================================== */

// ---------------------------------------------------------------------
// 1. Χρώματα (ένα σημείο για όλη τη σελίδα)
// ---------------------------------------------------------------------
const C = {
    lignite: '#b06a4b', gas: '#d18b57', hydro: '#5b9bd5', res: '#70ad47',
    dis: '#e0c2cd', chg: '#b276a0', imports: '#ffc000', exports: '#e74c3c',
    pumping: '#85c1e9', demand: '#e2e8f0', price: '#00e5ff',
    wind: '#70ad47', bigHydro: '#5b9bd5', solar: '#f39c12', uce: '#e74c3c',
    cogen: '#f1c40f', smallHydro: '#3498db', biomass: '#8e44ad',
    entsoeSolar: '#ff9f43', entsoeWind: '#10ac84',
    accent: (window.ACCENT && window.ACCENT[400]) || '#cbd5e1', grid: 'rgba(71, 85, 105, 0.35)', muted: '#94a3b8'
};

// ---------------------------------------------------------------------
// 2. Κείμενα (EN / GR)
// ---------------------------------------------------------------------
const T = {
    en: {
        locale: 'en-GB', title: 'Greek Power Live',
        an: { conclTitle: 'Conclusion of the day', conclSub: 'Written automatically from the day\'s data, the same way every day; the decomposition is a model estimate.',
              decTitle: 'What the unmetered generation is made of', decSub: 'UCE hour by hour, split by the model into low-voltage solar, distribution wind and small units; the rest is the difference between ADMIE\'s estimate and the model (it can be negative).',
              pv: 'Low-voltage solar (est.)', wind: 'Distribution wind (est.)', base: 'Small units (est.)', residual: 'Difference from model', uce: 'UCE (ADMIE)',
              loadTitle: 'Layers of the day\'s load', loadSub: 'ADMIE\'s live load built up layer by layer, against ENTSO-E\'s load. GWh.',
              noCrete: 'Transmission, without Crete', crete: 'Flow to Crete', mv: 'Medium voltage (metered)', lv: 'Low voltage (estimated, UCE)', entsoeLoad: 'ENTSO-E load',
              admieRow: 'ADMIE (live)', entsoeRow: 'ENTSO-E',
              resTitle: 'Three renewables totals of the same day', resSub: 'What ADMIE counts as RES depends on the layer. GWh.',
              resT: 'Transmission only (daily bulletin)', resM: '+ medium voltage (metered)', resL: '+ low-voltage estimate (live)', resTs: 'Bulletin', resMs: '+ MV', resLs: '+ LV (live)',
              resNote: 'Solar + wind + biomass: ADMIE live {a} GWh · ENTSO-E ({s}) {b} GWh.',
              calTitle: 'The model, recalibrated every day', calSub: 'Each day the model is fitted again on the previous 90 days: UCE ≈ base + k₁ × metered wind + k₂ × metered solar (robust regression; 90% intervals by bootstrap over days).',
              kSolar: 'Unmetered solar', kWind: 'Distribution wind', kBase: 'Small units', perMeteredSolar: '× metered solar', perMeteredWind: '× metered wind', perHour: 'MWh every hour',
              noCalib: 'Not enough history yet for this day (the model needs two weeks of data).', bessNote: 'Distribution batteries check: when ADMIE\'s BESS fleet is added to the model its factor is {k}; if about 100 MW of distribution batteries were inside UCE with the same pattern it would be about {e}. They are not added to the decomposition.', bessSmall: 'Distribution batteries check: ADMIE\'s BESS fleet was still too small on this day to judge.', ci: '90%', none: 'No analysis for this day.' },
        mcpTitle: 'Day-ahead price (MCP)', mcpUnit: '€/MWh', mcpDayAvg: 'Day average', mcpRank: 'Rank in the day', mcpRankOf: 'of', mcpRankHigh: 'most expensive',
        cleanEnergy: 'Clean energy', fossilFuels: 'Fossil fuels', cleanHint: 'RES (incl. CHP, as ADMIE reports) + hydro', cleanHintShort: 'RES incl. CHP + hydro', fossilHint: 'lignite + natural gas', shareOfGen: 'of generation',
        minorOther: 'Other', methodLink: 'Methodology →', networkLoad: 'Network load',
        short: { lignite: 'Lignite', gas: 'Gas', hydro: 'Hydro', res: 'RES', dis: 'BESS out', imports: 'Imports', demand: 'Demand', exports: 'Exports', chg: 'BESS in', pumping: 'Pumping' },
        priceRange: 'Price range', dayClean: 'Clean share of generation',
        recProgTitle: 'Progression of the #1', recTopTitle: 'Top five', viewHistory: 'history →', trackingStart: 'tracking starts',
        newTop5: 'new in the top five', recHourlySub: 'The highest value of a single hour (MWh in one hour)', recShort: { bess_chg_pump: 'BESS + pumping' }, recDailySub: 'The highest total of a whole day', newPlural: 'NEW', newAt: 'NEW #', recRank: 'Rank', recWhen: 'When', recValue: 'Value',
        lastUpdate: 'Last update:', nextUpdate: 'Next update:', methodology: 'Methodology & Sources',
        tabs: { live: 'Live (hour)', daily: 'Daily', clean: 'Clean energy', analysis: 'Analysis', records: 'Records' },
        pickerHour: 'Hour:', pickerDate: 'Date:', today: 'today',
        pill: { live: 'Live', delayed: 'Delayed', stale: 'Stale data', histHour: 'Past hour', today: 'Today', histDay: 'Past day', expost: 'Ex-post data' },
        load: { title: 'System Initialization', g1: 'Data fetching', g2: 'Building views', s1: 'Reading the data', s2: 'Live balance', s3: 'Daily dispatch', s4: 'Clean energy cross-check', s5: 'Analysis of the day', s6: 'Records', ready: 'Dashboard is ready!', error: 'The data could not be loaded. Reload the page in a few minutes.' },
        names: { lignite: 'Lignite', gas: 'Natural gas', hydro: 'Hydro', res: 'RES (incl. CHP)', dis: 'BESS discharge', chg: 'BESS charge', imports: 'Imports', exports: 'Exports', pumping: 'Pumping', demand: 'Domestic demand', price: 'Day-ahead price', total: 'Total generation',
                 wind: 'Wind', bigHydro: 'Large hydro', solar: 'Solar', cogen: 'Cogeneration', smallHydro: 'Small hydro', biomass: 'Biomass', uce: 'UCE', entsoeSolar: 'Solar (ENTSO-E)', entsoeWind: 'Wind (ENTSO-E)', admieSolar: 'Solar (ADMIE)', admieWind: 'Wind (ADMIE)' },
        countries: { AL: 'Albania', BG: 'Bulgaria', IT: 'Italy', TR: 'Türkiye', MK: 'North Macedonia' },
        genLedger: 'Generation', balLedger: 'System balance', ledgerTotal: 'Total', ledgerDemand: 'Demand',
        balanceOk: 'Matches ADMIE total load', balanceOff: 'Differs from ADMIE total load',
        supplyTitle: 'Where the energy came from', usesTitle: 'Where it went',
        flowsTitle: 'Cross-border flows', flowsSub: 'Imports above zero, exports below. MWh in the selected hour.',
        flowsMismatch: 'In this hour the per-country flows do not add up to ADMIE\'s official totals; the balance uses the totals.',
        avgPrice: 'Average day-ahead price', hoursData: 'Hours with data', dayInProgress: 'day in progress',
        dispatchTitle: '24-hour dispatch and day-ahead price',
        dispatchSub: 'Sources above zero, exports, charging and pumping below. Hours that have not happened yet show the price only.',
        hourAxis: 'Hour (start, Greek time)', mwh: 'MWh', eur: '€/MWh',
        cleanIntro: 'ADMIE’s metered clean generation compared with its own live figures. The difference (UCE) is distribution-level generation that ADMIE estimates but does not meter, mostly rooftop solar.',
        boxVar: 'Variable & dispatchable', boxUce: 'Unallocated clean energy (UCE)', boxBase: 'Baseload',
        uceNet: 'Net for the day', ucePos: 'Hours with live higher', uceNeg: 'Hours with ex-post higher',
        uceNA: 'Not available: live data start on {d}.',
        xrayTitle: 'Physical clean generation and UCE', xraySub: 'Metered clean generation by technology (CHP excluded), UCE in the stack (below zero when negative), day-ahead price on the right axis.',
        reconTitle: 'ADMIE vs ENTSO-E: solar and wind', reconSub: 'Solid lines: ADMIE ex-post files. Dashed lines: ENTSO-E Transparency Platform (actual generation per type).',
        reconNA: 'No ENTSO-E data for this day.',
        gapTitle: 'ADMIE and ENTSO-E: the day at a glance',
        gapSub: 'The same day in ADMIE’s figures and in ENTSO-E’s. ENTSO-E revises solar about ten days later to metered generation only.',
        gapShare: 'Clean share', gapClean: 'RES + hydro', gapRevision: 'ENTSO-E solar: revision', gapLoad: 'Total load',
        gapMissing: 'not in ENTSO-E', gapPoints: 'points', gapFirst: 'first version', gapNow: 'current version',
        gapProvisional: 'provisional', gapFinal: 'final', gapUnknown: 'earliest kept', gapNotYet: 'not revised yet', gapNoLoad: 'ENTSO-E load not loaded yet for this day', gapNoHistory: 'No version history kept yet for this day', gapNoCrete: 'ADMIE without Crete',
        loadTitle: 'Total load: ADMIE and ENTSO-E', loadSub: 'ADMIE live total load against ENTSO-E actual total load (A65). Thin line: ADMIE load without the flow to Crete, which ADMIE counts as load and ENTSO-E does not. Dotted: ENTSO-E first version, when it differs.',
        admieLoad: 'ADMIE total load', admieLoadNoCrete: 'ADMIE load without the flow to Crete', entsoeLoad: 'ENTSO-E load', entsoeLoadFirst: 'ENTSO-E load (first version)', entsoeSolarFirst: 'Solar (ENTSO-E, first version)',
        recordsIntro: 'The highest values since tracking began on {l}. Select a record for its progression and the top five.',
        recHourly: 'Hourly records', recDaily: 'Daily records', newBadge: 'NEW', noData: 'No data yet',
        rec: { solar: 'Solar', wind: 'Wind', exports: 'Exports', bess_chg: 'BESS charge', bess_dis: 'BESS discharge', bess_chg_pump: 'BESS charge + pumping', network_load: 'Network load', res: 'RES (incl. CHP)' },
        close: 'Close', modalTitle: 'Methodology & Data Sources'
    },
    el: {
        locale: 'el-GR', title: 'Greek Power Live',
        an: { conclTitle: 'Το συμπέρασμα της ημέρας', conclSub: 'Γράφεται αυτόματα από τα δεδομένα της ημέρας, με τον ίδιο τρόπο κάθε μέρα· η ανάλυση είναι εκτίμηση μοντέλου.',
              decTitle: 'Από τι αποτελείται η παραγωγή που δεν μετριέται', decSub: 'Το UCE ώρα προς ώρα, χωρισμένο από το μοντέλο σε φ/β χαμηλής τάσης, αιολικά διανομής και μικρές μονάδες· το υπόλοιπο είναι η απόκλιση της εκτίμησης του ΑΔΜΗΕ από το μοντέλο (μπορεί να είναι αρνητική).',
              pv: 'Φ/β χαμηλής τάσης (εκτ.)', wind: 'Αιολικά διανομής (εκτ.)', base: 'Μικρές μονάδες (εκτ.)', residual: 'Απόκλιση από το μοντέλο', uce: 'UCE (ΑΔΜΗΕ)',
              loadTitle: 'Τα επίπεδα του φορτίου της ημέρας', loadSub: 'Το live φορτίο του ΑΔΜΗΕ χτισμένο επίπεδο προς επίπεδο, έναντι του φορτίου της ENTSO-E. GWh.',
              noCrete: 'Μεταφορά, χωρίς Κρήτη', crete: 'Ροή προς Κρήτη', mv: 'Μέση τάση (μετρημένη)', lv: 'Χαμηλή τάση (εκτίμηση, UCE)', entsoeLoad: 'Φορτίο ENTSO-E',
              admieRow: 'ΑΔΜΗΕ (live)', entsoeRow: 'ENTSO-E',
              resTitle: 'Τρία σύνολα ΑΠΕ της ίδιας ημέρας', resSub: 'Τι μετρά ο ΑΔΜΗΕ ως ΑΠΕ εξαρτάται από το επίπεδο. GWh.',
              resT: 'Μόνο μεταφορά (ημερήσιο δελτίο)', resM: '+ μέση τάση (μετρημένη)', resL: '+ εκτίμηση χαμηλής τάσης (live)', resTs: 'Δελτίο', resMs: '+ ΜΤ', resLs: '+ ΧΤ (live)',
              resNote: 'Φ/β + αιολικά + βιομάζα: ΑΔΜΗΕ live {a} GWh · ENTSO-E ({s}) {b} GWh.',
              calTitle: 'Το μοντέλο, ξαναβαθμονομημένο κάθε μέρα', calSub: 'Κάθε μέρα το μοντέλο προσαρμόζεται ξανά στις 90 προηγούμενες ημέρες: UCE ≈ βάση + k₁ × μετρημένα αιολικά + k₂ × μετρημένα φ/β (ανθεκτική παλινδρόμηση· διαστήματα 90% με bootstrap ανά ημέρα).',
              kSolar: 'Φ/β που δεν μετρώνται', kWind: 'Αιολικά διανομής', kBase: 'Μικρές μονάδες', perMeteredSolar: '× μετρημένα φ/β', perMeteredWind: '× μετρημένα αιολικά', perHour: 'MWh κάθε ώρα',
              noCalib: 'Δεν υπάρχει ακόμα αρκετό ιστορικό για αυτή την ημέρα (το μοντέλο θέλει δύο εβδομάδες δεδομένων).', bessNote: 'Έλεγχος μπαταριών διανομής: όταν η λειτουργία του στόλου BESS του ΑΔΜΗΕ προστεθεί στο μοντέλο, ο συντελεστής της είναι {k}· αν περίπου 100 MW μπαταριών διανομής ήταν μέσα στο UCE με το ίδιο μοτίβο, θα ήταν περίπου {e}. Δεν προστίθενται στην ανάλυση.', bessSmall: 'Έλεγχος μπαταριών διανομής: ο στόλος BESS του ΑΔΜΗΕ ήταν ακόμα πολύ μικρός αυτή την ημέρα για να κριθεί κάτι.', ci: '90%', none: 'Δεν υπάρχει ανάλυση για αυτή την ημέρα.' },
        mcpTitle: 'Τιμή επόμενης ημέρας (MCP)', mcpUnit: '€/MWh', mcpDayAvg: 'Μέση ημέρας', mcpRank: 'Θέση στην ημέρα', mcpRankOf: 'από', mcpRankHigh: 'ακριβότερη',
        cleanEnergy: 'Καθαρή ενέργεια', fossilFuels: 'Ορυκτά καύσιμα', cleanHint: 'ΑΠΕ (με ΣΗΘΥΑ, όπως τις δημοσιεύει ο ΑΔΜΗΕ) + υδροηλεκτρικά', cleanHintShort: 'ΑΠΕ με ΣΗΘΥΑ + υδρο', fossilHint: 'λιγνίτης + φυσικό αέριο', shareOfGen: 'της παραγωγής',
        minorOther: 'Λοιπά', methodLink: 'Μεθοδολογία →', networkLoad: 'Φορτίο δικτύου',
        short: { lignite: 'Λιγνίτης', gas: 'Αέριο', hydro: 'Υδρο', res: 'ΑΠΕ', dis: 'Εκφόρτιση', imports: 'Εισαγωγές', demand: 'Ζήτηση', exports: 'Εξαγωγές', chg: 'Φόρτιση', pumping: 'Άντληση' },
        priceRange: 'Εύρος τιμής', dayClean: 'Μερίδιο καθαρής στην παραγωγή',
        recProgTitle: 'Εξέλιξη του #1', recTopTitle: 'Οι πέντε κορυφαίες', viewHistory: 'ιστορικό →', trackingStart: 'έναρξη καταγραφής',
        newTop5: 'νέα είσοδος στις πέντε κορυφαίες', recHourlySub: 'Η υψηλότερη τιμή μίας ώρας (MWh σε μία ώρα)', recShort: { bess_chg_pump: 'BESS + άντληση' }, recDailySub: 'Το υψηλότερο σύνολο μίας ημέρας', newPlural: 'ΝΕΑ', newAt: 'ΝΕΟ #', recRank: 'Θέση', recWhen: 'Πότε', recValue: 'Τιμή',
        lastUpdate: 'Τελευταία ενημέρωση:', nextUpdate: 'Επόμενη:', methodology: 'Μεθοδολογία & Πηγές',
        tabs: { live: 'Live (ώρα)', daily: 'Ημέρα', clean: 'Καθαρή ενέργεια', analysis: 'Ανάλυση', records: 'Ρεκόρ' },
        pickerHour: 'Ώρα:', pickerDate: 'Ημέρα:', today: 'σήμερα',
        pill: { live: 'Live', delayed: 'Καθυστέρηση', stale: 'Παλιά δεδομένα', histHour: 'Προηγούμενη ώρα', today: 'Σήμερα', histDay: 'Προηγούμενη ημέρα', expost: 'Εκ των υστέρων' },
        load: { title: 'Εκκίνηση', g1: 'Λήψη δεδομένων', g2: 'Προετοιμασία προβολών', s1: 'Ανάγνωση δεδομένων', s2: 'Ισοζύγιο ώρας', s3: 'Κατανομή ημέρας', s4: 'Διασταύρωση καθαρής ενέργειας', s5: 'Ανάλυση ημέρας', s6: 'Ρεκόρ', ready: 'Το dashboard είναι έτοιμο!', error: 'Τα δεδομένα δεν φορτώθηκαν. Ανανεώστε τη σελίδα σε λίγα λεπτά.' },
        names: { lignite: 'Λιγνίτης', gas: 'Φυσικό αέριο', hydro: 'Υδροηλεκτρικά', res: 'ΑΠΕ (με ΣΗΘΥΑ)', dis: 'Εκφόρτιση BESS', chg: 'Φόρτιση BESS', imports: 'Εισαγωγές', exports: 'Εξαγωγές', pumping: 'Άντληση', demand: 'Εγχώρια ζήτηση', price: 'Τιμή DAM', total: 'Συνολική παραγωγή',
                 wind: 'Αιολικά', bigHydro: 'Μεγάλα υδροηλεκτρικά', solar: 'Φωτοβολταϊκά', cogen: 'Συμπαραγωγή', smallHydro: 'Μικρά υδροηλεκτρικά', biomass: 'Βιομάζα', uce: 'UCE', entsoeSolar: 'Φ/Β (ENTSO-E)', entsoeWind: 'Αιολικά (ENTSO-E)', admieSolar: 'Φ/Β (ΑΔΜΗΕ)', admieWind: 'Αιολικά (ΑΔΜΗΕ)' },
        countries: { AL: 'Αλβανία', BG: 'Βουλγαρία', IT: 'Ιταλία', TR: 'Τουρκία', MK: 'Βόρεια Μακεδονία' },
        genLedger: 'Παραγωγή', balLedger: 'Ισοζύγιο συστήματος', ledgerTotal: 'Σύνολο', ledgerDemand: 'Ζήτηση',
        balanceOk: 'Συμφωνεί με το συνολικό φορτίο του ΑΔΜΗΕ', balanceOff: 'Διαφέρει από το συνολικό φορτίο του ΑΔΜΗΕ',
        supplyTitle: 'Από πού ήρθε η ενέργεια', usesTitle: 'Πού πήγε',
        flowsTitle: 'Διασυνοριακές ροές', flowsSub: 'Εισαγωγές πάνω από το μηδέν, εξαγωγές κάτω. MWh στην επιλεγμένη ώρα.',
        flowsMismatch: 'Σε αυτή την ώρα οι ροές ανά χώρα δεν αθροίζουν στα επίσημα σύνολα του ΑΔΜΗΕ· το ισοζύγιο χρησιμοποιεί τα σύνολα.',
        avgPrice: 'Μέση τιμή DAM', hoursData: 'Ώρες με δεδομένα', dayInProgress: 'η ημέρα εξελίσσεται',
        dispatchTitle: 'Κατανομή 24ώρου και τιμή επόμενης ημέρας',
        dispatchSub: 'Πηγές πάνω από το μηδέν· εξαγωγές, φόρτιση και άντληση κάτω. Για τις ώρες που δεν έχουν γίνει ακόμα φαίνεται μόνο η τιμή.',
        hourAxis: 'Ώρα (έναρξη, ώρα Ελλάδας)', mwh: 'MWh', eur: '€/MWh',
        cleanIntro: 'Η μετρημένη καθαρή παραγωγή του ΑΔΜΗΕ σε σύγκριση με τα δικά του live στοιχεία. Η διαφορά (UCE) είναι παραγωγή της διανομής που ο ΑΔΜΗΕ εκτιμά αλλά δεν μετρά, κυρίως φ/β στέγης.',
        boxVar: 'Μεταβλητές & κατανεμόμενες', boxUce: 'Μη κατανεμημένη καθαρή ενέργεια (UCE)', boxBase: 'Βάσης',
        uceNet: 'Καθαρό για την ημέρα', ucePos: 'Ώρες με μεγαλύτερο το live', uceNeg: 'Ώρες με μεγαλύτερα τα εκ των υστέρων',
        uceNA: 'Μη διαθέσιμο: τα live δεδομένα ξεκινούν στις {d}.',
        xrayTitle: 'Φυσική καθαρή παραγωγή και UCE', xraySub: 'Μετρημένη καθαρή παραγωγή ανά τεχνολογία (χωρίς ΣΗΘΥΑ), το UCE στη στοίβα (κάτω από το μηδέν όταν είναι αρνητικό) και η τιμή DAM στον δεξιό άξονα.',
        reconTitle: 'ΑΔΜΗΕ και ENTSO-E: φωτοβολταϊκά και αιολικά', reconSub: 'Συνεχείς γραμμές: εκ των υστέρων αρχεία ΑΔΜΗΕ. Διακεκομμένες: ENTSO-E Transparency Platform (πραγματική παραγωγή ανά τύπο).',
        reconNA: 'Δεν υπάρχουν δεδομένα ENTSO-E για αυτή την ημέρα.',
        gapTitle: 'ΑΔΜΗΕ και ENTSO-E: η εικόνα της ημέρας',
        gapSub: 'Η ίδια ημέρα στα στοιχεία του ΑΔΜΗΕ και της ENTSO-E. Η ENTSO-E αναθεωρεί τα φ/β περίπου δέκα ημέρες μετά σε μόνο μετρημένη παραγωγή.',
        gapShare: 'Μερίδιο καθαρής', gapClean: 'ΑΠΕ + υδροηλεκτρικά', gapRevision: 'Φ/β ENTSO-E: αναθεώρηση', gapLoad: 'Συνολικό φορτίο',
        gapMissing: 'λείπουν από την ENTSO-E', gapPoints: 'μονάδες', gapFirst: 'πρώτη έκδοση', gapNow: 'τρέχουσα έκδοση',
        gapProvisional: 'προσωρινά', gapFinal: 'τελικά', gapUnknown: 'παλαιότερη που κρατήθηκε', gapNotYet: 'δεν έχει αναθεωρηθεί ακόμα', gapNoLoad: 'Το φορτίο της ENTSO-E δεν έχει φορτωθεί ακόμα για αυτή την ημέρα', gapNoHistory: 'Δεν υπάρχει ακόμα ιστορικό εκδόσεων για αυτή την ημέρα', gapNoCrete: 'ΑΔΜΗΕ χωρίς Κρήτη',
        loadTitle: 'Συνολικό φορτίο: ΑΔΜΗΕ και ENTSO-E', loadSub: 'Live συνολικό φορτίο του ΑΔΜΗΕ έναντι του πραγματικού συνολικού φορτίου της ENTSO-E (A65). Λεπτή γραμμή: το φορτίο του ΑΔΜΗΕ χωρίς τη ροή προς την Κρήτη, που ο ΑΔΜΗΕ μετρά ως φορτίο και η ENTSO-E όχι. Με τελείες: η πρώτη έκδοση της ENTSO-E, όταν διαφέρει.',
        admieLoad: 'Φορτίο ΑΔΜΗΕ', admieLoadNoCrete: 'Φορτίο ΑΔΜΗΕ χωρίς τη ροή προς Κρήτη', entsoeLoad: 'Φορτίο ENTSO-E', entsoeLoadFirst: 'Φορτίο ENTSO-E (πρώτη έκδοση)', entsoeSolarFirst: 'Φ/Β (ENTSO-E, πρώτη έκδοση)',
        recordsIntro: 'Οι υψηλότερες τιμές από την έναρξη της καταγραφής, {l}. Πατήστε σε ένα ρεκόρ για την εξέλιξή του και τις πέντε κορυφαίες.',
        recHourly: 'Ωριαία ρεκόρ', recDaily: 'Ημερήσια ρεκόρ', newBadge: 'ΝΕΟ', noData: 'Δεν υπάρχουν ακόμα δεδομένα',
        rec: { solar: 'Φωτοβολταϊκά', wind: 'Αιολικά', exports: 'Εξαγωγές', bess_chg: 'Φόρτιση BESS', bess_dis: 'Εκφόρτιση BESS', bess_chg_pump: 'Φόρτιση BESS + άντληση', network_load: 'Φορτίο δικτύου', res: 'ΑΠΕ (με ΣΗΘΥΑ)' },
        close: 'Κλείσιμο', modalTitle: 'Μεθοδολογία & Πηγές Δεδομένων'
    }
};

const METHODOLOGY = {
    en: `
<h4 class="text-acc-300 font-semibold mb-1">Data sources</h4>
<p class="mb-4">Live figures come from ADMIE/IPTO's market portal (generation mix and load, day-ahead market, SCADA interconnection flows) and are fetched every hour at minute 5. The clean-energy breakdown comes from ADMIE's ex-post operation files, published one to two days later. ENTSO-E's Transparency Platform (actual generation per type) is used as an independent cross-check.</p>
<h4 class="text-acc-300 font-semibold mb-1">Hours</h4>
<p class="mb-4">All times are Greek local time. ADMIE numbers hours 1 to 24; hour 1 is 00:00–01:00. The page labels each hour by its start (00–01, 01–02, …). Values are MWh in one hour, which equals the average MW of that hour.</p>
<h4 class="text-acc-300 font-semibold mb-1">System balance and demand</h4>
<p class="mb-4">Demand is ADMIE's total load. It equals generation + imports − exports + BESS discharge − BESS charge − pumping; the page checks this for every hour and says when it does not hold. Imports and exports are ADMIE's official totals; the per-country flows are shown as a breakdown.</p>
<h4 id="m-uce" class="text-acc-300 font-semibold mb-1 scroll-mt-4">Unallocated clean energy (UCE)</h4>
<p class="mb-4">ADMIE's live “RES” figure includes cogeneration (CHP) and an estimate of distribution-level generation that is not metered. Physical clean energy is the metered part: large hydro + small hydro + solar + wind + biomass, from the transmission SCADA file and the medium-voltage RESMV file. Live clean energy is live RES + hydro minus cogeneration; cogeneration is removed from both sides because it is mostly gas-fired. UCE is live minus physical and keeps its sign. It is mainly rooftop and other low-voltage solar (its daily shape follows medium-voltage solar closely), distribution-connected wind (RESMV has no wind) and small low-voltage hydro and biomass. Crete is in neither source: both see it only through its two interconnection cables. A negative hour means ADMIE's estimate came out below the metered value, for example through losses; it is not consumption. On the Live and Daily tabs, “RES” is ADMIE's figure, cogeneration included.</p>
<h4 class="text-acc-300 font-semibold mb-1">Prices</h4>
<p class="mb-4">The day-ahead price is the hourly value for Greece as published on ADMIE's portal.</p>
<h4 id="m-entsoe" class="text-acc-300 font-semibold mb-1 scroll-mt-4">ADMIE and ENTSO-E</h4>
<p class="mb-4">ADMIE's own statistics split renewables into system RES (transmission) and network RES (distribution); network RES include medium-voltage generation metered in the RESMV file and an estimate of low-voltage generation that is not metered hourly. On the ENTSO-E Transparency Platform the first published solar figure is close to that total; about ten days later it is revised to metered generation only, and biomass is not reported. The page keeps both ENTSO-E versions (the first one and the latest, marked provisional or final after 14 days) and the ENTSO-E actual total load, so the two sources can be compared day by day.</p>
<h4 id="m-analysis" class="text-acc-300 font-semibold mb-1 scroll-mt-4">Analysis tab</h4>
<p class="mb-4">For each day the model UCE ≈ base + k₁ × metered wind + k₂ × metered solar is fitted again on the previous 90 days with a robust (Huber) regression; 90% intervals come from a bootstrap over days. Applied to the day's hours it splits UCE into low-voltage solar, distribution wind and small units; what is left is the difference between ADMIE's estimate and the model, which can be negative. Tested on data it had not seen, the model explained about 84% of hourly UCE; day totals are reliable, single hours approximate. The conclusion of the day is written by fixed sentences filled with the day's numbers, the same way every day, without interpretation. The layers come from the exact identities in "Layers of load and of renewables".</p>
<p class="mb-4"><strong>Distribution batteries.</strong> According to public announcements of July 2026, about 100 MW / 200 MWh of batteries are connected to the distribution network. On 21 Oct 2026 we tested whether they appear inside UCE, using as a proxy the hourly operation of ADMIE's own BESS fleet (same market signals, including the double daily cycles) and, separately, the day-ahead price. No model improved the prediction on unseen data; after mid-July the fleet factor was −0.03 (90%: −0.08 to +0.01), whereas about 0.18 would be expected if 100 MW with the same pattern were inside UCE; the price only mimicked solar. The most likely reading is that ADMIE's live distribution estimate covers renewables only, so these batteries show up indirectly in the transmission load, not in UCE. Even if some escaped the test, at most about 200 MWh a day is at stake, under 2% of UCE. The check is repeated every day and shown under the coefficients chart.</p>
<h4 id="m-layers" class="text-acc-300 font-semibold mb-1 scroll-mt-4">Layers of load and of renewables</h4>
<p class="mb-2">ADMIE's figures add up exactly, layer by layer (example: 17 Oct 2026, MWh):</p>
<ul class="mb-2 list-disc pl-5 space-y-1">
<li>transmission load without Crete 89,667 + flow to Crete through the two cables 5,937 = SCADA net load 95,604;</li>
<li>+ pumping and BESS charging − BESS discharging = 97,647, the total of ADMIE's daily energy bulletin;</li>
<li>SCADA net load + medium-voltage generation (RESMV) 22,790 + the low-voltage estimate (UCE) 11,976 = 130,370, ADMIE's live total load.</li>
</ul>
<p class="mb-4">ADMIE therefore publishes three renewables totals for the same day: transmission only (daily bulletin, 66,187), metered transmission + medium voltage (88,977) and live, with the low-voltage estimate (100,953). None is wrong; they measure different things. Crete is outside the mainland figures: its own renewables appear in none of them, only the flow through the cables. ENTSO-E's load leaves out the flow to Crete and about 40% of the low-voltage estimate; its generation leaves out the whole low-voltage estimate.</p>
<h4 class="text-acc-300 font-semibold mb-1">Records</h4>
<p class="mb-4">The five highest values since tracking began (1 April 2026), recomputed every hour from the full history, so a correction by ADMIE also corrects a record. Each record shows how the #1 progressed; in the first weeks of tracking almost every day is a “record”, which is why that period is shaded. Hourly values are MWh in one hour, equal to the average MW.</p>
<h4 class="text-acc-300 font-semibold mb-1">Status</h4>
<p>“Live” means the latest hour ended less than 75 minutes ago. “Delayed” means up to three hours, usually one missed update. “Stale data” means longer than that.</p>`,
    el: `
<h4 class="text-acc-300 font-semibold mb-1">Πηγές δεδομένων</h4>
<p class="mb-4">Τα live στοιχεία προέρχονται από την πύλη αγοράς του ΑΔΜΗΕ (μείγμα παραγωγής και φορτίο, αγορά επόμενης ημέρας, ροές διασυνδέσεων SCADA) και λαμβάνονται κάθε ώρα στο 5ο λεπτό. Η ανάλυση της καθαρής ενέργειας προέρχεται από τα εκ των υστέρων αρχεία λειτουργίας του ΑΔΜΗΕ, που δημοσιεύονται μία με δύο ημέρες αργότερα. Η ENTSO-E Transparency Platform (πραγματική παραγωγή ανά τύπο) χρησιμοποιείται ως ανεξάρτητη διασταύρωση.</p>
<h4 class="text-acc-300 font-semibold mb-1">Ώρες</h4>
<p class="mb-4">Όλες οι ώρες είναι ώρα Ελλάδας. Ο ΑΔΜΗΕ αριθμεί τις ώρες από 1 έως 24· η ώρα 1 είναι 00:00–01:00. Η σελίδα ονομάζει κάθε ώρα από την έναρξή της (00–01, 01–02, …). Οι τιμές είναι MWh σε μία ώρα, ίσες με τα μέσα MW της ώρας.</p>
<h4 class="text-acc-300 font-semibold mb-1">Ισοζύγιο και ζήτηση</h4>
<p class="mb-4">Η ζήτηση είναι το συνολικό φορτίο του ΑΔΜΗΕ. Ισούται με παραγωγή + εισαγωγές − εξαγωγές + εκφόρτιση BESS − φόρτιση BESS − άντληση· η σελίδα το ελέγχει για κάθε ώρα και το επισημαίνει όταν δεν ισχύει. Οι εισαγωγές και οι εξαγωγές είναι τα επίσημα σύνολα του ΑΔΜΗΕ· οι ροές ανά χώρα εμφανίζονται ως ανάλυση.</p>
<h4 id="m-uce" class="text-acc-300 font-semibold mb-1 scroll-mt-4">Μη κατανεμημένη καθαρή ενέργεια (UCE)</h4>
<p class="mb-4">Το live «ΑΠΕ» του ΑΔΜΗΕ περιέχει τη συμπαραγωγή (ΣΗΘΥΑ) και μια εκτίμηση της παραγωγής της διανομής που δεν μετριέται. Η φυσική καθαρή ενέργεια είναι το μετρημένο κομμάτι: μεγάλα + μικρά υδροηλεκτρικά + φωτοβολταϊκά + αιολικά + βιομάζα, από το SCADA μεταφοράς και το αρχείο μέσης τάσης RESMV. Η live καθαρή ενέργεια είναι live ΑΠΕ + υδροηλεκτρικά μείον τη συμπαραγωγή· η συμπαραγωγή αφαιρείται και από τις δύο πλευρές, γιατί είναι κυρίως με φυσικό αέριο. Το UCE είναι live μείον φυσική, με το πρόσημό του. Είναι κυρίως φ/β στέγης και λοιπά φ/β χαμηλής τάσης (το ημερήσιο σχήμα του ακολουθεί στενά τα φ/β μέσης τάσης), αιολικά της διανομής (το RESMV δεν έχει αιολικά) και μικρά υδροηλεκτρικά και βιομάζα χαμηλής τάσης. Η Κρήτη δεν υπάρχει σε καμία από τις δύο πηγές: και οι δύο τη βλέπουν μόνο μέσα από τα δύο καλώδια διασύνδεσης. Μια αρνητική ώρα σημαίνει ότι η εκτίμηση του ΑΔΜΗΕ βγήκε κάτω από τη μέτρηση, για παράδειγμα λόγω απωλειών· δεν είναι κατανάλωση. Στα tabs Live και Ημέρα, το «ΑΠΕ» είναι το στοιχείο του ΑΔΜΗΕ, μαζί με τη συμπαραγωγή.</p>
<h4 class="text-acc-300 font-semibold mb-1">Τιμές</h4>
<p class="mb-4">Η τιμή επόμενης ημέρας είναι η ωριαία τιμή για την Ελλάδα όπως δημοσιεύεται στην πύλη του ΑΔΜΗΕ.</p>
<h4 id="m-entsoe" class="text-acc-300 font-semibold mb-1 scroll-mt-4">ΑΔΜΗΕ και ENTSO-E</h4>
<p class="mb-4">Τα στατιστικά του ίδιου του ΑΔΜΗΕ χωρίζουν τις ΑΠΕ σε ΑΠΕ συστήματος (μεταφορά) και ΑΠΕ δικτύου (διανομή)· οι ΑΠΕ δικτύου περιέχουν την παραγωγή μέσης τάσης που μετριέται στο αρχείο RESMV και μια εκτίμηση της παραγωγής χαμηλής τάσης που δεν μετριέται ωριαία. Στην ENTSO-E Transparency Platform η πρώτη δημοσιευμένη τιμή των φ/β είναι κοντά σε αυτό το σύνολο· περίπου δέκα ημέρες μετά αναθεωρείται σε μόνο μετρημένη παραγωγή, και η βιομάζα δεν δηλώνεται. Η σελίδα κρατά και τις δύο εκδόσεις της ENTSO-E (την πρώτη και την πιο πρόσφατη, με ένδειξη προσωρινή ή τελική μετά από 14 ημέρες) και το πραγματικό συνολικό φορτίο της ENTSO-E, ώστε οι δύο πηγές να συγκρίνονται ημέρα προς ημέρα.</p>
<h4 id="m-analysis" class="text-acc-300 font-semibold mb-1 scroll-mt-4">Tab «Ανάλυση»</h4>
<p class="mb-4">Για κάθε ημέρα το μοντέλο UCE ≈ βάση + k₁ × μετρημένα αιολικά + k₂ × μετρημένα φ/β προσαρμόζεται ξανά στις 90 προηγούμενες ημέρες με ανθεκτική παλινδρόμηση (Huber)· τα διαστήματα 90% προκύπτουν με bootstrap ανά ημέρα. Εφαρμοσμένο στις ώρες της ημέρας χωρίζει το UCE σε φ/β χαμηλής τάσης, αιολικά διανομής και μικρές μονάδες· ό,τι μένει είναι η απόκλιση της εκτίμησης του ΑΔΜΗΕ από το μοντέλο και μπορεί να είναι αρνητική. Σε δεδομένα που δεν είχε δει, το μοντέλο εξήγησε περίπου το 84% του ωριαίου UCE· τα σύνολα ημέρας είναι αξιόπιστα, οι μεμονωμένες ώρες προσεγγιστικές. Το συμπέρασμα της ημέρας γράφεται με σταθερές προτάσεις που συμπληρώνονται με τους αριθμούς της ημέρας, με τον ίδιο τρόπο κάθε μέρα, χωρίς ερμηνεία. Τα επίπεδα προκύπτουν από τις ακριβείς ταυτότητες της ενότητας «Επίπεδα φορτίου και ΑΠΕ».</p>
<p class="mb-4"><strong>Μπαταρίες της διανομής.</strong> Σύμφωνα με δημόσιες ανακοινώσεις του Ιουλίου 2026, περίπου 100 MW / 200 MWh μπαταριών είναι συνδεδεμένες στο δίκτυο διανομής. Στις 21 Οκτ 2026 ελέγξαμε αν εμφανίζονται μέσα στο UCE, με δείκτη την ωριαία λειτουργία του στόλου BESS του ΑΔΜΗΕ (ίδια σήματα αγοράς, μαζί με τους διπλούς ημερήσιους κύκλους) και, χωριστά, την τιμή επόμενης ημέρας. Κανένα μοντέλο δεν βελτίωσε την πρόβλεψη σε δεδομένα που δεν είχε δει· μετά τα μέσα Ιουλίου ο συντελεστής του στόλου ήταν −0,03 (90%: −0,08 έως +0,01), ενώ θα περιμέναμε περίπου 0,18 αν 100 MW με το ίδιο μοτίβο ήταν μέσα στο UCE· η τιμή απλώς μιμήθηκε τα φ/β. Η πιθανότερη ερμηνεία είναι ότι η live εκτίμηση του ΑΔΜΗΕ για τη διανομή καλύπτει μόνο ΑΠΕ, οπότε οι μπαταρίες αυτές φαίνονται έμμεσα στο φορτίο της μεταφοράς και όχι στο UCE. Ακόμα κι αν κάποιο κομμάτι ξέφυγε από τον έλεγχο, πρόκειται για το πολύ περίπου 200 MWh την ημέρα, κάτω από 2% του UCE. Ο έλεγχος επαναλαμβάνεται κάθε μέρα και φαίνεται κάτω από το γράφημα των συντελεστών.</p>
<h4 id="m-layers" class="text-acc-300 font-semibold mb-1 scroll-mt-4">Επίπεδα φορτίου και ΑΠΕ</h4>
<p class="mb-2">Τα στοιχεία του ΑΔΜΗΕ αθροίζουν ακριβώς, επίπεδο προς επίπεδο (παράδειγμα: 17 Οκτ 2026, MWh):</p>
<ul class="mb-2 list-disc pl-5 space-y-1">
<li>φορτίο μεταφοράς χωρίς Κρήτη 89.667 + ροή προς Κρήτη από τα δύο καλώδια 5.937 = καθαρό φορτίο SCADA 95.604·</li>
<li>+ άντληση και φόρτιση BESS − εκφόρτιση BESS = 97.647, το σύνολο του ημερήσιου δελτίου ενέργειας του ΑΔΜΗΕ·</li>
<li>καθαρό φορτίο SCADA + παραγωγή μέσης τάσης (RESMV) 22.790 + εκτίμηση χαμηλής τάσης (UCE) 11.976 = 130.370, το live συνολικό φορτίο του ΑΔΜΗΕ.</li>
</ul>
<p class="mb-4">Ο ΑΔΜΗΕ δημοσιεύει έτσι τρία σύνολα ΑΠΕ για την ίδια ημέρα: μόνο μεταφορά (ημερήσιο δελτίο, 66.187), μετρημένη μεταφορά + μέση τάση (88.977) και live, με την εκτίμηση χαμηλής τάσης (100.953). Κανένα δεν είναι λάθος· μετρούν διαφορετικά πράγματα. Η Κρήτη είναι εκτός των στοιχείων της ηπειρωτικής χώρας: οι ΑΠΕ της δεν εμφανίζονται σε κανένα, μόνο η ροή από τα καλώδια. Το φορτίο της ENTSO-E αφήνει έξω τη ροή προς την Κρήτη και περίπου το 40% της εκτίμησης χαμηλής τάσης· η παραγωγή της αφήνει έξω ολόκληρη την εκτίμηση χαμηλής τάσης.</p>
<h4 class="text-acc-300 font-semibold mb-1">Ρεκόρ</h4>
<p class="mb-4">Οι πέντε υψηλότερες τιμές από την έναρξη της καταγραφής (1 Απριλίου 2026), που υπολογίζονται κάθε ώρα από όλο το ιστορικό· έτσι μια διόρθωση του ΑΔΜΗΕ διορθώνει και το ρεκόρ. Κάθε ρεκόρ δείχνει πώς εξελίχθηκε το #1· τις πρώτες εβδομάδες σχεδόν κάθε μέρα είναι «ρεκόρ», γι’ αυτό η περίοδος αυτή είναι σκιασμένη. Οι ωριαίες τιμές είναι MWh σε μία ώρα, ίσες με τα μέσα MW.</p>
<h4 class="text-acc-300 font-semibold mb-1">Κατάσταση</h4>
<p>«Live» σημαίνει ότι η τελευταία ώρα τελείωσε πριν από λιγότερα από 75 λεπτά. «Καθυστέρηση» σημαίνει έως τρεις ώρες, συνήθως μία ενημέρωση που χάθηκε. «Παλιά δεδομένα» σημαίνει περισσότερο.</p>`
};

// ---------------------------------------------------------------------
// 3. Κατάσταση
// ---------------------------------------------------------------------
const S = {
    lang: 'en', tab: 'live',
    manifest: null, records: null,
    cache: {},                 // 'live/2026-10-18' → json | null
    liveDate: null, hourSel: null,
    dailyDate: null, cleanDate: null,
    charts: {},
    recScope: 'hourly',  // κινητό: ποια ομάδα ρεκόρ φαίνεται (D45)
    anDate: null         // ημέρα της «Ανάλυσης» (D46)
};
try { const l = localStorage.getItem('kp_lang'); if (l === 'el' || l === 'en') S.lang = l; } catch (e) { /* ιδιωτική περιήγηση */ }

// Όρια φρεσκάδας (D07): το cron τρέχει στο :05.
const STALE_DELAYED_MIN = 75, STALE_STALE_MIN = 180;

// ---------------------------------------------------------------------
// 4. Βοηθητικά
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const t = () => T[S.lang];
const pad = (n) => String(n).padStart(2, '0');
const fmt = (v, digits = 0) => (v === null || v === undefined || Number.isNaN(v)) ? '–'
    : new Intl.NumberFormat(t().locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// hr 1 = 00:00–01:00 (ΑΔΜΗΕ) → ετικέτα από την έναρξη
const hourTick = (hr) => pad(hr - 1);
// Κινητό (D44): οι άξονες MWh γράφουν χιλιάδες ως «5k» για να κερδίζεται πλάτος.
const isNarrow = () => window.innerWidth < 640;
const axisMWh = (v) => {                       // με πρόσημο (π.χ. αρνητικό UCE)
    if (isNarrow() && Math.abs(v) >= 1000) return `${fmt(v / 1000, v % 1000 ? 1 : 0)}k`;
    return fmt(v);
};
const axisMWhAbs = (v) => axisMWh(Math.abs(v));   // χωρίς πρόσημο (εξαγωγές/φόρτιση κάτω από το μηδέν)
// 1η, 2η… / 1st, 2nd…
function ordinal(n) {
    if (S.lang === 'el') return `${n}η`;
    const v = n % 100, suf = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return `${n}${suf}`;
}
const hourRange = (hr) => `${pad(hr - 1)}:00–${pad(hr)}:00`;

function fmtDate(iso, withYear = true) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(t().locale, { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' })
        .format(new Date(Date.UTC(y, m - 1, d)));
}
function fmtTimeAthens(isoTs, withDate = false) {
    if (!isoTs) return '–';
    const opts = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Athens' };
    if (withDate) { opts.day = 'numeric'; opts.month = 'short'; }
    return new Intl.DateTimeFormat(t().locale, opts).format(new Date(isoTs));
}

// Λεπτά από το ΤΕΛΟΣ της ώρας hr της ημέρας iso, σε ώρα Αθήνας
function minutesSinceHourEnd(iso, hr) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Athens', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const now = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round((now - Date.UTC(y, m - 1, d, hr)) / 60000);
}
const fmtLag = (min) => min < 120 ? `${min}′` : `${Math.floor(min / 60)}h ${pad(min % 60)}′`;

// Λήψη JSON με μνήμη. Τα αρχεία που αλλάζουν συχνά παίρνουν cache-busting.
async function getJSON(path, bust = false) {
    if (!bust && path in S.cache) return S.cache[path];
    const url = `data/${path}.json` + (bust ? `?v=${Date.now()}` : '');
    let json = null;
    try {
        const r = await fetch(url);
        json = r.ok ? await r.json() : null;
    } catch (e) { json = null; }
    S.cache[path] = json;
    return json;
}
// Ενεργές ημέρες (σήμερα/χθες) αλλάζουν κάθε ώρα· οι παλαιότερες όχι.
function isActiveDay(iso) {
    const days = (S.manifest && S.manifest.live_days) || [];
    return days.slice(-2).includes(iso);
}
// Πρώτη λήψη ενεργής ημέρας: πάντα φρέσκια· μετά από τη μνήμη (το refresh τη σβήνει).
const getLive = (iso) => getJSON(`live/${iso}`, isActiveDay(iso) && !(`live/${iso}` in S.cache));
const getXray = (iso) => getJSON(`xray/${iso}`);
const getEntsoe = (iso) => getJSON(`entsoe/${iso}`);

// Ενιαίες ρυθμίσεις Chart.js
function chartDefaults() {
    Chart.defaults.color = C.muted;
    Chart.defaults.borderColor = C.grid;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.96)';
    Chart.defaults.plugins.tooltip.borderColor = '#334155';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400;
}
function upsertChart(id, config) {
    if (S.charts[id]) S.charts[id].destroy();
    S.charts[id] = new Chart($(id), config);
}

// Plugin: σύνολο στο κέντρο του donut
// Plugin: το κέντρο του donut (D43). Χωρίς επιλογή: ετικέτα + σύνολο.
// Με δείκτη/δάχτυλο πάνω σε φέτα: όνομα, τιμή και ποσοστό της φέτας (αντί για αιωρούμενο tooltip).
const centerText = {
    id: 'centerText',
    afterDraw(chart, _args, opts) {
        if (!opts || !opts.text) return;
        const { ctx, chartArea: a } = chart;
        const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
        const meta = chart.getDatasetMeta(0), inner = meta.data[0] ? meta.data[0].innerRadius : 60;
        const maxW = inner * 1.7, fam = Chart.defaults.font.family;
        const fit = (txt, weight, size) => {          // σμίκρυνση γραμματοσειράς ώστε να χωρά στην «τρύπα»
            let s2 = size; ctx.font = `${weight} ${s2}px ${fam}`;
            while (s2 > 9 && ctx.measureText(txt).width > maxW) { s2 -= 1; ctx.font = `${weight} ${s2}px ${fam}`; }
        };
        const act = chart.getActiveElements();
        let label = opts.label || '', value = opts.text, sub = opts.sub || '', color = '#f1f5f9';
        if (act.length) {
            const i = act[0].index, ds = chart.data.datasets[0], v = ds.data[i];
            const total = ds.data.reduce((p, q) => p + (q || 0), 0);
            label = chart.data.labels[i]; value = fmt(v); color = ds.backgroundColor[i];
            sub = `MWh · ${fmt(100 * v / total, 1)}%`;
        }
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = act.length ? color : C.muted; fit(label, act.length ? 600 : 500, 12); ctx.fillText(label, x, y - 20);
        ctx.fillStyle = '#f1f5f9'; fit(value, 700, 20); ctx.fillText(value, x, y + 1);
        ctx.fillStyle = C.muted; fit(sub, 400, 11); ctx.fillText(sub, x, y + 20);
        ctx.restore();
    }
};

// Plugin: ετικέτες με «βελάκι» έξω από κάθε φέτα (D38).
// Μόνο φέτες ≥ minShare· οι ετικέτες κάθε πλευράς απλώνονται κάθετα ώστε να μην πέφτουν η μία στην άλλη.
const CALLOUT_MIN_WIDTH = 380;
const calloutLabels = {
    id: 'calloutLabels',
    afterDatasetsDraw(chart, _args, opts) {
        if (!opts || !opts.enabled || chart.width < CALLOUT_MIN_WIDTH) return;
        const meta = chart.getDatasetMeta(0), ds = chart.data.datasets[0];
        const total = ds.data.reduce((a, b) => a + (b || 0), 0);
        if (!total) return;
        const { ctx, chartArea: area } = chart;
        const font = Chart.defaults.font.family, lineH = 15;
        const items = [];
        meta.data.forEach((arc, i) => {
            const v = ds.data[i];
            if (!v || v / total < (opts.minShare || 0.03)) return;
            const p = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'outerRadius'], true);
            const a = (p.startAngle + p.endAngle) / 2, cos = Math.cos(a), sin = Math.sin(a);
            items.push({
                i, right: cos >= 0, color: ds.backgroundColor[i],
                x0: p.x + cos * p.outerRadius, y0: p.y + sin * p.outerRadius,
                x1: p.x + cos * (p.outerRadius + 12), y1: p.y + sin * (p.outerRadius + 12),
                cx: p.x, r: p.outerRadius,
                text: (opts.short && opts.short[i]) || chart.data.labels[i], value: `${fmt(v)} MWh`
            });
        });
        // απλωμα ανά πλευρά
        for (const side of [true, false]) {
            const list = items.filter((t) => t.right === side).sort((a, b) => a.y1 - b.y1);
            for (let k = 1; k < list.length; k++) {
                if (list[k].y1 - list[k - 1].y1 < lineH * 2) list[k].y1 = list[k - 1].y1 + lineH * 2;
            }
            const overflow = list.length ? list[list.length - 1].y1 - (area.bottom - lineH) : 0;
            if (overflow > 0) list.forEach((t) => { t.y1 -= overflow; });
        }
        ctx.save();
        const fitText = (txt, maxW) => {
            if (ctx.measureText(txt).width <= maxW) return txt;
            let t2 = txt;
            while (t2.length > 1 && ctx.measureText(t2 + '…').width > maxW) t2 = t2.slice(0, -1);
            return t2 + '…';
        };
        items.forEach((t) => {
            // σταθερές «στήλες» δεξιά/αριστερά της πίτας, μέσα στο περιθώριο του γραφήματος
            const colX = t.right ? area.right + 6 : area.left - 6;
            const maxW = t.right ? chart.width - colX - 6 : colX - 6;
            ctx.strokeStyle = t.color; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.lineTo(colX, t.y1); ctx.stroke();
            ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x0, t.y0, 2, 0, Math.PI * 2); ctx.fill();
            ctx.textAlign = t.right ? 'left' : 'right'; ctx.textBaseline = 'middle';
            const tx = colX + (t.right ? 3 : -3);
            ctx.fillStyle = '#e2e8f0'; ctx.font = `600 11px ${font}`; ctx.fillText(fitText(t.text, maxW), tx, t.y1 - 7);
            ctx.fillStyle = C.muted; ctx.font = `11px ${font}`; ctx.fillText(fitText(t.value, maxW), tx, t.y1 + 7);
        });
        ctx.restore();
    }
};

// ---------------------------------------------------------------------
// 5. Header: ενημέρωση, κατάσταση, επιλογέας
// ---------------------------------------------------------------------
const PILL = {
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    orange: 'bg-orange-500/10 border-orange-400/40 text-orange-300',
    red: 'bg-red-500/10 border-red-500/40 text-red-300',
    slate: 'bg-slate-700/40 border-slate-600 text-slate-300'
};
function setPill(text, tone) {
    const el = $('statusPill');
    el.className = `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold ${PILL[tone]}`;
    el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current"></span>${esc(text)}`;
}
function updateHeader() {
    const m = S.manifest;
    $('lastUpdateVal').textContent = m && m.last_live ? fmtTimeAthens(m.last_live.fetched, true) : '–';
    $('nextUpdateVal').textContent = m ? fmtTimeAthens(m.next_update) : '–';
    updatePill();
}
function updatePill() {
    const p = t().pill, last = S.manifest && S.manifest.last_live;
    if (S.tab === 'clean' || S.tab === 'analysis') return setPill(p.expost, 'slate');
    if (S.tab === 'daily') return setPill(S.dailyDate === S.liveDate ? p.today : p.histDay, S.dailyDate === S.liveDate ? 'green' : 'slate');
    if (S.tab === 'live' && last && S.hourSel !== last.hr) return setPill(p.histHour, 'slate');
    if (!last) return setPill(p.stale, 'red');
    const lag = minutesSinceHourEnd(last.date, last.hr);
    if (lag <= STALE_DELAYED_MIN) setPill(p.live, 'green');
    else if (lag <= STALE_STALE_MIN) setPill(`${p.delayed} · ${fmtLag(lag)}`, 'orange');
    else setPill(`${p.stale} · ${fmtLag(lag)}`, 'red');
}

function fillPicker() {
    const sel = $('contextSelect'), box = $('pickerBox'), m = S.manifest;
    if (S.tab === 'records') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    let opts = [], value;
    if (S.tab === 'live') {
        $('pickerLabel').textContent = t().pickerHour;
        const day = S.cache[`live/${S.liveDate}`];
        const hrs = day ? day.hours.filter((h) => h.has_data).map((h) => h.hr).reverse() : [];
        opts = hrs.map((hr) => [hr, hourRange(hr)]);
        value = S.hourSel;
    } else {
        $('pickerLabel').textContent = t().pickerDate;
        const src = S.tab === 'daily' ? m.live_days : S.tab === 'analysis' ? m.analysis_days : m.xray_days;
        const days = (src || []).slice().reverse();
        opts = days.map((d) => [d, fmtDate(d) + (d === S.liveDate && S.tab === 'daily' ? ` (${t().today})` : '')]);
        value = S.tab === 'daily' ? S.dailyDate : S.tab === 'analysis' ? S.anDate : S.cleanDate;
    }
    sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    sel.value = String(value);
}

async function onPickerChange() {
    const v = $('contextSelect').value;
    if (S.tab === 'live') { S.hourSel = Number(v); renderLive(); }
    else if (S.tab === 'daily') { S.dailyDate = v; await renderDaily(); }
    else if (S.tab === 'clean') { S.cleanDate = v; await renderClean(); }
    else if (S.tab === 'analysis') { S.anDate = v; await renderAnalysis(); }
    updatePill();
}

// ---------------------------------------------------------------------
// 6. Tabs, γλώσσα, modal
// ---------------------------------------------------------------------
const TAB_ON = ['bg-acc-400', 'text-slate-900', 'border-acc-400', 'md:bg-transparent', 'md:text-acc-400', 'md:border-b-acc-400'];
const TAB_OFF = ['bg-slate-800', 'text-slate-400', 'border-slate-700', 'hover:text-white', 'md:bg-transparent', 'md:border-transparent', 'md:hover:text-acc-200'];

function hideTip() { const el = document.getElementById('chart-tip'); if (el) el.style.opacity = 0; }

function setTab(tab) {
    S.tab = tab;
    hideTip();
    document.querySelectorAll('.tab-btn').forEach((b) => {
        const on = b.dataset.tab === tab;
        b.classList.remove(...TAB_ON, ...TAB_OFF);
        b.classList.add(...(on ? TAB_ON : TAB_OFF));
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['live', 'daily', 'clean', 'analysis', 'records'].forEach((v) => $(`view-${v}`).classList.toggle('hidden', v !== tab));
    fillPicker();
    updatePill();
    if (tab === 'live' && S.manifest) renderLive();   // οι πίτες μετρούν ξανά το πλάτος τους
    if (tab === 'records' && S.recVisible && S.recVisible.length) {
        markSeen(S.recVisible);
        // το σήμα του tab ησυχάζει αμέσως· οι κάρτες συνεχίζουν να πάλλονται μέχρι την επόμενη σχεδίαση
        const tb = document.querySelector('.tab-btn[data-tab="records"] [data-badge]');
        if (tb) tb.className = 'rec-badge-soft ml-2 px-1.5 py-0.5 text-[10px]';
    }
    // Τα γραφήματα σε κρυφό tab έχουν μηδενικό μέγεθος· τα ξαναμετράμε.
    requestAnimationFrame(() => Object.values(S.charts).forEach((c) => c.resize()));
}

function applyStaticText() {
    const x = t();
    document.documentElement.lang = S.lang === 'el' ? 'el' : 'en';
    $('pageTitle').textContent = x.title; $('mainTitle').textContent = x.title;
    $('lastUpdateLabel').textContent = x.lastUpdate; $('nextUpdateLabel').textContent = x.nextUpdate;
    $('btnMethodology').textContent = x.methodology;
    document.querySelectorAll('.tab-btn').forEach((b) => {
        const badge = b.querySelector('[data-badge]');
        b.textContent = x.tabs[b.dataset.tab];
        if (badge) b.appendChild(badge);
    });
    document.querySelectorAll('.lang-btn').forEach((b) => {
        const on = b.dataset.lang === S.lang;
        b.className = `lang-btn flex-1 md:flex-none flex items-center justify-center px-4 rounded transition ${on ? 'bg-acc-400 text-slate-900' : 'text-slate-400 hover:text-white'}`;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const ids = {
        genLedgerTitle: x.genLedger, balLedgerTitle: x.balLedger, supplyDonutTitle: x.supplyTitle, usesDonutTitle: x.usesTitle,
        flowsTitle: x.flowsTitle, flowsSub: x.flowsSub, supplyRankTitle: x.supplyTitle, usesRankTitle: x.usesTitle,
        dispatchTitle: x.dispatchTitle, dispatchSub: x.dispatchSub, cleanIntro: x.cleanIntro,
        boxVarTitle: x.boxVar, boxUceTitle: x.boxUce, boxBaseTitle: x.boxBase,
        xrayTitle: x.xrayTitle, xraySub: x.xraySub, reconTitle: x.reconTitle, gapTitle: x.gapTitle, gapSub: x.gapSub, anConclTitle: x.an.conclTitle, anConclSub: x.an.conclSub, anDecTitle: x.an.decTitle, anDecSub: x.an.decSub, anMore: x.methodLink, anLoadTitle: x.an.loadTitle, anLoadSub: x.an.loadSub, anResTitle: x.an.resTitle, anResSub: x.an.resSub, anCalTitle: x.an.calTitle, anCalSub: x.an.calSub, mcpTitle: x.mcpTitle, cleanMore: x.methodLink, gapMore: x.methodLink, recProgTitle: x.recProgTitle, recHourlySub: x.recHourlySub, recDailySub: x.recDailySub, recTopTitle: x.recTopTitle, recModalClose: x.close, loadChartTitle: x.loadTitle, loadChartSub: x.loadSub,
        recHourlyTitle: x.recHourly, recDailyTitle: x.recDaily, modalTitle: x.modalTitle, modalCloseBtn: x.close,
        loadTitle: x.load.title, loadGroup1: x.load.g1, loadGroup2: x.load.g2, loadReady: x.load.ready
    };
    Object.entries(ids).forEach(([id, txt]) => { const el = $(id); if (el) el.textContent = txt; });
    document.querySelectorAll('.load-row').forEach((r) => { r.querySelector('[data-load-label]').textContent = x.load[`s${r.dataset.step}`]; });
    $('modalBody').innerHTML = METHODOLOGY[S.lang];
}

async function setLang(lang) {
    if (lang === S.lang) return;
    S.lang = lang;
    try { localStorage.setItem('kp_lang', lang); } catch (e) { /* */ }
    applyStaticText();
    updateHeader();
    fillPicker();
    await renderAll();
}

function openMethodology(anchor) {
    toggleModal(true);
    if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 320);
}

function toggleModal(open) {
    const modal = $('methodologyModal'), content = $('modalContent');
    if (open) {
        modal.classList.remove('hidden'); modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); });
        modal.querySelector('[data-close-modal]').focus();
    } else {
        modal.classList.add('opacity-0'); content.classList.add('scale-95');
        document.body.style.overflow = '';
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); $('btnMethodologyWrap').focus(); }, 300);
    }
}

// ---------------------------------------------------------------------
// 6b. Δικά μας HTML tooltips (επικεφαλίδα ώρα | τιμή, ενότητες, σύνολα)
// ---------------------------------------------------------------------
const tipHourLabel = (hr) => `${S.lang === 'el' ? 'Ώρα' : 'Hour'}: ${pad(hr - 1)}–${pad(hr)}`;
const tipHead = (left, right) => `<div class="flex justify-between items-baseline gap-6 mb-2.5">
    <b class="text-[15px] text-acc-300">${left}</b>${right ? `<b class="text-[15px]" style="color:${C.price}">${right}</b>` : ''}</div>`;
const tipRule = '<div class="border-t border-dashed border-white/20 my-2"></div>';
function tipRow(label, value, color, opts = {}) {
    if (value === null || value === undefined || Math.round(value) === 0) return '';
    const v = value === null || value === undefined ? '–' : (opts.sign && value > 0 ? '+' : '') + fmt(value, opts.digits || 0);
    return `<div class="flex justify-between items-baseline gap-6 py-[2px] text-[13.5px]">
        <span class="${opts.strong ? 'font-bold text-white' : 'text-slate-200'}">${color ? `<span class="inline-block w-2 h-2 rounded-full mr-2 align-middle" style="background:${color}"></span>` : ''}${esc(label)}:</span>
        <span class="text-white whitespace-nowrap" ${opts.valueColor ? `style="color:${opts.valueColor}"` : ''}><b>${v}</b> ${opts.unit || 'MWh'}</span></div>`;
}
const tipSections = (...parts) => parts.filter((x) => x).join(tipRule);
const priceStr = (p) => p === null || p === undefined ? '' : `MCP: ${fmt(p, p % 1 ? 2 : 0)} €/MWh`;

// Επιστρέφει handler για tooltip.external· το build(dataIndex) δίνει το HTML.
function htmlTip(build) {
    return (ctx) => {
        let el = document.getElementById('chart-tip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'chart-tip';
            el.className = 'fixed z-[9000] pointer-events-none rounded-lg border border-slate-600 bg-slate-900/95 shadow-2xl px-4 py-3 min-w-[240px] max-w-[92vw] transition-opacity duration-100';
            document.body.appendChild(el);
        }
        const tt = ctx.tooltip;
        if (!tt || tt.opacity === 0 || !tt.dataPoints || !tt.dataPoints.length) { el.style.opacity = 0; return; }
        el.innerHTML = build(tt.dataPoints[0].dataIndex);
        el.style.opacity = 1;
        // Θέση: δεξιά του σημείου, ή αριστερά αν δεν χωράει· πάντα μέσα στην οθόνη.
        const r = ctx.chart.canvas.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight, gap = 14;
        let x = r.left + tt.caretX + gap;
        if (x + w > window.innerWidth - 8) x = r.left + tt.caretX - w - gap;
        x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
        let y = r.top + ctx.chart.chartArea.top;
        y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
        el.style.left = `${x}px`; el.style.top = `${y}px`;
    };
}
const tipOff = (build) => ({ enabled: false, external: htmlTip(build) });

// ---------------------------------------------------------------------
// 7. LIVE
// ---------------------------------------------------------------------
function ledgerRow(label, op, value, color, strong = false) {
    return `<div class="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 py-1.5 ${strong ? 'text-base font-bold text-white' : 'text-sm'}">
        <span class="flex items-center gap-2 ${strong ? '' : 'text-slate-300'}">${color ? `<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${color}"></span>` : ''}${esc(label)}</span>
        <span class="text-slate-500 w-3 text-center">${op}</span>
        <span class="text-right min-w-[5.5rem] ${strong ? 'text-acc-300' : 'text-slate-100'}">${fmt(value)} <span class="text-[11px] font-normal text-slate-500">MWh</span></span>
    </div>`;
}
const ledgerRule = '<div class="border-t border-slate-600 my-1.5"></div>';

function renderLive() {
    const day = S.cache[`live/${S.liveDate}`];
    const h = day && day.hours.find((x) => x.hr === S.hourSel && x.has_data);
    if (!h) return;
    const n = t().names, x = t(), g = h.gen;

    // Παραγωγή + υποενότητα καθαρή / ορυκτά (ίδιος υπολογισμός με τον ΑΔΜΗΕ)
    const clean = g.res + g.hydro, fossil = g.lignite + g.gas;
    const shareRow = (label, hint, v, color) => `<div class="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 py-1 text-sm" title="${esc(hint)}">
        <span class="flex items-center gap-2 text-slate-300"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>${esc(label)}</span>
        <span class="text-right text-slate-100">${fmt(v)} <span class="text-[11px] text-slate-500">MWh</span></span>
        <span class="text-right font-semibold text-white min-w-[3.5rem]">${g.total ? fmt(100 * v / g.total, 1) : '–'}%</span></div>`;
    $('genLedger').innerHTML =
        ledgerRow(n.lignite, '', g.lignite, C.lignite) + ledgerRow(n.gas, '+', g.gas, C.gas) +
        ledgerRow(n.hydro, '+', g.hydro, C.hydro) + ledgerRow(n.res, '+', g.res, C.res) +
        ledgerRule + ledgerRow(t().ledgerTotal, '=', g.total, null, true) +
        '<div class="border-t border-dashed border-slate-600 my-2"></div>' +
        shareRow(x.cleanEnergy, x.cleanHint, clean, C.res) + shareRow(x.fossilFuels, x.fossilHint, fossil, C.gas);

    const check = h.balance_ok === true ? `<p class="mt-3 text-xs text-emerald-400">✓ ${esc(t().balanceOk)}</p>`
        : h.balance_ok === false ? `<p class="mt-3 text-xs text-orange-300">${esc(t().balanceOff)}</p>` : '';
    $('balLedger').innerHTML =
        ledgerRow(n.total, '', g.total, null) + ledgerRow(n.imports, '+', h.imports, C.imports) +
        ledgerRow(n.exports, '−', h.exports, C.exports) + ledgerRow(n.dis, '+', h.storage.dis, C.dis) +
        ledgerRow(n.chg, '−', h.storage.chg, C.chg) + ledgerRow(n.pumping, '−', h.pumping, C.pumping) +
        ledgerRule + ledgerRow(t().ledgerDemand, '=', h.demand, null, true) + check;

    // Πίτες με ετικέτες-βελάκια (μεγάλες οθόνες) ή υπόμνημα (στενές)
    const totalIn = g.total + h.imports + h.storage.dis;
    const donut = (id, items) => {
        const data = items.filter((i) => i.v > 0);
        const wide = $(id).parentElement.clientWidth >= CALLOUT_MIN_WIDTH;
        const sum = data.reduce((a, i) => a + i.v, 0);
        const minor = data.filter((i) => i.v / sum < 0.03);
        $(`${id}Minor`).textContent = wide && minor.length ? `${x.minorOther}: ` + minor.map((i) => `${i.l} ${fmt(i.v)} MWh`).join(' · ') : '';
        upsertChart(id, {
            type: 'doughnut',
            data: { labels: data.map((i) => i.l), datasets: [{ data: data.map((i) => i.v), backgroundColor: data.map((i) => i.c), borderColor: '#1e293b', borderWidth: 2 }] },
            options: {
                cutout: '62%',
                hoverOffset: 8,
                interaction: { mode: 'nearest', intersect: true },
                layout: { padding: wide ? { left: 104, right: 104, top: 22, bottom: 22 } : 0 },
                plugins: {
                    legend: { display: !wide, position: 'bottom', labels: { font: { size: 11 } } },
                    tooltip: { enabled: false },
                    centerText: { text: fmt(totalIn), sub: 'MWh', label: x.networkLoad },
                    calloutLabels: { enabled: wide, minShare: 0.03, short: data.map((i) => i.s || i.l) }
                }
            },
            plugins: [centerText, calloutLabels]
        });
    };
    donut('supplyDonut', [
        { l: n.lignite, s: x.short.lignite, v: g.lignite, c: C.lignite }, { l: n.gas, s: x.short.gas, v: g.gas, c: C.gas }, { l: n.hydro, s: x.short.hydro, v: g.hydro, c: C.hydro },
        { l: n.res, s: x.short.res, v: g.res, c: C.res }, { l: n.dis, s: x.short.dis, v: h.storage.dis, c: C.dis }, { l: n.imports, s: x.short.imports, v: h.imports, c: C.imports }
    ]);
    donut('usesDonut', [
        { l: n.demand, s: x.short.demand, v: h.demand, c: '#64748b' }, { l: n.exports, s: x.short.exports, v: h.exports, c: C.exports },
        { l: n.chg, s: x.short.chg, v: h.storage.chg, c: C.chg }, { l: n.pumping, s: x.short.pumping, v: h.pumping, c: C.pumping }
    ]);

    // Ροές
    const codes = ['AL', 'BG', 'IT', 'TR', 'MK'];
    upsertChart('flowsChart', {
        type: 'bar',
        data: {
            labels: codes.map((c) => t().countries[c]),
            datasets: [
                { label: n.imports, data: codes.map((c) => h.flows[c].imp), backgroundColor: C.imports, stack: 'f', borderRadius: 3, maxBarThickness: window.innerWidth >= 1024 ? 69 : 46 },
                { label: n.exports, data: codes.map((c) => -(h.flows[c].exp || 0)), backgroundColor: C.exports, stack: 'f', borderRadius: 3, maxBarThickness: window.innerWidth >= 1024 ? 69 : 46 }
            ]
        },
        options: {
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (v) => fmt(Math.abs(v)) }, title: { display: true, text: 'MWh' } } },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: tipOff((i) => {
                    const f = h.flows[codes[i]], imp = f.imp || 0, exp = f.exp || 0;
                    return tipHead(esc(t().countries[codes[i]]), '') + tipSections(
                        tipRow(n.imports, imp, C.imports) + tipRow(n.exports, exp, C.exports),
                        imp && exp ? tipRow(S.lang === 'el' ? 'Καθαρό (εισ. − εξ.)' : 'Net (imp − exp)', imp - exp, null, { strong: true, sign: true }) : '');
                })
            }
        }
    });
    $('flowsMismatch').textContent = t().flowsMismatch;
    $('flowsMismatch').classList.toggle('hidden', h.flows_match !== false);

    // MCP της ώρας, με θέση στην ημέρα και μέση τιμή
    const prices = day.hours.map((q) => q.dam_price).filter((v) => v !== null && v !== undefined);
    const rank = h.dam_price === null ? null : 1 + prices.filter((v) => v > h.dam_price).length;
    $('mcpBox').innerHTML = `
        <div class="flex items-baseline gap-2"><span class="text-4xl font-bold" style="color:${C.price}">${fmt(h.dam_price, h.dam_price % 1 ? 2 : 0)}</span><span class="text-sm text-slate-400">${esc(x.mcpUnit)}</span></div>
        <p class="text-xs text-slate-400 mt-1">${esc(hourRange(h.hr))}</p>
        <div class="border-t border-slate-700 mt-3 pt-3 space-y-1 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">${esc(x.mcpDayAvg)}</span><span class="text-slate-100">${fmt(day.totals.dam_price_avg, 2)} ${esc(x.mcpUnit)}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">${esc(x.mcpRank)}</span><span class="text-slate-100">${rank ? `${ordinal(rank)} ${esc(x.mcpRankOf)} ${prices.length} (${esc(x.mcpRankHigh)})` : '–'}</span></div>
        </div>`;
}

// ---------------------------------------------------------------------
// 8. DAILY
// ---------------------------------------------------------------------
function rankList(items, total) {
    const rows = items.filter((i) => i.v !== null).sort((a, b) => b.v - a.v);
    return rows.map((i) => {
        const share = total > 0 ? 100 * i.v / total : 0;
        return `<div>
            <div class="flex justify-between items-baseline text-sm gap-3">
                <span class="flex items-center gap-2 text-slate-200"><span class="w-2.5 h-2.5 rounded-sm" style="background:${i.c}"></span>${esc(i.l)}</span>
                <span class="text-slate-100 font-semibold">${fmt(i.v)} <span class="text-[11px] font-normal text-slate-500">MWh</span><span class="text-slate-400 font-normal w-14 inline-block text-right">${fmt(share, 1)}%</span></span>
            </div>
            <div class="h-1.5 bg-slate-700/50 rounded-full mt-1.5 overflow-hidden"><div class="h-full rounded-full" style="width:${share.toFixed(2)}%;background:${i.c}"></div></div>
        </div>`;
    }).join('');
}

async function renderDaily() {
    const day = await getLive(S.dailyDate);
    if (!day) return;
    const n = t().names, tot = day.totals, x = t();
    const nHours = day.hours.length;

    // Ribbon (D40): τέσσερα κουτάκια, κεντραρισμένα
    const prices = day.hours.map((h) => h.dam_price).filter((v) => v !== null && v !== undefined);
    const tile = (label, value, sub) => `<div class="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 text-center">
        <div class="text-[11px] uppercase tracking-wide text-slate-400">${esc(label)}</div>
        <div class="text-lg font-bold text-white mt-0.5">${value}</div>${sub ? `<div class="text-[11px] text-slate-500">${sub}</div>` : ''}</div>`;
    const g = tot.gen;
    const cleanShare = g && g.total ? 100 * (g.res + g.hydro) / g.total : null;
    $('dailyStats').innerHTML =
        tile(x.avgPrice, `${fmt(tot.dam_price_avg, 2)} <span class="text-xs font-normal text-slate-400">€/MWh</span>`) +
        tile(x.priceRange, prices.length ? `${fmt(Math.min(...prices))} – ${fmt(Math.max(...prices))} <span class="text-xs font-normal text-slate-400">€/MWh</span>` : '–') +
        tile(x.hoursData, `${tot.hours_with_data}/${nHours}`, tot.hours_with_data < nHours && S.dailyDate === S.liveDate ? esc(x.dayInProgress) : '') +
        tile(x.dayClean, cleanShare === null ? '–' : `${fmt(cleanShare, 1)}%`, esc(x.cleanHintShort));

    if (tot.hours_with_data > 0) {
        const supply = [
            { l: n.res, v: tot.gen.res, c: C.res }, { l: n.gas, v: tot.gen.gas, c: C.gas }, { l: n.lignite, v: tot.gen.lignite, c: C.lignite },
            { l: n.hydro, v: tot.gen.hydro, c: C.hydro }, { l: n.imports, v: tot.imports, c: C.imports }, { l: n.dis, v: tot.storage.dis, c: C.dis }
        ];
        const uses = [
            { l: n.demand, v: tot.demand, c: C.demand }, { l: n.exports, v: tot.exports, c: C.exports },
            { l: n.chg, v: tot.storage.chg, c: C.chg }, { l: n.pumping, v: tot.pumping, c: C.pumping }
        ];
        const sumOf = (a) => a.reduce((s, i) => s + (i.v || 0), 0);
        $('supplyRank').innerHTML = rankList(supply, sumOf(supply));
        $('usesRank').innerHTML = rankList(uses, sumOf(uses));
    } else {
        $('supplyRank').innerHTML = $('usesRank').innerHTML = `<p class="text-sm text-slate-500">${esc(x.noData)}</p>`;
    }

    const H = day.hours;
    const val = (fn) => H.map((h) => (h.has_data ? fn(h) : null));
    const bar = (label, data, color) => ({ type: 'bar', label, data, backgroundColor: color, stack: 's', yAxisID: 'y', order: 2 });
    upsertChart('dispatchChart', {
        data: {
            labels: H.map((h) => hourTick(h.hr)),
            datasets: [
                // Σειρά στοίβαξης από το μηδέν προς τα έξω (D28): κάτω από το μηδέν
                // άντληση → φόρτιση → εξαγωγές (οι εξαγωγές στον πάτο)· πάνω από το μηδέν
                // λιγνίτης → αέριο → εισαγωγές → εκφόρτιση → ΑΠΕ → υδροηλεκτρικά (στην κορυφή).
                bar(n.pumping, val((h) => -h.pumping), C.pumping), bar(n.chg, val((h) => -h.storage.chg), C.chg),
                bar(n.exports, val((h) => -h.exports), C.exports),
                bar(n.lignite, val((h) => h.gen.lignite), C.lignite), bar(n.gas, val((h) => h.gen.gas), C.gas),
                bar(n.imports, val((h) => h.imports), C.imports), bar(n.dis, val((h) => h.storage.dis), C.dis),
                bar(n.res, val((h) => h.gen.res), C.res), bar(n.hydro, val((h) => h.gen.hydro), C.hydro),
                { type: 'line', label: n.demand, data: val((h) => h.demand), borderColor: C.demand, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, yAxisID: 'y', order: 1, spanGaps: false },
                { type: 'line', label: n.price, data: H.map((h) => h.dam_price), borderColor: C.price, backgroundColor: C.price, borderWidth: 2, pointRadius: 2.5, yAxisID: 'y1', order: 0 }
            ]
        },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { stacked: true, grid: { display: false }, title: { display: true, text: x.hourAxis } },
                y: { stacked: true, title: { display: true, text: 'MWh' }, ticks: { callback: axisMWhAbs } },
                y1: { position: 'right', grid: { display: false }, title: { display: true, text: '€/MWh', color: C.price }, ticks: { color: C.price } }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: tipOff((i) => {
                    const h = H[i];
                    let html = tipHead(tipHourLabel(h.hr), priceStr(h.dam_price));
                    if (!h.has_data) return html + `<p class="text-xs text-slate-400">${S.lang === 'el' ? 'Η ώρα δεν έχει γίνει ακόμα.' : 'This hour has not happened yet.'}</p>`;
                    return html + tipSections(
                        tipRow(n.hydro, h.gen.hydro, C.hydro) + tipRow(n.res, h.gen.res, C.res) + tipRow(n.dis, h.storage.dis, C.dis) +
                        tipRow(n.imports, h.imports, C.imports) + tipRow(n.gas, h.gen.gas, C.gas) + tipRow(n.lignite, h.gen.lignite, C.lignite),
                        tipRow(n.demand, h.demand, '#94a3b8', { strong: true }) + tipRow(n.pumping, h.pumping, C.pumping) +
                        tipRow(n.chg, h.storage.chg, C.chg) + tipRow(n.exports, h.exports, C.exports));
                })
            }
        }
    });
}

// ---------------------------------------------------------------------
// 9. CLEAN ENERGY
// ---------------------------------------------------------------------
function boxRow(label, value, color, sign = false) {
    const v = value === null || value === undefined ? '–' : (sign && value > 0 ? '+' : '') + fmt(value);
    return `<div class="flex justify-between items-baseline text-sm gap-3">
        <span class="flex items-center gap-2 text-slate-300">${color ? `<span class="w-2.5 h-2.5 rounded-sm" style="background:${color}"></span>` : ''}${esc(label)}</span>
        <span class="text-slate-100 font-semibold">${v} <span class="text-[11px] font-normal text-slate-500">MWh</span></span>
    </div>`;
}

async function renderClean() {
    const [xr, en] = await Promise.all([getXray(S.cleanDate), getEntsoe(S.cleanDate)]);
    if (!xr) return;
    const n = t().names, x = t(), tot = xr.totals, H = xr.hours;

    $('boxVar').innerHTML = boxRow(n.wind, tot.wind, C.wind) + boxRow(n.bigHydro, tot.big_hydro, C.bigHydro) + boxRow(n.solar, tot.solar, C.solar);
    $('boxBase').innerHTML = boxRow(n.smallHydro, tot.small_hydro, C.smallHydro) + boxRow(n.biomass, tot.biomass, C.biomass) +
        `<p class="pt-2 mt-1 border-t border-slate-700 text-xs text-slate-400">${esc(S.lang === 'el' ? 'Συμπαραγωγή (ΣΗΘΥΑ), εκτός καθαρής' : 'Cogeneration (CHP), excluded from clean')}: <span class="text-slate-300 font-semibold">${fmt(tot.cogen)} MWh</span></p>`;
    if (tot.uce === null) {
        const first = (S.manifest.live_days || [])[0];
        $('boxUce').innerHTML = `<p class="text-sm text-slate-400">${esc(x.uceNA.replace('{d}', first ? fmtDate(first) : '–'))}</p>`;
    } else {
        $('boxUce').innerHTML = `<div class="flex justify-between items-baseline gap-3 pb-2 mb-1 border-b border-slate-700">
                <span class="text-sm text-slate-300">${esc(x.uceNet)}</span>
                <span class="text-xl font-bold ${tot.uce < 0 ? 'text-sky-300' : 'text-red-300'}">${tot.uce > 0 ? '+' : ''}${fmt(tot.uce)} <span class="text-xs font-normal text-slate-500">MWh</span></span>
            </div>` + boxRow(x.ucePos, tot.uce_positive || 0, null, true) + boxRow(x.uceNeg, tot.uce_negative || 0, null, true);
    }

    const bar = (label, key, color) => ({ type: 'bar', label, data: H.map((h) => h[key]), backgroundColor: color, stack: 'c', yAxisID: 'y', order: 2 });
    upsertChart('xrayChart', {
        data: {
            labels: H.map((h) => hourTick(h.hr)),
            datasets: [
                // Σειρά στοίβαξης από κάτω προς τα πάνω (D28).
                bar(n.biomass, 'biomass', C.biomass), bar(n.smallHydro, 'small_hydro', C.smallHydro),
                bar(n.uce, 'uce', C.uce),
                bar(n.solar, 'solar', C.solar), bar(n.bigHydro, 'big_hydro', C.bigHydro), bar(n.wind, 'wind', C.wind),
                { type: 'line', label: n.price, data: H.map((h) => h.mcp), borderColor: C.price, backgroundColor: C.price, borderWidth: 2, pointRadius: 2.5, yAxisID: 'y1', order: 0 }
            ]
        },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { stacked: true, grid: { display: false }, title: { display: true, text: x.hourAxis } },
                y: { stacked: true, title: { display: true, text: 'MWh' }, ticks: { callback: axisMWh } },
                y1: { position: 'right', grid: { display: false }, title: { display: true, text: '€/MWh', color: C.price }, ticks: { color: C.price } }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: tipOff((i) => {
                    const h = H[i];
                    const total = h.uce !== null ? h.phys_clean + h.uce : h.phys_clean;
                    return tipHead(tipHourLabel(h.hr), priceStr(h.mcp)) + tipSections(
                        tipRow(n.wind, h.wind, C.wind) + tipRow(n.bigHydro, h.big_hydro, C.bigHydro) + tipRow(n.solar, h.solar, C.solar),
                        tipRow(S.lang === 'el' ? 'Μη κατανεμημένη καθαρή ενέργεια' : 'Unallocated clean energy', h.uce, C.uce, { strong: true, sign: true }),
                        tipRow(n.smallHydro, h.small_hydro, C.smallHydro) + tipRow(n.biomass, h.biomass, C.biomass),
                        tipRow(S.lang === 'el' ? 'Συνολική καθαρή ενέργεια' : 'Total clean energy', total, null, { valueColor: C.res }));
                })
            }
        }
    });

    const enByHr = en ? Object.fromEntries(en.hours.map((h) => [h.hr, h])) : {};
    const enFirstByHr = en && en.first && en.first.hours ? Object.fromEntries(en.first.hours.map((h) => [h.hr, h])) : {};
    const enStatus = en && en.status ? (en.status === 'final' ? x.gapFinal : x.gapProvisional) : '';
    // Η πρώτη έκδοση εμφανίζεται μόνο όταν διαφέρει ουσιαστικά από την τρέχουσα (>1% στα ημερήσια φ/β).
    const solarRevised = en && en.first && en.first.totals && en.totals.solar && Math.abs(en.first.totals.solar - en.totals.solar) > 0.01 * en.totals.solar;
    const line = (label, data, color, dash) => ({ type: 'line', label, data, borderColor: color, backgroundColor: color, borderWidth: dash === 'dot' ? 2 : 2.5, pointRadius: 0, tension: 0.3, borderDash: dash === 'dash' ? [7, 5] : dash === 'dot' ? [2, 4] : [] });
    const ds = [line(n.admieSolar, H.map((h) => h.solar), C.solar), line(n.admieWind, H.map((h) => h.wind), C.wind)];
    const withStatus = (label) => enStatus ? label.replace(')', `, ${enStatus})`) : label;
    if (en) ds.push(line(withStatus(n.entsoeSolar), H.map((h) => (enByHr[h.hr] || {}).solar ?? null), C.entsoeSolar, 'dash'),
                    line(withStatus(n.entsoeWind), H.map((h) => (enByHr[h.hr] || {}).wind ?? null), C.entsoeWind, 'dash'));
    if (solarRevised) ds.push(line(x.entsoeSolarFirst, H.map((h) => (enFirstByHr[h.hr] || {}).solar ?? null), C.entsoeSolar, 'dot'));
    upsertChart('reconChart', {
        type: 'line',
        data: { labels: H.map((h) => hourTick(h.hr)), datasets: ds },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: { x: { grid: { display: false }, title: { display: true, text: x.hourAxis } }, y: { title: { display: true, text: 'MWh' }, ticks: { callback: axisMWh } } },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: tipOff((i) => {
                    const h = H[i], e = enByHr[h.hr] || {};
                    return tipHead(tipHourLabel(h.hr), '') + tipSections(
                        tipRow(n.admieSolar, h.solar, C.solar) + tipRow(n.entsoeSolar, en ? e.solar : null, C.entsoeSolar) +
                        (solarRevised ? tipRow(x.entsoeSolarFirst, (enFirstByHr[h.hr] || {}).solar, C.entsoeSolar) : ''),
                        tipRow(n.admieWind, h.wind, C.wind) + tipRow(n.entsoeWind, en ? e.wind : null, C.entsoeWind));
                })
            }
        }
    });
    $('reconSub').textContent = en ? x.reconSub : x.reconNA;
    await renderGap(xr, en);
}

// ---------------------------------------------------------------------
// 9b. ΑΔΜΗΕ και ENTSO-E: σύγκριση της ημέρας και φορτίο (D33)
// ---------------------------------------------------------------------
function gapCard(title, body) {
    return `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-4"><h3 class="text-xs font-semibold text-slate-400 mb-2">${esc(title)}</h3>${body}</div>`;
}
const gwh = (v) => v === null || v === undefined ? '–' : fmt(v / 1000, 1);
function gapLine(label, value, unit, strong) {
    return `<div class="flex justify-between items-baseline gap-3 text-sm"><span class="text-slate-300">${esc(label)}</span><span class="${strong ? 'font-bold text-white' : 'text-slate-100'}">${value} <span class="text-[11px] font-normal text-slate-500">${unit}</span></span></div>`;
}

async function renderGap(xr, en) {
    const x = t(), live = await getLive(S.cleanDate);
    if (!live || !live.totals || !live.totals.gen) { $('gapBox').innerHTML = ''; return; }
    const g = live.totals.gen;
    const aClean = g.res + g.hydro, aShare = aClean / (g.res + g.hydro + g.gas + g.lignite);
    let cards = '';
    if (en) {
        const e = en.totals, eClean = (e.solar || 0) + (e.wind || 0) + (e.hydro || 0) + (e.biomass || 0);
        const eShare = eClean / (eClean + (e.gas || 0) + (e.lignite || 0));
        const status = en.status === 'final' ? x.gapFinal : en.status === 'provisional' ? x.gapProvisional : '';
        const src = status ? `ENTSO-E (${status})` : 'ENTSO-E';
        cards += gapCard(x.gapShare,
            gapLine('ΑΔΜΗΕ', fmt(aShare * 100, 1), '%') + gapLine(src, fmt(eShare * 100, 1), '%') +
            gapLine('Δ', fmt((aShare - eShare) * 100, 1), x.gapPoints, true));
        cards += gapCard(x.gapClean,
            gapLine('ΑΔΜΗΕ', gwh(aClean), 'GWh') + gapLine(src, gwh(eClean), 'GWh') +
            gapLine(x.gapMissing, gwh(aClean - eClean), 'GWh', true));
        const f = en.first && en.first.totals;
        const fLabel = en.first && en.first.status === 'unknown' ? x.gapUnknown : x.gapFirst;
        const revised = f && e.solar && Math.abs(f.solar - e.solar) > 0.01 * e.solar;
        cards += gapCard(x.gapRevision, !f
            ? gapLine(x.gapNow, gwh(e.solar), 'GWh') + `<p class="text-xs text-slate-500 mt-1">${esc(x.gapNoHistory)}</p>`
            : gapLine(fLabel, gwh(f.solar), 'GWh') + gapLine(status ? `${x.gapNow} (${status})` : x.gapNow, gwh(e.solar), 'GWh') +
              (revised ? gapLine('Δ', gwh(e.solar - f.solar), 'GWh', true) : `<p class="text-xs text-slate-500 mt-1">${esc(en.status === 'final' ? '' : x.gapNotYet)}</p>`));
        const crete = live.totals.crete_flow ?? (xr && xr.totals ? xr.totals.crete_flow : null);   // αρνητικό = προς Κρήτη
        const noCrete = crete === null || crete === undefined ? null : live.totals.demand + crete;
        cards += gapCard(x.gapLoad, e.load === null || e.load === undefined
            ? gapLine('ΑΔΜΗΕ', gwh(live.totals.demand), 'GWh') + `<p class="text-xs text-slate-500 mt-1">${esc(x.gapNoLoad)}</p>`
            : gapLine('ΑΔΜΗΕ', gwh(live.totals.demand), 'GWh') +
              (noCrete !== null ? gapLine(x.gapNoCrete, gwh(noCrete), 'GWh') : '') +
              gapLine(src, gwh(e.load), 'GWh') +
              gapLine('Δ', gwh((noCrete !== null ? noCrete : live.totals.demand) - e.load), 'GWh', true));
    }
    $('gapBox').innerHTML = cards;

    // Γράφημα φορτίου
    const H = live.hours.filter((h) => h.has_data);
    const enByHr = en ? Object.fromEntries(en.hours.map((h) => [h.hr, h])) : {};
    const fByHr = en && en.first && en.first.hours ? Object.fromEntries(en.first.hours.map((h) => [h.hr, h])) : {};
    const hasLoad = en && en.totals.load !== null && en.totals.load !== undefined;
    const loadRevised = hasLoad && en.first && en.first.totals && en.first.totals.load && Math.abs(en.first.totals.load - en.totals.load) > 0.005 * en.totals.load;
    const ln = (label, data, color, dash) => ({ type: 'line', label, data, borderColor: color, backgroundColor: color, borderWidth: 2.5, pointRadius: 0, tension: 0.3, borderDash: dash === 'dash' ? [7, 5] : dash === 'dot' ? [2, 4] : [] });
    const xrByHr = xr ? Object.fromEntries(xr.hours.map((q) => [q.hr, q])) : {};
    const creteOf = (h) => h.crete_flow ?? (xrByHr[h.hr] || {}).crete_flow ?? null;   // αρνητικό = προς Κρήτη
    const noCreteData = H.map((h) => (creteOf(h) === null ? null : h.demand + creteOf(h)));
    const hasCrete = noCreteData.some((v) => v !== null);
    const ds = [ln(x.admieLoad, H.map((h) => h.demand), C.demand)];
    if (hasCrete) ds.push({ ...ln(x.admieLoadNoCrete, noCreteData, '#94a3b8'), borderWidth: 1.5 });
    if (hasLoad) ds.push(ln(x.entsoeLoad, H.map((h) => (enByHr[h.hr] || {}).load ?? null), C.price, 'dash'));
    if (loadRevised) ds.push(ln(x.entsoeLoadFirst, H.map((h) => (fByHr[h.hr] || {}).load ?? null), C.price, 'dot'));
    upsertChart('loadChart', {
        type: 'line',
        data: { labels: H.map((h) => hourTick(h.hr)), datasets: ds },
        options: {
            interaction: { mode: 'index', intersect: false },
            scales: { x: { grid: { display: false }, title: { display: true, text: x.hourAxis } }, y: { title: { display: true, text: 'MWh' }, ticks: { callback: axisMWh } } },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: tipOff((i) => {
                    const h = H[i], e = enByHr[h.hr] || {}, f = fByHr[h.hr] || {};
                    return tipHead(tipHourLabel(h.hr), '') + tipSections(
                        tipRow(x.admieLoad, h.demand, C.demand) + (hasCrete ? tipRow(x.admieLoadNoCrete, noCreteData[i], '#94a3b8') : '') +
                        (hasLoad ? tipRow(x.entsoeLoad, e.load, C.price) : '') +
                        (loadRevised ? tipRow(x.entsoeLoadFirst, f.load, C.price) : ''),
                        hasLoad && e.load ? tipRow('Δ', (noCreteData[i] ?? h.demand) - e.load, null, { strong: true, sign: true }) : '');
                })
            }
        }
    });
}

// ---------------------------------------------------------------------
// 10. RECORDS
// ---------------------------------------------------------------------
const REC_ORDER = {
    hourly: [['solar', C.solar], ['wind', C.wind], ['exports', C.exports], ['bess_chg', C.chg], ['bess_dis', C.dis], ['bess_chg_pump', C.pumping], ['network_load', C.accent]],
    daily: [['solar', C.solar], ['wind', C.wind], ['exports', C.exports], ['bess_chg', C.chg], ['bess_dis', C.dis], ['bess_chg_pump', C.pumping], ['res', C.res]]
};
const MEDAL = ['text-acc-300', 'text-slate-400', 'text-slate-500'];

function recordWhen(id) {
    // 'YYYY-MM-DD' ή 'YYYY-MM-DD, HH:00' (HH = hr του ΑΔΜΗΕ, δηλ. τέλος της ώρας)
    const [d, hh] = id.split(', ');
    const date = `<span class="whitespace-nowrap">${esc(fmtDate(d, true))}</span>`;
    return hh ? `${date}, <span class="whitespace-nowrap">${esc(hourRange(parseInt(hh, 10)).replace(/:00/g, ''))}</span>` : date;
}

// «Πρόσφατο» ρεκόρ (D45): στις 5 πρώτες και μέσα στις τελευταίες 24 ώρες δεδομένων
// (ωριαία: έως 24 ώρες πριν από την τελευταία ώρα· ημερήσια: σήμερα ή χθες).
function recentRank(items) {
    const last = S.manifest && S.manifest.last_live;
    if (!last || !items) return null;
    const ref = dayIndex(last.date) * 24 + last.hr;
    for (let i = 0; i < items.length; i++) {
        const [d, hh] = items[i].id.split(', ');
        const recent = hh ? (ref - (dayIndex(d) * 24 + parseInt(hh, 10))) < 24 : dayIndex(d) >= dayIndex(last.date) - 1;
        if (recent) return i + 1;
    }
    return null;
}
const isRecentId = (id) => recentRank([{ id }]) !== null;

function shortWhen(id) {
    const [d, hh] = id.split(', ');
    const [y, m, dd] = d.split('-').map(Number);
    const yr = S.manifest && S.manifest.last_live && +S.manifest.last_live.date.slice(0, 4) !== y ? `/${String(y).slice(2)}` : '';
    const date = `${dd}/${m}${yr}`;
    return hh ? `${date} · ${hourRange(parseInt(hh, 10)).replace(/:00/g, '')}` : date;
}
// Μνήμη «το έχω δει» (D48): κλειδιά των πρόσφατων ρεκόρ που ο επισκέπτης έχει ήδη δει στο tab Ρεκόρ.
const SEEN_KEY = 'lgp_rec_seen';
function seenSet() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } }
function markSeen(keys) {
    try {
        const cur = seenSet(); keys.forEach((k) => cur.add(k));
        localStorage.setItem(SEEN_KEY, JSON.stringify([...cur].slice(-200)));   // όριο ώστε να μη μεγαλώνει για πάντα
    } catch (e) { /* χωρίς αποθήκευση: απλώς πάλλονται όλα, όπως πριν */ }
}
const recKey = (scope, key, id) => `${scope}:${key}:${id}`;
// #1: γεμάτο· #2–#5: περίγραμμα· παλμός μόνο αν δεν το έχει δει
function badgeHtml(rank, extra = '', unseen = false) {
    const cls = rank === 1 ? 'rec-badge' : 'rec-badge-soft';
    return `<span class="${cls} ${unseen && rank === 1 ? 'rec-pulse' : ''} ${extra}">${esc(t().newAt)}${rank}</span>`;   // παλμός μόνο σε νέο #1
}
// Το πρόσφατο ρεκόρ μιας κατηγορίας: θέση και κλειδί
function recentEntry(scope, key, items) {
    const rank = recentRank(items);
    return rank ? { rank, key: recKey(scope, key, items[rank - 1].id) } : null;
}

function renderRecords() {
    const R = S.records, x = t(), start = R && R.tracking_start ? R.tracking_start.live : (S.manifest.live_days || [])[0];
    $('recordsIntro').textContent = x.recordsIntro.replace('{l}', start ? fmtDate(start) : '–');
    const counts = { hourly: 0, daily: 0 }, unseenCounts = { hourly: 0, daily: 0 }, seen = seenSet();
    S.recVisible = [];
    const block = (scope) => {
        let cards = '', rows = '';
        REC_ORDER[scope].forEach(([key, color]) => {
            const items = (R && R[scope] && R[scope][key]) || [];
            const top = items[0];
            const re = recentEntry(scope, key, items), rank = re ? re.rank : null, unseen = !!re && !seen.has(re.key);
            if (re) { counts[scope]++; S.recVisible.push(re.key); if (unseen) unseenCounts[scope]++; }
            if (!top) {
                cards += `<div class="bg-slate-800/40 p-4 rounded-xl border border-slate-700"><h3 class="text-sm font-semibold text-slate-200">${esc(x.rec[key])}</h3><p class="text-sm text-slate-500 mt-2">${esc(x.noData)}</p></div>`;
                return;
            }
            const ring = rank === 1 ? 'border-fuchsia-500/60' : rank ? 'border-fuchsia-500/30' : 'border-slate-700';
            // desktop / tablet: κάρτα
            cards += `<button type="button" data-rec="${scope}:${key}" class="relative group text-left bg-slate-800/40 p-4 rounded-xl border ${ring} hover:border-acc-400 hover:bg-slate-800/70 transition w-full">
                ${rank ? badgeHtml(rank, `rec-sticker ${rank === 1 ? 'rec-tilt' : ''}`, unseen) : ''}
                <h3 class="text-sm font-semibold text-slate-200 pr-10">${esc(x.rec[key])}</h3>
                <div class="mt-2 text-2xl font-bold" style="color:${color}">${fmt(top.value)} <span class="text-xs font-normal text-slate-500">MWh</span></div>
                <div class="flex justify-between items-center mt-1 text-xs">
                    <span class="text-slate-400">${recordWhen(top.id)}</span>
                    <span class="text-acc-300 group-hover:text-white">${esc(x.viewHistory)}</span>
                </div>
            </button>`;
            // κινητό: συμπαγής γραμμή
            rows += `<button type="button" data-rec="${scope}:${key}" class="w-full flex items-center gap-3 py-2.5 px-3 text-left ${rank ? 'bg-fuchsia-500/10' : ''}">
                <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold text-slate-200 truncate">${esc((x.recShort && x.recShort[key]) || x.rec[key])}</span>
                    <span class="flex items-center gap-2 text-[11px] text-slate-400">${esc(shortWhen(top.id))}${rank ? badgeHtml(rank, 'text-[10px] px-1.5 py-px', unseen) : ''}</span>
                </span>
                <span class="text-base font-bold whitespace-nowrap" style="color:${color}">${fmt(top.value)} <span class="text-[10px] font-normal text-slate-500">MWh</span></span>
                <span class="text-slate-500 text-lg leading-none">›</span>
            </button>`;
        });
        return `<div class="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">${cards}</div>
                <div class="sm:hidden divide-y divide-slate-700/60 border border-slate-700/60 rounded-xl overflow-hidden">${rows}</div>`;
    };
    $('recHourly').innerHTML = block('hourly');
    $('recDaily').innerHTML = block('daily');
    document.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => openRecord(...b.dataset.rec.split(':'))));

    // διακόπτης κινητού
    document.querySelectorAll('.rec-scope-btn').forEach((b) => {
        const sc = b.dataset.recscope, on = sc === S.recScope;
        b.className = `rec-scope-btn flex-1 h-10 rounded flex items-center justify-center gap-2 transition ${on ? 'bg-acc-400 text-slate-900' : 'text-slate-400'}`;
        b.innerHTML = `${esc(sc === 'hourly' ? x.recHourly : x.recDaily)}${counts[sc] ? ` <span class="${unseenCounts[sc] ? 'rec-badge rec-pulse' : 'rec-badge-soft'} text-[10px] px-1.5 py-0.5">${counts[sc]} ${esc(x.newPlural)}</span>` : ''}`;
    });
    $('recPanelHourly').classList.toggle('max-sm:hidden', S.recScope !== 'hourly');
    $('recPanelDaily').classList.toggle('max-sm:hidden', S.recScope !== 'daily');

    // σήμα στο tab
    const total = counts.hourly + counts.daily, totalUnseen = unseenCounts.hourly + unseenCounts.daily;
    const btn = document.querySelector('.tab-btn[data-tab="records"]');
    let badge = btn.querySelector('[data-badge]');
    if (total > 0) {
        if (!badge) { badge = document.createElement('span'); badge.dataset.badge = '1'; btn.appendChild(badge); }
        badge.className = `${totalUnseen ? 'rec-badge rec-pulse' : 'rec-badge-soft'} ml-2 px-1.5 py-0.5 text-[10px]`;
        badge.textContent = `${total} ${x.newPlural}`;
    } else if (badge) badge.remove();
}

// --- Modal ρεκόρ (D39): εξέλιξη του #1 + πέντε κορυφαίες ---
const dayIndex = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const isoFromIndex = (i) => new Date(i * 86400000).toISOString().slice(0, 10);
const TRACKING_SHADE_DAYS = 21;

// Σκιά «έναρξη καταγραφής»: τις πρώτες εβδομάδες σχεδόν κάθε μέρα είναι «ρεκόρ».
const startShade = {
    id: 'startShade',
    beforeDatasetsDraw(chart, _a, opts) {
        if (!opts || opts.from === undefined) return;
        const { ctx, chartArea: area, scales: { x } } = chart;
        const x0 = Math.max(area.left, x.getPixelForValue(opts.from)), x1 = Math.min(area.right, x.getPixelForValue(opts.to));
        if (x1 <= x0) return;
        ctx.save();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.10)'; ctx.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
        ctx.fillStyle = C.muted; ctx.font = `11px ${Chart.defaults.font.family}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(opts.label, x0 + 6, area.top + 6);
        ctx.restore();
    }
};

function openRecord(scope, key) {
    const R = S.records, x = t();
    const top = (R[scope] && R[scope][key]) || [], prog = (R.progression && R.progression[scope] && R.progression[scope][key]) || [];
    const color = (REC_ORDER[scope].find(([k]) => k === key) || [])[1] || C.accent;
    $('recModalTitle').textContent = `${x.rec[key]} · ${scope === 'hourly' ? x.recHourly : x.recDaily}`;
    const rRank = recentRank(top);
    $('recModalSub').innerHTML = (top[0] ? esc(`#1: ${fmt(top[0].value)} MWh · ${recordWhen(top[0].id).replace(/<[^>]+>/g, '')}`) : '') +
        (rRank ? ` <span class="ml-2 align-middle inline-block">${badgeHtml(rRank, 'text-[11px] px-2 py-0.5')}</span>` : '');

    // κλιμακωτό γράφημα: κάθε σημείο = νέο ρεκόρ· η τελευταία τιμή εκτείνεται έως σήμερα
    const start = (R.tracking_start && (['solar', 'wind'].includes(key) ? R.tracking_start.xray : R.tracking_start.live)) || (prog[0] && prog[0].id);
    const pts = prog.map((p) => ({ x: dayIndex(p.id) + (p.id.length > 10 ? (parseInt(p.id.slice(12, 14), 10) - 0.5) / 24 : 0.5), y: p.value, id: p.id }));
    const today = S.liveDate ? dayIndex(S.liveDate) + 1 : (pts.length ? pts[pts.length - 1].x + 1 : 0);
    if (pts.length) pts.push({ x: today, y: pts[pts.length - 1].y, id: null });
    const s0 = start ? dayIndex(start) : (pts[0] ? Math.floor(pts[0].x) : 0);
    upsertChart('recProgChart', {
        type: 'line',
        data: { datasets: [{ label: x.rec[key], data: pts, borderColor: color, backgroundColor: pts.map((p) => (p.id && isRecentId(p.id) ? '#d946ef' : color)),
                             stepped: 'before', borderWidth: 2.5,
                             pointRadius: pts.map((p) => (!p.id ? 0 : isRecentId(p.id) ? 7 : 3.5)), pointHoverRadius: 7 }] },
        options: {
            parsing: false,
            scales: {
                x: { type: 'linear', min: s0, max: today, grid: { display: false },
                     ticks: { maxTicksLimit: 7, callback: (v) => fmtDate(isoFromIndex(Math.floor(v)), false) } },
                y: { title: { display: true, text: 'MWh' }, ticks: { callback: (v) => fmt(v) } }
            },
            plugins: {
                legend: { display: false },
                startShade: { from: s0, to: s0 + TRACKING_SHADE_DAYS, label: x.trackingStart },
                tooltip: { filter: (c) => !!c.raw.id, callbacks: { title: (items) => recordWhen(items[0].raw.id).replace(/<[^>]+>/g, ''), label: (c) => ` ${fmt(c.raw.y)} MWh` } }
            }
        },
        plugins: [startShade]
    });

    $('recTopTable').innerHTML = `<table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-slate-400 border-b border-slate-700">
            <th class="py-2 pr-3 font-medium">${esc(x.recRank)}</th><th class="py-2 pr-3 font-medium">${esc(x.recWhen)}</th><th class="py-2 text-right font-medium">${esc(x.recValue)}</th></tr></thead>
        <tbody>${top.map((it, i) => `<tr class="border-b border-slate-800 ${isRecentId(it.id) ? 'bg-fuchsia-500/10' : ''}">
            <td class="py-2 pr-3 font-bold ${i === 0 ? 'text-acc-300' : 'text-slate-400'}">#${i + 1}</td>
            <td class="py-2 pr-3 text-slate-300">${recordWhen(it.id)}${isRecentId(it.id) ? ` <span class="ml-1 inline-block">${badgeHtml(i + 1, 'text-[10px] px-1.5 py-0.5')}</span>` : ''}</td>
            <td class="py-2 text-right font-semibold" style="color:${color}">${fmt(it.value)} <span class="text-[11px] font-normal text-slate-500">MWh</span></td></tr>`).join('')}</tbody></table>`;
    toggleRecModal(true);
}

function toggleRecModal(open) {
    const modal = $('recordModal'), content = $('recModalContent');
    if (open) {
        modal.classList.remove('hidden'); modal.classList.add('flex'); document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); if (S.charts.recProgChart) S.charts.recProgChart.resize(); });
        modal.querySelector('[data-close-rec]').focus();
    } else {
        modal.classList.add('opacity-0'); content.classList.add('scale-95'); document.body.style.overflow = '';
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    }
}

// ---------------------------------------------------------------------
// 10b. ΑΝΑΛΥΣΗ (D46): συμπέρασμα, ανάλυση UCE, επίπεδα, βαθμονόμηση
// ---------------------------------------------------------------------
const getAnalysis = (iso) => getJSON(`analysis/${iso}`);
const C_AN = { base: '#64748b', crete: '#14b8a6', mv: '#a78bfa' };

async function renderAnalysis() {
    const x = t(), a = x.an;
    if (!S.anDate) { $('anConclusion').innerHTML = `<p class="text-slate-400">${esc(a.none)}</p>`; return; }
    const [A, cal] = await Promise.all([getAnalysis(S.anDate), getJSON('analysis/calibration')]);
    if (!A) { $('anConclusion').innerHTML = `<p class="text-slate-400">${esc(a.none)}</p>`; return; }

    // 1. Συμπέρασμα
    $('anConclusion').innerHTML = (A.conclusion[S.lang] || []).map((p) => `<p>${esc(p)}</p>`).join('');

    // 2. Ανάλυση UCE ώρα προς ώρα
    const D = A.uce_decomposition;
    if (D) {
        const H = D.hours;
        const bar = (label, key, color) => ({ label, data: H.map((h) => h[key]), backgroundColor: color, stack: 'u', borderRadius: 2, order: 2 });
        upsertChart('anDecChart', {
            type: 'bar',
            data: {
                labels: H.map((h) => hourTick(h.hr)),
                datasets: [
                    bar(a.base, 'base', C_AN.base), bar(a.wind, 'wind', C.wind), bar(a.pv, 'pv', C.solar),
                    { ...bar(a.residual, 'residual', 'rgba(226, 232, 240, 0.10)'), borderColor: '#e2e8f0', borderWidth: 1 },
                    { type: 'line', label: a.uce, data: H.map((h) => h.uce), borderColor: C.uce, backgroundColor: C.uce, borderWidth: 2.5, pointRadius: 0, tension: 0.3, order: 1 }
                ]
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: { x: { stacked: true, grid: { display: false }, title: { display: true, text: x.hourAxis } },
                          y: { stacked: true, title: { display: true, text: 'MWh' }, ticks: { callback: axisMWh } } },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: tipOff((i) => {
                        const h = H[i];
                        return tipHead(tipHourLabel(h.hr), '') + tipSections(
                            tipRow(a.pv, h.pv, C.solar) + tipRow(a.wind, h.wind, C.wind) + tipRow(a.base, h.base, C_AN.base) +
                            tipRow(a.residual, h.residual, '#cbd5e1', { sign: true }),
                            tipRow(a.uce, h.uce, C.uce, { strong: true }));
                    })
                }
            }
        });
    } else if (S.charts.anDecChart) { S.charts.anDecChart.destroy(); delete S.charts.anDecChart; }

    // 3. Επίπεδα: φορτίο και τρία σύνολα ΑΠΕ (GWh)
    const Ld = A.layers && A.layers.load, Rs = A.layers && A.layers.res;
    const g = (v) => (v === null || v === undefined ? null : v / 1000);
    if (Ld && Ld.net_load !== null) {
        const seg = (label, v, color) => ({ label, data: [g(v), null], backgroundColor: color, stack: 'l', borderRadius: 3, barThickness: 34 });
        upsertChart('anLoadChart', {
            type: 'bar',
            data: {
                labels: [a.admieRow, a.entsoeRow],
                datasets: [
                    seg(a.noCrete, Ld.transmission_no_crete, '#475569'), seg(a.crete, Ld.crete, C_AN.crete),
                    seg(a.mv, Ld.mv, C_AN.mv), seg(a.lv, Ld.lv, C.uce),
                    { label: a.entsoeLoad, data: [null, g(Ld.entsoe)], backgroundColor: C.price, stack: 'l', borderRadius: 3, barThickness: 34 }
                ]
            },
            options: {
                indexAxis: 'y',
                scales: { x: { stacked: true, title: { display: true, text: 'GWh' }, ticks: { callback: (v) => fmt(v) } }, y: { stacked: true, grid: { display: false } } },
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } },
                           tooltip: { callbacks: { label: (c) => c.raw === null ? null : ` ${c.dataset.label}: ${fmt(c.raw, 1)} GWh` } } }
            }
        });
    } else if (S.charts.anLoadChart) { S.charts.anLoadChart.destroy(); delete S.charts.anLoadChart; }

    if (Rs && Rs.transmission !== null) {
        upsertChart('anResChart', {
            type: 'bar',
            data: {
                labels: isNarrow() ? [a.resTs, a.resMs, a.resLs] : [a.resT, a.resM, a.resL],
                datasets: [{ data: [g(Rs.transmission), g(Rs.metered), g(Rs.live)],
                             backgroundColor: ['rgba(112, 173, 71, 0.45)', 'rgba(112, 173, 71, 0.72)', C.res], borderRadius: 3, barThickness: 30 }]
            },
            options: {
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, title: { display: true, text: 'GWh' }, ticks: { callback: (v) => fmt(v) } }, y: { grid: { display: false } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${fmt(c.raw, 1)} GWh` } } }
            }
        });
        const st = Rs.entsoe_status === 'final' ? x.gapFinal : Rs.entsoe_status === 'provisional' ? x.gapProvisional : '–';
        $('anResNote').textContent = Rs.entsoe === null || Rs.entsoe === undefined ? '' :
            a.resNote.replace('{a}', fmt(Rs.live_sw / 1000, 1)).replace('{s}', st).replace('{b}', fmt(Rs.entsoe / 1000, 1));
    } else { $('anResNote').textContent = ''; if (S.charts.anResChart) { S.charts.anResChart.destroy(); delete S.charts.anResChart; } }

    // 4. Βαθμονόμηση: τρεις τιμές με διαστήματα + πορεία στον χρόνο
    const c = A.calibration;
    const tile = (label, value, unit, ci, color) => `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-4">
        <div class="text-xs text-slate-400">${esc(label)}</div>
        <div class="text-2xl font-bold mt-1" style="color:${color}">${value} <span class="text-xs font-normal text-slate-400">${esc(unit)}</span></div>
        ${ci ? `<div class="text-[11px] text-slate-500 mt-0.5">${esc(a.ci)}: ${ci}</div>` : ''}</div>`;
    $('anCalTiles').innerHTML = c
        ? tile(a.kSolar, fmt(c.k_solar, 3), a.perMeteredSolar, c.ci90 && c.ci90.k_solar ? `${fmt(c.ci90.k_solar[0], 3)} – ${fmt(c.ci90.k_solar[1], 3)}` : '', C.solar) +
          tile(a.kWind, fmt(c.k_wind, 3), a.perMeteredWind, c.ci90 && c.ci90.k_wind ? `${fmt(c.ci90.k_wind[0], 3)} – ${fmt(c.ci90.k_wind[1], 3)}` : '', C.wind) +
          tile(a.kBase, fmt(c.base, 0), a.perHour, c.ci90 && c.ci90.base ? `${fmt(c.ci90.base[0], 0)} – ${fmt(c.ci90.base[1], 0)}` : '', '#cbd5e1')
        : `<p class="text-sm text-slate-400 sm:col-span-3">${esc(a.noCalib)}</p>`;
    const dg = c && c.diag_bess;
    $('anBessNote').textContent = !dg ? '' : dg.k_bess === null || dg.k_bess === undefined ? a.bessSmall
        : a.bessNote.replace('{k}', fmt(dg.k_bess, 3)).replace('{e}', fmt(dg.expected_if_in_uce, 2));
    const days = cal && cal.days ? Object.keys(cal.days) : [];
    if (days.length) {
        const sel = days.indexOf(S.anDate);
        const line = (label, key, color) => ({ label, data: days.map((d) => cal.days[d][key]), borderColor: color, backgroundColor: color, borderWidth: 2,
                                              tension: 0.25, pointRadius: days.map((_, i) => (i === sel ? 5 : 0)), pointHoverRadius: 4 });
        upsertChart('anCalChart', {
            type: 'line',
            data: { labels: days.map((d) => fmtDate(d, false)), datasets: [line(`${a.kSolar} (k₂)`, 'k_solar', C.solar), line(`${a.kWind} (k₁)`, 'k_wind', C.wind)] },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, ticks: { callback: (v) => fmt(v, 2) } } },
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (q) => ` ${q.dataset.label}: ${fmt(q.raw, 3)}` } } }
            }
        });
    }
}

async function renderAll() {
    renderLive();
    await Promise.all([renderDaily(), renderClean(), renderAnalysis()]);
    renderRecords();
}

// ---------------------------------------------------------------------
// 11. Εκκίνηση (house style: βήματα με ρυθμό)
// ---------------------------------------------------------------------
// Οθόνη φόρτωσης (D47, ρυθμός όπως στο BigHydro): κάθε βήμα «ανάβει», κάνει τη δουλειά του και μετά
// η μπάρα του γεμίζει ομαλά σε STEP ms· το ✓ μπαίνει όταν τελειώσει. Λιγότερη κίνηση → συντομότεροι χρόνοι.
const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const LOAD_STEP = REDUCE_MOTION ? 120 : 350, LOAD_MIN_READ = REDUCE_MOTION ? 200 : 650, LOAD_READY = REDUCE_MOTION ? 200 : 650;
const pause = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const loadRow = (i) => document.querySelector(`.load-row[data-step="${i}"]`);
function loadActivate(i) { const r = loadRow(i); if (r) r.classList.remove('opacity-50'); }
function loadSet(i, pct) { const b = loadRow(i) && loadRow(i).querySelector('[data-load-bar]'); if (b) b.style.width = `${pct}%`; }
function loadDone(i) {
    const r = loadRow(i); if (!r) return;
    const b = r.querySelector('[data-load-bar]');
    b.style.width = '100%'; b.classList.remove('bg-blue-500', 'bg-acc-500'); b.classList.add('bg-emerald-500');
    r.querySelector('[data-load-ck]').classList.remove('opacity-0');
}
// Βήμα 2…6: πρώτα η δουλειά, μετά το γέμισμα της μπάρας, μετά ✓.
async function loadStep(i, work) {
    loadActivate(i);
    await pause(20);                        // ο browser προλαβαίνει να δείξει ότι το βήμα «άναψε»
    await work();
    const b = loadRow(i).querySelector('[data-load-bar]');
    b.style.transitionDuration = `${LOAD_STEP}ms`; b.style.transitionTimingFunction = 'linear'; b.style.width = '100%';
    await pause(LOAD_STEP);
    loadDone(i);
}

function loadFailed(err) {
    console.error(err);
    $('mainSpinner').classList.add('hidden');
    $('loadError').textContent = t().load.error;
    $('loadError').classList.remove('hidden');
}

async function boot() {
    chartDefaults();
    applyStaticText();
    setTab('live');
    try {
        // Βήμα 1: πραγματική πρόοδος (manifest → ημέρα live + ρεκόρ), με ελάχιστο χρόνο ανάγνωσης
        loadActivate(1);
        const t0 = Date.now();
        S.manifest = await getJSON('manifest', true);
        if (!S.manifest || !S.manifest.last_live) throw new Error('manifest.json missing or empty');
        loadSet(1, 34);
        S.liveDate = S.manifest.last_live.date;
        S.hourSel = S.manifest.last_live.hr;
        S.dailyDate = S.liveDate;
        S.cleanDate = (S.manifest.xray_days || []).slice(-1)[0] || null;
        S.anDate = (S.manifest.analysis_days || []).slice(-1)[0] || null;
        updateHeader();
        const [live, recs] = await Promise.all([
            getLive(S.liveDate).then((v) => { loadSet(1, 67); return v; }),
            getJSON('records', true).then((v) => { loadSet(1, 100); return v; })
        ]);
        if (!live) throw new Error(`live/${S.liveDate}.json missing`);
        S.records = recs;
        await pause(Math.max(0, LOAD_MIN_READ - (Date.now() - t0)));
        loadDone(1);
        await pause(LOAD_STEP);

        // Βήματα 2–6: κάθε προβολή με τη σειρά των tabs
        await loadStep(2, async () => { renderLive(); fillPicker(); });
        await loadStep(3, () => renderDaily());
        await loadStep(4, async () => { if (S.cleanDate) await renderClean(); });
        await loadStep(5, async () => { try { await renderAnalysis(); } catch (e) { console.warn('analysis', e); } });
        await loadStep(6, async () => { renderRecords(); });

        $('mainSpinner').classList.add('hidden');
        $('loadRowFinal').classList.remove('opacity-0', 'translate-y-2');
        await pause(LOAD_READY);
        const ov = $('loading-overlay');
        ov.classList.add('opacity-0');
        setTimeout(() => { ov.style.display = 'none'; }, 500);
    } catch (err) { loadFailed(err); }
}

// Κάθε 5 λεπτά: αν υπάρχει νέα ώρα, φόρτωσέ την. Κάθε λεπτό: ξαναϋπολόγισε την κατάσταση.
async function refresh() {
    const m = await getJSON('manifest', true);
    if (!m || !m.last_live || !S.manifest) return;
    const prev = S.manifest.last_live;
    S.manifest = m;
    if (m.last_live.date !== prev.date || m.last_live.hr !== prev.hr) {
        const wasOnLatest = S.hourSel === prev.hr && S.liveDate === prev.date;
        const wasOnToday = S.dailyDate === S.liveDate;
        S.liveDate = m.last_live.date;
        delete S.cache[`live/${prev.date}`];
        await getJSON(`live/${S.liveDate}`, true);
        if (wasOnLatest) S.hourSel = m.last_live.hr;
        if (wasOnToday) S.dailyDate = S.liveDate;
        S.records = await getJSON('records', true);
        const lastAn = (m.analysis_days || []).slice(-1)[0];
        if (lastAn && lastAn !== S.anDate && S.tab !== 'analysis') { S.anDate = lastAn; delete S.cache['analysis/calibration']; }
        await renderAll();
        fillPicker();
    }
    updateHeader();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
    $('contextSelect').addEventListener('change', onPickerChange);
    $('btnMethodologyWrap').addEventListener('click', () => toggleModal(true));
    document.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => openMethodology(b.dataset.method)));
    document.querySelectorAll('[data-close-rec]').forEach((b) => b.addEventListener('click', () => toggleRecModal(false)));
    document.querySelectorAll('.rec-scope-btn').forEach((b) => b.addEventListener('click', () => { S.recScope = b.dataset.recscope; renderRecords(); }));
    $('recordModal').addEventListener('click', (e) => { if (e.target.id === 'recordModal') toggleRecModal(false); });
    // Οι πίτες αλλάζουν μορφή (βελάκια ή υπόμνημα) με το πλάτος: ξανασχεδιάζονται όταν αλλάζει το παράθυρο.
    let resizeT; let lastW = window.innerWidth;
    window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; if (S.tab === 'live') renderLive(); } }, 250); });
    document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => toggleModal(false)));
    $('methodologyModal').addEventListener('click', (e) => { if (e.target.id === 'methodologyModal') toggleModal(false); });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!$('recordModal').classList.contains('hidden')) toggleRecModal(false); else if (!$('methodologyModal').classList.contains('hidden')) toggleModal(false); });
    boot();
    setInterval(refresh, 5 * 60 * 1000);
    setInterval(updatePill, 60 * 1000);
    window.addEventListener('scroll', hideTip, { passive: true });
});
