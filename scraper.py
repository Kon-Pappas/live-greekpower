import requests
import json
import os
import time
import sys
from datetime import datetime, timedelta
import pytz
from jsonio import load_json_strict, write_json_atomic
import contract

# =====================================================================
# 1. ΚΑΝΟΝΕΣ ΕΠΙΚΥΡΩΣΗΣ (SANITY CHECKS) & ΣΥΓΧΩΝΕΥΣΗΣ
# =====================================================================

def apply_live_sanity_checks(item):
    """Εφαρμόζει τους κανόνες αποτροπής λανθασμένων 0 στο Live Mode."""
    forbidden_root = ['demand_mwh', 'TOTAL_PROD'] 
    forbidden_prod = ['CO2_FACTOR_GAS', 'CO2_FACTOR_LIGNITE', 'MARKET_LOAD', 'RES_PROD', 'TOTAL GAS']

    # Καθαρισμός ρίζας
    for field in forbidden_root:
        if item.get(field) == 0:
            item[field] = None
            
    # Καθαρισμός παραγωγής
    if item.get('production_mix'):
        for field in forbidden_prod:
            if item['production_mix'].get(field) == 0:
                item['production_mix'][field] = None

    # Έλεγχος Διασυνδέσεων (Total Islanding)
    if item.get('interconnections_mwh'):
        inter = item['interconnections_mwh']
        # Αν υπάρχουν κλειδιά και ΟΛΕΣ οι τιμές είναι ακριβώς 0
        if len(inter) > 0 and all(v == 0 for v in inter.values()):
            item['interconnections_mwh'] = None

    return item

def merge_hourly_record(old_record, new_record):
    """Συγχωνεύει δεδομένα. Κρατάει την παλιά τιμή αν η νέα είναι None."""
    merged = old_record.copy()
    
    for key in ['demand_mwh', 'dam_price_eur', 'co2_emissions']:
        if new_record.get(key) is not None:
            merged[key] = new_record[key]
            
    if new_record.get('production_mix'):
        if not merged.get('production_mix'):
            merged['production_mix'] = {}
        for key, val in new_record['production_mix'].items():
            if val is not None:
                merged['production_mix'][key] = val
                
    if new_record.get('interconnections_mwh') is not None:
        if not merged.get('interconnections_mwh'):
            merged['interconnections_mwh'] = {}
        for key, val in new_record['interconnections_mwh'].items():
            if val is not None:
                merged['interconnections_mwh'][key] = val

    merged['fetch_timestamp'] = new_record.get('fetch_timestamp', merged.get('fetch_timestamp'))
    if new_record.get('source'):
        merged['source'] = new_record['source']          # D50: από πού ήρθε η ώρα
    return merged

# =====================================================================
# 2. ΑΝΤΛΗΣΗ & ΔΙΑΧΕΙΡΙΣΗ ΔΕΔΟΜΕΝΩΝ
# =====================================================================

def get_target_dates():
    start_env = os.environ.get('START_DATE', '').strip().replace('-', '')
    end_env = os.environ.get('END_DATE', '').strip().replace('-', '')

    tz = pytz.timezone('Europe/Athens')
    today_dt = datetime.now(tz)
    yesterday_dt = today_dt - timedelta(days=1)
    
    today_str = today_dt.strftime("%Y%m%d")
    yesterday_str = yesterday_dt.strftime("%Y%m%d")

    # Καθορισμός Mode (Live αν δεν δοθούν ημερομηνίες)
    is_live_mode = not start_env and not end_env

    start_str = start_env if start_env else yesterday_str
    end_str = end_env if end_env else today_str

    try:
        start_dt = datetime.strptime(start_str, "%Y%m%d")
        end_dt = datetime.strptime(end_str, "%Y%m%d")
    except ValueError:
        print("Μη έγκυρη μορφή ημερομηνίας. Γίνεται fallback στο Χθες και Σήμερα.")
        start_dt = yesterday_dt
        end_dt = today_dt
        is_live_mode = True

    dates = []
    current = start_dt
    while current <= end_dt:
        dates.append(current.strftime("%Y%m%d"))
        current += timedelta(days=1)

    return dates, is_live_mode, start_dt.strftime("%Y%m%d"), end_dt.strftime("%Y%m%d")

