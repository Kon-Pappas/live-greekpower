"""Έλεγχος πηγής live δεδομένων (D50) — ΔΕΝ γράφει τίποτα στο repo.

Κατεβάζει μια ημέρα που ήδη έχουμε (PROBE_DATE, προεπιλογή 20261028) από κάθε πηγή (PROBE_SOURCES,
προεπιλογή «admie,ipto») και τη συγκρίνει πεδίο προς πεδίο, ώρα προς ώρα, με το data/live/<ημέρα>.json.
"""
import json
import os

import contract
import scraper

FIELDS = [('λιγνίτης', lambda h: h['gen']['lignite']), ('αέριο', lambda h: h['gen']['gas']),
          ('υδρο', lambda h: h['gen']['hydro']), ('ΑΠΕ', lambda h: h['gen']['res']),
          ('σύνολο', lambda h: h['gen']['total']), ('ζήτηση', lambda h: h['demand']),
          ('εισαγωγές', lambda h: h['imports']), ('εξαγωγές', lambda h: h['exports']),
          ('άντληση', lambda h: h['pumping']), ('εκφόρτιση', lambda h: h['storage']['dis']),
          ('φόρτιση', lambda h: h['storage']['chg']), ('τιμή DAM', lambda h: h['dam_price'])]

date8 = os.environ.get('PROBE_DATE', '20261028').strip().replace('-', '')
iso = f"{date8[:4]}-{date8[4:6]}-{date8[6:]}"
stored_path = os.path.join(contract.LIVE_DIR, iso + '.json')
stored = {h['hr']: h for h in json.load(open(stored_path))['hours'] if h.get('has_data')} if os.path.exists(stored_path) else {}
print(f"Αποθηκευμένες ώρες για {iso}: {len(stored)}")
verdict = {}
for key in [x.strip() for x in os.environ.get('PROBE_SOURCES', 'admie,ipto').split(',') if x.strip() in scraper.FETCHERS]:
    name = scraper.SOURCE_NAMES[key]
    print(f"\n========== Πηγή: {name} ==========")
    recs = scraper.FETCHERS[key](date8)
    hours = {h['hr']: h for h in (contract.normalize_live_hour(r) for r in recs) if h['has_data']}
    if not hours:
        print("✗ Καμία ώρα με δεδομένα.")
        verdict[name] = 'καμία ώρα'
        continue
    n_ok, n_cmp, diffs = 0, 0, []
    for hr in sorted(hours):
        h = hours[hr]
        if h['balance_ok'] is False:
            diffs.append(f"ώρα {hr}: ισοζύγιο εκτός")
        if hr not in stored:
            continue
        n_cmp += 1
        bad = [(f, g(h), g(stored[hr])) for f, g in FIELDS if g(stored[hr]) is not None and abs((g(h) or 0) - g(stored[hr])) > 0.6]
        if bad:
            diffs.append(f"ώρα {hr:02d}: " + ', '.join(f"{f} {a} ≠ {b}" for f, a, b in bad))
        else:
            n_ok += 1
    print(f"Ώρες από την πηγή: {len(hours)} · συγκρίθηκαν: {n_cmp} · ταυτίζονται πλήρως (12/12 πεδία): {n_ok}")
    for d in diffs[:30]:
        print('   ✗', d)
    verdict[name] = 'ΟΚ' if n_cmp and n_ok == n_cmp and not diffs else ('διαφορές' if n_cmp else 'καμία σύγκριση')
print("\n========== ΣΥΜΠΕΡΑΣΜΑ ==========")
for k, v in verdict.items():
    print(f"{'✓' if v == 'ΟΚ' else '✗'} {k}: {v}")
