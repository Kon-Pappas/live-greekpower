"""Νέα δομή δεδομένων (schema v1) — ένα αρχείο ανά ημέρα και ανά πηγή.

    data/manifest.json          ← γράφει ΜΟΝΟ το scraper
    data/records.json           ← γράφει ΜΟΝΟ το scraper (ίδια μορφή με πριν)
    data/live/YYYY-MM-DD.json   ← γράφει ΜΟΝΟ το scraper
    data/xray/YYYY-MM-DD.json   ← γράφει ΜΟΝΟ το xray_builder
    data/entsoe/YYYY-MM-DD.json ← γράφει ΜΟΝΟ το entsoe_builder

Κάθε αρχείο έχει έναν μόνο «συγγραφέα», ώστε τα δύο workflows να μην
αγγίζουν ποτέ το ίδιο αρχείο και το git rebase να περνά πάντα καθαρά (D04).

Συμβάσεις:
- hr = 1..24 όπως στον ΑΔΜΗΕ: hr 1 = 00:00–01:00 ώρα Ελλάδας
  (23 ή 25 ώρες τις ημέρες αλλαγής ώρας).
- null ≠ 0: null σημαίνει «δεν υπάρχει τιμή», 0 σημαίνει «μετρήθηκε μηδέν».
- Όλες οι ενέργειες σε MWh ανά ώρα, οι τιμές σε €/MWh.
"""
import os
from collections import defaultdict
from datetime import datetime, timedelta

import pytz

from jsonio import load_json_strict, load_json_lenient, write_json_atomic

SCHEMA = 1
ATHENS = pytz.timezone('Europe/Athens')
DATA_DIR = 'data'
LIVE_DIR = os.path.join(DATA_DIR, 'live')
XRAY_DIR = os.path.join(DATA_DIR, 'xray')
ENTSOE_DIR = os.path.join(DATA_DIR, 'entsoe')
RECORDS_PATH = os.path.join(DATA_DIR, 'records.json')
MANIFEST_PATH = os.path.join(DATA_DIR, 'manifest.json')

# Ονόματα διασυνδέσεων του ΑΔΜΗΕ → κωδικοί ISO
COUNTRY_MAP = {'ΑΛΒΑΝΙΑ': 'AL', 'ΒΟΥΛΓΑΡΙΑ': 'BG', 'ΙΤΑΛΙΑ': 'IT', 'ΤΟΥΡΚΙΑ': 'TR', 'FYROM': 'MK'}


# ---------------------------------------------------------------------
# Βοηθητικά
# ---------------------------------------------------------------------

def iso_date(date8):
    """'20261018' → '2026-10-18'"""
    return f"{date8[:4]}-{date8[4:6]}-{date8[6:8]}"


def now_athens_iso():
    return datetime.now(ATHENS).replace(microsecond=0).isoformat()


def r1(v):
    """Στρογγυλοποίηση σε 1 δεκαδικό, κρατώντας το None."""
    return None if v is None else round(float(v), 1)


def _sum(values):
    """Άθροισμα που αγνοεί τα None· None αν δεν υπάρχει καμία τιμή."""
    vals = [v for v in values if v is not None]
    return round(sum(vals), 1) if vals else None


def _valid_hr(hr):
    try:
        hr = int(hr)
    except (TypeError, ValueError):
        return None
    return hr if 1 <= hr <= 25 else None


def day_path(folder, date8):
    return os.path.join(folder, iso_date(date8) + '.json')


