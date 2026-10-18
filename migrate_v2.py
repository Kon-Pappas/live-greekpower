"""ΜΙΑΣ ΧΡΗΣΗΣ: μετατρέπει το υπάρχον ιστορικό στη νέα δομή (schema v1).

Διαβάζει τα παλιά live_data.json, xray_data.json και entsoe_ref.json
(δεν τα αλλάζει) και γράφει:
    data/live/, data/xray/, data/entsoe/  (ένα αρχείο ανά ημέρα)
    data/records.json  (ξαναϋπολογισμένο από όλο το ιστορικό, ίδια μορφή)
    data/manifest.json

Τρέχει από το workflow «Migrate to v2 (one-off)». Είναι ασφαλές να ξανατρέξει:
απλώς ξαναγράφει τα ίδια αρχεία.
"""
import contract
from jsonio import load_json_strict

if __name__ == "__main__":
    live = load_json_strict('data/live_data.json', [])
    xray = load_json_strict('data/xray_data.json', [])
    entsoe = load_json_strict('data/entsoe_ref.json', [])
    print(f"Παλιά αρχεία: live {len(live)} ώρες, X-Ray {len(xray)}, ENTSO-E {len(entsoe)}")

    # Σειρά: πρώτα live, γιατί το X-Ray τα διαβάζει για τον υπολογισμό του UCE.
    contract.write_live_days(live, {r['date'] for r in live if r.get('date')})
    contract.write_xray_days(xray)
    contract.write_entsoe_days(entsoe)
    contract.build_records()
    contract.write_manifest()
    print("✓ Η μετατροπή ολοκληρώθηκε.")
