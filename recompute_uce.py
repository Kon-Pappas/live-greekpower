"""Ξαναϋπολογίζει τα παράγωγα πεδία (φυσική καθαρή, live καθαρή, UCE) στα ήδη
αποθηκευμένα αρχεία data/xray/, χωρίς νέα λήψη από τον ΑΔΜΗΕ.

Χρήση: μετά από backfill των live δεδομένων ή μετά από αλλαγή ορισμού (D30).
    START_DATE / END_DATE (YYYYMMDD, προαιρετικά): περιορισμός διαστήματος.
"""
import os
import contract


def _iso(v):
    v = (v or '').strip().replace('-', '')
    return f"{v[:4]}-{v[4:6]}-{v[6:8]}" if len(v) == 8 else None


if __name__ == "__main__":
    contract.rebuild_xray_derived(_iso(os.environ.get('START_DATE')), _iso(os.environ.get('END_DATE')))
