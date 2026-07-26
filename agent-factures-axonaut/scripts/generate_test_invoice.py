#!/usr/bin/env python3
"""Génère la facture PDF fictive de test (T0/T1) sans aucune dépendance externe.

Usage :
    python3 scripts/generate_test_invoice.py [chemin_sortie.pdf]

Par défaut, écrit tests/fixtures/invoice-standard-fr.pdf.
Le PDF produit reprend exactement les données de invoice-standard-fr.json
(données strictement fictives : SIRET de la série 999, jamais attribuée).
"""

import sys
import zlib
from pathlib import Path

LINES = [
    ("Helvetica-Bold", 16, "FACTURE"),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 11, "FOURNITEST SARL"),
    ("Helvetica", 10, "1 rue du Test, 63000 Clermont-Ferrand, France"),
    ("Helvetica", 10, "SIRET : 999 000 001 10000"),
    ("Helvetica", 10, "TVA intracommunautaire : FR36999000001"),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 10, "Facturé à :"),
    ("Helvetica", 10, "HD ECOMMERCE"),
    ("Helvetica", 10, "France"),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 10, "Facture n° FT-2026-001"),
    ("Helvetica", 10, "Date de facture : 01/07/2026"),
    ("Helvetica", 10, "Date d'échéance : 31/07/2026"),
    ("Helvetica", 10, ""),
    ("Helvetica", 10, "Désignation : Denrées alimentaires (TVA 5,5 %)"),
    ("Helvetica", 10, ""),
    ("Helvetica", 10, "Montant HT :            200,00 EUR"),
    ("Helvetica", 10, "TVA 5,5 % :              11,00 EUR"),
    ("Helvetica-Bold", 11, "Total TTC :             211,00 EUR"),
    ("Helvetica", 10, ""),
    ("Helvetica", 8, "Document strictement fictif genere pour les tests de l'agent"),
    ("Helvetica", 8, "de traitement des factures fournisseurs. Ne pas payer."),
]


def _escape(text: str) -> str:
    # WinAnsiEncoding : les caractères accentués latin-1 passent tels quels.
    return (
        text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    )


def build_pdf() -> bytes:
    content_parts = ["BT"]
    y = 780
    for font, size, text in LINES:
        if text:
            content_parts.append(f"/{'F1' if font == 'Helvetica' else 'F2'} {size} Tf")
            content_parts.append(f"1 0 0 1 72 {y} Tm")
            content_parts.append(f"({_escape(text)}) Tj")
        y -= int(size * 1.6)
    content_parts.append("ET")
    stream = "\n".join(content_parts).encode("latin-1")
    compressed = zlib.compress(stream)

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(compressed)
        + compressed
        + b"\nendstream",
        # Objet de remplissage non référencé : porte le fichier au-dessus du
        # seuil de 15 Ko du filtre F1 (les pièces jointes < 15 Ko sont ignorées
        # par le scénario — un PDF de test plus petit ne passerait jamais).
        b"<< /Length 20480 >>\nstream\n" + (b"% padding\n" * 2048) + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % index + body + b"\nendobj\n"

    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += (
        b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objects) + 1, xref_pos)
    )
    return bytes(out)


def main() -> None:
    default = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "invoice-standard-fr.pdf"
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else default
    target.write_bytes(build_pdf())
    print(f"PDF de test écrit : {target} ({target.stat().st_size} octets)")


if __name__ == "__main__":
    main()
