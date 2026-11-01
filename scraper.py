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

def fetch_all_data(date_str):
    base_proxy = "https://iptoanalytics-api.admie.gr/iptoanalytics/api/ipto?endpoint=https:%2F%2Fmarket-public-api.admie.gr%2Frestws%2Fportal%2F"
    
    endpoints = {
        "production": f"{base_proxy}prodmixandload%2F{date_str}",
        "dam": f"{base_proxy}dayaheadmarket%2F{date_str}",
        "interconnections": f"{base_proxy}scadainterflows%2F{date_str}",
    }

    headers = {
        'User-Agent': 'live-greekpower-bot (Mozilla/5.0)',
        'Accept': 'application/json'
    }

    tz = pytz.timezone('Europe/Athens')
    current_time = datetime.now(tz)
    fetch_timestamp = current_time.isoformat()
    daily_data = {}

    def get_or_create_hour(hr):
        if hr not in daily_data:
            daily_data[hr] = {
                "fetch_timestamp": fetch_timestamp,
                "date": date_str,
                "target_hour": hr,
                "demand_mwh": None,
                "production_mix": {},
                "dam_price_eur": None,
                "interconnections_mwh": {},
                "co2_emissions": None
            }
        return daily_data[hr]

    print(f"--- Fetching Data for Date: {date_str} ---")

    try:
        resp_prod = requests.get(endpoints["production"], headers=headers, timeout=30)
        if resp_prod.status_code == 200:
            for item in resp_prod.json().get("items", []):
                hr = item.get("hr")
                if hr is not None:
                    record = get_or_create_hour(hr)
                    tech, energy = item.get("itemname"), item.get("energy")
                    if tech == "TOTAL_LOAD": record["demand_mwh"] = energy
                    elif tech: record["production_mix"][tech] = energy

        resp_dam = requests.get(endpoints["dam"], headers=headers, timeout=30)
        if resp_dam.status_code == 200:
             for item in resp_dam.json().get("items", []):
                 hr = item.get("hr")
                 if hr is not None and item.get("country") == "GR":
                     get_or_create_hour(hr)["dam_price_eur"] = item.get("value") 

        resp_int = requests.get(endpoints["interconnections"], headers=headers, timeout=30)
        if resp_int.status_code == 200:
            for item in resp_int.json().get("items", []):
                hr = item.get("hr")
                if hr is not None:
                    country, flow = item.get("itemname"), item.get("energy")
                    if country: get_or_create_hour(hr)["interconnections_mwh"][country] = flow

        return list(daily_data.values())
    except Exception as e:
        print(f"Σφάλμα κατά την άντληση {date_str}: {e}")
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

if __name__ == "__main__":
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