# ---------------------------------------------------------------------
# Πηγές live δεδομένων (D50). Δύο «προσαρμογείς» που παράγουν ΑΚΡΙΒΩΣ την ίδια μορφή εγγραφής:
#   admie : οι δημόσιες διευθύνσεις του www.admie.gr (νέο IPTO Analytics, από 31/10/2026)
#   ipto  : ο παλιός ενδιάμεσος iptoanalytics-api.admie.gr (εκτός από 29/10/2026· κρατιέται ως εφεδρεία)
# Σειρά από τη μεταβλητή LIVE_SOURCES (προεπιλογή «admie,ipto»). Για κάθε ημέρα χρησιμοποιείται η πρώτη
# πηγή που δίνει ώρες ΚΑΙ περνά τον έλεγχο του ισοζυγίου· αλλιώς δεν γράφεται τίποτα.
# ---------------------------------------------------------------------
HEADERS = {'User-Agent': 'live-greekpower-bot (Mozilla/5.0)', 'Accept': 'application/json'}
SOURCE_NAMES = {'admie': 'admie.gr', 'ipto': 'iptoanalytics'}


def _now_iso():
    return datetime.now(pytz.timezone('Europe/Athens')).isoformat()


def _empty_record(date_str, hr, ts, source):
    return {"fetch_timestamp": ts, "date": date_str, "target_hour": hr, "demand_mwh": None,
            "production_mix": {}, "dam_price_eur": None, "interconnections_mwh": {},
            "co2_emissions": None, "source": source}


def fetch_ipto(date_str):
    """Παλιά πηγή (εφεδρική): iptoanalytics-api → market-public-api (prodmixandload, dayaheadmarket, scadainterflows)."""
    base_proxy = "https://iptoanalytics-api.admie.gr/iptoanalytics/api/ipto?endpoint=https:%2F%2Fmarket-public-api.admie.gr%2Frestws%2Fportal%2F"
    endpoints = {
        "production": f"{base_proxy}prodmixandload%2F{date_str}",
        "dam": f"{base_proxy}dayaheadmarket%2F{date_str}",
        "interconnections": f"{base_proxy}scadainterflows%2F{date_str}",
    }
    ts, daily_data = _now_iso(), {}

    def hour(hr):
        if hr not in daily_data:
            daily_data[hr] = _empty_record(date_str, hr, ts, SOURCE_NAMES['ipto'])
        return daily_data[hr]

    try:
        resp_prod = requests.get(endpoints["production"], headers=HEADERS, timeout=30)
        if resp_prod.status_code == 200:
            for item in resp_prod.json().get("items", []):
                hr = item.get("hr")
                if hr is not None:
                    record = hour(hr)
                    tech, energy = item.get("itemname"), item.get("energy")
                    if tech == "TOTAL_LOAD": record["demand_mwh"] = energy
                    elif tech: record["production_mix"][tech] = energy
        else:
            return []
        resp_dam = requests.get(endpoints["dam"], headers=HEADERS, timeout=30)
        if resp_dam.status_code == 200:
            for item in resp_dam.json().get("items", []):
                hr = item.get("hr")
                if hr is not None and item.get("country") == "GR":
                    hour(hr)["dam_price_eur"] = item.get("value")
        resp_int = requests.get(endpoints["interconnections"], headers=HEADERS, timeout=30)
        if resp_int.status_code == 200:
            for item in resp_int.json().get("items", []):
                hr = item.get("hr")
                if hr is not None:
                    country, flow = item.get("itemname"), item.get("energy")
                    if country: hour(hr)["interconnections_mwh"][country] = flow
        return list(daily_data.values())
    except Exception as e:
        print(f"   [ipto] {date_str}: {type(e).__name__}: {str(e)[:120]}")
        return []


