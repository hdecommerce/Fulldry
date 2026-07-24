# Checklist des actions manuelles — Phase 3

## A. Déjà fait par le projet (rien à faire de votre côté)

- Code : normalisation, nettoyage de noms de fichiers, SHA-256, clé de doublon,
  validation des totaux/SIRET/TVA/dates, codes d'anomalies (`src/`) — **59 tests
  unitaires, tous verts** (`python3 -m unittest discover -s tests/unit`).
- Facture fictive PDF de test : `tests/fixtures/invoice-standard-fr.pdf`
  (régénérable : `python3 scripts/generate_test_invoice.py`).
- Fixtures JSON des 5 cas de test (`tests/fixtures/*.json`).
- Prompts IA (`prompts/`), schéma JSON (`schemas/invoice-extraction.schema.json`).
- Modèle de journal (`templates/invoice-processing-journal.csv`).
- Documentation complète : T0, libellés Gmail, structure Drive, Data Store, journal
  Sheets, scénario module par module, filtres et expressions (`docs/`).

## B. Actions à faire dans vos comptes — DANS CET ORDRE

> Chaque action indique : écran → menu → valeur exacte → résultat attendu → vérification.
> Les points `MANUAL_CONFIRMATION_REQUIRED` sont des informations à relever dans
> l'interface et à reporter dans les docs concernées.

### B1. Test T0 — valider l'ingestion Axonaut ⭐ PREMIÈRE ACTION

| | |
|---|---|
| Écran | Gmail (boîte dédiée) + Axonaut → Dépenses |
| Procédure complète | **`docs/test-t0-axonaut.md`** (préparation, envoi, checklist 10 points) |
| Valeurs | Destinataire `expense@axonaut.com` · objet `Facture FOURNITEST SARL - FT-2026-001` · pièce jointe `tests/fixtures/invoice-standard-fr.pdf` |
| Résultat attendu | Dépense « à traiter » dans Axonaut, PDF joint, non payée |
| Vérification | Checklist T0 §6 ; reporter VERT/ROUGE dans le doc §9 |
| Si ROUGE | **STOP** — diagnostic §8, puis décision Plan B ensemble. Ne rien construire dans Make |

### B2. Libellés Gmail

| | |
|---|---|
| Écran | Gmail → roue dentée → Voir tous les paramètres → onglet **Libellés** |
| Valeurs | `FACTURES` puis 5 sous-libellés : `A-TRAITER`, `ENVOYEES-AXONAUT`, `DOUBLONS`, `ANOMALIES`, `ERREURS-TECHNIQUES` (sans accents) |
| Procédure | `docs/gmail-labels.md` §1 |
| Vérification | Recherche `label:FACTURES-A-TRAITER` reconnue par Gmail |

### B3. Filtre Gmail d'entrée

| | |
|---|---|
| Écran | Gmail → Paramètres → **Filtres et adresses bloquées** → Créer un filtre |
| Valeur | Requête et action exactes : `docs/gmail-labels.md` §2 — action = appliquer `FACTURES/A-TRAITER` **uniquement** (jamais de transfert automatique) |
| Vérification | S'envoyer le PDF de test avec objet « Facture de test » → libellé appliqué automatiquement |

### B4. Dossiers Google Drive

| | |
|---|---|
| Écran | drive.google.com (compte qui sera connecté à Make) → Nouveau → Dossier |
| Valeurs | Arborescence exacte : `docs/google-drive-structure.md` §1 (7 dossiers numérotés + `2026/07_JUILLET` dans 00 et 02) |
| Résultat attendu | IDs relevés depuis les URLs et reportés dans le tableau du doc |
| Vérification | Chaque URL de dossier s'ouvre ; IDs notés |

### B5. Feuille Google Sheets (journal)

