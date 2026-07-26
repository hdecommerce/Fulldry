# Make Data Store — `hd_ecommerce_invoice_registry`

Registre anti-doublons et anti-second-envoi. C'est la **mémoire** du scénario :
aucune facture ne part deux fois vers Axonaut tant que ce registre est intact.

## 1. Création

1. Make → menu de gauche → **Data stores** → **Add data store**.
2. Nom : `hd_ecommerce_invoice_registry`.
3. **Add data structure** → nom : `invoice_registry_item` → ajouter les champs du §2.
4. Taille : 1 Mo suffit largement pour démarrer (~1 000 factures) ; prévoir la marge
   selon votre plan Make.

## 2. Champs

> Types Make disponibles : Text, Number, Boolean, Date. Les listes de valeurs sont
> des conventions à respecter par le scénario (Make ne les impose pas).

| Champ | Type | Obligatoire | Contenu |
|---|---|---|---|
| *(clé du record)* | — | ✔ | `record_key` — voir §3. La clé d'un record Make est fournie au moment du Add/Replace, elle n'est pas un champ de la structure |
| `record_key` | Text | ✔ | Copie de la clé (facilite lecture et exports) |
| `file_sha256` | Text | ✔ | Hash SHA-256 hexadécimal du fichier |
| `gmail_message_id` | Text | ✔ | ID du message Gmail source |
| `gmail_thread_id` | Text | ✔ | ID du fil Gmail |
| `attachment_id` | Text | ✖ | Identifiant de la pièce jointe si exposé par le module Gmail — `MANUAL_CONFIRMATION_REQUIRED` (sinon laisser vide) |
| `original_filename` | Text | ✔ | Nom original de la pièce jointe |
| `normalized_filename` | Text | ✖ | Nom normalisé (Route A uniquement) |
| `supplier_name` | Text | ✔ | Nom fournisseur extrait |
| `supplier_name_normalized` | Text | ✔ | Nom normalisé (minuscules/sans accents/alphanum) |
| `supplier_siret` | Text | ✖ | SIRET (14 chiffres) ou vide |
| `supplier_vat_number` | Text | ✖ | N° TVA ou vide |
| `invoice_number` | Text | ✔ | N° de facture extrait |
| `invoice_number_normalized` | Text | ✔ | N° normalisé |
| `invoice_date` | Text | ✔ | ISO AAAA-MM-JJ |
| `due_date` | Text | ✖ | ISO AAAA-MM-JJ ou vide |
| `currency` | Text | ✔ | `EUR` en V1 |
| `amount_excluding_tax` | Number | ✖ | HT |
| `vat_amount` | Number | ✖ | TVA |
| `amount_including_tax` | Number | ✔ | TTC |
| `document_type` | Text | ✔ | `invoice` (seule valeur en Route A) |
| `ai_confidence` | Number | ✔ | 0–1 |
| `validation_status` | Text | ✔ | voir §4 |
| `processing_status` | Text | ✔ | voir §4 |
| `anomaly_codes` | Text | ✖ | Codes séparés par `\|` (ex. `LOW_CONFIDENCE\|PROFORMA`) |
| `drive_original_file_id` | Text | ✔ | ID Drive du fichier archivé |
| `drive_original_url` | Text | ✔ | webViewLink de l'original |
| `drive_processed_file_id` | Text | ✖ | ID de la copie classée |
| `drive_processed_url` | Text | ✖ | webViewLink de la copie |
| `axonaut_import_method` | Text | ✔ | `email_forward` (V1) ou `api_create_expense` (Plan B) |
| `axonaut_forwarded_at` | Date | ✖ | Horodatage de l'envoi à expense@axonaut.com |
| `axonaut_expense_id` | Text | ✖ | Toujours vide en V1 (réservé Plan B) |
| `created_at` | Date | ✔ | Création du record |
| `updated_at` | Date | ✔ | Dernière mise à jour |
| `scenario_version` | Text | ✔ | ex. `1.0.0` |
| `retry_count` | Number | ✔ | Tentatives techniques (0 par défaut) |
| `last_error` | Text | ✖ | Dernier message d'erreur technique (sans secret) |