def fetch_admie(date_str):
    """Νέα πηγή (κύρια): www.admie.gr.
    production_fuel_hourly → όλη η μέρα με μία αίτηση (μείγμα, ζήτηση, άντληση)·
    overview (ανά ώρα) → συνολική παραγωγή, εισαγωγές/εξαγωγές, φόρτιση/εκφόρτιση, τιμή DAM.
    Επαληθευμένο στις 28/10/2026 13:00: 12/12 πεδία ίδια με την παλιά πηγή. Ροές ανά χώρα και Κρήτη δεν δίνονται."""
    ts, out = _now_iso(), []
    pause = float(os.environ.get('ADMIE_PAUSE', '0.15') or 0)
    try:
        r = requests.get(f"https://www.admie.gr/production_fuel_hourly?date_from={date_str}", headers=HEADERS, timeout=30)
        if r.status_code != 200:
            print(f"   [admie] {date_str}: production_fuel_hourly HTTP {r.status_code}")
            return []
        rows = r.json() or []
    except Exception as e:
        print(f"   [admie] {date_str}: {type(e).__name__}: {str(e)[:120]}")
        return []
    for row in rows:
        hr, d = row.get('hour'), row.get('data') or {}
        if not hr or not (d.get('TOTAL_LOAD') or 0) > 0:
            continue                                   # ώρα που δεν έχει γίνει ακόμα
        try:
            if pause:
                time.sleep(pause)
            o = requests.get(f"https://www.admie.gr/ipto-analytics/overview?date={date_str}&type=hourly&time={hr}",
                             headers=HEADERS, timeout=20)
            ov = (o.json() or {}).get('data') if o.status_code == 200 else None
        except Exception as e:
            print(f"   [admie] {date_str} ώρα {hr}: overview {type(e).__name__}")
            ov = None
        if not ov or not (ov.get('production') or 0) > 0:
            continue
        rec = _empty_record(date_str, hr, ts, SOURCE_NAMES['admie'])
        m = rec['production_mix']
        for k in ['TOTAL LIGNITE', 'TOTAL GAS', 'TOTAL HYDRO', 'RES_PROD', 'RES_SYSTEM', 'RES_NETWORK', 'STORAGE', 'INTER_BALANCE']:
            if d.get(k) is not None:
                m[k] = d[k]
        # Ίδια ονόματα και πρόσημα με την παλιά πηγή: άντληση θετική, φόρτιση αρνητική, εξαγωγές θετικές.
        m['TOTAL_PROD'] = ov.get('production')
        m['TOTAL IMPORTS'] = ov.get('imports')
        m['TOTAL EXPORTS'] = abs(ov.get('exports') or 0)
        m['STORAGE_INJECTION'] = ov.get('injection')
        m['STORAGE_ABSORPTION'] = -abs(ov.get('absorption') or 0)
        pump = ov.get('pumping') if ov.get('pumping') is not None else d.get('ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ')
        m['ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ'] = abs(pump or 0)
        rec['demand_mwh'] = ov.get('demand') if ov.get('demand') is not None else d.get('TOTAL_LOAD')
        rec['dam_price_eur'] = ov.get('dam_price')
        out.append(rec)
    return out


FETCHERS = {'admie': fetch_admie, 'ipto': fetch_ipto}


def validate_day(records):
    """Δεκτή ημέρα: τουλάχιστον μία ώρα με δεδομένα και ισοζύγιο που κλείνει σε κάθε τέτοια ώρα."""
    hours = [contract.normalize_live_hour(r) for r in records]
    data = [h for h in hours if h['has_data']]
    bad = [h['hr'] for h in data if h['balance_ok'] is False]
    return len(data), bad


def fetch_all_data(date_str):
    order = [x.strip() for x in os.environ.get('LIVE_SOURCES', 'admie,ipto').split(',') if x.strip() in FETCHERS]
    print(f"--- Fetching Data for Date: {date_str} (πηγές: {' → '.join(order)}) ---")
    for i, key in enumerate(order):
        recs = FETCHERS[key](date_str)
        n, bad = validate_day(recs) if recs else (0, [])
        role = 'κύρια' if i == 0 else 'εφεδρική'
        if n and not bad:
            print(f"✓ {date_str}: {n} ώρες από {SOURCE_NAMES[key]} ({role})")
            return recs
        why = 'καμία ώρα' if not n else f'ισοζύγιο εκτός στις ώρες {bad}'
        print(f"⚠ {date_str}: {SOURCE_NAMES[key]} ({role}) απορρίφθηκε: {why}")
    print(f"✗ {date_str}: καμία πηγή δεν έδωσε δεκτά δεδομένα· δεν γράφεται τίποτα.")
    return []

RAW_PATH = 'data/live_raw.json'          # μνήμη συγχώνευσης: μόνο χθες + σήμερα
LEGACY_PATH = 'data/live_data.json'      # παλιό αρχείο 30 ημερών (φάση 3b: σβήνεται)

