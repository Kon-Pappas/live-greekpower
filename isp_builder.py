"""Πλεόνασμα ενέργειας του προγραμματισμού ISP2 του ΑΔΜΗΕ (D59) → data/isp/YYYY-MM-DD.json.

Τα αρχεία του φακέλου data/isp/ τα γράφει ΜΟΝΟ αυτό το script (πρωινό X-Ray workflow, ή isp_refresh.yml).
Ανάγνωση όπως στο BESS dashboard (update_data.py, parse_isp): η γραμμή «Energy Surplus» του αρχείου
ISP2ISPResults, τέταρτα (MW) έως τη στήλη TOTAL· ωριαία ενέργεια = μέσος όρος των 4 τετάρτων (MWh).
Οι ώρες του ISP είναι ώρα αγοράς (CET/CEST), μία ώρα πίσω από την ώρα Ελλάδας: η ώρα αγοράς h
(λήξη) είναι η ώρα Ελλάδας h+1 (επιβεβαιωμένο με τις επίσημες εντολές περιορισμού, Ιούν–Σεπ 2026).
Χωρίς ημερομηνίες: σήμερα και χθες. START_DATE / END_DATE: διάστημα (ιστορικό).
"""
import io
import os
import time
from datetime import datetime, timedelta

import pandas as pd
import pytz
import requests

import contract
from jsonio import write_json_atomic, load_json_lenient
from xray_builder import fetch_excel_url

ATHENS = pytz.timezone('Europe/Athens')
ISP_DIR = os.path.join(contract.DATA_DIR, 'isp')


def _num(x):
    try:
        v = float(str(x).replace(',', '.'))
        return None if v != v else v
    except (TypeError, ValueError):
        return None


def parse_surplus(df):
    """{ώρα αγοράς h (1…N): MWh ≥ 0} από τη γραμμή «Energy Surplus», ή None."""
    total_col = None
    for idx in range(len(df)):
        cells = [str(c).strip().upper() for c in df.iloc[idx].tolist()]
        if 'TOTAL' in cells:
            total_col = cells.index('TOTAL')
            break
    for _, row in df.iterrows():
        cells = row.tolist()
        name_idx = next((c for c in range(min(len(cells), 4)) if 'ENERGY SURPLUS' in str(cells[c]).upper()), None)
        if name_idx is None or total_col is None or total_col <= name_idx:
            continue
        q = [_num(x) for x in cells[name_idx + 1: total_col]]
        if not any(v is not None for v in q):
            continue                                  # γραμμή τίτλου χωρίς δεδομένα
        q = [v or 0.0 for v in q]
        return {h + 1: round(abs(sum(q[h * 4: h * 4 + 4])) / 4, 2) for h in range(len(q) // 4)}
    return None


def build_day(date8):
    url = fetch_excel_url(date8, 'ISP2ISPResults')
    if not url:
        print(f"[{date8}] ISP2: δεν βρέθηκε αρχείο.")
        return None
    r = requests.get(url, verify=False, timeout=60)
    if r.status_code != 200:
        print(f"[{date8}] ISP2: HTTP {r.status_code}")
        return None
    xls = pd.ExcelFile(io.BytesIO(r.content))
    for sheet in xls.sheet_names:
        surplus = parse_surplus(pd.read_excel(xls, sheet_name=sheet, header=None))
        if surplus:
            break
    else:
        print(f"[{date8}] ISP2: δεν βρέθηκε γραμμή «Energy Surplus».")
        return None
    # ώρα αγοράς h → ώρα Ελλάδας h+1· η τελευταία ώρα αγοράς ανήκει στην επόμενη ημέρα Ελλάδας
    local = {str(h + 1): v for h, v in surplus.items() if h + 1 <= len(surplus)}
    return {'schema': contract.SCHEMA, 'date': contract.iso_date(date8), 'updated': contract.now_athens_iso(),
            'source': os.path.basename(url), 'version': 'ISP2', 'surplus_mwh': local}


def _days():
    s = os.environ.get('START_DATE', '').strip().replace('-', '')
    e = os.environ.get('END_DATE', '').strip().replace('-', '')
    if s and e:
        a, b = datetime.strptime(s, '%Y%m%d'), datetime.strptime(e, '%Y%m%d')
        out = []
        while a <= b:
            out.append(a.strftime('%Y%m%d')); a += timedelta(days=1)
        return out
    now = datetime.now(ATHENS)
    return [(now - timedelta(days=1)).strftime('%Y%m%d'), now.strftime('%Y%m%d')]


if __name__ == '__main__':
    days = _days(); pause = float(os.environ.get('PAUSE_SECONDS', '0') or 0); n = 0
    print(f"ISP2 για τις ημέρες: {days[0]} → {days[-1]} ({len(days)})")
    for i, d8 in enumerate(days):
        if i and pause:
            time.sleep(pause)
        try:
            doc = build_day(d8)
        except Exception as ex:
            print(f"[{d8}] ISP2: {type(ex).__name__}: {str(ex)[:120]}")
            doc = None
        if doc:
            write_json_atomic(os.path.join(ISP_DIR, contract.iso_date(d8) + '.json'), doc); n += 1
    print(f"✓ ISP2: {n} ημέρες.")
