# Journal d'audit — Google Sheets

Le journal est la trace lisible de **chaque** événement de traitement (une ligne par
pièce jointe traitée, y compris doublons, anomalies et erreurs). Le Data Store est la
mémoire technique ; le journal est le registre d'audit humain.

## 1. Créer la feuille depuis le modèle

Le modèle est fourni : [`templates/invoice-processing-journal.csv`](../templates/invoice-processing-journal.csv)
(32 colonnes + 1 ligne d'exemple fictive).

1. Ouvrir [sheets.google.com](https://sheets.google.com) avec le compte connecté à Make
   → **Vide** (nouvelle feuille).
2. Nommer le classeur : `JOURNAL FACTURES FOURNISSEURS - HD ECOMMERCE`.
3. Menu **Fichier → Importer → Importer un fichier → Parcourir** → sélectionner
   `invoice-processing-journal.csv`.
4. Options d'importation : **Remplacer la feuille active** · Type de séparateur :
   **virgule** · « Convertir le texte en nombres et dates » : **NON**
   (⚠️ important : les SIRET, IDs Gmail et hash doivent rester du texte — sinon
   Sheets tronque les grands nombres).
5. **Importer les données**.
6. Renommer l'onglet : `journal`.
7. Figer la ligne d'en-tête : sélectionner la ligne 1 → **Affichage → Figer →
   1 ligne**.
8. Formater la colonne A à T en **Texte brut** : sélectionner les colonnes →
   **Format → Nombre → Texte brut** (protège SIRET/hash/IDs).
9. **Supprimer la ligne d'exemple** (ligne 2) une fois le mapping Make validé — la
   garder pendant la construction du scénario aide à vérifier le mapping.

## 2. Colonnes (ordre exact du modèle)

`event_id` · `timestamp` · `scenario_version` · `processing_status` ·
`validation_status` · `gmail_message_id` · `gmail_thread_id` · `original_filename` ·
`normalized_filename` · `file_sha256` · `supplier_name` · `supplier_siret` ·
`invoice_number` · `invoice_date` · `due_date` · `currency` ·
`amount_excluding_tax` · `vat_amount` · `amount_including_tax` · `document_type` ·
`ai_confidence` · `anomaly_codes` · `drive_original_url` · `drive_processed_url` ·
`axonaut_import_method` · `axonaut_forwarded_at` · `axonaut_expense_id` ·
`retry_count` · `processing_duration_ms` · `ai_model` · `last_error` ·
`manual_review_notes`

Conventions :
- `event_id` = `dedup_key` + `-` + horodatage compact (`AAAAMMJJHHMMSS`) — unique
  par événement, y compris pour les doublons du même document.
- `anomaly_codes` : codes séparés par `|`.
- `manual_review_notes` : colonne réservée aux humains — Make n'y écrit jamais.
- **Jamais d'IBAN ni de secret dans le journal.**

## 3. Connecter Make

1. Dans le scénario, ajouter **Google Sheets — Add a Row** (modules 16/20 selon la
   route — voir `make-scenario-phase-3.md`).
2. Connection : le compte Google du classeur → autoriser l'accès Sheets.
3. Spreadsheet : `JOURNAL FACTURES FOURNISSEURS - HD ECOMMERCE` · Sheet : `journal`.
4. « Table contains headers » : **Oui** → Make affiche chaque colonne par son nom :
   mapper selon le tableau de mapping de `make-scenario-phase-3.md`.
5. **Vérification** : exécuter le module seul (« Run this module only ») avec des
   valeurs bidon → une ligne apparaît, chaque valeur dans la bonne colonne →
   supprimer la ligne de test.

## 4. Protection et conservation

- Partage du classeur : lecture seule pour les consultants du journal, écriture pour
  le compte Make et l'administrateur uniquement.
- **Ne jamais trier/supprimer des lignes** : pour l'analyse, dupliquer dans un autre
  onglet ou utiliser des vues filtrées (**Données → Vues filtrées**).
- Conservation : 10 ans (pièces comptables). Chaque début d'année, dupliquer le
  classeur en archive (`JOURNAL ... - ARCHIVE 2026`) et continuer sur le classeur
  courant si le volume dépasse ~30 000 lignes.
- Sauvegarde : le plan de sauvegarde global (Drive + export mensuel) est décrit dans
  la doc de mise en production (Phase 5).
