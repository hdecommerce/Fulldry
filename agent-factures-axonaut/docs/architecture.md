# Architecture cible — Agent IA Factures Fournisseurs

> **Statut : projet d'architecture (Phase 1/2).** Les noms exacts de certains modules
> Make et deux capacités Axonaut (création de dépense, rattachement du justificatif)
> doivent être confirmés dans les comptes réels — voir `audit-make-axonaut.md`.
> Rien dans ce document ne doit être construit avant cette confirmation.

## 1. Vue d'ensemble

Un scénario Make principal orchestre le flux. Le code (Python ou Node.js) n'intervient
que pour les traitements que Make fait mal : normalisation fine, validations complexes,
hash SHA-256 de fichiers, appels API absents du connecteur Axonaut.

```
┌─────────┐   ┌──────────┐   ┌────────┐   ┌───────────────┐   ┌──────────┐
│  Gmail   │→→│ Iterator  │→→│ Filtre │→→│ Drive ARCHIVES │→→│ IA (OCR)  │
│ Watch    │  │ pièces    │  │ type + │  │ ORIGINALES     │  │ Claude    │
│ Emails   │  │ jointes   │  │ taille │  │ (original)     │  │ → JSON    │
└─────────┘   └──────────┘   └────────┘   └───────────────┘   └──────────┘
                                                                    ↓
┌──────────────┐   ┌────────────────┐   ┌───────────────┐   ┌────────────┐
│ Router Make   │←←│ Data Store      │←←│ Contrôles de   │←←│ Parse JSON  │
│ A / B / C     │  │ (doublons)      │  │ cohérence      │  │ + variables │
└──────────────┘   └────────────────┘   └───────────────┘   └────────────┘
   ↓ Route A (valide)                ↓ Route B (doublon)      ↓ Route C (anomalie)
   Axonaut : recherche fournisseur   Drive → DOUBLONS         Drive → ANOMALIES
   → création si absent (règles)     Libellés Gmail           Libellés Gmail
   → création dépense (non payée)    Alerte email             Alerte email
   → justificatif (voir §8)          Journal                  Journal
   → Journal → Drive TRAITÉES
   → Libellés Gmail
```

## 2. Déclencheur Gmail

- Module : **Gmail — Watch Emails** (avec récupération des pièces jointes activée).
- Requête de recherche : `label:FACTURES-A-TRAITER has:attachment`.

> ⚠️ Recommandation : nommer les libellés **sans accents ni espaces**
> (`FACTURES/A-TRAITER`, `FACTURES/TRAITEES`, `FACTURES/DOUBLONS`, `FACTURES/ANOMALIES`).
> Les recherches Gmail sur des libellés accentués avec espaces sont fragiles dans les
> requêtes `label:` (Gmail remplace espaces par `-` en interne). L'affichage humain
> peut garder les accents ; la requête API non.

Libellés à créer :

| Libellé | Rôle |
|---|---|
| `FACTURES/A-TRAITER` | File d'attente d'entrée |
| `FACTURES/TRAITEES` | Facture traitée avec succès (Route A) |
| `FACTURES/DOUBLONS` | Doublon détecté (Route B) |
| `FACTURES/ANOMALIES` | Anomalie ou erreur technique (Route C) |

## 3. Itération et filtrage des pièces jointes

- **Flow Control — Iterator** sur le tableau des pièces jointes de l'email.
- Filtre Make (entre Iterator et suite) :
  - `mimeType` ∈ {`application/pdf`, `image/jpeg`, `image/png`} ;
  - taille ≥ 15 360 octets (exclut signatures et logos) ;
  - nom de fichier ne se termine pas par `.exe`, `.zip`, `.rar`, `.7z` (V1 : archives ignorées).

## 4. Archivage immédiat de l'original (avant toute analyse)

- **Google Drive — Upload a File** vers `FACTURES FOURNISSEURS/HD ECOMMERCE/ARCHIVES ORIGINALES/`.
- Le fichier original n'est **jamais modifié ni supprimé**, quel que soit le résultat.

Arborescence Drive :

```
FACTURES FOURNISSEURS/
└── HD ECOMMERCE/
    ├── À CONTROLER/           (option validation humaine)
    ├── TRAITÉES/
    ├── DOUBLONS/
    ├── ANOMALIES/
    └── ARCHIVES ORIGINALES/   (copie brute systématique)
```