def save_to_json(new_records, is_live_mode, start_str, end_str):
    """Συγχωνεύει τις νέες λήψεις με τη μνήμη (live mode) ή τις αντικαθιστά
    (ιστορικό mode) και επιστρέφει όλες τις εγγραφές, ώστε να γραφτούν από
    αυτές τα αρχεία ημέρας. Η μνήμη κρατά ΜΟΝΟ χθες και σήμερα: είναι το μόνο
    που χρειάζεται η συγχώνευση (κρατά την παλιά τιμή όταν ο ΑΔΜΗΕ δίνει κενό)."""
    if not new_records: return []

    if not is_live_mode:
        # Ιστορικό mode (π.χ. backfill): οι ημέρες αντικαθίστανται ολόκληρες, δεν χρειάζεται
        # συγχώνευση. Η μνήμη (live_raw.json) ΔΕΝ αγγίζεται: τη γράφει μόνο το ωριαίο scrape.
        print(f"Λειτουργία: HISTORICAL (Αντικατάσταση δεδομένων από {start_str} έως {end_str})")
        return sorted(new_records, key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))

    history = load_json_strict(RAW_PATH, None)
    if history is None:
        # Πρώτο run μετά τη φάση 3b: αφετηρία το παλιό αρχείο, αν υπάρχει.
        history = load_json_strict(LEGACY_PATH, [])

    print("Λειτουργία: LIVE (Εφαρμογή Sanity Checks & Ασφαλές Merging)")
    history_map = { (rec.get("date"), rec.get("target_hour")): i for i, rec in enumerate(history) }
    for new_rec in new_records:
        clean_rec = apply_live_sanity_checks(new_rec)
        key = (clean_rec.get("date"), clean_rec.get("target_hour"))
        if key in history_map:
            idx = history_map[key]
            history[idx] = merge_hourly_record(history[idx], clean_rec)
        else:
            history.append(clean_rec)
            history_map[key] = len(history) - 1

    history.sort(key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))

    tz = pytz.timezone('Europe/Athens')
    keep_from = (datetime.now(tz) - timedelta(days=1)).strftime("%Y%m%d")
    write_json_atomic(RAW_PATH, [rec for rec in history if rec.get("date", "") >= keep_from])

    if os.path.exists(LEGACY_PATH):
        os.remove(LEGACY_PATH)
        print(f"✓ Το παλιό {LEGACY_PATH} αφαιρέθηκε (φάση 3b).")
    print(f"✓ Μνήμη συγχώνευσης: {RAW_PATH}.")
    return history

# ---------------------------------------------------------------------
# D56: λειτουργία «μόνο διαχωρισμός ΑΠΕ» (RES_SPLIT_ONLY=1). Συμπληρώνει στα ΥΠΑΡΧΟΝΤΑ live αρχεία
# τα res_system / res_network (D55) από το production_fuel_hourly του ΑΔΜΗΕ (μία αίτηση ανά ημέρα).
# Γράφει μια ημέρα μόνο αν σε ΚΑΘΕ ώρα με δεδομένα ισχύει RES_SYSTEM + RES_NETWORK = αποθηκευμένες ΑΠΕ (±1 MWh)
# και αλλάζει ΜΟΝΟ αυτά τα δύο πεδία και τα σύνολά τους. Τίποτα άλλο στο αρχείο.
# ---------------------------------------------------------------------
def res_split_only(dates, pause=1.0, tol=1.0):
    ok, skipped = 0, []
    for i, d8 in enumerate(dates):
        if i and pause:
            time.sleep(pause)
        iso = f"{d8[:4]}-{d8[4:6]}-{d8[6:]}"
        path = os.path.join(contract.LIVE_DIR, iso + '.json')
        if not os.path.exists(path):
            skipped.append((iso, 'δεν υπάρχει live αρχείο')); continue
        try:
            r = requests.get(f"https://www.admie.gr/production_fuel_hourly?date_from={d8}", headers=HEADERS, timeout=30)
            rows = r.json() if r.status_code == 200 else None
        except Exception as e:
            rows = None
            print(f"   [{iso}] {type(e).__name__}: {str(e)[:100]}")
        if not rows:
            skipped.append((iso, 'καμία απάντηση από τον ΑΔΜΗΕ')); continue
        split = {row.get('hour'): (row.get('data') or {}) for row in rows if row.get('hour')}
        day = load_json_strict(path, None)
        if not day or not day.get('hours'):
            skipped.append((iso, 'άκυρο live αρχείο')); continue
        hours = [h for h in day['hours'] if h.get('has_data')]
        bad = []
        for h in hours:
            dd = split.get(h['hr'])
            if not dd or dd.get('RES_SYSTEM') is None or dd.get('RES_NETWORK') is None:
                bad.append(f"ώρα {h['hr']}: λείπει"); continue
            if abs(dd['RES_SYSTEM'] + dd['RES_NETWORK'] - (h['gen']['res'] or 0)) > tol:
                bad.append(f"ώρα {h['hr']}: {dd['RES_SYSTEM']}+{dd['RES_NETWORK']}≠{h['gen']['res']}")
        if bad:
            skipped.append((iso, '; '.join(bad[:4]) + (' …' if len(bad) > 4 else ''))); continue
        for h in hours:
            dd = split[h['hr']]
            h['gen']['res_system'] = contract.r1(dd['RES_SYSTEM'])
            h['gen']['res_network'] = contract.r1(dd['RES_NETWORK'])
        if day.get('totals', {}).get('gen') is not None:
            for k in ['res_system', 'res_network']:
                day['totals']['gen'][k] = contract._sum(h['gen'][k] for h in hours)
        write_json_atomic(path, day)
        ok += 1
    print(f"✓ Διαχωρισμός ΑΠΕ: {ok} ημέρες συμπληρώθηκαν · {len(skipped)} παραλείφθηκαν.")
    for iso, why in skipped:
        print(f"   ⚠ {iso}: {why}")
    return ok, skipped


