"""ENTSO-E Transparency Platform, A44 (τιμές αγοράς επόμενης ημέρας) → data/price/YYYY-MM-DD.json.
Γράφει ΜΟΝΟ αυτό το script (D68).

Ένα αρχείο ανά ΗΜΕΡΑ ΑΓΟΡΑΣ, όπως τη δημοσιεύουν ΕΧΕ και ENTSO-E (και όπως στο BESS):
CET/CEST 00:00–24:00 = 01:00–01:00 ώρα Ελλάδας. Κρατά τα 15λεπτα (92/96/100) και τη μέση της ημέρας.

Κανόνες «κενό αντί για λάθος»:
  - curveType A03: όταν λείπει μια θέση μέσα σε Period, ισχύει η τιμή της προηγούμενης (forward-fill
    ΜΟΝΟ μέσα στην ίδια Period, όπως στο BESS). Με A01, θέση που λείπει μένει κενή.
  - Τιμή ΑΚΡΙΒΩΣ 0: το ENTSO-E βάζει μερικές φορές 0 εκεί που δεν έχει τιμή, αλλά την άνοιξη η ελληνική
    αγορά έχει και αληθινά μηδενικά το μεσημέρι (ο ΑΔΜΗΕ δίνει τότε κι αυτός 0). Κανόνας (D68): ένα 0
    γίνεται δεκτό ΜΟΝΟ όταν η ωριαία τιμή του ΑΔΜΗΕ για την ίδια ώρα ταιριάζει (±0,6 €) με τον μέσο όρο
    των τεσσάρων 15λέπτων ΜΑΖΙ με τα μηδενικά· αλλιώς, ή αν ο ΑΔΜΗΕ δεν δίνει τιμή, γίνεται κενό (null).
    Η τιμή του ΑΔΜΗΕ: από το live αρχείο της ημέρας (dam_price_admie) ή από το iptoanalytics
    (dayaheadmarket, όλη η ημέρα, μία αίτηση).
  - Μέση ημέρας μόνο όταν ΟΛΑ τα 15λεπτα είναι έγκυρα· αλλιώς null.

Χωρίς ημερομηνίες (ωριαίο scrape): σημερινή και αυριανή ημέρα αγοράς· ημέρα με πλήρες αρχείο δεν
ξανακατεβαίνει (οι τιμές DAM δεν αλλάζουν μετά τη δημοσίευση). Με START_DATE/END_DATE: ιστορικό,
σε κομμάτια έως 31 ημερών ανά αίτηση (το ENTSO-E είναι αργό: ~10–20 s ανά αίτηση).
"""
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import pytz
import requests

from jsonio import load_json_strict, write_json_atomic

API = "https://web-api.tp.entsoe.eu/api"
GR = '10YGR-HTSO-----Y'
MARKET_TZ = pytz.timezone('Europe/Brussels')
ATHENS = pytz.timezone('Europe/Athens')
PRICE_DIR = os.path.join('data', 'price')
SCHEMA = 1


def price_path(date8):
    return os.path.join(PRICE_DIR, f"{date8[:4]}-{date8[4:6]}-{date8[6:]}.json")


def market_window(date8):
    """(αρχή UTC, τέλος UTC, πλήθος 15λεπτων) της ημέρας αγοράς (CET/CEST)."""
    d = datetime.strptime(date8, "%Y%m%d")
    s = MARKET_TZ.localize(d).astimezone(pytz.utc)
    e = MARKET_TZ.localize(d + timedelta(days=1)).astimezone(pytz.utc)
    return s, e, int(round((e - s).total_seconds() / 900))


