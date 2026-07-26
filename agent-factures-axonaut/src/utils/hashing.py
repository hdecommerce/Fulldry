"""Calcul du SHA-256 des justificatifs (contrôle secondaire anti-doublons)."""

import hashlib


def sha256_bytes(data: bytes) -> str:
    """SHA-256 hexadécimal (minuscules) d'un contenu binaire."""
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str) -> str:
    """SHA-256 hexadécimal d'un fichier, lu par blocs (fichiers volumineux)."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()
