# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.3.0] — 2026-07-24

### Ajouté — livrables Phase 3 (hors-ligne, prêts à configurer)
- **Code testé** (Python stdlib, zéro dépendance) : normalisation fournisseur/numéro
  (`src/utils/normalize.py`), nettoyage et anti-écrasement des noms de fichiers
  (`src/utils/filenames.py`), SHA-256 (`src/utils/hashing.py`), clé de doublon
  (`src/duplicates/dedup.py`), validations totaux/SIRET (Luhn)/TVA FR/dates
  (`src/validation/validators.py`), codes d'anomalies bloquants et informatifs
  (`src/validation/anomalies.py`). **59 tests unitaires verts.**
- **Facture fictive** : générateur PDF sans dépendance
  (`scripts/generate_test_invoice.py` → `tests/fixtures/invoice-standard-fr.pdf`,
  21 Ko, FOURNITEST SARL, SIRET fictif série 999 valide Luhn, TVA 5,5 %) + 5 fixtures
  JSON (standard, doublon, montants incohérents, proforma, confiance basse).
- **Prompts IA** (`prompts/invoice-extraction-{system,user}.txt`) et **schéma JSON
  Schema 2020-12** (`schemas/invoice-extraction.schema.json`) avec les 18 codes
  d'anomalies normalisés.
- **Modèle de journal** (`templates/invoice-processing-journal.csv`, 32 colonnes,
  ligne d'exemple fictive).
- **Documentation Phase 3** : `test-t0-axonaut.md` (procédure + checklist 10 points +
  diagnostic), `gmail-labels.md` (5 libellés dont ERREURS-TECHNIQUES, filtres sans
  transfert automatique), `google-drive-structure.md` (dossiers numérotés 00–06,
  année/mois, conventions de nommage), `make-data-store.md`
  (`hd_ecommerce_invoice_registry`, 35 champs typés, statuts, rétention),
  `google-sheets-journal.md`, `make-scenario-phase-3.md` (modules tronc 1–13 +
  routes A/B/C/E détaillés), `make-filters.md` (filtres et expressions exactes),
  `manual-setup-checklist.md` (actions manuelles B1→B10 ordonnées).
- `requirements.txt` (stdlib uniquement, pytest optionnel).

### Modifié
- `make-scenario.md` marqué document historique (référence → phase 3).
- README : statut Phase 3, structure complète, commandes de test.

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