## 3. Clés

**Clé primaire (clé du record Make)** — calculée par l'expression `dedup_key`
(`make-filters.md` §5) :

- SIRET présent et valide (14 chiffres) :
  `supplier_siret` + `-` + `invoice_number_normalized` + `-` + `amount_including_tax` (2 décimales)
  → `99900000110000-ft2026001-211.00`
- SIRET absent/invalide :
  `supplier_name_normalized` + `-` + `invoice_number_normalized` + `-` + montant
  → `fournitestsarl-ft2026001-211.00`

Normalisations (identiques dans `src/utils/normalize.py` et les expressions Make) :
minuscules, sans espaces, sans accents (translittérés), sans caractères spéciaux,
montant `formatNumber(x; 2; "."; "")`.

**Contrôle secondaire** : `file_sha256`. Le module « Search Records » filtré sur
`file_sha256` détecte le même fichier renvoyé sous un autre nom/numéro
(voir `make-filters.md` §3). Jamais de déduplication par nom de fichier ou ID Gmail.

## 4. Statuts autorisés

`processing_status` (cycle de vie technique) :

| Valeur | Signification |
|---|---|
| `received` | Pièce jointe détectée, archivée dans Drive |
| `extracted` | JSON IA obtenu et parsé |
| `validated` | Contrôles de cohérence passés |
| `sending` | Envoi vers Axonaut EN COURS (posé juste avant l'email) |
| `sent_to_axonaut` | Email parti — état final nominal V1 |
| `duplicate` | Doublon détecté, jamais envoyé |
| `anomaly` | Anomalie fonctionnelle, jamais envoyé |
| `technical_error` | Échec technique, retraitable |
| `completed` | Réservé (fin de cycle après validation, V1.1) |
| `failed` | Échec définitif après 3 tentatives |

`validation_status` (côté humain/Axonaut) :

| Valeur | Signification |
|---|---|
| `pending_axonaut_validation` | Dépense à valider dans Axonaut (Route A) |
| `validated_in_axonaut` | Mise à jour MANUELLE (ou V1.1) après validation |
| `rejected` | Rejetée par l'humain dans Axonaut (mise à jour manuelle) |
| `not_applicable` | Routes B/C/E (rien à valider dans Axonaut) |

`axonaut_import_method` : `email_forward` \| `api_create_expense`.

## 5. Règles d'actualisation

1. **Route A uniquement** crée un record complet : d'abord `processing_status =
   sending` (AVANT l'email), puis mise à jour `sent_to_axonaut` + `axonaut_forwarded_at`
   (APRÈS l'email). Un record bloqué en `sending` = plantage entre les deux → alerte,
   arbitrage humain, jamais de renvoi automatique.
2. **Route B ne modifie jamais le record existant** (il décrit le premier traitement,
   qui fait foi) — le doublon est journalisé dans Google Sheets et l'alerte.
3. **Routes C et E** ne créent pas de record sous la clé principale (une facture en
   anomalie doit pouvoir être retraitée après correction sans être vue comme doublon).
   L'erreur technique incrémente `retry_count`/`last_error` **si** un record existe
   déjà (échec après `sending`).
4. `updated_at` est renseigné à chaque Add/Replace ; `created_at` uniquement à la création.
5. Aucune suppression automatique de record par le scénario.

## 6. Durée de conservation

- **Registre Data Store** : conserver au minimum **24 mois glissants**. Purger un
  record réactive le risque de doublon pour cette facture — ne purger que des
  exercices clos et archivés. La purge est un acte manuel documenté.
- **Journal Google Sheets + PDF Drive** : conservation **10 ans** (obligation
  comptable française sur les pièces justificatives) — voir `google-sheets-journal.md`.
- RGPD : le registre ne contient aucune donnée personnelle au-delà des mentions
  professionnelles de facturation ; pas d'IBAN dans le Data Store.
