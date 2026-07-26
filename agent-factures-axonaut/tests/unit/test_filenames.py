import unittest

from src.utils.filenames import build_normalized_filename, sanitize_component


class TestSanitizeComponent(unittest.TestCase):
    def test_removes_forbidden_characters(self):
        self.assertEqual(sanitize_component('A/B\\C:D*E?F"G<H>I|J'), "ABCDEFGHIJ")

    def test_collapses_spaces_and_translates_accents(self):
        self.assertEqual(sanitize_component("  Société   Générale  "), "Societe-Generale")


class TestBuildNormalizedFilename(unittest.TestCase):
    def test_nominal(self):
        name = build_normalized_filename("2026-07-20", "GOOGLE", "FR-4587", 1055, "pdf")
        self.assertEqual(name, "2026-07-20_GOOGLE_FR-4587_1055.00_EUR.pdf")

    def test_accents_and_spaces_in_supplier(self):
        name = build_normalized_filename("2026-07-01", "Fournitest Électro", "FT 001", "120.0", "PDF")
        self.assertEqual(name, "2026-07-01_FOURNITEST-ELECTRO_FT-001_120.00_EUR.pdf")

    def test_empty_components_get_placeholders(self):
        name = build_normalized_filename("2026-07-01", "", "", 10, "png")
        self.assertEqual(name, "2026-07-01_FOURNISSEUR-INCONNU_SANS-NUMERO_10.00_EUR.png")

    def test_length_limit(self):
        name = build_normalized_filename("2026-07-01", "X" * 300, "FT-1", 10, "pdf")
        self.assertLessEqual(len(name), 140)
        self.assertTrue(name.endswith("_FT-1_10.00_EUR.pdf"))

    def test_no_overwrite_suffix(self):
        existing = {"2026-07-20_GOOGLE_FR-4587_1055.00_EUR.pdf"}
        name = build_normalized_filename("2026-07-20", "GOOGLE", "FR-4587", 1055, "pdf", existing)
        self.assertEqual(name, "2026-07-20_GOOGLE_FR-4587_1055.00_EUR_2.pdf")
        existing.add(name)
        name3 = build_normalized_filename("2026-07-20", "GOOGLE", "FR-4587", 1055, "pdf", existing)
        self.assertEqual(name3, "2026-07-20_GOOGLE_FR-4587_1055.00_EUR_3.pdf")


if __name__ == "__main__":
    unittest.main()
