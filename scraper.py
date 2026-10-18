import requests
import json
import os
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

def save_to_json(new_records, is_live_mode, start_str, end_str):
    """Γράφει το παλιό live_data.json (30 ημέρες, για τη σημερινή σελίδα)
    και επιστρέφει το συγχωνευμένο ιστορικό πριν το κόψιμο των 30 ημερών,
    ώστε να γραφτούν από αυτό τα νέα αρχεία ημέρας."""
    if not new_records: return []
    filepath = 'data/live_data.json'
    os.makedirs('data', exist_ok=True)
    history = load_json_strict(filepath, [])

    if is_live_mode:
        print("Λειτουργία: LIVE (Εφαρμογή Sanity Checks & Ασφαλές Merging)")
        history_map = { (rec.get("date"), rec.get("target_hour")): i for i, rec in enumerate(history) }
        
        for new_rec in new_records:
            clean_rec = apply_live_sanity_checks(new_rec)
            key = (clean_rec["date"], clean_rec["target_hour"])
            
            if key in history_map: 
                idx = history_map[key]
                history[idx] = merge_hourly_record(history[idx], clean_rec)
            else:
                history.append(clean_rec)
                history_map[key] = len(history) - 1
    else:
        print(f"Λειτουργία: HISTORICAL (Clean Slate από {start_str} έως {end_str})")
        history = [rec for rec in history if not (start_str <= rec.get("date", "") <= end_str)]
        history.extend(new_records)
            
    history.sort(key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))
    
    tz = pytz.timezone('Europe/Athens')
    thirty_days_ago = datetime.now(tz) - timedelta(days=30)
    cutoff = thirty_days_ago.strftime("%Y%m%d")
    filtered_history = [rec for rec in history if rec.get("date", "") >= cutoff]

    write_json_atomic(filepath, filtered_history)
    print(f"✓ Δεδομένα αποθηκεύτηκαν στο {filepath}.")
    return history

if __name__ == "__main__":
    target_dates, is_live_mode, start_str, end_str = get_target_dates()
    print(f"Θα αντληθούν δεδομένα για τις εξής {len(target_dates)} ημέρες: {target_dates}")
    
    all_new_data = []
    for d_str in target_dates:
        daily_data = fetch_all_data(d_str)
        all_new_data.extend(daily_data)
        
    if all_new_data:
        merged_history = save_to_json(all_new_data, is_live_mode, start_str, end_str)
        # --- Νέα δομή (schema v1): αρχεία ημέρας, records, manifest ---
        contract.write_live_days(merged_history, set(target_dates))
        contract.build_records()
        contract.write_manifest()
