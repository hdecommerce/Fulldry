"""Normalisation des chaînes utilisées dans les clés de déduplication.

Ces fonctions doivent produire EXACTEMENT le même résultat que les expressions
Make documentées dans docs/make-filters.md, afin que les clés calculées côté
code et côté Make soient interchangeables :
Make : replace(ascii(lower(x); true); "/[^a-z0-9]/g"; "")
"""

import unicodedata


def remove_accents(text: str) -> str:
    """Translittère les caractères accentués vers leur équivalent ASCII."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize_supplier_name(name: str | None) -> str:
    """Normalise un nom de fournisseur : minuscules, sans accents,
    uniquement [a-z0-9]. Retourne "" si le nom est vide ou None."""
    if not name:
        return ""
    text = remove_accents(name).lower()
    return "".join(c for c in text if c.isascii() and c.isalnum())


def normalize_invoice_number(number: str | None) -> str:
    """Normalise un numéro de facture selon les mêmes règles que le nom
    de fournisseur (FA-2026/458 → fa2026458)."""
    return normalize_supplier_name(number)


def format_amount(amount: float | int | str) -> str:
    """Formate un montant avec exactement deux décimales et un point
    (équivalent Make : formatNumber(x; 2; "."; ""))."""
    from decimal import Decimal, ROUND_HALF_UP

    value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{value:.2f}"
