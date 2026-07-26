"""Construction et nettoyage des noms de fichiers de classement Drive.

Convention (docs/google-drive-structure.md) :
AAAA-MM-JJ_FOURNISSEUR_NUMERO_FACTURE_MONTANT_TTC_EUR.ext
"""

import re

from src.utils.normalize import format_amount, remove_accents

# Caractères interdits par Windows/Drive + contrôle.
_FORBIDDEN = re.compile(r'[\/\\:*?"<>|\x00-\x1f]')
_MAX_LENGTH = 140  # longueur totale max du nom de fichier, extension comprise


def sanitize_component(text: str) -> str:
    """Nettoie un composant de nom de fichier : accents translittérés,
    caractères interdits supprimés, espaces multiples réduits, espaces → tirets."""
    text = remove_accents(text or "")
    text = _FORBIDDEN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace(" ", "-")
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-_")


def build_normalized_filename(
    invoice_date: str,
    supplier_name: str,
    invoice_number: str,
    amount_including_tax: float | str,
    extension: str,
    existing_names: set[str] | None = None,
) -> str:
    """Construit le nom normalisé et garantit l'absence d'écrasement.

    - `invoice_date` : ISO AAAA-MM-JJ (déjà validée en amont) ;
    - `extension` : "pdf", "jpg" ou "png" (sans point) ;
    - `existing_names` : noms déjà présents dans le dossier cible ;
      en cas de collision, un suffixe _2, _3… est ajouté avant l'extension.
    """
    ext = extension.lower().lstrip(".")
    supplier = sanitize_component(supplier_name).upper() or "FOURNISSEUR-INCONNU"
    number = sanitize_component(invoice_number).upper() or "SANS-NUMERO"
    amount = format_amount(amount_including_tax)

    base = f"{invoice_date}_{supplier}_{number}_{amount}_EUR"

    # Limite de longueur : on tronque le fournisseur en priorité.
    overflow = len(base) + 1 + len(ext) - _MAX_LENGTH
    if overflow > 0:
        supplier = supplier[: max(1, len(supplier) - overflow)].rstrip("-_")
        base = f"{invoice_date}_{supplier}_{number}_{amount}_EUR"

    candidate = f"{base}.{ext}"
    if not existing_names:
        return candidate

    counter = 2
    while candidate in existing_names:
        candidate = f"{base}_{counter}.{ext}"
        counter += 1
    return candidate
