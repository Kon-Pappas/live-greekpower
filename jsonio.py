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


def write_json_atomic(path, data):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
