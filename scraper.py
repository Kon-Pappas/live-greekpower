import requests
import json
import os
from datetime import datetime, timedelta
import pytz

def get_today_string():
    tz = pytz.timezone('Europe/Athens')
    now = datetime.now(tz)
    return now.strftime("%Y%m%d")

def fetch_all_data():
    date_str = get_today_string()
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
        print(f"Σφάλμα κατά την άντληση: {e}")
        return []

def update_records(new_records):
    if not new_records: return
    records_path = 'data/records.json'
    
    # Αρχική δομή του records.json
    records = {
        "daily": {"res": [], "res_share": [], "exports": [], "bess_chg_pump": [], "bess_dis": []},
        "hourly": {"demand": [], "exports": [], "bess_chg": [], "bess_dis": [], "network_load": []}
    }
    
    if os.path.exists(records_path):
        try:
            with open(records_path, 'r', encoding='utf-8') as f:
                records = json.load(f)
        except: pass

    # Helper για την ενημέρωση του Top 5
    def add_top5(lst, entry):
        # Αν υπάρχει ήδη η ημερομηνία/ώρα, κάνουμε update
        existing = next((i for i in lst if i['id'] == entry['id']), None)
        if existing:
            existing['value'] = max(existing['value'], entry['value'])
        else:
            lst.append(entry)
        lst.sort(key=lambda x: x['value'], reverse=True)
        return lst[:5]

    today = new_records[0]['date']
    d_res = d_gen = d_exp = d_chg_pump = d_dis = 0

    country_keys = ['ΑΛΒΑΝΙΑ', 'ΒΟΥΛΓΑΡΙΑ', 'ΙΤΑΛΙΑ', 'ΤΟΥΡΚΙΑ', 'FYROM']

    for hr_data in new_records:
        hr = hr_data['target_hour']
        if hr == 0 or hr > 24: continue
        hr_id = f"{today[:4]}-{today[4:6]}-{today[6:]}, {hr:02d}:00"
        
        gen = hr_data['production_mix'].get('TOTAL_PROD', 0)
        res = hr_data['production_mix'].get('RES_PROD', 0)
        st_in = hr_data['production_mix'].get('STORAGE_INJECTION', 0)
        st_abs = abs(hr_data['production_mix'].get('STORAGE_ABSORPTION', 0))
        pump = hr_data['production_mix'].get('ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ', 0)
        
        imp, exp = 0, 0
        for c in country_keys:
            imp += hr_data['interconnections_mwh'].get(f"{c}_IMP", 0)
            exp += abs(hr_data['interconnections_mwh'].get(f"{c}_EXP", 0))
            
        demand = gen + imp + st_in - exp - st_abs - pump
        net_load = gen + imp + st_in # Το Gross System Supply
        
        # Accumulate for Daily
        d_res += res
        d_gen += gen
        d_exp += exp
        d_chg_pump += (st_abs + pump)
        d_dis += st_in
        
        # Process Hourly Top 5 (MW)
        records['hourly']['demand'] = add_top5(records['hourly']['demand'], {'id': hr_id, 'value': round(demand, 1)})
        records['hourly']['exports'] = add_top5(records['hourly']['exports'], {'id': hr_id, 'value': round(exp, 1)})
        records['hourly']['bess_chg'] = add_top5(records['hourly']['bess_chg'], {'id': hr_id, 'value': round(st_abs, 1)})
        records['hourly']['bess_dis'] = add_top5(records['hourly']['bess_dis'], {'id': hr_id, 'value': round(st_in, 1)})
        records['hourly']['network_load'] = add_top5(records['hourly']['network_load'], {'id': hr_id, 'value': round(net_load, 1)})

    # Process Daily Top 5
    d_res_share = (d_res / d_gen * 100) if d_gen > 0 else 0
    today_formatted = f"{today[:4]}-{today[4:6]}-{today[6:]}"
    
    records['daily']['res'] = add_top5(records['daily']['res'], {'id': today_formatted, 'value': round(d_res, 1)})
    records['daily']['res_share'] = add_top5(records['daily']['res_share'], {'id': today_formatted, 'value': round(d_res_share, 2)})
    records['daily']['exports'] = add_top5(records['daily']['exports'], {'id': today_formatted, 'value': round(d_exp, 1)})
    records['daily']['bess_chg_pump'] = add_top5(records['daily']['bess_chg_pump'], {'id': today_formatted, 'value': round(d_chg_pump, 1)})
    records['daily']['bess_dis'] = add_top5(records['daily']['bess_dis'], {'id': today_formatted, 'value': round(d_dis, 1)})

    with open(records_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

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
        if key in history_map: history[history_map[key]] = new_rec
        else:
            history.append(new_rec)
            history_map[key] = len(history) - 1
    history.sort(key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))
    
    tz = pytz.timezone('Europe/Athens')
    seven_days_ago = datetime.now(tz) - timedelta(days=7)
    cutoff = seven_days_ago.strftime("%Y%m%d")
    filtered_history = [rec for rec in history if rec.get("date", "") >= cutoff]

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(filtered_history, f, ensure_ascii=False, indent=2)
    print(f"✓ Δεδομένα αποθηκεύτηκαν στο {filepath}.")

if __name__ == "__main__":
    combined_data = fetch_all_data()
    save_to_json(combined_data)
    update_records(combined_data)  # Η νέα λειτουργία "Κυνηγός Ρεκόρ"
