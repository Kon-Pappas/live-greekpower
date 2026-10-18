import requests
import xml.etree.ElementTree as ET
import os
import json
from datetime import datetime, timedelta
import pytz
from jsonio import write_json_atomic
import contract

def get_target_dates():
    start_env = os.environ.get('START_DATE', '').strip().replace('-', '')
    end_env = os.environ.get('END_DATE', '').strip().replace('-', '')

    tz = pytz.timezone('Europe/Athens')
    now = datetime.now(tz)
    
    # Αν δεν δοθούν ημερομηνίες (π.χ. cron-job), βάλε Προχθές και Χθες
    if not start_env or not end_env:
        yesterday_dt = now - timedelta(days=1)
        day_before_dt = now - timedelta(days=2)
        start_str = day_before_dt.strftime("%Y%m%d")
        end_str = yesterday_dt.strftime("%Y%m%d")
    else:
        start_str = start_env
        end_str = end_env

    try:
        start_dt = datetime.strptime(start_str, "%Y%m%d")
        end_dt = datetime.strptime(end_str, "%Y%m%d")
    except ValueError:
        print("Μη έγκυρη μορφή ημερομηνίας. Γίνεται fallback (Προχθές - Χθες).")
        yesterday_dt = now - timedelta(days=1)
        day_before_dt = now - timedelta(days=2)
        start_dt = day_before_dt
        end_dt = yesterday_dt

    dates = []
    current = start_dt
    while current <= end_dt:
        dates.append(current.strftime("%Y%m%d"))
        current += timedelta(days=1)
    return dates

