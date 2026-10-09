import requests
import json
import os
import sys
from datetime import datetime, timedelta
import pytz

def get_target_dates():
    # Διαβάζει τα inputs από το GitHub Action (αφαιρεί τυχόν παύλες αν ο χρήστης βάλει 2026-10-09 αντί για 20261009)
    start_env = os.environ.get('START_DATE', '').strip().replace('-', '')
    end_env = os.environ.get('END_DATE', '').strip().replace('-', '')

    tz = pytz.timezone('Europe/Athens')
    today_dt = datetime.now(tz)
    today_str = today_dt.strftime("%Y%m%d")

    start_str = start_env if start_env else today_str
    end_str = end_env if end_env else start_str

    try:
        start_dt = datetime.strptime(start_str, "%Y%m%d")
        end_dt = datetime.strptime(end_str, "%Y%m%d")
    except ValueError:
        print("Μη έγκυρη μορφή ημερομηνίας. Γίνεται fallback στη σημερινή.")
        start_dt = today_dt
        end_dt = today_dt

    dates = []
    current = start_dt
    while current <= end_dt:
        dates.append(current.strftime("%Y%m%d"))
        current += timedelta(days=1)

    return dates

def fetch_all_data(date_str):
    base_proxy = "https://iptoanalytics-api.admie.gr/iptoanalytics/api/ipto?endpoint=https:%2F%2Fmarket-public-api.admie.gr%2Frestws%2Fportal%2F"
    
    endpoints = {
        "production": f"{base_proxy}prodmixandload%2F{date_str}",
        "dam": f"{base_proxy}dayaheadmarket%2F{date_str}",
        "interconnections": f"{base_proxy}scadainterflows%2F{date_str}",
        "co2": f"{base_proxy}carbon%2F{date_str}"
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
                "demand_mwh": 0,
                "production_mix": {},
                "dam_price_eur": 0,
                "interconnections_mwh": {},
                "co2_emissions": 0
            }
        return daily_data[hr]

    print(f"--- Fetching Data for Date: {date_str} ---")

    try:
        resp_prod = requests.get(endpoints["production"], headers=headers)
        if resp_prod.status_code == 200:
            for item in resp_prod.json().get("items", []):
                hr = item.get("hr")
                if hr is not None:
                    record = get_or_create_hour(hr)
                    tech, energy = item.get("itemname"), item.get("energy")
                    if tech == "TOTAL_LOAD": record["demand_mwh"] = energy
                    elif tech: record["production_mix"][tech] = energy

        resp_dam = requests.get(endpoints["dam"], headers=headers)
        if resp_dam.status_code == 200:
             for item in resp_dam.json().get("items", []):
                 hr = item.get("hr")
                 if hr is not None and item.get("country") == "GR":
                     get_or_create_hour(hr)["dam_price_eur"] = item.get("value", 0) 

        resp_int = requests.get(endpoints["interconnections"], headers=headers)
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

