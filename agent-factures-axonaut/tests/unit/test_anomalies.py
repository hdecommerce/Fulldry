import json
import unittest
from datetime import date
from pathlib import Path

from src.validation.anomalies import compute_anomaly_codes, has_blocking_anomaly

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
TODAY = date(2026, 7, 24)


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class TestAnomalyCodes(unittest.TestCase):
    def test_standard_invoice_has_no_anomaly(self):
        codes = compute_anomaly_codes(load("invoice-standard-fr.json"), today=TODAY)
        self.assertEqual(codes, [])
        self.assertFalse(has_blocking_anomaly(codes))

    def test_duplicate_fixture_is_clean_by_itself(self):
        # Le doublon n'est pas détectable par la seule extraction : il est
        # détecté par le Data Store (Route B), pas par les codes d'anomalie.
        codes = compute_anomaly_codes(load("invoice-duplicate.json"), today=TODAY)
        self.assertEqual(codes, [])

    def test_amount_mismatch(self):
        codes = compute_anomaly_codes(load("invoice-amount-mismatch.json"), today=TODAY)
        self.assertIn("AMOUNT_MISMATCH", codes)
        self.assertTrue(has_blocking_anomaly(codes))

    def test_proforma(self):
        codes = compute_anomaly_codes(load("invoice-proforma.json"), today=TODAY)
        self.assertIn("PROFORMA", codes)
        self.assertTrue(has_blocking_anomaly(codes))

    def test_low_confidence(self):
        codes = compute_anomaly_codes(load("invoice-low-confidence.json"), today=TODAY)
        self.assertIn("LOW_CONFIDENCE", codes)
        self.assertTrue(has_blocking_anomaly(codes))

    def test_unknown_company(self):
        data = load("invoice-standard-fr.json")
        data["company"] = "AUTRE SOCIETE"
        self.assertIn("UNKNOWN_COMPANY", compute_anomaly_codes(data, today=TODAY))

    def test_unsupported_currency(self):
        data = load("invoice-standard-fr.json")
        data["currency"] = "USD"
        self.assertIn("UNSUPPORTED_CURRENCY", compute_anomaly_codes(data, today=TODAY))

    def test_missing_supplier_and_number(self):
        data = load("invoice-standard-fr.json")
        data["supplier_name"] = None
        data["invoice_number"] = ""
        codes = compute_anomaly_codes(data, today=TODAY)
        self.assertIn("MISSING_SUPPLIER", codes)
        self.assertIn("MISSING_INVOICE_NUMBER", codes)

    def test_invalid_siret_and_vat(self):
        data = load("invoice-standard-fr.json")
        data["supplier_siret"] = "12345678900012"  # Luhn invalide
        data["supplier_vat_number"] = "FR00999000001"  # clé fausse
        codes = compute_anomaly_codes(data, today=TODAY)
        self.assertIn("INVALID_SIRET", codes)
        self.assertIn("INVALID_VAT_NUMBER", codes)

    def test_null_siret_is_not_invalid(self):
        data = load("invoice-standard-fr.json")
        data["supplier_siret"] = None
        data["supplier_vat_number"] = None
        codes = compute_anomaly_codes(data, today=TODAY)
        self.assertNotIn("INVALID_SIRET", codes)
        self.assertNotIn("INVALID_VAT_NUMBER", codes)

    def test_future_invoice_date(self):
        data = load("invoice-standard-fr.json")
        data["invoice_date"] = "2026-12-01"
        self.assertIn("FUTURE_INVOICE_DATE", compute_anomaly_codes(data, today=TODAY))

    def test_invalid_due_date(self):
        data = load("invoice-standard-fr.json")
        data["due_date"] = "2026-01-01"  # antérieure à la facture
        self.assertIn("INVALID_DUE_DATE", compute_anomaly_codes(data, today=TODAY))

    def test_invalid_date_format(self):
        data = load("invoice-standard-fr.json")
        data["invoice_date"] = "01/07/2026"
        self.assertIn("INVALID_DATE", compute_anomaly_codes(data, today=TODAY))

    def test_multiple_vat_rates_is_warning_only(self):
        data = load("invoice-standard-fr.json")
        data["amount_excluding_tax"] = 300.0
        data["vat_amount"] = 31.0
        data["amount_including_tax"] = 331.0
        data["vat_breakdown"] = [
            {"rate": 20.0, "taxable_amount": 100.0, "vat_amount": 20.0},
            {"rate": 5.5, "taxable_amount": 200.0, "vat_amount": 11.0},
        ]
        codes = compute_anomaly_codes(data, today=TODAY)
        self.assertEqual(codes, ["MULTIPLE_VAT_RATES"])
        self.assertFalse(has_blocking_anomaly(codes))

    def test_unreadable_document(self):
        data = load("invoice-low-confidence.json")
        data["confidence"] = 0.2
        codes = compute_anomaly_codes(data, today=TODAY)
        self.assertIn("UNREADABLE_DOCUMENT", codes)


if __name__ == "__main__":
    unittest.main()