def build_entsoe_for_date(date_str, token):
    if not token:
        print("ΣΦΑΛΜΑ: Δεν βρέθηκε το ENTSOE_TOKEN στα περιβάλλοντα (env).")
        return []

    athens = pytz.timezone('Europe/Athens')
    # Χρονικά όρια: Από 00:00 της ζητούμενης ημέρας έως 00:00 της επόμενης
    start_dt_athens = athens.localize(datetime.strptime(date_str, "%Y%m%d"))
    end_dt_athens = start_dt_athens + timedelta(days=1)
    
    # Μετατροπή σε UTC για το ENTSO-E (μορφή YYYYMMDDHHMM)
    start_utc = start_dt_athens.astimezone(pytz.utc).strftime("%Y%m%d%H%M")
    end_utc = end_dt_athens.astimezone(pytz.utc).strftime("%Y%m%d%H%M")

    url = "https://web-api.tp.entsoe.eu/api"
    params = {
        'securityToken': token,
        'documentType': 'A75', # Actual Generation per Type
        'processType': 'A16',  # Realised
        'in_Domain': '10YGR-HTSO-----Y', # Ελλάδα
        'periodStart': start_utc,
        'periodEnd': end_utc
    }
    
    # Οι κωδικοί που μας ενδιαφέρουν για τη διασταύρωση
    psr_map = {
        'B16': 'entsoe_solar',
        'B19': 'entsoe_wind',
        'B11': 'entsoe_hydro_ror', # Run-of-river
        'B12': 'entsoe_hydro_res', # Reservoir
        'B01': 'entsoe_biomass',
        'B04': 'entsoe_gas',
        'B02': 'entsoe_lignite'
    }
    
    # Προετοιμασία: Φτιάχνουμε λίστες για κάθε ώρα (ώστε να βγάλουμε τον μέσο όρο των 15λεπτων)
    hourly_raw = {hr: {k: [] for k in psr_map.values()} for hr in range(1, 25)}
    
    print(f"[{date_str}] Ζήτηση δεδομένων ENTSO-E (Actual Generation)...")
    try:
        response = requests.get(url, params=params, timeout=20)
    except Exception as e:
        print(f"[{date_str}] Αποτυχία σύνδεσης στο ENTSO-E API: {e}")
        return []

    if response.status_code != 200:
        print(f"[{date_str}] ENTSO-E API Error {response.status_code}: {response.text}")
        return []
        
    # Αυστηρό Parsing του XML βάσει του ENTSO-E Namespace
    ns = {'ns': 'urn:iec62325.351:tc57wg16:451-6:generationloaddocument:3:0'}
    try:
        root = ET.fromstring(response.content)
    except ET.ParseError:
        print(f"[{date_str}] Σφάλμα ανάλυσης XML από το ENTSO-E.")
        return []
    
    for ts in root.findall('ns:TimeSeries', ns):
        psr_type_elem = ts.find('ns:MktPSRType/ns:psrType', ns)
        if psr_type_elem is None or psr_type_elem.text not in psr_map:
            continue
            
        out_key = psr_map[psr_type_elem.text]
        period = ts.find('ns:Period', ns)
        if period is None: continue
        
        res_text = period.find('ns:resolution', ns).text
        start_str = period.find('ns:timeInterval/ns:start', ns).text
        
        # Ώρα έναρξης του block σε UTC
        ts_start_utc = datetime.strptime(start_str, "%Y-%m-%dT%H:%MZ").replace(tzinfo=pytz.utc)
        
        for pt in period.findall('ns:Point', ns):
            pos = int(pt.find('ns:position', ns).text)
            qty = float(pt.find('ns:quantity', ns).text)
            
            # Υπολογισμός πραγματικού Timestamp του Point
            if res_text == 'PT15M':
                point_time_utc = ts_start_utc + timedelta(minutes=15 * (pos - 1))
            elif res_text == 'PT60M':
                point_time_utc = ts_start_utc + timedelta(minutes=60 * (pos - 1))
            else:
                continue
                
            # Μετατροπή σε Ώρα Ελλάδος
            point_time_athens = point_time_utc.astimezone(athens)
            
            # Διασφάλιση ότι αφορά ακριβώς τη ζητούμενη μέρα
            if point_time_athens.strftime("%Y%m%d") == date_str:
                # Το 00:00 (12 το βράδυ) ανήκει στην Ώρα 1
                target_hour = point_time_athens.hour + 1
                hourly_raw[target_hour][out_key].append(qty)
                
    # 2. Συγχώνευση (Averaging) και Δημιουργία των Records
    entsoe_records = []
    for hr in range(1, 25):
        rec = {
            "date": date_str,
            "target_hour": int(hr)
        }
        for k in psr_map.values():
            vals = hourly_raw[hr][k]
            # Ο μέσος όρος ισχύος MW (Average) μας δίνει την ενέργεια σε MWh
            rec[k] = round(sum(vals) / len(vals), 1) if vals else 0.0
        
        # Ευκολία για το frontend: Συνολικά Υδροηλεκτρικά (ROR + RES)
        rec['entsoe_hydro'] = round(rec['entsoe_hydro_ror'] + rec['entsoe_hydro_res'], 1)
        
        entsoe_records.append(rec)
        
    return entsoe_records

if __name__ == "__main__":
    target_dates = get_target_dates()
    token = os.environ.get('ENTSOE_TOKEN')
    print(f"Θα ελεγχθούν δεδομένα ENTSO-E για τις ημέρες: {target_dates}")
    
    all_entsoe_data = []
    for d_str in target_dates:
        daily_data = build_entsoe_for_date(d_str, token)
        all_entsoe_data.extend(daily_data)
        
    if all_entsoe_data:
        # --- Νέα δομή (schema v1): ένα αρχείο ανά ημέρα ---
        contract.write_entsoe_days(all_entsoe_data)
        # Φάση 3b: το παλιό συγκεντρωτικό αρχείο δεν χρησιμοποιείται πια.
        if os.path.exists('data/entsoe_ref.json'):
            os.remove('data/entsoe_ref.json')
            print("✓ Το παλιό data/entsoe_ref.json αφαιρέθηκε (φάση 3b).")
