# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.1.0] — 2026-07-24

### Ajouté
- Structure initiale du projet (`src/`, `tests/`, `docs/`, `examples/`).
- `README.md` : présentation, périmètre, règles impératives.
- `.env.example` et `.gitignore` (aucun secret versionné).
- `docs/architecture.md` : architecture cible du scénario Make (Routes A/B/C),
  arborescence Drive, libellés Gmail, schéma JSON d'extraction, contrôles de
  cohérence, clé de déduplication, structure Data Store et journal d'audit.
- `docs/audit-make-axonaut.md` : audit Phase 1 — modules Make et endpoints
  Axonaut vérifiés, limitations identifiées, points bloquants à confirmer.

### Notes
- Phase 1 (audit) uniquement — aucun scénario Make construit, aucun code exécutable.
- Point critique documenté : la création de dépense (`POST /expenses`) et le
  rattachement du justificatif à une dépense doivent être confirmés dans le
  connecteur Make et la doc officielle Axonaut avant la Phase 3.
