import requests
import json
import os
from datetime import datetime
import pytz

def get_today_string():
    tz = pytz.timezone('Europe/Athens')
    now = datetime.now(tz)
    return now.strftime("%Y%m%d")

def fetch_all_data():
    date_str = get_today_string()
    
    # Base URL και τα 4 κρίσιμα endpoints
    base_proxy = "https://iptoanalytics-api.admie.gr/iptoanalytics/api/ipto?endpoint=https:%2F%2Fmarket-public-api.admie.gr%2Frestws%2Fportal%2F"
    
    endpoints = {
        "production": f"{base_proxy}prodmixandload%2F{date_str}",
        "dam": f"{base_proxy}dayaheadmarket%2F{date_str}",
        "interconnections": f"{base_proxy}scadainterflows%2F{date_str}",
        "co2": f"{base_proxy}co2emissions%2F{date_str}%2F{date_str}"
    }

    headers = {
        'User-Agent': 'live-greekpower-bot (Mozilla/5.0)',
        'Accept': 'application/json'
    }

    tz = pytz.timezone('Europe/Athens')
    current_time = datetime.now(tz)
    # To API συνήθως είναι 1-2 ώρες πίσω, αλλά ας κρατήσουμε την ώρα που τρέχει το script
    run_hour = current_time.hour 

    hourly_record = {
        "fetch_timestamp": current_time.isoformat(),
        "date": date_str,
        "target_hour": run_hour,
        "demand_mwh": 0,
        "production_mix": {},
        "dam_price_eur": 0,
        "interconnections_mwh": {},
        "co2_emissions": 0
    }

    print(f"--- Fetching Data for Date: {date_str}, Hour: {run_hour} ---")

    try:
        # 1. Παραγωγή & Φορτίο
        resp_prod = requests.get(endpoints["production"], headers=headers)
        if resp_prod.status_code == 200:
            data = resp_prod.json()
            if "items" in data:
                for item in data["items"]:
                    if item.get("hr") == run_hour:
                        tech = item.get("itemname")
                        energy = item.get("energy")
                        # Διόρθωση στο κλειδί του συνολικού φορτίου
                        if tech == "TOTAL_LOAD":
                            hourly_record["demand_mwh"] = energy
                        elif tech:
                            hourly_record["production_mix"][tech] = energy

        # 2. Day Ahead Market (Τιμή DAM)
        resp_dam = requests.get(endpoints["dam"], headers=headers)
        if resp_dam.status_code == 200:
             data = resp_dam.json()
             # Debug Print για να δούμε τα κλειδιά της DAM στα GitHub logs
             print("DAM Data Sample:", str(data)[:500]) 
             if "items" in data:
                 for item in data["items"]:
                     if item.get("hr") == run_hour:
                         hourly_record["dam_price_eur"] = item.get("price", item.get("mcp", 0)) 

        # 3. Διασυνδέσεις
        resp_int = requests.get(endpoints["interconnections"], headers=headers)
        if resp_int.status_code == 200:
            data = resp_int.json()
            if "items" in data:
                for item in data["items"]:
                    if item.get("hr") == run_hour:
                        country = item.get("itemname")
                        flow = item.get("energy")
                        if country:
                            hourly_record["interconnections_mwh"][country] = flow

        # 4. Εκπομπές CO2
        resp_co2 = requests.get(endpoints["co2"], headers=headers)
        if resp_co2.status_code == 200:
            data = resp_co2.json()
            # Debug Print για να δούμε τα κλειδιά του CO2 στα GitHub logs
            print("CO2 Data Sample:", str(data)[:500])
            if "items" in data:
                 for item in data["items"]:
                    if item.get("hr") == run_hour:
                         hourly_record["co2_emissions"] = item.get("value", 0)

        return hourly_record

    except Exception as e:
        print(f"Σφάλμα κατά την άντληση: {e}")
        return None

def save_to_json(new_data):
    if not new_data:
        return

    filepath = 'data/live_data.json'
    os.makedirs('data', exist_ok=True)

    history = []
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except json.JSONDecodeError:
            pass 

    history.append(new_data)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Δεδομένα αποθηκεύτηκαν στο {filepath}")

if __name__ == "__main__":
    combined_data = fetch_all_data()
    save_to_json(combined_data)
    
    if combined_data:
        print(json.dumps(combined_data, indent=2, ensure_ascii=False))
