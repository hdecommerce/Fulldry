import unittest

from src.utils.normalize import (
    format_amount,
    normalize_invoice_number,
    normalize_supplier_name,
    remove_accents,
)


class TestNormalize(unittest.TestCase):
    def test_remove_accents(self):
        self.assertEqual(remove_accents("Électricité Générale"), "Electricite Generale")

    def test_supplier_name_lowercase_alnum_only(self):
        self.assertEqual(normalize_supplier_name("Société Générale & Fils !"), "societegeneralefils")
        # Les caractères spéciaux sont supprimés, pas remplacés
        self.assertEqual(normalize_supplier_name("Génér@le"), "generle")

    def test_supplier_name_empty_and_none(self):
        self.assertEqual(normalize_supplier_name(""), "")
        self.assertEqual(normalize_supplier_name(None), "")

    def test_invoice_number(self):
        self.assertEqual(normalize_invoice_number("FA-2026/458"), "fa2026458")
        self.assertEqual(normalize_invoice_number(" FT 2026 001 "), "ft2026001")

    def test_format_amount_two_decimals(self):
        self.assertEqual(format_amount(1055), "1055.00")
        self.assertEqual(format_amount(1055.5), "1055.50")
        self.assertEqual(format_amount("120.005"), "120.01")  # arrondi demi-sup

    def test_format_amount_matches_make_expression(self):
        # Équivalence avec formatNumber(x; 2; "."; "") de Make
        self.assertEqual(format_amount(0.1 + 0.2), "0.30")


if __name__ == "__main__":
    unittest.main()