Nom normalisé après traitement (copie de travail, pas l'original) :
`AAAA-MM-JJ_FOURNISSEUR_NUMERO-FACTURE_MONTANT-TTC_EUR.pdf`
Exemple : `2026-07-20_GOOGLE_FR-4587_1055.00_EUR.pdf`
Nettoyage : suppression de `/ \ : * ? " < > |`, accents translittérés, espaces → `-`.

## 5. Analyse IA

- Appel de l'API Anthropic (Claude) avec le document en entrée
  (les PDF sont acceptés nativement par l'API Messages via un bloc `document` en base64 ;
  les images via un bloc `image`).
- Si le module Make « Anthropic Claude » ne permet pas de joindre un PDF, utiliser
  **HTTP — Make a Request** vers `https://api.anthropic.com/v1/messages` (voir audit §4).
- Sortie attendue : **exclusivement** le JSON du §6. `response_format`/consigne stricte +
  **JSON — Parse JSON** avec gestionnaire d'erreur (JSON invalide → Route C).

### Prompt système (base)

> Tu es un moteur d'extraction documentaire spécialisé dans les factures fournisseurs
> françaises. Analyse le document fourni. Retourne exclusivement un JSON valide conforme
> au schéma demandé. Ne retourne aucun commentaire, aucune balise Markdown et aucun texte
> en dehors du JSON. N'invente jamais une donnée absente. Utilise null lorsqu'une donnée
> n'est pas disponible. Vérifie mathématiquement les montants. Identifie les éventuelles
> anomalies. Le score confidence doit refléter la qualité réelle de l'extraction.

Règles additionnelles : ne pas deviner le SIRET ; ne pas confondre client/fournisseur,
date de facture/échéance, HT/TTC ; conserver les décimales ; dates ISO `AAAA-MM-JJ` ;
conserver la devise détectée ; signaler toute incohérence et tout multi-taux de TVA ;
ne pas classer un devis ou une proforma comme facture.

## 6. Schéma JSON d'extraction

```json
{
  "company": "HD ECOMMERCE",
  "supplier_name": "Nom du fournisseur",
  "supplier_siret": "12345678900012",
  "supplier_vat_number": "FR12345678901",
  "supplier_address": "Adresse complète",
  "supplier_country": "FR",
  "invoice_number": "FA-2026-458",
  "invoice_date": "2026-07-20",
  "due_date": "2026-08-20",
  "currency": "EUR",
  "amount_excluding_tax": 1000.00,
  "vat_amount": 55.00,
  "amount_including_tax": 1055.00,
  "vat_breakdown": [
    { "rate": 5.5, "taxable_amount": 1000.00, "vat_amount": 55.00 }
  ],
  "document_type": "invoice",
  "purchase_order_number": null,
  "iban": null,
  "confidence": 0.97,
  "anomalies": [],
  "raw_summary": "Résumé court de la facture"
}
```

`document_type` ∈ {`invoice`, `credit_note`, `receipt`, `proforma`, `delivery_note`, `unknown`}.
**V1 : seul `invoice` part en Route A ; tout le reste part en Route C.**

> Sécurité : le champ `iban` est extrait pour contrôle interne éventuel mais **masqué**
> dans le journal, les alertes et les logs (affichage `FRxx••••••••`).

## 7. Contrôles de cohérence (avant routage)

Facture **valide** (Route A) uniquement si TOUTES les conditions sont vraies :

| # | Contrôle |
|---|---|
| 1 | `confidence >= 0.95` |
| 2 | `company == "HD ECOMMERCE"` |
| 3 | `invoice_number` non vide |
| 4 | `supplier_name` non vide |
| 5 | `invoice_date` valide (et non aberrante dans le futur) |
| 6 | `amount_including_tax > 0` |
| 7 | `currency == "EUR"` |
| 8 | `document_type == "invoice"` |
| 9 | `abs((HT + TVA) − TTC) <= 0.02` |
| 10 | Multi-taux : Σ bases HT = HT total ± 0,02 € et Σ TVA = TVA total ± 0,02 € |
| 11 | SIRET (si présent) : 14 chiffres |
| 12 | N° TVA FR (si présent) : structure `FR` + 2 caractères + 9 chiffres SIREN |
| 13 | `due_date >= invoice_date` (si présente) |
| 14 | Montant TTC « raisonnable » (plafond paramétrable, ex. ≤ 50 000 €) |

Chaque échec ajoute une entrée dans `anomalies[]` ; toute anomalie ⇒ Route C.
Doublon (voir §9) ⇒ Route B, prioritaire sur A.

## 8. Route A — Axonaut

1. **Recherche fournisseur** : par SIRET d'abord (si présent), sinon par nom normalisé.
2. **Fournisseur existant** → utiliser son identifiant. Jamais deux fournisseurs de même SIRET.
3. **Fournisseur absent** → création uniquement si : `supplier_name` présent, SIRET valide,
   `confidence >= 0.98`, adresse ou pays disponible. Sinon Route C (validation humaine).
4. **Création de la dépense** : HT, TVA, TTC, n° de facture, date, échéance, statut **non payé**,
   description avec la mention « Créée automatiquement — validation requise » + lien Drive.
5. **Justificatif** : ⚠️ le rattachement direct d'un fichier à une dépense n'est **pas
   confirmé** dans l'API Axonaut (voir audit §3). Solution de repli actée : lien Drive
   dans la description + document ajouté à la fiche société Axonaut
   (`POST /companies/{id}/documents`) si l'upload de fichier y est réellement supporté.
   Ne jamais simuler une réussite.
6. Journal (`expense_created`), déplacement Drive → `TRAITÉES/`, libellés Gmail.

## 9. Détection des doublons (Data Store Make)

Clé primaire normalisée :
- avec SIRET : `siret + "-" + invoice_number_normalisé + "-" + ttc(2 décimales)` ;
- sans SIRET : `supplier_name_normalisé + "-" + invoice_number_normalisé + "-" + ttc`.

Normalisation : minuscules, sans espaces, sans accents, sans caractères spéciaux.
Exemple : `93776694700000-fa2026-458-1055.00`.

Contrôle secondaire : hash **SHA-256 du fichier** (même fichier renvoyé deux fois).
Ne jamais se fier au nom de fichier ni à l'ID du message Gmail seul.

Enregistrement Data Store (`invoices_processed`) :

| Champ | Type |
|---|---|
| `key` (clé unique normalisée) | text (clé du record) |
| `file_hash_sha256` | text |
| `supplier_name` / `supplier_siret` | text |
| `invoice_number` / `invoice_date` | text / date |
| `amount_including_tax` | number |
| `axonaut_supplier_id` / `axonaut_expense_id` | text |
| `gmail_message_id` / `gmail_thread_id` | text |
| `drive_original_url` / `drive_processed_url` | text |
| `processed_at` | date |
| `status` | text |

L'écriture dans le Data Store se fait **après** la création réussie de la dépense
(sinon un échec Axonaut bloquerait le retraitement) ; l'existence est vérifiée **avant**
le Router (module *Data Store — Check the existence of a record*).

## 10. Journal d'audit

Support V1 : Google Sheets (simple, lisible) ; migration Supabase/PostgreSQL possible.
Colonnes : `event_id`, `timestamp`, `gmail_message_id`, `gmail_thread_id`,
`attachment_name`, `attachment_hash`, `supplier_name`, `supplier_siret`,
`invoice_number`, `invoice_date`, `amount_excluding_tax`, `vat_amount`,
`amount_including_tax`, `confidence`, `status`, `anomaly_reason`,
`axonaut_supplier_id`, `axonaut_expense_id`, `drive_original_url`,
`drive_processed_url`, `processing_duration`, `ai_model`, `scenario_version`.

Statuts : `received`, `extracted`, `validated`, `duplicate`, `anomaly`,
`supplier_created`, `expense_created`, `completed`, `failed`.

## 11. Gestion des erreurs

Chaque module critique porte un gestionnaire d'erreur Make (directives *Break* avec
retry, *Resume*, *Ignore* selon le cas) :

