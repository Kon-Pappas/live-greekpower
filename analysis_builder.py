"""Ανάλυση ημέρας (φάση 4, D46) → data/analysis/YYYY-MM-DD.json και data/analysis/calibration.json.

Τα αρχεία του φακέλου data/analysis/ τα γράφει ΜΟΝΟ αυτό το script (τρέχει στο X-Ray workflow
μετά το X-Ray και την ENTSO-E). Διαβάζει, χωρίς να τα αλλάζει, τα live, X-Ray, ENTSO-E και records.

Για κάθε ημέρα D:
  1. Βαθμονόμηση στις 90 ημέρες έως και τη D (ανθεκτική παλινδρόμηση Huber):
         UCE ≈ βάση + k_wind × μετρημένα αιολικά + k_solar × μετρημένα φ/β
     με διαστήματα 90% (bootstrap ανά ημέρα).
  2. Ανάλυση του UCE της D, ώρα προς ώρα: αθέατα φ/β, αιολικά διανομής, βάση, σφάλμα εκτίμησης.
  3. Τα «επίπεδα» της ημέρας (K19): φορτίο μεταφοράς χωρίς Κρήτη, ροή προς Κρήτη,
     μέση τάση, χαμηλή τάση· τρία σύνολα ΑΠΕ του ΑΔΜΗΕ και της ENTSO-E.
  4. Ημερήσιο συμπέρασμα σε GR/EN: σταθερές προτάσεις με αριθμούς, χωρίς επίθετα.

Χωρίς ημερομηνίες (cron 10:15): προχθές και χθες. START_DATE / END_DATE: διάστημα (backfill).
"""
import os
import random
from datetime import datetime, timedelta

import pytz

import contract
from jsonio import load_json_lenient, write_json_atomic

ATHENS = pytz.timezone('Europe/Athens')
ANALYSIS_DIR = os.path.join(contract.DATA_DIR, 'analysis')
CALIB_PATH = os.path.join(ANALYSIS_DIR, 'calibration.json')
WINDOW_DAYS = 90
BOOTSTRAP = 40
MIN_HOURS = 24 * 14          # τουλάχιστον δύο εβδομάδες ωρών για βαθμονόμηση


# ---------------------------------------------------------------------
# Ανθεκτική παλινδρόμηση (σκέτη Python)
# ---------------------------------------------------------------------

def _solve3(A, b):
    A = [row[:] + [v] for row, v in zip(A, b)]
    n = 3
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(A[r][i]))
        A[i], A[p] = A[p], A[i]
        if abs(A[i][i]) < 1e-12:
            return None
        for r in range(n):
            if r != i:
                f = A[r][i] / A[i][i]
                for c in range(i, n + 1):
                    A[r][c] -= f * A[i][c]
    return [A[i][n] / A[i][i] for i in range(n)]


def _wls(X, y, w):
    A = [[0.0] * 3 for _ in range(3)]
    b = [0.0] * 3
    for xi, yi, wi in zip(X, y, w):
        for r in range(3):
            b[r] += wi * xi[r] * yi
            for c in range(3):
                A[r][c] += wi * xi[r] * xi[c]
    return _solve3(A, b)


