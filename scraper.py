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

    # Dictionary για να κρατήσουμε τα δεδομένα ΟΛΩΝ των ωρών της ημέρας
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
        # 1. Παραγωγή & Φορτίο (Σάρωση όλων των διαθέσιμων ωρών)
        resp_prod = requests.get(endpoints["production"], headers=headers)
        if resp_prod.status_code == 200:
            data = resp_prod.json()
            if "items" in data:
                for item in data["items"]:
                    hr = item.get("hr")
                    if hr is not None:
                        record = get_or_create_hour(hr)
                        tech = item.get("itemname")
                        energy = item.get("energy")
                        if tech == "TOTAL_LOAD":
                            record["demand_mwh"] = energy
                        elif tech:
                            record["production_mix"][tech] = energy

        # 2. Day Ahead Market (Τιμή DAM)
        resp_dam = requests.get(endpoints["dam"], headers=headers)
        if resp_dam.status_code == 200:
             data = resp_dam.json()
             if "items" in data:
                 for item in data["items"]:
                     hr = item.get("hr")
                     if hr is not None and item.get("country") == "GR":
                         record = get_or_create_hour(hr)
                         record["dam_price_eur"] = item.get("value", 0) 

        # 3. Διασυνδέσεις
        resp_int = requests.get(endpoints["interconnections"], headers=headers)
        if resp_int.status_code == 200:
            data = resp_int.json()
            if "items" in data:
                for item in data["items"]:
                    hr = item.get("hr")
                    if hr is not None:
                        record = get_or_create_hour(hr)
                        country = item.get("itemname")
                        flow = item.get("energy")
                        if country:
                            record["interconnections_mwh"][country] = flow

        # 4. Εκπομπές CO2 (Carbon)
        resp_co2 = requests.get(endpoints["co2"], headers=headers)
        if resp_co2.status_code == 200:
            data = resp_co2.json()
            if "items" in data:
                 for item in data["items"]:
                    hr = item.get("hr")
                    if hr is not None:
                         record = get_or_create_hour(hr)
                         record["co2_emissions"] = item.get("value", 0)

        # Επιστροφή όλων των ωρών ως λίστα
        return list(daily_data.values())

    except Exception as e:
        print(f"Σφάλμα κατά την άντληση: {e}")
        return []

def save_to_json(new_records):
    if not new_records:
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

    # --- UPSERT (HEALING) LOGIC ---
    # Δημιουργία ευρετηρίου για γρήγορη αναζήτηση υπαρχουσών εγγραφών
    history_map = { (rec.get("date"), rec.get("target_hour")): i for i, rec in enumerate(history) }

    for new_rec in new_records:
        key = (new_rec["date"], new_rec["target_hour"])
        if key in history_map:
            # Αν υπάρχει ήδη η ώρα, την κάνουμε overwrite με τα φρέσκα/διορθωμένα δεδομένα
            idx = history_map[key]
            history[idx] = new_rec
        else:
            # Αν δεν υπάρχει, την προσθέτουμε στο τέλος
            history.append(new_rec)
            # Ενημέρωση του map
            history_map[key] = len(history) - 1

    # Ταξινόμηση ιστορικού χρονολογικά
    history.sort(key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))

    # --- CLEANUP LOGIC (Κράτημα 7 ημερών) ---
    tz = pytz.timezone('Europe/Athens')
    seven_days_ago = datetime.now(tz) - timedelta(days=7)
    cutoff_date_str = seven_days_ago.strftime("%Y%m%d")
    
    # Φιλτράρισμα: κρατάμε μόνο όσες εγγραφές είναι από την cutoff_date και μετά
    filtered_history = [rec for rec in history if rec.get("date", "") >= cutoff_date_str]

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(filtered_history, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Δεδομένα αποθηκεύτηκαν στο {filepath}. Σύνολο ωριαίων εγγραφών (τελ. 7 ημέρες): {len(filtered_history)}")

if __name__ == "__main__":
    combined_data = fetch_all_data()
    save_to_json(combined_data)
    
    if combined_data:
        print(f"Αντλήθηκαν και ανανεώθηκαν {len(combined_data)} ωριαίες εγγραφές για τη σημερινή ημέρα.")