def list_days(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(f[:-5] for f in os.listdir(folder) if f.endswith('.json') and len(f) == 15)


# ---------------------------------------------------------------------
# LIVE (ΑΔΜΗΕ portal)
# ---------------------------------------------------------------------

def normalize_live_hour(rec):
    """Μια ωριαία εγγραφή του live_data.json → μορφή v1."""
    m = rec.get('production_mix') or {}
    inter = rec.get('interconnections_mwh') or {}

    total = m.get('TOTAL_PROD')
    demand = rec.get('demand_mwh')
    has_data = (total or 0) > 0 or (demand or 0) > 0

    out = {
        'hr': _valid_hr(rec.get('target_hour')),
        'has_data': has_data,
        'dam_price': r1(rec.get('dam_price_eur')),
        'fetched': rec.get('fetch_timestamp'),
    }
    if not has_data:
        # Ώρα που δεν έχει γίνει ακόμα (ή χωρίς δημοσίευση): μόνο η τιμή DAM.
        out.update({'gen': None, 'imports': None, 'exports': None, 'flows': None,
                    'flows_match': None, 'storage': None, 'pumping': None,
                    'demand': None, 'balance_ok': None})
        return out

    gen = {
        'lignite': r1(m.get('TOTAL LIGNITE') or 0),
        'gas': r1(m.get('TOTAL GAS') or 0),
        'hydro': r1(m.get('TOTAL HYDRO') or 0),
        'res': r1(m.get('RES_PROD') or 0),
        'total': r1(total or 0),
    }

    flows = {}
    for gr_name, code in COUNTRY_MAP.items():
        imp = inter.get(f'{gr_name}_IMP')
        exp = inter.get(f'{gr_name}_EXP')
        flows[code] = {'imp': r1(imp), 'exp': r1(abs(exp)) if exp is not None else None}

    # Επίσημα σύνολα του ΑΔΜΗΕ. Με αυτά ο ισολογισμός κλείνει σε 735/735 ώρες
    # (έλεγχος 18/10/2026)· το άθροισμα ανά χώρα αποκλίνει σε 2.
    imports = r1(m.get('TOTAL IMPORTS') or 0)
    exports = r1(abs(m.get('TOTAL EXPORTS') or 0))
    flows_imp = sum((f['imp'] or 0) for f in flows.values())
    flows_exp = sum((f['exp'] or 0) for f in flows.values())
    flows_match = abs(flows_imp - imports) <= 1 and abs(flows_exp - exports) <= 1

    storage = {'dis': r1(m.get('STORAGE_INJECTION') or 0),
               'chg': r1(abs(m.get('STORAGE_ABSORPTION') or 0))}
    pumping = r1(m.get('ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ') or 0)

    # Ζήτηση = ισολογισμός (παραγωγή + εισαγωγές − εξαγωγές + εκφόρτιση − φόρτιση − άντληση).
    # Αν ο ΑΔΜΗΕ δίνει TOTAL_LOAD, ελέγχουμε ότι συμφωνεί.
    balance = gen['total'] + imports - exports + storage['dis'] - storage['chg'] - pumping
    out.update({
        'gen': gen,
        'imports': imports,
        'exports': exports,
        'flows': flows,
        'flows_match': flows_match,
        'storage': storage,
        'pumping': pumping,
        'demand': r1(demand) if demand else r1(balance),
        'balance_ok': (abs(demand - balance) <= 1) if demand else None,
    })
    return out


def live_day_totals(hours):
    data = [h for h in hours if h['has_data']]
    prices = [h['dam_price'] for h in hours if h['dam_price'] is not None]
    if not data:
        return {'hours_with_data': 0,
                'dam_price_avg': round(sum(prices) / len(prices), 2) if prices else None}
    return {
        'hours_with_data': len(data),
        'gen': {k: _sum(h['gen'][k] for h in data) for k in ['lignite', 'gas', 'hydro', 'res', 'total']},
        'imports': _sum(h['imports'] for h in data),
        'exports': _sum(h['exports'] for h in data),
        'storage': {k: _sum(h['storage'][k] for h in data) for k in ['dis', 'chg']},
        'pumping': _sum(h['pumping'] for h in data),
        'demand': _sum(h['demand'] for h in data),
        'dam_price_avg': round(sum(prices) / len(prices), 2) if prices else None,
        'hours_flows_mismatch': sum(1 for h in data if h['flows_match'] is False),
        'hours_balance_off': sum(1 for h in data if h['balance_ok'] is False),
    }


def write_live_days(raw_records, dates8):
    """Γράφει data/live/<ημέρα>.json για κάθε ημέρα του dates8,
    από τις (ήδη συγχωνευμένες) εγγραφές του live_data.json."""
    by_date = defaultdict(dict)
    for rec in raw_records:
        hr = _valid_hr(rec.get('target_hour'))
        if rec.get('date') in dates8 and hr:
            # Το παλιό live_data.json έχει διπλές εγγραφές για λίγες ώρες (K17):
            # κρατάμε την πιο πρόσφατη λήψη, όπως και η σημερινή σελίδα.
            prev = by_date[rec['date']].get(hr)
            if prev is None or (rec.get('fetch_timestamp') or '') >= (prev.get('fetch_timestamp') or ''):
                by_date[rec['date']][hr] = rec
    for date8 in sorted(dates8):
        if date8 not in by_date:
            continue
        hours = [normalize_live_hour(by_date[date8][hr]) for hr in sorted(by_date[date8])]
        write_json_atomic(day_path(LIVE_DIR, date8), {
            'schema': SCHEMA,
            'date': iso_date(date8),
            'source': 'ADMIE/IPTO market portal: prodmixandload, dayaheadmarket, scadainterflows',
            'updated': now_athens_iso(),
            'totals': live_day_totals(hours),
            'hours': hours,
        })
    print(f"✓ Live day files: {len([d for d in dates8 if d in by_date])} ημέρες.")


# ---------------------------------------------------------------------
# X-RAY (αρχεία ΑΔΜΗΕ, D-1/D-2) + UCE
# ---------------------------------------------------------------------

XRAY_FIELDS = ['big_hydro', 'small_hydro', 'solar', 'wind', 'biomass', 'cogen', 'other_res']


def normalize_xray_hour(rec, live_hour):
    out = {'hr': _valid_hr(rec.get('target_hour'))}
    for k in XRAY_FIELDS:
        out[k] = r1(rec.get(k))
    out['bess_dis'] = r1(rec.get('bess_disch'))
    out['bess_chg'] = r1(rec.get('bess_chg'))
    out['pumping'] = r1(rec.get('pump'))
    out['mcp'] = r1(rec.get('mcp'))

    # Ίδιος ορισμός με τη σημερινή σελίδα: το other_res ΔΕΝ μπαίνει στο άθροισμα.
    out['phys_clean'] = r1(sum((rec.get(k) or 0) for k in
                               ['big_hydro', 'small_hydro', 'solar', 'wind', 'biomass', 'cogen']))
    if live_hour and live_hour.get('has_data'):
        out['live_clean'] = r1(live_hour['gen']['res'] + live_hour['gen']['hydro'])
        # UCE ΜΕ ΠΡΟΣΗΜΟ (K03): αρνητικό = η φυσική καθαρή ενέργεια ξεπερνά τη live.
        out['uce'] = r1(out['live_clean'] - out['phys_clean'])
    else:
        out['live_clean'] = None
        out['uce'] = None
    return out


def write_xray_days(raw_records):
    by_date = defaultdict(dict)
    for rec in raw_records:
        hr = _valid_hr(rec.get('target_hour'))
        if rec.get('date') and hr:
            by_date[rec['date']][hr] = rec
    for date8, hrs in sorted(by_date.items()):
        # Τα live δεδομένα της ίδιας μέρας τα ΔΙΑΒΑΖΟΥΜΕ μόνο (τα γράφει το scraper).
        live = load_json_lenient(day_path(LIVE_DIR, date8), {})
        live_by_hr = {h['hr']: h for h in live.get('hours', [])}
        hours = [normalize_xray_hour(hrs[hr], live_by_hr.get(hr)) for hr in sorted(hrs)]
        uce_vals = [h['uce'] for h in hours if h['uce'] is not None]
        write_json_atomic(day_path(XRAY_DIR, date8), {
            'schema': SCHEMA,
            'date': iso_date(date8),
            'source': 'ADMIE/IPTO operation-market files (ex-post) + RESMV',
            'updated': now_athens_iso(),
            'totals': {
                **{k: _sum(h[k] for h in hours) for k in XRAY_FIELDS + ['bess_dis', 'bess_chg', 'pumping', 'phys_clean', 'live_clean']},
                'uce': _sum(uce_vals),
                'uce_positive': _sum(v for v in uce_vals if v > 0),
                'uce_negative': _sum(v for v in uce_vals if v < 0),
            },
            'hours': hours,
        })
    print(f"✓ X-Ray day files: {len(by_date)} ημέρες.")


# ---------------------------------------------------------------------
# ENTSO-E (A75, D-1/D-2)
# ---------------------------------------------------------------------

ENTSOE_FIELDS = ['solar', 'wind', 'hydro_ror', 'hydro_res', 'hydro', 'biomass', 'gas', 'lignite']


def write_entsoe_days(raw_records):
    by_date = defaultdict(dict)
    for rec in raw_records:
        hr = _valid_hr(rec.get('target_hour'))
        if rec.get('date') and hr:
            by_date[rec['date']][hr] = rec
    for date8, hrs in sorted(by_date.items()):
        hours = [{'hr': hr, **{k: r1(hrs[hr].get('entsoe_' + k)) for k in ENTSOE_FIELDS}}
                 for hr in sorted(hrs)]
        write_json_atomic(day_path(ENTSOE_DIR, date8), {
            'schema': SCHEMA,
            'date': iso_date(date8),
            'source': 'ENTSO-E Transparency Platform, A75 actual generation per type (GR)',
            'updated': now_athens_iso(),
            'totals': {k: _sum(h[k] for h in hours) for k in ENTSOE_FIELDS},
            'hours': hours,
        })
    print(f"✓ ENTSO-E day files: {len(by_date)} ημέρες.")


# ---------------------------------------------------------------------
# RECORDS — ξαναϋπολογισμός από ΟΛΟ το ιστορικό (K05)
# ---------------------------------------------------------------------

LIVE_CATS = {'hourly': ['bess_chg', 'bess_dis', 'exports', 'bess_chg_pump', 'network_load'],
             'daily': ['bess_chg_pump', 'bess_chg', 'bess_dis', 'exports', 'res']}
XRAY_CATS = {'hourly': ['solar', 'wind'], 'daily': ['solar', 'wind']}


def _top3(entries):
    return sorted(entries, key=lambda e: e['value'], reverse=True)[:3]


def build_records():
    """Ίδια μορφή records.json με πριν (η σημερινή σελίδα τη διαβάζει ως έχει).

    Κάθε run ξαναϋπολογίζει από όλα τα αρχεία ημέρας, οπότε μια διόρθωση του
    ΑΔΜΗΕ προς τα κάτω διορθώνει και το ρεκόρ. Εγγραφές με ημερομηνία ΠΡΙΝ
    από την πρώτη διαθέσιμη ημέρα κάθε πηγής δεν μπορούν να ξαναϋπολογιστούν,
    οπότε κρατιούνται από το υπάρχον records.json («legacy»)."""
    old = load_json_strict(RECORDS_PATH, {})
    cand = {'hourly': defaultdict(list), 'daily': defaultdict(list)}

    live_days = list_days(LIVE_DIR)
    for d in live_days:
        day = load_json_strict(os.path.join(LIVE_DIR, d + '.json'), {})
        tot = {'exp': 0, 'chg_pump': 0, 'dis': 0, 'chg': 0, 'res': 0}
        for h in day.get('hours', []):
            if not h.get('has_data') or not h.get('hr'):
                continue
            hr_id = f"{d}, {h['hr']:02d}:00"
            dis, chg, pump, exp = h['storage']['dis'], h['storage']['chg'], h['pumping'], h['exports']
            for cat, val in [('bess_chg', chg), ('bess_dis', dis), ('exports', exp),
                             ('bess_chg_pump', chg + pump),
                             ('network_load', h['gen']['total'] + h['imports'] + dis)]:
                cand['hourly'][cat].append({'id': hr_id, 'value': round(val, 1)})
            tot['exp'] += exp; tot['chg_pump'] += chg + pump; tot['dis'] += dis
            tot['chg'] += chg; tot['res'] += h['gen']['res']
        if day.get('hours'):
            for cat, key in [('bess_chg_pump', 'chg_pump'), ('bess_chg', 'chg'), ('bess_dis', 'dis'),
                             ('exports', 'exp'), ('res', 'res')]:
                cand['daily'][cat].append({'id': d, 'value': round(tot[key], 1)})

    xray_days = list_days(XRAY_DIR)
    for d in xray_days:
        day = load_json_strict(os.path.join(XRAY_DIR, d + '.json'), {})
        tot = {'solar': 0, 'wind': 0}
        for h in day.get('hours', []):
            if not h.get('hr'):
                continue
            hr_id = f"{d}, {h['hr']:02d}:00"
            for cat in ['solar', 'wind']:
                v = h.get(cat) or 0
                cand['hourly'][cat].append({'id': hr_id, 'value': round(v, 1)})
                tot[cat] += v
        if tot['solar'] + tot['wind'] > 0:
            for cat in ['solar', 'wind']:
                cand['daily'][cat].append({'id': d, 'value': round(tot[cat], 1)})

    records = {'daily': {}, 'hourly': {}}
    order = {'daily': ['solar', 'wind', 'exports', 'bess_chg', 'bess_dis', 'bess_chg_pump', 'res'],
             'hourly': ['solar', 'wind', 'exports', 'bess_chg', 'bess_dis', 'bess_chg_pump', 'network_load']}
    for scope in ['daily', 'hourly']:
        for cat in order[scope]:
            first = (xray_days if cat in XRAY_CATS[scope] else live_days)
            first = first[0] if first else '9999-99-99'
            legacy = [e for e in old.get(scope, {}).get(cat, []) if e['id'][:10] < first]
            records[scope][cat] = _top3(cand[scope][cat] + legacy)

    write_json_atomic(RECORDS_PATH, records)
    print("✓ records.json ξαναϋπολογίστηκε από όλο το ιστορικό.")
    return records


# ---------------------------------------------------------------------
# MANIFEST
# ---------------------------------------------------------------------

def write_manifest():
    live_days = list_days(LIVE_DIR)
    last = None
    for d in reversed(live_days):
        day = load_json_strict(os.path.join(LIVE_DIR, d + '.json'), {})
        with_data = [h for h in day.get('hours', []) if h.get('has_data')]
        if with_data:
            h = with_data[-1]
            last = {'date': d, 'hr': h['hr'], 'fetched': h.get('fetched')}
            break

    # Το cron-job.org τρέχει το scrape στο :05 κάθε ώρας.
    now = datetime.now(ATHENS).replace(second=0, microsecond=0)
    nxt = now.replace(minute=5)
    if nxt <= now:
        nxt += timedelta(hours=1)

    write_json_atomic(MANIFEST_PATH, {
        'schema': SCHEMA,
        'generated': now_athens_iso(),
        'last_live': last,
        'next_update': nxt.isoformat(),
        'live_days': live_days,
        'xray_days': list_days(XRAY_DIR),
        'entsoe_days': list_days(ENTSOE_DIR),
    })
    print("✓ manifest.json ενημερώθηκε.")