| | |
|---|---|
| Écran | sheets.google.com → Vide → Fichier → Importer |
| Valeurs | Importer `templates/invoice-processing-journal.csv` · classeur `JOURNAL FACTURES FOURNISSEURS - HD ECOMMERCE` · onglet `journal` · « Convertir texte en nombres » : **NON** |
| Procédure | `docs/google-sheets-journal.md` §1 |
| Vérification | 32 en-têtes en ligne 1, ligne 1 figée, colonnes SIRET/hash en texte brut |

### B6. Connexions Make

| | |
|---|---|
| Écran | make.com → votre organisation → **Connections** (ou à la volée dans chaque module) |
| Valeurs | 1. Gmail (boîte dédiée — autoriser lecture, libellés, envoi) · 2. Google Drive (même compte) · 3. Google Sheets · 4. Clé Anthropic : créer la connexion du module Anthropic Claude OU un « keychain » pour le header `x-api-key` du module HTTP — **la clé ne doit jamais apparaître en clair dans un module** |
| Vérification | Chaque connexion testée verte dans Make |

### B7. Data Store Make

| | |
|---|---|
| Écran | make.com → **Data stores** → Add data store |
| Valeurs | Nom `hd_ecommerce_invoice_registry` · structure `invoice_registry_item` · champs exacts : `docs/make-data-store.md` §2 |
| Vérification | Le Data Store apparaît avec tous les champs typés ; « Browse » montre 0 record |

### B8. Construction du scénario Make

| | |
|---|---|
| Écran | make.com → **Scenarios** → Create a new scenario |
| Valeurs | Nom `FACTURES-HD-V1` · modules et mappings : **`docs/make-scenario-phase-3.md`** · filtres : **`docs/make-filters.md`** · planification 15 min · « Allow storing incomplete executions » : activé |
| À relever pendant la construction (`MANUAL_CONFIRMATION_REQUIRED`) | 1. Le module Gmail « Watch Emails » expose-t-il bien `attachments[].data` (option à cocher) ? Existe-t-il « Download an Attachment » dans votre version ? · 2. Intitulé exact du module de libellés (« Modify email labels ») · 3. Le module Anthropic Claude accepte-t-il un PDF ? sinon HTTP §8 · 4. `sha256()` stable sur binaire ? · 5. Intitulés Data Store (« Check the existence of a record », « Search records », « Update a record ») |
| Vérification | Le scénario se sauvegarde sans erreur de mapping ; exécution à vide (aucun email libellé) = 1 opération, 0 erreur |

### B9. Relever les champs « Create an Expense » (Plan B — 5 min, sans exécution)

| | |
|---|---|
| Écran | Dans un scénario **brouillon séparé**, ajouter le module Axonaut → Create an Expense (connexion Axonaut par clé API : Axonaut → Paramètres → API) |
| Valeurs | **Ne pas exécuter, ne pas sauvegarder dans FACTURES-HD-V1** — noter les champs affichés (montants, dates, statut payé, description, pièce jointe ?) dans `docs/audit-make-axonaut.md` §5.1 |
| Vérification | Champs documentés ; brouillon supprimé |

### B10. Premier test réel (T1)

| | |
|---|---|
| Écran | Gmail + Make (Run once) + Axonaut + Drive + Sheets |
| Procédure | `make-scenario.md` §8 T1 (adapté à la numérotation Phase 3) : envoi du PDF de test libellé `A-TRAITER` → Run once → vérifier chaque bulle d'exécution → dépense dans Axonaut → record Data Store `sent_to_axonaut` → ligne journal → copie Drive → libellés |
| Vérification | Checklist T1 complète, puis T2 (doublon) → T7 (panne) |

## C. Ce qui reste interdit pendant toute la Phase 3

- Aucun module Axonaut dans `FACTURES-HD-V1` (l'email A15 est la seule sortie).
- Aucun paiement, aucune validation automatique, aucune suppression.
- Aucune vraie facture tant que T1–T7 ne sont pas verts (uniquement les documents
  fictifs FOURNITEST).
- Aucune clé API dans Git, dans le chat, ou en clair dans un module Make.
