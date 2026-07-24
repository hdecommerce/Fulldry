# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.2.0] — 2026-07-24

### Modifié — décision d'architecture V1
- **Import Axonaut par envoi email à `expense@axonaut.com`** (ingestion officielle :
  OCR Axonaut + création d'une dépense « à traiter » avec justificatif joint), à la
  place de la création de dépense par API. Une seule méthode d'import — jamais les
  deux — pour éviter tout doublon dans Axonaut.
- `docs/architecture.md` réécrit : nouveau flux Route A (envoi email, séquence
  Data Store idempotente anti-second-envoi), libellé `FACTURES/ENVOYEES-AXONAUT`,
  dossier Drive `ENVOYÉES AXONAUT/`, Plan B documenté (§10).
- `docs/audit-make-axonaut.md` : points bloquants §5.1/§5.2 résolus —
  « Create an Expense » confirmé disponible dans le connecteur Make (champs à relever
  dans le module connecté, réservé au Plan B) ; rattachement du justificatif par API
  toujours non confirmé et à ne pas présenter comme fonctionnel sans test réel.
- `README.md` mis à jour (statuts, flux, libellés).

### Ajouté — livrables Phase 2
- `docs/make-scenario.md` : liste ordonnée des 22 modules Make, filtres des routes
  A/B/C, structure du Data Store `invoices_processed` et du journal Google Sheets,
  expressions Make (normalisation, clé de déduplication, contrôles), prompt IA final,
  payload HTTP de l'appel Claude, procédure de test T0→T8 avec facture fictive,
  check-list de configuration manuelle dans Make, Plan B détaillé.
- `examples/invoice-output.json` : exemple de sortie d'extraction (données fictives).

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
