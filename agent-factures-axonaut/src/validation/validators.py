"""Contrôles de cohérence des données extraites d'une facture."""

from datetime import date, datetime, timedelta
from decimal import Decimal

TOLERANCE = Decimal("0.02")


def _dec(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def validate_totals(
    amount_excluding_tax,
    vat_amount,
    amount_including_tax,
    vat_breakdown: list[dict] | None = None,
) -> bool:
    """Vrai si HT + TVA = TTC (± 0,02 €) et, en présence d'une ventilation
    multi-taux, si Σ bases = HT (± 0,02 €) et Σ TVA = TVA totale (± 0,02 €)."""
    ht, tva, ttc = _dec(amount_excluding_tax), _dec(vat_amount), _dec(amount_including_tax)
    if ht is None or tva is None or ttc is None:
        return False
    if abs(ht + tva - ttc) > TOLERANCE:
        return False
    if vat_breakdown:
        sum_bases = sum((_dec(line.get("taxable_amount")) or Decimal(0)) for line in vat_breakdown)
        sum_vat = sum((_dec(line.get("vat_amount")) or Decimal(0)) for line in vat_breakdown)
        if abs(sum_bases - ht) > TOLERANCE or abs(sum_vat - tva) > TOLERANCE:
            return False
    return True


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, char in enumerate(reversed(digits)):
        digit = int(char)
        if i % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def validate_siret(siret: str | None) -> bool:
    """SIRET français : 14 chiffres + clé de Luhn.

    Exception documentée : les établissements de La Poste (SIREN 356000000)
    ne respectent pas Luhn — leur somme de chiffres est un multiple de 5."""
    if not siret:
        return False
    digits = "".join(c for c in siret if c.isdigit())
    if len(digits) != 14:
        return False
    if digits.startswith("356000000"):
        return sum(int(c) for c in digits) % 5 == 0
    return _luhn_ok(digits)


def validate_french_vat_number(vat: str | None) -> bool:
    """Structure d'un numéro de TVA intracommunautaire français :
    FR + clé (2 caractères alphanumériques) + SIREN (9 chiffres).
    Si la clé est purement numérique, elle est vérifiée :
    clé = (12 + 3 × (SIREN mod 97)) mod 97."""
    if not vat:
        return False
    value = vat.replace(" ", "").upper()
    if len(value) != 13 or not value.startswith("FR"):
        return False
    key, siren = value[2:4], value[4:13]
    if not siren.isdigit():
        return False
    allowed = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # I et O exclus
    if not all(c in allowed for c in key):
        return False
    if key.isdigit():
        return int(key) == (12 + 3 * (int(siren) % 97)) % 97
    return True


def parse_iso_date(value: str | None) -> date | None:
    """Retourne la date si `value` est une date ISO AAAA-MM-JJ valide, sinon None."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def validate_dates(
    invoice_date: str | None,
    due_date: str | None = None,
    today: date | None = None,
    future_tolerance_days: int = 2,
) -> bool:
    """Vrai si la date de facture est valide et non aberrante dans le futur,
    et si l'échéance (quand elle existe) est valide et ≥ date de facture."""
    today = today or date.today()
    inv = parse_iso_date(invoice_date)
    if inv is None:
        return False
    if inv > today + timedelta(days=future_tolerance_days):
        return False
    if due_date is not None:
        due = parse_iso_date(due_date)
        if due is None or due < inv:
            return False
    return True