- Erreurs **techniques** (Gmail/Drive/IA/Axonaut indisponibles, timeout) :
  retry ×3 avec délai progressif (Break), puis Route C + alerte. L'email **garde** son
  libellé `A-TRAITER` (pas de perte), l'original reste archivé.
- Erreurs **fonctionnelles** (JSON invalide, doublon, données incohérentes) :
  pas de retry — routage direct B ou C.
- Aucune erreur silencieuse : tout échec écrit une ligne `failed` au journal et
  déclenche une alerte email détaillée (sans données sensibles).
- Idempotence : le Data Store empêche la création d'un doublon Axonaut lors d'un rejeu.

## 12. Sécurité

- Clés dans les **connexions Make** / variables d'environnement / coffre-fort — jamais en clair
  dans les modules, jamais dans Git (`.env` ignoré, `.env.example` vide).
- Masquage systématique : IBAN, clés API, tokens, données bancaires (logs, journal, alertes).
- Moindre privilège : Gmail (`gmail.modify` : lecture + libellés, pas de suppression),
  Drive limité au dossier `FACTURES FOURNISSEURS/`, Axonaut par clé API dédiée.
- RGPD : données conservées dans l'UE quand l'option existe ; factures réelles jamais
  versionnées dans Git ; journal limité aux données comptables nécessaires.

## 13. Extension multi-sociétés (préparée, non construite)

L'architecture isole la société dans : le champ `company` du JSON, un sous-dossier Drive
par société, un préfixe de clé Data Store, et une table de configuration
(société → dossier Drive, connexion Axonaut, libellés Gmail). Ajouter **BUSINESS** ou
**MIX TERROIR** = ajouter une ligne de configuration + une branche de Router — sans
refonte du scénario. V1 : toute facture dont `company ≠ HD ECOMMERCE` part en Route C
(« société inconnue »).

## 14. Validation humaine (V1)

- Dépenses créées non payées, mention « validation requise » — la validation se fait
  **dans Axonaut** par un humain.
- Nouveaux fournisseurs : création automatique seulement dans le cas strict du §8.3 ;
  sinon anomalie → décision humaine.
- Les anomalies et doublons ne sont jamais retraités automatiquement.
