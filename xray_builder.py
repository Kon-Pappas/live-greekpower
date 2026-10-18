import requests
import json
import os
import sys
from datetime import datetime, timedelta
import pytz
from jsonio import load_json_strict, write_json_atomic
import pandas as pd
import io
import urllib3

# Απενεργοποίηση προειδοποιήσεων SSL για το API του ΑΔΜΗΕ
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def get_target_dates():
    start_env = os.environ.get('START_DATE', '').strip().replace('-', '')
    end_env = os.environ.get('END_DATE', '').strip().replace('-', '')

    tz = pytz.timezone('Europe/Athens')
    now = datetime.now(tz)
    
    # Αν είναι κενές (π.χ. από αυτόματο τρέξιμο cron-job), βρες προχθές και χθες
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

def fetch_excel_url(date_str, category):
    date_formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    url = f"https://www.admie.gr/getOperationMarketFile?dateStart={date_formatted}&dateEnd={date_formatted}&FileCategory={category}"
    try:
        resp = requests.get(url, verify=False, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                return data[0].get("file_path")
            elif isinstance(data, dict):
                return data.get("file_path")
    except Exception as e:
        print(f"Error fetching {category} URL for {date_formatted}: {e}")
    return None

def fetch_api_supplement(date_str):
    """Αντλεί MCP, BESS και Pumping απευθείας από το API του ΑΔΜΗΕ για απόλυτη ανεξαρτησία."""
    base_proxy = "https://iptoanalytics-api.admie.gr/iptoanalytics/api/ipto?endpoint=https:%2F%2Fmarket-public-api.admie.gr%2Frestws%2Fportal%2F"
    endpoints = {
        "production": f"{base_proxy}prodmixandload%2F{date_str}",
        "dam": f"{base_proxy}dayaheadmarket%2F{date_str}"
    }
    headers = {'User-Agent': 'live-greekpower-bot (Mozilla/5.0)', 'Accept': 'application/json'}
    
    hourly_supp = {hr: {'mcp': 0.0, 'bess_disch': 0.0, 'bess_chg': 0.0, 'pump': 0.0} for hr in range(1, 25)}
    
    try:
        resp_prod = requests.get(endpoints["production"], headers=headers, verify=False, timeout=15)
        if resp_prod.status_code == 200:
            for item in resp_prod.json().get("items", []):
                hr = item.get("hr")
                tech = item.get("itemname")
                energy = item.get("energy")
                if hr and tech:
                    if tech == 'STORAGE_INJECTION': hourly_supp[hr]['bess_disch'] = float(energy)
                    elif tech == 'STORAGE_ABSORPTION': hourly_supp[hr]['bess_chg'] = float(abs(energy))
                    elif tech == 'ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ': hourly_supp[hr]['pump'] = float(energy)
        
        resp_dam = requests.get(endpoints["dam"], headers=headers, verify=False, timeout=15)
        if resp_dam.status_code == 200:
             for item in resp_dam.json().get("items", []):
                 hr = item.get("hr")
                 if hr and item.get("country") == "GR":
                     hourly_supp[hr]['mcp'] = float(item.get("value", 0))
    except Exception as e:
        print(f"[{date_str}] Σφάλμα λήψης API (MCP/Storage): {e}")
        
    return hourly_supp

def build_xray_for_date(date_str):
    scada_url = fetch_excel_url(date_str, "SystemRealizationSCADA")
    resmv_url = fetch_excel_url(date_str, "RESMV")
    
    if not scada_url or not resmv_url:
        print(f"[{date_str}] Δεν βρέθηκαν αρχεία X-Ray (Excel).")
        return []
        
    print(f"[{date_str}] Λήψη SCADA: {scada_url}")
    scada_resp = requests.get(scada_url, verify=False, timeout=20)
    print(f"[{date_str}] Λήψη RESMV: {resmv_url}")
    resmv_resp = requests.get(resmv_url, verify=False, timeout=20)
    
    try:
        scada_df = pd.read_excel(io.BytesIO(scada_resp.content), sheet_name='System_Production')
        resmv_df = pd.read_excel(io.BytesIO(resmv_resp.content), sheet_name='Sheet1')
    except Exception as e:
        print(f"[{date_str}] Σφάλμα ανάγνωσης Excel: {e}")
        return []

    # Reset Column Names for easy numeric iteration
    scada_df.columns = [str(i) for i in range(len(scada_df.columns))]
    resmv_df.columns = resmv_df.columns.str.strip() 
    
    # Λίστες Διαχωρισμού Υδροηλεκτρικών
    big_hydro_names = ["ΚΡΕΜΑΣΤΑ", "ΚΑΣΤΡΑΚΙ", "ΣΤΡΑΤΟΣ 1", "ΙΛΑΡΙΩΝ", "ΠΟΛΥΦΥΤΟ", "ΣΦΗΚΙΑ", "ΑΣΩΜΑΤΑ", "ΑΩΟΣ", "ΠΟΥΡΝΑΡΙ", "ΠΟΥΡΝΑΡΙ 2", "ΘΗΣΑΥΡΟΣ", "ΠΛΑΤΑΝΟΒΡΥΣΗ", "ΛΑΔΩΝΑΣ", "ΠΛΑΣΤΗΡΑΣ", "ΑΓΡΑΣ", "ΕΔΕΣΣΑΙΟΣ"]
    small_hydro_names = ["ΣΤΡΑΤΟΣ 2", "ΜΑΚΡΟΧΩΡΙ", "ΛΟΥΡΟΣ", "ΓΚΙΩΝΑ"]
    
    try:
        hydro_start = scada_df[scada_df['1'].astype(str).str.contains("ΥΔΡΟΗΛΕΚΤΡΙΚΕΣ ΜΟΝΑΔΕΣ", na=False)].index[0]
        hydro_end = scada_df[scada_df['1'] == "TOTAL HYDRO"].index[0]
        hydro_df = scada_df.iloc[hydro_start:hydro_end].copy()
        
        res_start = scada_df[scada_df['1'].astype(str).str.contains("ΑΝΑΝΕΩΣΙΜΑ", na=False)].index[0]
        res_end = scada_df[scada_df['1'] == "TOTAL RES"].index[0]
        res_df = scada_df.iloc[res_start+1:res_end].copy()
    except IndexError:
        print(f"[{date_str}] Δομικό λάθος στο SCADA: Δεν βρέθηκαν οι ενότητες Υδροηλεκτρικών/ΑΠΕ.")
        return []

    # Φίλτρα (Masks) για την ενότητα ΑΠΕ του SCADA
    is_myis = res_df['1'].astype(str).str.contains("ΜΥΗΣ", na=False)
    is_pv = res_df['1'].astype(str).str.contains("PV|PV2", na=False, regex=True)
    is_bm = res_df['1'].astype(str).str.contains("BM", na=False)
    is_cg = res_df['1'].astype(str).str.contains("CG", na=False)
    is_wind = ~is_myis & ~is_pv & ~is_bm & ~is_cg & pd.notna(res_df['1'])

    # Ανάκτηση MCP & Storage από το API
    api_supp = fetch_api_supplement(date_str)
    xray_records = []
    
    for hr in range(1, 25):
        scada_col = str(hr + 1)
        
        # 1. Υπολογισμοί SCADA (Κάνουμε ρητό cast σε float!)
        def get_val(df, mask):
            val = pd.to_numeric(df.loc[mask, scada_col], errors='coerce').fillna(0).sum()
            return float(val)
        
        scada_bh = get_val(hydro_df, hydro_df['1'].isin(big_hydro_names))
        scada_sh = get_val(hydro_df, hydro_df['1'].isin(small_hydro_names))
        
        scada_myis = get_val(res_df, is_myis)
        scada_solar = get_val(res_df, is_pv)
        scada_biomass = get_val(res_df, is_bm)
        scada_cogen = get_val(res_df, is_cg)
        scada_wind = get_val(res_df, is_wind)
        
        raw_scada_total = pd.to_numeric(scada_df.loc[res_end, scada_col], errors='coerce')
        scada_total_res_row = 0.0 if pd.isna(raw_scada_total) else float(raw_scada_total)
            
        # Other RES: Ό,τι περισσεύει
        sum_of_scada_parts = scada_myis + scada_solar + scada_biomass + scada_cogen + scada_wind
        scada_other_res = scada_total_res_row - sum_of_scada_parts
        
        # 2. Υπολογισμοί RESMV (Ρητό cast σε float!)
        resmv_row = resmv_df[resmv_df['ΩΡΑ'] == float(hr)]
        if not resmv_row.empty:
            r = resmv_row.iloc[0]
            resmv_sh = float(r.get('ΜΥΗΣ ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0)
            resmv_solar = float(r.get('Φ/Β ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0)
            resmv_biomass = float(r.get('B/A ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0)
            resmv_cogen = float(r.get('ΣΗΘΥΑ ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0)
        else:
            resmv_sh = resmv_solar = resmv_biomass = resmv_cogen = 0.0

        # 3. Ενσωμάτωση δεδομένων
        supp = api_supp.get(hr, {'mcp': 0.0, 'bess_disch': 0.0, 'bess_chg': 0.0, 'pump': 0.0})

        # 4. Χτίσιμο του JSON αντικειμένου, εξασφαλίζοντας ότι ΟΛΑ είναι Python floats/ints
        xray_records.append({
            "date": date_str,
            "target_hour": int(hr),
            "mcp": float(round(supp['mcp'], 2)),
            "big_hydro": float(round(scada_bh, 1)),
            "small_hydro": float(round(scada_sh + scada_myis + resmv_sh, 1)),
            "solar": float(round(scada_solar + resmv_solar, 1)),
            "biomass": float(round(scada_biomass + resmv_biomass, 1)),
            "cogen": float(round(scada_cogen + resmv_cogen, 1)),
            "wind": float(round(scada_wind, 1)),
            "other_res": float(round(scada_other_res, 1)),
            "bess_disch": float(round(supp['bess_disch'], 1)),
            "bess_chg": float(round(supp['bess_chg'], 1)),
            "pump": float(round(supp['pump'], 1))
        })
        
    return xray_records

def save_xray_data(new_records):
    if not new_records: return
    filepath = 'data/xray_data.json'
    os.makedirs('data', exist_ok=True)
    
    # Το αρχείο κρατά όλο το ιστορικό από 1/4/2026 και δεν υπάρχει αλλού:
    # αν δεν διαβάζεται, ΣΤΑΜΑΤΑΜΕ αντί να το αντικαταστήσουμε με 2 μέρες.
    history = load_json_strict(filepath, [])
        
    history_map = { (rec.get("date"), rec.get("target_hour")): i for i, rec in enumerate(history) }
    
    for new_rec in new_records:
        key = (new_rec["date"], new_rec["target_hour"])
        if key in history_map: 
            history[history_map[key]] = new_rec
        else:
            history.append(new_rec)
            history_map[key] = len(history) - 1
            
    # Ταξινόμηση - ΧΩΡΙΣ ΟΡΙΟ (Κρατάει το ιστορικό για πάντα)
    history.sort(key=lambda x: (x.get("date", ""), x.get("target_hour", 0)))

    write_json_atomic(filepath, history)
    print(f"✓ Δεδομένα X-Ray αποθηκεύτηκαν στο {filepath} ({len(history)} ώρες συνολικά).")

if __name__ == "__main__":
    target_dates = get_target_dates()
    print(f"Θα ελεγχθούν δεδομένα X-Ray για τις ημέρες: {target_dates}")
    
    all_xray_data = []
    for d_str in target_dates:
        daily_xray = build_xray_for_date(d_str)
        all_xray_data.extend(daily_xray)
        
    if all_xray_data:
        save_xray_data(all_xray_data)
