"""ENTSO-E Transparency Platform, A44 (τιμές αγοράς επόμενης ημέρας) → data/price/YYYY-MM-DD.json.
Γράφει ΜΟΝΟ αυτό το script (D68).

Ένα αρχείο ανά ΗΜΕΡΑ ΑΓΟΡΑΣ, όπως τη δημοσιεύουν ΕΧΕ και ENTSO-E (και όπως στο BESS):
CET/CEST 00:00–24:00 = 01:00–01:00 ώρα Ελλάδας. Κρατά τα 15λεπτα (92/96/100) και τη μέση της ημέρας.

Κανόνες «κενό αντί για λάθος»:
  - curveType A03: όταν λείπει μια θέση μέσα σε Period, ισχύει η τιμή της προηγούμενης (forward-fill
    ΜΟΝΟ μέσα στην ίδια Period, όπως στο BESS). Με A01, θέση που λείπει μένει κενή.
  - Τιμή ΑΚΡΙΒΩΣ 0 → κενό (null) και καταγράφεται στο `zeros`: το ENTSO-E βάζει μερικές φορές 0 εκεί
    που δεν έχει τιμή, και το ακριβές 0,00 στην ελληνική αγορά δεν είναι σχεδόν ποτέ αληθινό.
  - Μέση ημέρας μόνο όταν ΟΛΑ τα 15λεπτα είναι έγκυρα· αλλιώς null.

Χωρίς ημερομηνίες (ωριαίο scrape): σημερινή και αυριανή ημέρα αγοράς· ημέρα με πλήρες αρχείο δεν
ξανακατεβαίνει (οι τιμές DAM δεν αλλάζουν μετά τη δημοσίευση). Με START_DATE/END_DATE: ιστορικό.
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
    """→ (quarters [n_q, None όπου λείπει], zeros [δείκτες]).
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
    for i in zeros:
        quarters[i] = None
    return quarters, zeros


def day_doc(date8, quarters, zeros, start_utc):
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
        'zeros': zeros,
    }


def fetch_day(date8, token):
    s, e, n_q = market_window(date8)
    params = {'documentType': 'A44', 'in_Domain': GR, 'out_Domain': GR,
              'contract_MarketAgreement.type': 'A01', 'securityToken': token,
              'periodStart': s.strftime("%Y%m%d%H%M"), 'periodEnd': e.strftime("%Y%m%d%H%M")}
    try:
        r = requests.get(API, params=params, timeout=60)
    except Exception as ex:
        print(f"[{date8}] A44: αποτυχία σύνδεσης ({type(ex).__name__})")
        return None
    if r.status_code != 200 or b'<Reason>' in r.content and b'<TimeSeries>' not in r.content:
        print(f"[{date8}] A44: χωρίς δεδομένα (HTTP {r.status_code})")
        return None
    try:
        quarters, zeros = parse_a44(r.content, s, n_q)
    except Exception as ex:
        print(f"[{date8}] A44: σφάλμα ανάλυσης ({type(ex).__name__}: {ex})")
        return None
    return day_doc(date8, quarters, zeros, s)


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
    pause = float(os.environ.get('PAUSE_SECONDS', '1' if history else '0') or 0)
    for i, d in enumerate(dates):
        old = load_json_strict(price_path(d), None)
        if old and old.get('complete') and not os.environ.get('FORCE'):
            print(f"[{d}] ήδη πλήρες ({old['n_valid']} 15λεπτα, μέση {old['avg']}).")
            continue
        if i and pause:
            time.sleep(pause)
        doc = fetch_day(d, token)
        if doc is None:
            continue
        if old and old.get('n_valid', 0) > doc['n_valid']:
            print(f"[{d}] νέα λήψη με λιγότερα έγκυρα 15λεπτα ({doc['n_valid']} < {old['n_valid']}) · κρατάμε την παλιά.")
            continue
        os.makedirs(PRICE_DIR, exist_ok=True)
        write_json_atomic(price_path(d), doc)
        print(f"[{d}] ✓ {doc['n_valid']}/{len(doc['quarters'])} 15λεπτα· μέση {doc['avg']}"
              + (f"· μηδενικά → κενά: {len(doc['zeros'])}" if doc['zeros'] else '')
              + (f"· κενά: {len(doc['missing'])}" if doc['missing'] else ''))


if __name__ == '__main__':
    main()
