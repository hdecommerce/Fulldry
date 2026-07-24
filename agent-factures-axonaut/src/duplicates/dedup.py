"""Clé de déduplication des factures.

Clé principale : supplier_siret + invoice_number_normalized + amount_including_tax
Clé de secours  : supplier_name_normalized + invoice_number_normalized + amount_including_tax

Le même algorithme est reproduit en expressions Make (docs/make-filters.md §5) —
toute modification ici doit être répercutée là-bas, et inversement.
"""

import re

from src.utils.normalize import (
    format_amount,
    normalize_invoice_number,
    normalize_supplier_name,
)


def build_dedup_key(
    supplier_siret: str | None,
    supplier_name: str | None,
    invoice_number: str | None,
    amount_including_tax: float | str,
) -> str:
    """Construit la clé unique normalisée, ex. `93776694700000-fa2026458-1055.00`."""
    siret_digits = re.sub(r"\D", "", supplier_siret or "")
    if len(siret_digits) == 14:
        prefix = siret_digits
    else:
        prefix = normalize_supplier_name(supplier_name)
    number = normalize_invoice_number(invoice_number)
    amount = format_amount(amount_including_tax)
    return f"{prefix}-{number}-{amount}"
