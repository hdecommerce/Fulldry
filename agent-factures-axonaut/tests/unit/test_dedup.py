import unittest

from src.duplicates.dedup import build_dedup_key


class TestDedupKey(unittest.TestCase):
    def test_with_valid_siret(self):
        key = build_dedup_key("99900000110000", "FOURNITEST SARL", "FT-2026-001", 211.0)
        self.assertEqual(key, "99900000110000-ft2026001-211.00")

    def test_siret_with_spaces_is_cleaned(self):
        key = build_dedup_key("999 000 001 10000", "X", "FT-1", 10)
        self.assertTrue(key.startswith("99900000110000-"))

    def test_fallback_to_supplier_name_when_siret_missing(self):
        key = build_dedup_key(None, "Société Générale", "FA/2026-458", "1055.0")
        self.assertEqual(key, "societegenerale-fa2026458-1055.00")

    def test_fallback_when_siret_invalid_length(self):
        key = build_dedup_key("12345", "ACME", "F1", 5)
        self.assertEqual(key, "acme-f1-5.00")

    def test_spec_example(self):
        # Exemple du cahier des charges : 93776694700000-fa2026-458-1055.00
        # (notre normalisation retire aussi le tiret interne du numéro)
        key = build_dedup_key("93776694700000", None, "FA2026-458", 1055)
        self.assertEqual(key, "93776694700000-fa2026458-1055.00")

    def test_same_invoice_same_key(self):
        a = build_dedup_key("99900000110000", "A", "FT-001", 100.0)
        b = build_dedup_key("99900000110000", "B", "ft 001", "100.00")
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