def update_records():
    records_path = 'data/records.json'
    records = {
        "daily": {"res": [], "res_share": [], "exports": [], "bess_chg_pump": [], "bess_dis": []},
        "hourly": {"demand": [], "exports": [], "bess_chg": [], "bess_dis": [], "network_load": []}
    }
    
    if os.path.exists(records_path):
        try:
            with open(records_path, 'r', encoding='utf-8') as f:
                records = json.load(f)
        except: pass

    all_history = []
    if os.path.exists('data'):
        for filename in os.listdir('data'):
            if filename.endswith('.json') and filename != 'records.json':
                filepath = os.path.join('data', filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            all_history.extend(data)
                except: pass

    if not all_history: return

    unique_hours = {}
    for hr_data in all_history:
        date_str = hr_data.get('date')
        hr = hr_data.get('target_hour')
        if not date_str or hr == 0 or hr > 24: continue
        unique_hours[f"{date_str}_{hr}"] = hr_data

    clean_history = list(unique_hours.values())

    def add_top5(lst, entry):
        existing = next((i for i in lst if i['id'] == entry['id']), None)
        if existing:
            existing['value'] = max(existing['value'], entry['value'])
        else:
            lst.append(entry)
        lst.sort(key=lambda x: x['value'], reverse=True)
        return lst[:5]

    days_map = {}
    country_keys = ['ΑΛΒΑΝΙΑ', 'ΒΟΥΛΓΑΡΙΑ', 'ΙΤΑΛΙΑ', 'ΤΟΥΡΚΙΑ', 'FYROM']

    for hr_data in clean_history:
        date_str = hr_data.get('date')
        hr = hr_data.get('target_hour')
        
        if date_str not in days_map:
            days_map[date_str] = {'res': 0, 'gen': 0, 'exp': 0, 'chg_pump': 0, 'dis': 0}

        mix = hr_data.get('production_mix', {}) or {}
        gen = mix.get('TOTAL_PROD') or 0
        res = mix.get('RES_PROD') or 0
        st_in = mix.get('STORAGE_INJECTION') or 0
        st_abs = abs(mix.get('STORAGE_ABSORPTION') or 0)
        pump = mix.get('ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ') or 0
        
        imp, exp = 0, 0
        interchanges = hr_data.get('interconnections_mwh', {}) or {}
        for c in country_keys:
            imp += interchanges.get(f"{c}_IMP") or 0
            exp += abs(interchanges.get(f"{c}_EXP") or 0)
            
        demand = gen + imp + st_in - exp - st_abs - pump
        net_load = gen + imp + st_in
        
        days_map[date_str]['res'] += res
        days_map[date_str]['gen'] += gen
        days_map[date_str]['exp'] += exp
        days_map[date_str]['chg_pump'] += (st_abs + pump)
        days_map[date_str]['dis'] += st_in
        
        hr_id = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}, {hr:02d}:00"
        records['hourly']['demand'] = add_top5(records['hourly']['demand'], {'id': hr_id, 'value': round(demand, 1)})
        records['hourly']['exports'] = add_top5(records['hourly']['exports'], {'id': hr_id, 'value': round(exp, 1)})
        records['hourly']['bess_chg'] = add_top5(records['hourly']['bess_chg'], {'id': hr_id, 'value': round(st_abs, 1)})
        records['hourly']['bess_dis'] = add_top5(records['hourly']['bess_dis'], {'id': hr_id, 'value': round(st_in, 1)})
        records['hourly']['network_load'] = add_top5(records['hourly']['network_load'], {'id': hr_id, 'value': round(net_load, 1)})

    for date_str, d_vals in days_map.items():
        date_formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
        d_res = d_vals['res']
        d_gen = d_vals['gen']
        d_exp = d_vals['exp']
        d_chg_pump = d_vals['chg_pump']
        d_dis = d_vals['dis']
        d_res_share = (d_res / d_gen * 100) if d_gen > 0 else 0

        records['daily']['res'] = add_top5(records['daily']['res'], {'id': date_formatted, 'value': round(d_res, 1)})
        records['daily']['res_share'] = add_top5(records['daily']['res_share'], {'id': date_formatted, 'value': round(d_res_share, 2)})
        records['daily']['exports'] = add_top5(records['daily']['exports'], {'id': date_formatted, 'value': round(d_exp, 1)})
        records['daily']['bess_chg_pump'] = add_top5(records['daily']['bess_chg_pump'], {'id': date_formatted, 'value': round(d_chg_pump, 1)})
        records['daily']['bess_dis'] = add_top5(records['daily']['bess_dis'], {'id': date_formatted, 'value': round(d_dis, 1)})

    with open(records_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"✓ Το records.json ενημερώθηκε σαρώνοντας {len(clean_history)} μοναδικές ώρες.")

def save_to_json(new_records):
    if not new_records: return
    filepath = 'data/live_data.json'
    os.makedirs('data', exist_ok=True)
    history = []
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except: pass 
        
    history_map = { (rec.get("date"), rec.get("target_hour")): i for i, rec in enumerate(history) }
    
    for new_rec in new_records:
        key = (new_rec["date"], new_rec["target_hour"])
        if key in history_map: 
            history[history_map[key]] = new_rec
        else:
            history.append(new_rec)
            history_map[key] = len(history) - 1
            
    history.sort(key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))
    
    # Επέκταση σε 30 ημέρες για να χωράει τα ιστορικά fetch
    tz = pytz.timezone('Europe/Athens')
    thirty_days_ago = datetime.now(tz) - timedelta(days=30)
    cutoff = thirty_days_ago.strftime("%Y%m%d")
    filtered_history = [rec for rec in history if rec.get("date", "") >= cutoff]

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(filtered_history, f, ensure_ascii=False, indent=2)
    print(f"✓ Δεδομένα αποθηκεύτηκαν στο {filepath}.")

if __name__ == "__main__":
    target_dates = get_target_dates()
    print(f"Θα αντληθούν δεδομένα για τις εξής {len(target_dates)} ημέρες: {target_dates}")
    
    all_new_data = []
    for d_str in target_dates:
        daily_data = fetch_all_data(d_str)
        all_new_data.extend(daily_data)
        
    if all_new_data:
        save_to_json(all_new_data)
        update_records()