if __name__ == "__main__":
    if os.environ.get('CURTAIL_HINTS_ONLY', '') == '1':
        # D58: ενδείξεις πιθανής περικοπής φ/β μεταφοράς στα ΥΠΑΡΧΟΝΤΑ live αρχεία (μόνο τοπικά, καμία λήψη).
        # Αλλάζει μόνο το curtail_hint κάθε ώρας και το totals.curtail_hint_hours.
        n_days, n_flag = 0, 0
        for d8 in get_target_dates()[0]:
            path = contract.day_path(contract.LIVE_DIR, d8)
            day = load_json_strict(path, None)
            if not day or not day.get('hours'):
                continue
            flagged = contract.add_curtail_hints(d8, day['hours'])
            t = day.setdefault('totals', {})
            t['curtail_hint_hours'] = flagged
            t['curtail_other_hours'] = [h['hr'] for h in day['hours'] if (h.get('curtail_hint') or {}).get('case') == 'B']
            t['isp_surplus_hours'] = contract.isp_hours(day['hours'])
            write_json_atomic(path, day)
            n_days += 1; n_flag += len(flagged)
        print(f"✓ Ενδείξεις περικοπής: {n_days} ημέρες · {n_flag} ώρες με ένδειξη.")
        sys.exit(0)
    if os.environ.get('RES_SPLIT_ONLY', '') == '1':
        _ok, _skipped = res_split_only(get_target_dates()[0], pause=float(os.environ.get('PAUSE_SECONDS', '1') or 0))
        sys.exit(0)
    target_dates, is_live_mode, start_str, end_str = get_target_dates()
    print(f"Θα αντληθούν δεδομένα για τις εξής {len(target_dates)} ημέρες: {target_dates}")
    
    # Backfill: παύση ανάμεσα στις ημέρες, για να μην επιβαρύνουμε τον server του ΑΔΜΗΕ.
    pause = float(os.environ.get('PAUSE_SECONDS', '0') or 0)
    # Backfill: τα records και το manifest τα γράφει ΜΟΝΟ το ωριαίο scrape (ένας συγγραφέας ανά αρχείο).
    skip_derived = os.environ.get('SKIP_DERIVED', '') == '1'

    all_new_data = []
    for i, d_str in enumerate(target_dates):
        if i and pause:
            time.sleep(pause)
        daily_data = fetch_all_data(d_str)
        all_new_data.extend(daily_data)

    if all_new_data:
        merged_history = save_to_json(all_new_data, is_live_mode, start_str, end_str)
        # --- Νέα δομή (schema v1): αρχεία ημέρας, records, manifest ---
        contract.write_live_days(merged_history, set(target_dates))
        if not skip_derived:
            contract.build_records()
            contract.write_manifest()
