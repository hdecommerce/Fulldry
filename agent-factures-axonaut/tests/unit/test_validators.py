import unittest
from datetime import date

from src.validation.validators import (
    parse_iso_date,
    validate_dates,
    validate_french_vat_number,
    validate_siret,
    validate_totals,
)

TODAY = date(2026, 7, 24)


class TestTotals(unittest.TestCase):
    def test_coherent(self):
        self.assertTrue(validate_totals(1000.00, 55.00, 1055.00))

    def test_tolerance_two_cents(self):
        self.assertTrue(validate_totals(100.00, 20.00, 120.02))
        self.assertFalse(validate_totals(100.00, 20.00, 120.03))

    def test_mismatch(self):
        self.assertFalse(validate_totals(100.00, 20.00, 150.00))

    def test_missing_amounts(self):
        self.assertFalse(validate_totals(None, 20.0, 120.0))

    def test_float_precision(self):
        # 0.1 + 0.2 != 0.3 en float — Decimal doit absorber le problème
        self.assertTrue(validate_totals(0.1, 0.2, 0.3))

    def test_vat_breakdown_single_rate(self):
        breakdown = [{"rate": 5.5, "taxable_amount": 200.0, "vat_amount": 11.0}]
        self.assertTrue(validate_totals(200.0, 11.0, 211.0, breakdown))

    def test_vat_breakdown_multi_rate_ok(self):
        breakdown = [
            {"rate": 20.0, "taxable_amount": 100.0, "vat_amount": 20.0},
            {"rate": 5.5, "taxable_amount": 200.0, "vat_amount": 11.0},
        ]
        self.assertTrue(validate_totals(300.0, 31.0, 331.0, breakdown))

    def test_vat_breakdown_incoherent(self):
        breakdown = [{"rate": 20.0, "taxable_amount": 90.0, "vat_amount": 20.0}]
        self.assertFalse(validate_totals(100.0, 20.0, 120.0, breakdown))


class TestSiret(unittest.TestCase):
    def test_valid_fictional_siret(self):
        self.assertTrue(validate_siret("99900000110000"))

    def test_luhn_failure(self):
        self.assertFalse(validate_siret("12345678900012"))

    def test_wrong_length_or_empty(self):
        self.assertFalse(validate_siret("123"))
        self.assertFalse(validate_siret(None))
        self.assertFalse(validate_siret(""))

    def test_la_poste_exception(self):
        # SIREN 356000000, NIC choisi pour que la somme des chiffres soit multiple de 5
        self.assertTrue(validate_siret("35600000000001"))


class TestFrenchVat(unittest.TestCase):
    def test_valid_with_numeric_key(self):
        self.assertTrue(validate_french_vat_number("FR36999000001"))

    def test_wrong_numeric_key(self):
        self.assertFalse(validate_french_vat_number("FR00999000001"))

    def test_structure_errors(self):
        self.assertFalse(validate_french_vat_number("DE36999000001"))
        self.assertFalse(validate_french_vat_number("FR3699900000"))  # trop court
        self.assertFalse(validate_french_vat_number(None))

    def test_alphanumeric_key_structure_only(self):
        self.assertTrue(validate_french_vat_number("FRAB999000001"))
        self.assertFalse(validate_french_vat_number("FRIO999000001"))  # I et O interdits


class TestDates(unittest.TestCase):
    def test_parse_iso(self):
        self.assertEqual(parse_iso_date("2026-07-01"), date(2026, 7, 1))
        self.assertIsNone(parse_iso_date("01/07/2026"))
        self.assertIsNone(parse_iso_date("2026-13-01"))

    def test_valid_dates(self):
        self.assertTrue(validate_dates("2026-07-01", "2026-07-31", today=TODAY))

    def test_due_before_invoice(self):
        self.assertFalse(validate_dates("2026-07-31", "2026-07-01", today=TODAY))

    def test_far_future_invoice(self):
        self.assertFalse(validate_dates("2026-09-01", None, today=TODAY))

    def test_small_future_tolerance(self):
        self.assertTrue(validate_dates("2026-07-25", None, today=TODAY))

    def test_missing_due_date_is_ok(self):
        self.assertTrue(validate_dates("2026-07-01", None, today=TODAY))


if __name__ == "__main__":
    unittest.main()
