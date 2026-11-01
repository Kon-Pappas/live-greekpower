import requests
import json
import os
import time
import sys
from datetime import datetime, timedelta
import pytz
from jsonio import write_json_atomic, load_json_lenient
import contract
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
    """Διεύθυνση αρχείου του ΑΔΜΗΕ για την ημέρα date_str (D51).
    Το RESMV της ημέρας D έχει όνομα D+1 (π.χ. η 25/10 → 20261026_RESMV_01.xls).
    1) ερώτηση για την ίδια ημέρα (όπως πριν)· 2) αν δεν βρεθεί (π.χ. ημέρα αλλαγής ώρας),
    ερώτηση για γύρω ημέρες και επιλογή του αρχείου με το αναμενόμενο όνομα· 3) τυπική διεύθυνση."""
    d = datetime.strptime(date_str, "%Y%m%d")
    expected = (d + timedelta(days=1 if category == "RESMV" else 0)).strftime("%Y%m%d")

    def query(d0, d1):
        url = (f"https://www.admie.gr/getOperationMarketFile?dateStart={d0:%Y-%m-%d}"
               f"&dateEnd={d1:%Y-%m-%d}&FileCategory={category}")
        try:
            resp = requests.get(url, verify=False, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                data = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
                return [x.get("file_path") for x in data if isinstance(x, dict) and x.get("file_path")]
        except Exception as e:
            print(f"Error fetching {category} URL for {d0:%Y-%m-%d}: {e}")
        return []

    paths = query(d, d)
    for pth in paths:
        if os.path.basename(pth).startswith(expected):
            return pth
    if paths:
        return paths[0]                                   # συμπεριφορά όπως πριν
    for pth in query(d - timedelta(days=1), d + timedelta(days=2)):
        if os.path.basename(pth).startswith(expected):
            print(f"[{date_str}] {category}: βρέθηκε με ευρύτερη αναζήτηση ({os.path.basename(pth)})")
            return pth
    for k in (0, 1, 2):                                   # φάκελος = μήνας δημοσίευσης
        f = d + timedelta(days=k)
        for v in ("01", "02"):
            url = (f"https://www.admie.gr/sites/default/files/attached-files/type-file/"
                   f"{f:%Y}/{f:%m}/{expected}_{category}_{v}.xls")
            try:
                if requests.head(url, verify=False, timeout=15, allow_redirects=True).status_code == 200:
                    print(f"[{date_str}] {category}: βρέθηκε με τυπική διεύθυνση ({url})")
                    return url
            except Exception:
                pass
    return None


def local_hour_rows(date_str):
    """Για κάθε συνεχόμενη ώρα της ημέρας (1…N, N = 23/24/25) → η γραμμή του RESMV (ώρα ρολογιού 1…24).
    Ημέρα αλλαγής ώρας τον Οκτώβριο: η 03:00–04:00 εμφανίζεται δύο φορές → και οι δύο ώρες δείχνουν τη γραμμή 4
    (που στο RESMV είναι το άθροισμά τους). Τον Μάρτιο η 03:00–04:00 δεν υπάρχει (N = 23). D51."""
    tz = pytz.timezone('Europe/Athens')
    d = datetime.strptime(date_str, "%Y%m%d")
    start, end = tz.localize(d), tz.localize(d + timedelta(days=1))
    n = int(round((end - start).total_seconds() / 3600))
    start_utc = start.astimezone(pytz.utc)
    return [(start_utc + timedelta(hours=s)).astimezone(tz).hour + 1 for s in range(n)]


def live_supplement(date_str):
    """Τιμή DAM, BESS και άντληση από το live αρχείο της ημέρας (D51· έως 29/10/2026 από τον
    ενδιάμεσο iptoanalytics, που καταργήθηκε). Ίδια νούμερα, χωρίς εξωτερική εξάρτηση."""
    iso = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    day = load_json_lenient(os.path.join(contract.LIVE_DIR, iso + '.json'), None) or {}
    out = {}
    for h in day.get('hours', []):
        hr = h.get('hr')
        if not hr:
            continue
        rec = {'mcp': h.get('dam_price'), 'bess_disch': 0.0, 'bess_chg': 0.0, 'pump': 0.0}   # τιμή: κενό αν λείπει
        if h.get('has_data'):
            rec.update({'bess_disch': h['storage']['dis'] or 0.0, 'bess_chg': h['storage']['chg'] or 0.0,
                        'pump': h['pumping'] or 0.0})
        out[hr] = rec
    return out


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

    # Γραμμές συστήματος του SCADA (D36): οι δύο διασυνδέσεις της Κρήτης και το καθαρό φορτίο.
    # Πρόσημο όπως στο αρχείο: αρνητικό = ροή από την ηπειρωτική χώρα προς την Κρήτη.
    # Το αρχείο γράφει την Κρήτη με ελληνικούς χαρακτήρες έως 17/6/2026 ('AC ΚΡΗΤΗ', μόνο AC)
    # και με λατινικούς από 18/6/2026 ('AC KRHTH', 'DC KRHTH'). Δεχόμαστε και τις δύο γραφές (D41).
    def scada_row(*names):
        col = scada_df['1'].astype(str).str.strip().str.upper()
        for name in names:
            idx = scada_df.index[col == name]
            if len(idx):
                return idx[0]
        return None
    row_ac = scada_row('AC KRHTH', 'AC ΚΡΗΤΗ')
    row_dc = scada_row('DC KRHTH', 'DC ΚΡΗΤΗ')
    row_netload = scada_row('NET LOAD')

    # Τιμή DAM, BESS, άντληση από το live αρχείο (D51)
    api_supp = live_supplement(date_str)
    # Συνεχόμενες ώρες της ημέρας (23/24/25) και αντιστοίχιση με τις γραμμές του RESMV (D51)
    rows = local_hour_rows(date_str)
    row_count = {r: rows.count(r) for r in set(rows)}
    if len(rows) != 24:
        print(f"[{date_str}] Ημέρα αλλαγής ώρας: {len(rows)} ώρες.")
    xray_records = []

    for hr in range(1, len(rows) + 1):
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
        
        def row_val(idx):
            if idx is None:
                return None
            v = pd.to_numeric(scada_df.loc[idx, scada_col], errors='coerce')
            return None if pd.isna(v) else float(v)
        crete_ac, crete_dc, scada_net_load = row_val(row_ac), row_val(row_dc), row_val(row_netload)
        crete_flow = None if crete_ac is None and crete_dc is None else (crete_ac or 0.0) + (crete_dc or 0.0)

        # 2. Υπολογισμοί RESMV (Ρητό cast σε float!)
        rrow = rows[hr - 1]
        share = 1.0 / row_count[rrow]          # διπλή ώρα: η γραμμή του RESMV μοιράζεται στα δύο
        resmv_row = resmv_df[resmv_df['ΩΡΑ'] == float(rrow)]
        if not resmv_row.empty:
            r = resmv_row.iloc[0]
            resmv_sh = float(r.get('ΜΥΗΣ ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0) * share
            resmv_solar = float(r.get('Φ/Β ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0) * share
            resmv_biomass = float(r.get('B/A ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0) * share
            resmv_cogen = float(r.get('ΣΗΘΥΑ ΕΝΕΡΓΕΙΑ KWh', 0) / 1000.0) * share
        else:
            resmv_sh = resmv_solar = resmv_biomass = resmv_cogen = 0.0

        # 3. Ενσωμάτωση δεδομένων
        supp = api_supp.get(hr, {'mcp': None, 'bess_disch': 0.0, 'bess_chg': 0.0, 'pump': 0.0})

        # 4. Χτίσιμο του JSON αντικειμένου, εξασφαλίζοντας ότι ΟΛΑ είναι Python floats/ints
        xray_records.append({
            "date": date_str,
            "target_hour": int(hr),
            "mcp": None if supp['mcp'] is None else float(round(supp['mcp'], 2)),
            "big_hydro": float(round(scada_bh, 1)),
            "small_hydro": float(round(scada_sh + scada_myis + resmv_sh, 1)),
            "solar": float(round(scada_solar + resmv_solar, 1)),
            "biomass": float(round(scada_biomass + resmv_biomass, 1)),
            "cogen": float(round(scada_cogen + resmv_cogen, 1)),
            "wind": float(round(scada_wind, 1)),
            "other_res": float(round(scada_other_res, 1)),
            "bess_disch": float(round(supp['bess_disch'], 1)),
            "bess_chg": float(round(supp['bess_chg'], 1)),
            "pump": float(round(supp['pump'], 1)),
            "crete_ac": crete_ac,
            "crete_dc": crete_dc,
            "crete_flow": crete_flow,
            "scada_net_load": scada_net_load
        })
        
    return xray_records

if __name__ == "__main__":
    target_dates = get_target_dates()
    print(f"Θα ελεγχθούν δεδομένα X-Ray για τις ημέρες: {target_dates}")
    
    pause = float(os.environ.get('PAUSE_SECONDS', '0') or 0)
    all_xray_data = []
    for i, d_str in enumerate(target_dates):
        if i and pause:
            time.sleep(pause)
        daily_xray = build_xray_for_date(d_str)
        all_xray_data.extend(daily_xray)
        
    if all_xray_data:
        # --- Νέα δομή (schema v1): ένα αρχείο ανά ημέρα ---
        contract.write_xray_days(all_xray_data)
        # Φάση 3b: το παλιό συγκεντρωτικό αρχείο δεν χρησιμοποιείται πια.
        if os.path.exists('data/xray_data.json'):
            os.remove('data/xray_data.json')
            print("✓ Το παλιό data/xray_data.json αφαιρέθηκε (φάση 3b).")
