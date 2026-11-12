"""Κοινές συναρτήσεις ανάγνωσης/εγγραφής JSON για όλα τα scripts του repo.

load_json_strict  : για αρχεία που το script ΞΑΝΑΓΡΑΦΕΙ. Αν υπάρχουν αλλά
                    δεν διαβάζονται, σταματάμε (exit 1) χωρίς εγγραφή, ώστε
                    να μη γραφτεί από πάνω τους κάτι φτωχότερο.
load_json_lenient : για αρχεία που απλώς ΔΙΑΒΑΖΟΥΜΕ. Αν χαλάσουν,
                    συνεχίζουμε χωρίς αυτά, με προειδοποίηση.
write_json_atomic : γράφει σε προσωρινό αρχείο και μετά το μετονομάζει,
                    ώστε να μη μείνει ποτέ μισογραμμένο JSON.
"""
import json
import math
import os
import sys


def load_json_strict(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"✗ ΚΡΙΣΙΜΟ: Το {path} υπάρχει αλλά δεν διαβάζεται ({e}). Διακοπή χωρίς εγγραφή.")
        sys.exit(1)


def load_json_lenient(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠ Προειδοποίηση: Το {path} δεν διαβάστηκε ({e}). Συνέχεια χωρίς αυτό.")
        return default


def _finite(obj):
    """D64: NaN / ±άπειρο → None, σε όλη τη δομή. Ένα κενό κελί σε αρχείο του ΑΔΜΗΕ (π.χ. RESMV 11/11/2026,
    βιομάζα 18:00–19:00) έγινε NaN μέσω pandas· η Python το γράφει, αλλά δεν είναι έγκυρο JSON και ο browser
    απορρίπτει ΟΛΟ το αρχείο. Κανόνας: κενό αντί για λάθος."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _finite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_finite(v) for v in obj]
    return obj


def write_json_atomic(path, data):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(_finite(data), f, ensure_ascii=False, indent=2, allow_nan=False)   # D64: πάντα έγκυρο JSON
    os.replace(tmp, path)