def _t(s):
    return datetime.strptime(s[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=pytz.utc)


def parse_a44(xml_bytes, start_utc, n_q):
    """→ (quarters [n_q, None όπου λείπει, 0 ως έχει], zeros [δείκτες των 0, για έλεγχο]).
    Πρώτα τα 15λεπτα· ωριαία (παλιά ή εφεδρικά) γεμίζουν μόνο ό,τι έμεινε κενό."""
    root = ET.fromstring(xml_bytes)
    ns = {'ns': root.tag.split('}')[0].strip('{')}
    periods = []
    for ts in root.findall('ns:TimeSeries', ns):
        bt = ts.find('ns:businessType', ns)
        if bt is not None and bt.text != 'A62':
            continue
        cur = ts.find('ns:currency_Unit.name', ns)
        if cur is not None and cur.text != 'EUR':
            continue
        # Αν το ENTSO-E στέλνει δύο σειρές για την ίδια περίοδο (classificationSequence), κρατάμε τη 1η.
        seq = ts.find('ns:classificationSequence_AttributeInstanceComponent.position', ns)
        if seq is not None and seq.text not in (None, '1'):
            continue
        curve = ts.find('ns:curveType', ns)
        fill = curve is None or curve.text == 'A03'
        for period in ts.findall('ns:Period', ns):
            step = {'PT15M': 15, 'PT60M': 60}.get(period.find('ns:resolution', ns).text)
            if not step:
                continue
            p0 = _t(period.find('ns:timeInterval/ns:start', ns).text)
            p1 = _t(period.find('ns:timeInterval/ns:end', ns).text)
            pts = {}
            for pt in period.findall('ns:Point', ns):
                amt = pt.find('ns:price.amount', ns)
                if amt is not None and amt.text not in (None, ''):
                    pts[int(pt.find('ns:position', ns).text)] = float(amt.text)
            periods.append((step, p0, int((p1 - p0).total_seconds() // 60 // step), pts, fill))

    quarters = [None] * n_q
    for step, p0, n_pts, pts, fill in sorted(periods, key=lambda p: p[0]):
        last = None
        for pos in range(1, n_pts + 1):
            if pos in pts:
                last = pts[pos]
            elif not fill:
                last = None
            if last is None:
                continue
            t = p0 + timedelta(minutes=step * (pos - 1))
            for k in range(step // 15):
                i = int((t - start_utc).total_seconds() // 900) + k
                if 0 <= i < n_q and quarters[i] is None:
                    quarters[i] = last
    zeros = [i for i, v in enumerate(quarters) if v == 0]
    return quarters, zeros


def day_doc(date8, quarters, zeros, start_utc, zeros_ok=()):
    zeros_ok = sorted(zeros_ok)
    zeros_bad = [i for i in zeros if i not in set(zeros_ok)]
    quarters = [None if i in set(zeros_bad) else q for i, q in enumerate(quarters)]
    ok = [q for q in quarters if q is not None]
    complete = len(ok) == len(quarters)
    return {
        'schema': SCHEMA,
        'date': f"{date8[:4]}-{date8[4:6]}-{date8[6:]}",
        'source': 'ENTSO-E Transparency Platform, A44 (day-ahead prices, BZN|GR)',
        'market_day': 'CET/CEST 00:00–24:00 (01:00–01:00 Greek time)',
        'fetched': datetime.now(ATHENS).isoformat(timespec='seconds'),
        'start_utc': start_utc.strftime("%Y-%m-%dT%H:%MZ"),
        'resolution_min': 15,
        'quarters': [round(q, 2) if q is not None else None for q in quarters],
        'n_valid': len(ok),
        'complete': complete,
        'avg': round(sum(ok) / len(ok), 2) if complete else None,
        'missing': [i for i, q in enumerate(quarters) if q is None],
        'zeros': zeros_bad,               # 0 που ΔΕΝ επιβεβαίωσε ο ΑΔΜΗΕ → κενά
        'zeros_confirmed': zeros_ok,      # 0 που επιβεβαίωσε ο ΑΔΜΗΕ → κρατήθηκαν ως 0
    }


IPTO_DAM = ("https://iptoanalytics-api.admie.gr/iptoanalytics/api/ipto?endpoint=https:%2F%2Fmarket-public-api.admie.gr"
            "%2Frestws%2Fportal%2Fdayaheadmarket%2F{d}")
ZERO_TOL = 0.6


def admie_hourly(gdate8, cache):
    """{ώρα Ελλάδας: τιμή ΑΔΜΗΕ} για την ημέρα gdate8: πρώτα το live αρχείο, αλλιώς iptoanalytics."""
    if gdate8 in cache:
        return cache[gdate8]
    out = {}
    live = load_json_strict(os.path.join('data', 'live', f"{gdate8[:4]}-{gdate8[4:6]}-{gdate8[6:]}.json"), None)
    for h in (live or {}).get('hours', []):
        v = h.get('dam_price_admie', h.get('dam_price')) if 'dam_price_admie' in h or 'dam_price_src' not in h else None
        if v is not None:
            out[h['hr']] = v
    n_g = int(round((ATHENS.localize(datetime.strptime(gdate8, "%Y%m%d") + timedelta(days=1))
                     - ATHENS.localize(datetime.strptime(gdate8, "%Y%m%d"))).total_seconds() / 3600))
    if len(out) < n_g:
        try:
            r = requests.get(IPTO_DAM.format(d=gdate8), timeout=30,
                             headers={'User-Agent': 'live-greekpower-bot (Mozilla/5.0)', 'Accept': 'application/json'})
            if r.status_code == 200:
                for it in r.json().get('items', []):
                    if it.get('country') == 'GR' and it.get('hr') is not None and it.get('value') is not None:
                        out.setdefault(int(it['hr']), float(it['value']))
        except Exception as ex:
            print(f"   [{gdate8}] iptoanalytics dayaheadmarket: {type(ex).__name__}")
    cache[gdate8] = out
    return out


def greek_slot(t_utc):
    """(ημέρα Ελλάδας YYYYMMDD, ώρα 1…25) για τη στιγμή t_utc."""
    loc = t_utc.astimezone(ATHENS)
    d0 = ATHENS.localize(datetime(loc.year, loc.month, loc.day))
    return loc.strftime("%Y%m%d"), int((t_utc - d0.astimezone(pytz.utc)).total_seconds() // 3600) + 1


def verify_zeros(quarters, zeros, start_utc, cache):
    """Δείκτες των 0 που επιβεβαιώνει η ωριαία τιμή του ΑΔΜΗΕ (μέσος 4 15λέπτων με τα 0 ≈ ΑΔΜΗΕ)."""
    ok = []
    hours = {}
    for i in zeros:
        t = start_utc + timedelta(minutes=15 * i)
        hours.setdefault(greek_slot(t), []).append(i)
    for (gd, hr), idx in hours.items():
        # τα 4 15λεπτα της ώρας Ελλάδας: η ώρα αρχίζει πάντα σε ακέραιη ώρα UTC
        t0 = start_utc + timedelta(minutes=15 * idx[0])
        t0 = t0.replace(minute=0)
        i0 = int((t0 - start_utc).total_seconds() // 900)
        qs = [quarters[j] if 0 <= j < len(quarters) else None for j in range(i0, i0 + 4)]
        if any(q is None for q in qs):
            continue
        a = admie_hourly(gd, cache).get(hr)
        if a is not None and abs(a - sum(qs) / 4) <= ZERO_TOL:
            ok += idx
    return ok


def fetch_range(d_first, d_last, token, cache):
    """Μία αίτηση A44 για τις ημέρες αγοράς d_first…d_last → {date8: doc}. Κενό dict σε αποτυχία."""
    s = market_window(d_first)[0]
    e = market_window(d_last)[1]
    params = {'documentType': 'A44', 'in_Domain': GR, 'out_Domain': GR,
              'contract_MarketAgreement.type': 'A01', 'securityToken': token,
              'periodStart': s.strftime("%Y%m%d%H%M"), 'periodEnd': e.strftime("%Y%m%d%H%M")}
    r = None
    for attempt in (1, 2, 3):
        try:
            r = requests.get(API, params=params, timeout=120)
            if r.status_code == 200:
                break
            print(f"[{d_first}–{d_last}] A44: HTTP {r.status_code} (προσπάθεια {attempt})")
        except Exception as ex:
            print(f"[{d_first}–{d_last}] A44: {type(ex).__name__} (προσπάθεια {attempt})")
            r = None
        time.sleep(5 * attempt)
    if r is None or r.status_code != 200 or b'<TimeSeries>' not in r.content:
        print(f"[{d_first}–{d_last}] A44: χωρίς δεδομένα")
        return {}
    n_all = int(round((e - s).total_seconds() / 900))
    try:
        q_all, _ = parse_a44(r.content, s, n_all)
    except Exception as ex:
        print(f"[{d_first}–{d_last}] A44: σφάλμα ανάλυσης ({type(ex).__name__}: {ex})")
        return {}
    out = {}
    d = datetime.strptime(d_first, "%Y%m%d")
    while d <= datetime.strptime(d_last, "%Y%m%d"):
        d8 = d.strftime("%Y%m%d")
        ds, _, n_q = market_window(d8)
        i0 = int((ds - s).total_seconds() // 900)
        q = q_all[i0:i0 + n_q]
        zeros = [i for i, v in enumerate(q) if v == 0]
        out[d8] = day_doc(d8, q, zeros, ds, verify_zeros(q, zeros, ds, cache) if zeros else ())
        d += timedelta(days=1)
    return out


def target_dates():
    a = os.environ.get('START_DATE', '').strip().replace('-', '')
    b = os.environ.get('END_DATE', '').strip().replace('-', '')
    if a and b:
        s, e = datetime.strptime(a, "%Y%m%d"), datetime.strptime(b, "%Y%m%d")
        out = []
        while s <= e:
            out.append(s.strftime("%Y%m%d")); s += timedelta(days=1)
        return out, True
    today = datetime.now(MARKET_TZ)
    return [today.strftime("%Y%m%d"), (today + timedelta(days=1)).strftime("%Y%m%d")], False


def main():
    token = os.environ.get('ENTSOE_TOKEN', '')
    if not token:
        print("ΣΦΑΛΜΑ: Δεν βρέθηκε το ENTSOE_TOKEN· οι τιμές μένουν όπως είναι.")
        return
    dates, history = target_dates()
    force = bool(os.environ.get('FORCE'))
    todo = []
    for d in dates:
        old = load_json_strict(price_path(d), None)
        if old and old.get('complete') and not force:
            continue
        todo.append(d)
    print(f"Ημέρες αγοράς προς λήψη: {len(todo)} από {len(dates)}", flush=True)
    # Κομμάτια διαδοχικών ημερών, έως 31 ανά αίτηση.
    chunks, cur = [], []
    for d in todo:
        if cur and (len(cur) >= 31 or datetime.strptime(d, "%Y%m%d") - datetime.strptime(cur[-1], "%Y%m%d") != timedelta(days=1)):
            chunks.append(cur); cur = []
        cur.append(d)
    if cur:
        chunks.append(cur)
    cache = {}
    n_ok = n_full = 0
    for k, ch in enumerate(chunks):
        if k:
            time.sleep(2)
        docs = fetch_range(ch[0], ch[-1], token, cache)
        for d in ch:
            doc = docs.get(d)
            if doc is None or doc['n_valid'] == 0:
                continue
            old = load_json_strict(price_path(d), None)
            if old and old.get('n_valid', 0) > doc['n_valid']:
                print(f"[{d}] νέα λήψη με λιγότερα έγκυρα 15λεπτα ({doc['n_valid']} < {old['n_valid']}) · κρατάμε την παλιά.")
                continue
            os.makedirs(PRICE_DIR, exist_ok=True)
            write_json_atomic(price_path(d), doc)
            n_ok += 1; n_full += doc['complete']
            if history or not doc['complete'] or doc['zeros_confirmed']:
                print(f"[{d}] {doc['n_valid']}/{len(doc['quarters'])} 15λεπτα· μέση {doc['avg']}"
                      + (f"· 0 επιβεβαιωμένα από ΑΔΜΗΕ: {len(doc['zeros_confirmed'])}" if doc['zeros_confirmed'] else '')
                      + (f"· 0 χωρίς επιβεβαίωση → κενά: {len(doc['zeros'])}" if doc['zeros'] else '')
                      + (f"· άλλα κενά: {len(doc['missing']) - len(doc['zeros'])}" if len(doc['missing']) > len(doc['zeros']) else ''),
                      flush=True)
    print(f"✓ Τιμές: {n_ok} ημέρες γράφτηκαν ({n_full} πλήρεις).", flush=True)


if __name__ == '__main__':
    main()
