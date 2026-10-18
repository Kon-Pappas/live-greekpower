"""ENTSO-E Transparency Platform → data/entsoe/YYYY-MM-DD.json (γράφει ΜΟΝΟ αυτό το script).

Κατεβάζει για κάθε ημέρα:
  A75 – Actual Generation per Production Type (φ/β, αιολικά, υδροηλεκτρικά, βιομάζα, αέριο, λιγνίτης)
  A65 – Actual Total Load (συνολικό φορτίο)

Η ENTSO-E αναθεωρεί τα στοιχεία περίπου 10 ημέρες μετά (D33): η πρώτη έκδοση των φ/β
περιέχει εκτίμηση της χαμηλής τάσης, η τελική μόνο τα μετρημένα. Γι' αυτό:
  - χωρίς ημερομηνίες (cron 10:15): προχθές, χθες ΚΑΙ η ημέρα πριν από FINAL_LAG_DAYS (τελική έκδοση),
  - η ΠΡΩΤΗ έκδοση κάθε ημέρας φυλάσσεται για πάντα μέσα στο αρχείο (contract.write_entsoe_days).
Κενές τιμές μένουν κενές (null): «η ENTSO-E δεν δίνει στοιχείο» ≠ «παραγωγή μηδέν».
"""
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import pytz
import requests

import contract

API = "https://web-api.tp.entsoe.eu/api"
GR = '10YGR-HTSO-----Y'
NS = {'ns': 'urn:iec62325.351:tc57wg16:451-6:generationloaddocument:3:0'}
ATHENS = pytz.timezone('Europe/Athens')

PSR_MAP = {
    'B16': 'entsoe_solar',
    'B19': 'entsoe_wind',
    'B11': 'entsoe_hydro_ror',   # Run-of-river
    'B12': 'entsoe_hydro_res',   # Reservoir
    'B01': 'entsoe_biomass',
    'B04': 'entsoe_gas',
    'B02': 'entsoe_lignite',
}


def get_target_dates():
    start_env = os.environ.get('START_DATE', '').strip().replace('-', '')
    end_env = os.environ.get('END_DATE', '').strip().replace('-', '')
    now = datetime.now(ATHENS)
    if start_env and end_env:
        try:
            s = datetime.strptime(start_env, "%Y%m%d"); e = datetime.strptime(end_env, "%Y%m%d")
            out = []
            while s <= e:
                out.append(s.strftime("%Y%m%d")); s += timedelta(days=1)
            return out
        except ValueError:
            print("Μη έγκυρη μορφή ημερομηνίας. Γίνεται fallback στις αυτόματες ημέρες.")
    lag = int(os.environ.get('FINAL_LAG_DAYS', str(contract.ENTSOE_FINAL_LAG_DAYS)))
    return [(now - timedelta(days=lag)).strftime("%Y%m%d"),     # τελική έκδοση
            (now - timedelta(days=2)).strftime("%Y%m%d"),       # πρώτη έκδοση
            (now - timedelta(days=1)).strftime("%Y%m%d")]


def _day_window_utc(date_str):
    start = ATHENS.localize(datetime.strptime(date_str, "%Y%m%d"))
    end = ATHENS.localize(datetime.strptime(date_str, "%Y%m%d") + timedelta(days=1))
    return start.astimezone(pytz.utc).strftime("%Y%m%d%H%M"), end.astimezone(pytz.utc).strftime("%Y%m%d%H%M")


def _fetch(date_str, token, params, label):
    """Ένα αίτημα στο API· επιστρέφει {(key, hr): [τιμές]} ή None αν απέτυχε."""
    p0, p1 = _day_window_utc(date_str)
    params = {**params, 'securityToken': token, 'periodStart': p0, 'periodEnd': p1}
    try:
        r = requests.get(API, params=params, timeout=30)
    except Exception as e:
        print(f"[{date_str}] {label}: αποτυχία σύνδεσης ({e})")
        return None
    if r.status_code != 200:
        print(f"[{date_str}] {label}: σφάλμα API {r.status_code}")
        return None
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError:
        print(f"[{date_str}] {label}: σφάλμα ανάλυσης XML")
        return None
    out = {}
    for ts in root.findall('ns:TimeSeries', NS):
        psr = ts.find('ns:MktPSRType/ns:psrType', NS)
        key = PSR_MAP.get(psr.text) if psr is not None else 'entsoe_load'
        if key is None:
            continue
        period = ts.find('ns:Period', NS)
        if period is None:
            continue
        res = period.find('ns:resolution', NS).text
        step = {'PT15M': 15, 'PT30M': 30, 'PT60M': 60}.get(res)
        if not step:
            continue
        t0 = datetime.strptime(period.find('ns:timeInterval/ns:start', NS).text, "%Y-%m-%dT%H:%MZ").replace(tzinfo=pytz.utc)
        for pt in period.findall('ns:Point', NS):
            pos = int(pt.find('ns:position', NS).text)
            qty = float(pt.find('ns:quantity', NS).text)
            t = (t0 + timedelta(minutes=step * (pos - 1))).astimezone(ATHENS)
            if t.strftime("%Y%m%d") == date_str:
                out.setdefault((key, t.hour + 1), []).append(qty)   # 00:00–01:00 = ώρα 1
    return out


def build_entsoe_for_date(date_str, token):
    if not token:
        print("ΣΦΑΛΜΑ: Δεν βρέθηκε το ENTSOE_TOKEN.")
        return []
    print(f"[{date_str}] ENTSO-E: παραγωγή ανά τύπο (A75) και φορτίο (A65)...")
    gen = _fetch(date_str, token, {'documentType': 'A75', 'processType': 'A16', 'in_Domain': GR}, 'A75')
    if gen is None:
        return []          # χωρίς παραγωγή δεν γράφουμε τίποτα (το παλιό αρχείο μένει)
    time.sleep(1)
    load = _fetch(date_str, token, {'documentType': 'A65', 'processType': 'A16', 'outBiddingZone_Domain': GR}, 'A65') or {}

    avg = lambda v: round(sum(v) / len(v), 1) if v else None   # μέσο MW της ώρας = MWh
    recs = []
    for hr in range(1, 25):
        rec = {'date': date_str, 'target_hour': hr}
        for k in PSR_MAP.values():
            rec[k] = avg(gen.get((k, hr)))
        ror, resv = rec['entsoe_hydro_ror'], rec['entsoe_hydro_res']
        rec['entsoe_hydro'] = None if ror is None and resv is None else round((ror or 0) + (resv or 0), 1)
        rec['entsoe_load'] = avg(load.get(('entsoe_load', hr)))
        recs.append(rec)
    return recs


if __name__ == "__main__":
    target_dates = get_target_dates()
    token = os.environ.get('ENTSOE_TOKEN')
    pause = float(os.environ.get('PAUSE_SECONDS', '1') or 0)
    print(f"Θα ελεγχθούν δεδομένα ENTSO-E για τις ημέρες: {target_dates}")
    all_entsoe_data = []
    for i, d_str in enumerate(target_dates):
        if i and pause:
            time.sleep(pause)
        all_entsoe_data.extend(build_entsoe_for_date(d_str, token))
    if all_entsoe_data:
        contract.write_entsoe_days(all_entsoe_data)
    if os.path.exists('data/entsoe_ref.json'):
        os.remove('data/entsoe_ref.json')
        print("✓ Το παλιό data/entsoe_ref.json αφαιρέθηκε (φάση 3b).")
