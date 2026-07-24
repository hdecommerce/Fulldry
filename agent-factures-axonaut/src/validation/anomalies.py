"""Production des codes d'anomalies à partir d'une extraction de facture.

Les codes sont identiques à ceux du schéma `schemas/invoice-extraction.schema.json`
et des filtres Make (`docs/make-filters.md`).
"""

from datetime import date

from src.validation.validators import (
    parse_iso_date,
    validate_dates,
    validate_french_vat_number,
    validate_siret,
    validate_totals,
)

# Codes bloquants : présence => Route C (anomalie), jamais d'envoi à Axonaut.
BLOCKING_CODES = {
    "MISSING_SUPPLIER",
    "MISSING_INVOICE_NUMBER",
    "INVALID_DATE",
    "INVALID_SIRET",
    "INVALID_VAT_NUMBER",
    "AMOUNT_MISMATCH",
    "UNKNOWN_COMPANY",
    "UNSUPPORTED_CURRENCY",
    "LOW_CONFIDENCE",
    "CREDIT_NOTE",
    "PROFORMA",
    "DELIVERY_NOTE",
    "UNKNOWN_DOCUMENT",
    "UNREADABLE_DOCUMENT",
    "FUTURE_INVOICE_DATE",
    "INVALID_DUE_DATE",
}

# Codes informatifs : journalisés mais non bloquants à eux seuls.
WARNING_CODES = {
    "MULTIPLE_VAT_RATES",
    "POSSIBLE_DUPLICATE",  # posé par le scénario (Data Store), pas par cette fonction
}

ALL_CODES = BLOCKING_CODES | WARNING_CODES

_DOCUMENT_TYPE_CODES = {
    "credit_note": "CREDIT_NOTE",
    "proforma": "PROFORMA",
    "delivery_note": "DELIVERY_NOTE",
    "receipt": "UNKNOWN_DOCUMENT",  # ticket : non géré en V1
    "unknown": "UNKNOWN_DOCUMENT",
}

EXPECTED_COMPANY = "HD ECOMMERCE"
SUPPORTED_CURRENCY = "EUR"
CONFIDENCE_THRESHOLD = 0.95
UNREADABLE_THRESHOLD = 0.50


def compute_anomaly_codes(extraction: dict, today: date | None = None) -> list[str]:
    """Retourne la liste triée des codes d'anomalies pour une extraction IA.

    Une liste vide + absence de doublon = facture éligible à la Route A.
    """
    codes: set[str] = set()
    get = extraction.get

    confidence = get("confidence") or 0.0
    if confidence < UNREADABLE_THRESHOLD:
        codes.add("UNREADABLE_DOCUMENT")
    if confidence < CONFIDENCE_THRESHOLD:
        codes.add("LOW_CONFIDENCE")

    if (get("company") or "").strip().upper() != EXPECTED_COMPANY:
        codes.add("UNKNOWN_COMPANY")

    doc_type = get("document_type") or "unknown"
    if doc_type != "invoice":
        codes.add(_DOCUMENT_TYPE_CODES.get(doc_type, "UNKNOWN_DOCUMENT"))

    if not (get("supplier_name") or "").strip():
        codes.add("MISSING_SUPPLIER")
    if not (get("invoice_number") or "").strip():
        codes.add("MISSING_INVOICE_NUMBER")

    if (get("currency") or "").upper() != SUPPORTED_CURRENCY:
        codes.add("UNSUPPORTED_CURRENCY")

    siret = get("supplier_siret")
    if siret is not None and not validate_siret(siret):
        codes.add("INVALID_SIRET")

    vat_number = get("supplier_vat_number")
    if vat_number is not None and not validate_french_vat_number(vat_number):
        codes.add("INVALID_VAT_NUMBER")

    ttc = get("amount_including_tax")
    if (
        ttc is None
        or (isinstance(ttc, (int, float)) and ttc <= 0)
        or not validate_totals(
            get("amount_excluding_tax"),
            get("vat_amount"),
            ttc,
            get("vat_breakdown"),
        )
    ):
        codes.add("AMOUNT_MISMATCH")

    invoice_date = get("invoice_date")
    parsed_invoice = parse_iso_date(invoice_date)
    if parsed_invoice is None:
        codes.add("INVALID_DATE")
    else:
        today = today or date.today()
        if not validate_dates(invoice_date, None, today=today):
            codes.add("FUTURE_INVOICE_DATE")
        due = get("due_date")
        if due is not None and not validate_dates(invoice_date, due, today=today):
            codes.add("INVALID_DUE_DATE")

    if len(get("vat_breakdown") or []) > 1:
        codes.add("MULTIPLE_VAT_RATES")

    return sorted(codes)


def has_blocking_anomaly(codes: list[str]) -> bool:
    """Vrai si au moins un code de la liste est bloquant (Route C)."""
    return any(code in BLOCKING_CODES for code in codes)
