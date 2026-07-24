import os
import tempfile
import unittest

from src.utils.hashing import sha256_bytes, sha256_file


class TestHashing(unittest.TestCase):
    # Vecteur de test SHA-256 connu (chaîne vide et "abc")
    EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"

    def test_sha256_bytes_known_vectors(self):
        self.assertEqual(sha256_bytes(b""), self.EMPTY)
        self.assertEqual(sha256_bytes(b"abc"), self.ABC)

    def test_sha256_file_matches_bytes(self):
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(b"abc")
            path = tmp.name
        try:
            self.assertEqual(sha256_file(path), self.ABC)
        finally:
            os.unlink(path)

    def test_stability(self):
        data = os.urandom(200_000)
        self.assertEqual(sha256_bytes(data), sha256_bytes(data))


if __name__ == "__main__":
    unittest.main()