def huber_fit(X, y, iters=15):
    w = [1.0] * len(y)
    beta = _wls(X, y, w)
    if beta is None:
        return None
    for _ in range(iters):
        res = [yi - sum(bj * xj for bj, xj in zip(beta, xi)) for xi, yi in zip(X, y)]
        med = sorted(res)[len(res) // 2]
        mad = sorted(abs(r - med) for r in res)[len(res) // 2] or 1.0
        k = 1.345 * 1.4826 * mad
        w = [1.0 if abs(r) <= k else k / abs(r) for r in res]
        nb = _wls(X, y, w)
        if nb is None:
            break
        beta = nb
    return beta


def _pct(vals, q):
    s = sorted(vals)
    return s[min(len(s) - 1, max(0, int(round(q * (len(s) - 1)))))]


_ROWS = {}   # μνήμη: κάθε αρχείο X-Ray διαβάζεται μία φορά ανά εκτέλεση


def _day_rows(d):
    if d not in _ROWS:
        x = load_json_lenient(os.path.join(contract.XRAY_DIR, d + '.json'), None)
        _ROWS[d] = [([1.0, h.get('wind') or 0.0, h.get('solar') or 0.0], h['uce'])
                    for h in (x or {}).get('hours', []) if h.get('uce') is not None]
    return _ROWS[d]


def calibrate(end_iso):
    """Βαθμονόμηση στις WINDOW_DAYS ημέρες έως και την end_iso."""
    end = datetime.strptime(end_iso, '%Y-%m-%d')
    days = [(end - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(WINDOW_DAYS)]
    by_day = {}
    for d in days:
        rows = _day_rows(d)
        if rows:
            by_day[d] = rows
    allrows = [r for v in by_day.values() for r in v]
    if len(allrows) < MIN_HOURS:
        return None
    beta = huber_fit([r[0] for r in allrows], [r[1] for r in allrows])
    if beta is None:
        return None
    rng = random.Random(end_iso)            # αναπαραγώγιμο: ίδια ημέρα, ίδιο αποτέλεσμα
    keys = list(by_day)
    boots = []
    for _ in range(BOOTSTRAP):
        pick = [r for k in (rng.choice(keys) for _ in keys) for r in by_day[k]]
        bb = huber_fit([r[0] for r in pick], [r[1] for r in pick], iters=6)
        if bb:
            boots.append(bb)
    ci = lambda j: [round(_pct([b[j] for b in boots], 0.05), 4), round(_pct([b[j] for b in boots], 0.95), 4)] if boots else None
    return {
        'window_days': WINDOW_DAYS, 'from': keys[-1], 'to': keys[0], 'hours': len(allrows),
        'base': round(beta[0], 1), 'k_wind': round(beta[1], 4), 'k_solar': round(beta[2], 4),
        'ci90': {'base': ci(0), 'k_wind': ci(1), 'k_solar': ci(2)},
    }


# ---------------------------------------------------------------------
# Ημέρα: ανάλυση UCE, επίπεδα, συμπέρασμα
# ---------------------------------------------------------------------

def _gwh(v, nd=1):
    return None if v is None else round(v / 1000, nd)


def _num(v, nd, lang):
    s = f"{v:,.{nd}f}"
    return s.replace(',', 'X').replace('.', ',').replace('X', '.') if lang == 'el' else s


REC_NAMES = {
    'el': {'solar': 'φωτοβολταϊκά', 'wind': 'αιολικά', 'exports': 'εξαγωγές', 'bess_chg': 'φόρτιση BESS',
           'bess_dis': 'εκφόρτιση BESS', 'bess_chg_pump': 'φόρτιση BESS + άντληση', 'network_load': 'φορτίο δικτύου', 'res': 'ΑΠΕ'},
    'en': {'solar': 'solar', 'wind': 'wind', 'exports': 'exports', 'bess_chg': 'BESS charge',
           'bess_dis': 'BESS discharge', 'bess_chg_pump': 'BESS charge + pumping', 'network_load': 'network load', 'res': 'RES'},
}


def _records_of(day_iso):
    R = load_json_lenient(contract.RECORDS_PATH, {})
    out = []
    for scope in ['hourly', 'daily']:
        for cat, items in (R.get(scope) or {}).items():
            for i, e in enumerate(items or []):
                if e['id'][:10] == day_iso:
                    out.append({'scope': scope, 'cat': cat, 'rank': i + 1, 'value': e['value'], 'id': e['id']})
                    break
    return sorted(out, key=lambda r: (r['rank'], r['scope']))


def _fmt_date(iso, lang):
    y, m, d = map(int, iso.split('-'))
    if lang == 'el':
        months = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου',
                  'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου']
        return f"{d} {months[m - 1]} {y}"
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
              'September', 'October', 'November', 'December']
    return f"{d} {months[m - 1]} {y}"


def conclusion(day_iso, L, X, E, dec, layers, recs):
    """Σταθερές προτάσεις με αριθμούς (GR / EN). Καμία ερμηνεία πέρα από τα δεδομένα."""
    out = {}
    g = L['totals']['gen']
    share = 100 * (g['res'] + g['hydro']) / g['total'] if g['total'] else None
    netexp = L['totals']['exports'] - L['totals']['imports']
    for lang in ['el', 'en']:
        n = lambda v, nd=1: _num(v, nd, lang)
        date = _fmt_date(day_iso, lang)
        P = []
        if lang == 'el':
            P.append(f"Στις {date} η ζήτηση ήταν {n(L['totals']['demand'] / 1000)} GWh και οι ΑΠΕ με τα υδροηλεκτρικά "
                     f"κάλυψαν το {n(share)}% της εγχώριας παραγωγής (live ΑΔΜΗΕ, ΑΠΕ με ΣΗΘΥΑ). "
                     + (f"Οι καθαρές εξαγωγές ήταν {n(netexp / 1000)} GWh" if netexp >= 0 else f"Οι καθαρές εισαγωγές ήταν {n(-netexp / 1000)} GWh")
                     + f" και η μέση τιμή επόμενης ημέρας {n(L['totals']['dam_price_avg'], 2)} €/MWh.")
            if dec:
                t = dec['totals']
                P.append(f"Από την παραγωγή της διανομής, {n(t['uce'] / 1000)} GWh δεν μετρήθηκαν ωριαία. Εκτιμώνται "
                         f"{n(t['pv'] / 1000)} GWh φ/β στέγης και χαμηλής τάσης, {n(t['wind'] / 1000)} GWh αιολικά της διανομής "
                         f"και {n(t['base'] / 1000)} GWh μικρές μονάδες· το υπόλοιπο ({'+' if t['residual'] >= 0 else '−'}"
                         f"{n(abs(t['residual']) / 1000)} GWh) είναι απόκλιση της εκτίμησης του ΑΔΜΗΕ από το μοντέλο.")
            if layers and layers['load'].get('crete') is not None:
                P.append(f"Προς την Κρήτη στάλθηκαν {n(layers['load']['crete'] / 1000)} GWh μέσα από τα δύο καλώδια.")
            if layers and layers['res'].get('entsoe') is not None:
                st = {'provisional': 'προσωρινή', 'final': 'τελική'}.get(layers['res']['entsoe_status'], 'πιο πρόσφατη')
                P.append(f"Στην ENTSO-E ({st} έκδοση) φ/β, αιολικά και βιομάζα της ημέρας είναι {n(layers['res']['entsoe'] / 1000)} GWh, "
                         f"έναντι {n(layers['res']['live_sw'] / 1000)} GWh στα live στοιχεία του ΑΔΜΗΕ.")
            if recs:
                lst = ', '.join(f"{REC_NAMES['el'][r['cat']]} ({'ωριαίο' if r['scope'] == 'hourly' else 'ημερήσιο'}, #{r['rank']})" for r in recs)
                P.append(f"Ρεκόρ της ημέρας στις πέντε κορυφαίες θέσεις: {lst}.")
        else:
            P.append(f"On {date} demand was {n(L['totals']['demand'] / 1000)} GWh and renewables with hydro covered "
                     f"{n(share)}% of domestic generation (ADMIE live, RES incl. CHP). "
                     + (f"Net exports were {n(netexp / 1000)} GWh" if netexp >= 0 else f"Net imports were {n(-netexp / 1000)} GWh")
                     + f" and the average day-ahead price {n(L['totals']['dam_price_avg'], 2)} €/MWh.")
            if dec:
                t = dec['totals']
                P.append(f"Of distribution-level generation, {n(t['uce'] / 1000)} GWh was not metered hourly. An estimated "
                         f"{n(t['pv'] / 1000)} GWh came from rooftop and other low-voltage solar, {n(t['wind'] / 1000)} GWh from "
                         f"distribution-connected wind and {n(t['base'] / 1000)} GWh from small units; the remainder "
                         f"({'+' if t['residual'] >= 0 else '−'}{n(abs(t['residual']) / 1000)} GWh) is the difference between ADMIE's estimate and the model.")
            if layers and layers['load'].get('crete') is not None:
                P.append(f"{n(layers['load']['crete'] / 1000)} GWh was sent to Crete through the two cables.")
            if layers and layers['res'].get('entsoe') is not None:
                st = layers['res']['entsoe_status'] if layers['res']['entsoe_status'] in ('provisional', 'final') else 'latest'
                P.append(f"In ENTSO-E's {st} data, the day's solar, wind and biomass add up to {n(layers['res']['entsoe'] / 1000)} GWh, "
                         f"against {n(layers['res']['live_sw'] / 1000)} GWh in ADMIE's live figures.")
            if recs:
                lst = ', '.join(f"{REC_NAMES['en'][r['cat']]} ({r['scope']}, #{r['rank']})" for r in recs)
                P.append(f"Records of the day in the top five: {lst}.")
        out[lang] = P
    return out


def analyse_day(day_iso, calib):
    L = load_json_lenient(os.path.join(contract.LIVE_DIR, day_iso + '.json'), None)
    X = load_json_lenient(os.path.join(contract.XRAY_DIR, day_iso + '.json'), None)
    E = load_json_lenient(os.path.join(contract.ENTSOE_DIR, day_iso + '.json'), None)
    if not L or not X or not L.get('totals', {}).get('gen'):
        return None
    lh = {h['hr']: h for h in L['hours'] if h.get('has_data')}

    # 2. Ανάλυση του UCE
    dec = None
    if calib:
        hours = []
        for h in X['hours']:
            if h.get('uce') is None:
                continue
            pv = calib['k_solar'] * (h.get('solar') or 0)
            wd = calib['k_wind'] * (h.get('wind') or 0)
            bs = calib['base']
            hours.append({'hr': h['hr'], 'uce': h['uce'], 'pv': round(pv, 1), 'wind': round(wd, 1),
                          'base': round(bs, 1), 'residual': round(h['uce'] - pv - wd - bs, 1)})
        if hours:
            tot = {k: round(sum(x[k] for x in hours), 1) for k in ['uce', 'pv', 'wind', 'base', 'residual']}
            dec = {'hours': hours, 'totals': tot}

    # 3. Επίπεδα (K19): ζήτηση = NET LOAD + μέση τάση + UCE· NET LOAD = χωρίς Κρήτη + Κρήτη
    layers = None
    xt, lt = X['totals'], L['totals']
    if xt.get('uce') is not None:
        uce = xt['uce']
        crete = -lt['crete_flow'] if lt.get('crete_flow') is not None else (-xt['crete_flow'] if xt.get('crete_flow') is not None else None)
        net = xt.get('scada_net_load')
        mv = (lt['demand'] - net - uce) if net is not None else None
        res_live = lt['gen']['res']
        e = (E or {}).get('totals') or {}
        sw = sum((e.get(k) or 0) for k in ['solar', 'wind', 'biomass']) if e else None
        layers = {
            'load': {'demand': lt['demand'], 'net_load': net, 'crete': crete,
                     'transmission_no_crete': (net - crete) if (net is not None and crete is not None) else None,
                     'mv': mv, 'lv': uce, 'entsoe': e.get('load')},
            'res': {'transmission': (res_live - mv - uce) if mv is not None else None,
                    'metered': res_live - uce, 'live': res_live,
                    'live_sw': (xt.get('solar') or 0) + (xt.get('wind') or 0) + (xt.get('biomass') or 0) + uce,
                    'entsoe': sw if e else None, 'entsoe_status': (E or {}).get('status')},
        }

    recs = _records_of(day_iso)
    return {
        'schema': contract.SCHEMA, 'date': day_iso, 'updated': contract.now_athens_iso(),
        'calibration': calib, 'uce_decomposition': dec, 'layers': layers, 'records': recs,
        'conclusion': conclusion(day_iso, L, X, E, dec, layers, recs),
    }


def _target_days():
    s = os.environ.get('START_DATE', '').strip().replace('-', '')
    e = os.environ.get('END_DATE', '').strip().replace('-', '')
    now = datetime.now(ATHENS)
    if s and e:
        a, b = datetime.strptime(s, '%Y%m%d'), datetime.strptime(e, '%Y%m%d')
        out = []
        while a <= b:
            out.append(a.strftime('%Y-%m-%d')); a += timedelta(days=1)
        return out
    return [(now - timedelta(days=2)).strftime('%Y-%m-%d'), (now - timedelta(days=1)).strftime('%Y-%m-%d')]


if __name__ == '__main__':
    days = _target_days()
    print(f"Ανάλυση για τις ημέρες: {days[0]} → {days[-1]} ({len(days)})")
    written = 0
    for d in days:
        if not os.path.exists(os.path.join(contract.XRAY_DIR, d + '.json')):
            continue
        c = calibrate(d)
        doc = analyse_day(d, c)
        if not doc:
            continue
        write_json_atomic(os.path.join(ANALYSIS_DIR, d + '.json'), doc)
        written += 1
    # Η χρονοσειρά των συντελεστών ξαναχτίζεται από ΟΛΑ τα αρχεία ημέρας (ανθεκτικό σε διακοπή).
    cal = {'schema': contract.SCHEMA, 'days': {}}
    for d in contract.list_days(ANALYSIS_DIR):
        c = (load_json_lenient(os.path.join(ANALYSIS_DIR, d + '.json'), {}) or {}).get('calibration')
        if c:
            cal['days'][d] = {k: c[k] for k in ['base', 'k_wind', 'k_solar', 'hours']} | {'ci90': c['ci90']}
    cal['updated'] = contract.now_athens_iso()
    write_json_atomic(CALIB_PATH, cal)
    print(f"✓ Ανάλυση: {written} ημέρες · βαθμονόμηση: {len(cal['days'])} ημέρες στο ιστορικό.")
