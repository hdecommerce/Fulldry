# Architecture cible V1 — Agent IA Factures Fournisseurs

> **Décision d'architecture (2026-07-24, validée par HD ECOMMERCE) :**
> en version 1, l'import dans Axonaut se fait par **envoi de la facture à
> `expense@axonaut.com`** (ingestion officielle Axonaut : réception, OCR, création
> d'une dépense dans « Dépenses à traiter » avec le justificatif joint).
> Le module Make « Axonaut — Create an Expense » existe et est réservé au **Plan B**
> (§10). **Une seule méthode d'import est utilisée — jamais les deux — pour ne
> jamais créer de doublon dans Axonaut.**

## 1. Vue d'ensemble

Make orchestre tout le flux amont : détection, archivage, extraction IA, contrôles,
déduplication. Axonaut réalise l'OCR final et crée la dépense « à traiter ».
La validation reste **humaine, dans Axonaut**. Aucun paiement n'est jamais déclenché.

```
Gmail — Watch Emails (label FACTURES AXONAUT, has:attachment)
  → Iterator pièces jointes
  → Filtre PDF/JPG/PNG, ≥ 15 Ko
  → Archivage de l'original dans Drive (ARCHIVES ORIGINALES) — jamais modifié
  → Analyse IA (Claude) → Parse JSON
  → Normalisation + contrôles de cohérence
  → Contrôle des doublons (Data Store)
  → Router
      ├─ Route A — VALIDE
      │    → email avec la pièce jointe originale vers expense@axonaut.com
      │    → enregistrement Data Store (hash, n° facture, fournisseur, TTC, ID Gmail)
      │    → statut « envoyée à Axonaut — validation requise »
      │    → journal → copie Drive « ENVOYÉES AXONAUT » (nom normalisé)
      │    → libellé Gmail FACTURES AXONAUT/ENVOYEES, retrait FACTURES AXONAUT
      ├─ Route B — DOUBLON
      │    → AUCUN envoi à Axonaut
      │    → libellé FACTURES AXONAUT/DOUBLONS, retrait FACTURES AXONAUT
      │    → journal + alerte (détails du doublon)
      └─ Route C — ANOMALIE (route par défaut)
           → AUCUN envoi à Axonaut
           → copie Drive « ANOMALIES »
           → libellé FACTURES AXONAUT/ANOMALIES, retrait FACTURES AXONAUT
           → journal + alerte détaillée
```

Le détail opérationnel (modules ordonnés, filtres, expressions, tests, configuration)
est dans **[`make-scenario.md`](make-scenario.md)**.

## 2. Rôle de chaque brique

| Brique | Rôle | Ne fait jamais |
|---|---|---|
| Gmail | File d'entrée (libellés), envoi vers Axonaut, alertes | Suppression d'emails |
| Google Drive | Archivage immuable des originaux + classement des copies | Suppression de fichiers |
| Claude API | Extraction JSON + score de confiance (pré-contrôle qualité **avant** envoi à Axonaut) | Décision finale |
| Make Data Store | Base anti-doublons / anti-second-envoi | — |
| Google Sheets | Journal d'audit V1 | — |
| Axonaut (`expense@axonaut.com`) | OCR officiel + création de la dépense « à traiter » avec justificatif | Paiement, validation |
| Humain (dans Axonaut) | Validation finale de chaque dépense | — |

Intérêt de garder l'analyse IA en amont alors qu'Axonaut refait un OCR : c'est elle
qui permet le **tri qualité** (anomalies bloquées avant Axonaut), la **déduplication
fiable** (clé métier + hash) et le **journal d'audit** — l'OCR Axonaut ne fournit rien
de tout cela côté Make.

## 3. Déclencheur et libellés Gmail

Requête du trigger : `label:FACTURES-AXONAUT has:attachment`.

| Libellé | Rôle |
|---|---|
| `FACTURES AXONAUT` | **File d'attente d'entrée** : glisser un email de facture sur ce libellé (« dossier ») déclenche son traitement au cycle Make suivant |
| `FACTURES AXONAUT/ENVOYEES` | Facture transmise à Axonaut — validation requise (Route A) |
| `FACTURES AXONAUT/DOUBLONS` | Doublon détecté, non transmise (Route B) |
| `FACTURES AXONAUT/ANOMALIES` | Anomalie fonctionnelle, non transmise (Route C) |
| `FACTURES AXONAUT/ERREURS-TECHNIQUES` | Erreur technique — l'email garde aussi `FACTURES AXONAUT` pour être retraité (Route E) |

> Libellés **sans accents ni espaces** dans les identifiants (les requêtes `label:`
> sur libellés accentués/espacés sont fragiles). L'affichage humain reste libre.

Filtre pièces jointes : `application/pdf`, `image/jpeg`, `image/png` ; taille ≥ 15 360
octets ; exclusion `.exe`, `.zip`, `.rar`, `.7z` (V1), images de signature et logos
(exclus de fait par le seuil de taille).

## 4. Arborescence Google Drive

```
FACTURES FOURNISSEURS/
└── HD ECOMMERCE/
    ├── ENVOYÉES AXONAUT/      (copies renommées des factures transmises — Route A)
    ├── DOUBLONS/              (copies des doublons — Route B, optionnel)
    ├── ANOMALIES/             (copies des anomalies — Route C)
    ├── À CONTROLER/           (réservé : option validation humaine renforcée)
    └── ARCHIVES ORIGINALES/   (copie brute systématique, AVANT toute analyse)
```

- L'original est archivé **avant** l'analyse IA et n'est **jamais** modifié, déplacé
  ni supprimé — y compris en cas d'erreur.
- Copie de classement renommée : `AAAA-MM-JJ_FOURNISSEUR_NUMERO-FACTURE_MONTANT-TTC_EUR.pdf`
  (ex. `2026-07-20_GOOGLE_FR-4587_1055.00_EUR.pdf`). Nettoyage : caractères
  `/ \ : * ? " < > |` supprimés, accents translittérés, espaces → `-`.

## 5. Analyse IA et schéma JSON

- API Anthropic Messages : PDF natifs (bloc `document`, base64) et images (bloc `image`).
  Appel via le module Make Anthropic Claude s'il accepte les fichiers, sinon
  **HTTP — Make a Request** (payload exact dans `make-scenario.md` §6).
- Sortie : exclusivement le JSON ci-dessous. Parse JSON avec gestionnaire d'erreur
  (JSON invalide → Route C). Jamais de confiance aveugle : tous les montants sont
  re-vérifiés arithmétiquement par le scénario.

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

`document_type` ∈ {`invoice`, `credit_note`, `receipt`, `proforma`, `delivery_note`,
`unknown`}. **V1 : seul `invoice` peut partir en Route A ; tout le reste → Route C.**
Le champ `iban` est **masqué** dans le journal, les alertes et les logs (`FRxx••••`).

## 6. Contrôles de cohérence (conditions Route A)

Toutes les conditions doivent être vraies — sinon Route C (ou B si doublon) :

1. `confidence >= 0.95` ; 2. `company == "HD ECOMMERCE"` ; 3. `invoice_number` non vide ;
4. `supplier_name` non vide ; 5. `invoice_date` valide et non aberrante ;
6. `amount_including_tax > 0` ; 7. `currency == "EUR"` ; 8. `document_type == "invoice"` ;
9. `abs((HT + TVA) − TTC) <= 0.02` ; 10. multi-taux : Σ bases = HT ± 0,02 € et
Σ TVA = TVA ± 0,02 € ; 11. SIRET (si présent) = 14 chiffres ; 12. n° TVA FR (si présent)
structurellement cohérent ; 13. `due_date >= invoice_date` (si présente) ;
14. TTC ≤ plafond paramétrable (défaut 50 000 €).

## 7. Anti-doublons et anti-second-envoi (Data Store)

Clé unique normalisée (minuscules, sans espaces/accents/spéciaux, TTC à 2 décimales) :
- avec SIRET : `siret-invoicenumber-ttc` (ex. `93776694700000-fa2026458-1055.00`) ;
- sans SIRET : `suppliernamenorm-invoicenumber-ttc`.

Contrôle secondaire : **hash SHA-256 du fichier**. Jamais de déduplication par nom de
fichier ou ID Gmail seuls.

**Séquence idempotente de la Route A** (empêche tout second envoi, même en cas de
plantage à mi-parcours ou de rejeu du scénario) :

1. `Data Store — Add/Replace` : enregistrement `status = "sending"` **avant** l'envoi ;
2. envoi de l'email à `expense@axonaut.com` ;
3. `Data Store — Add/Replace` : `status = "sent_to_axonaut"` + horodatage.

Le contrôle d'existence (avant Router) route en B tout enregistrement existant, quel
que soit son statut. Un enregistrement bloqué en `sending` (plantage entre 1 et 2)
est signalé en alerte pour arbitrage humain — jamais renvoyé automatiquement.

Champs stockés : clé, hash SHA-256, fournisseur, SIRET, n° facture, date facture, TTC,
ID message Gmail, ID thread Gmail, URL Drive originale, URL Drive copie, date d'envoi
à Axonaut, statut, version du scénario.

## 8. Journal d'audit

Support V1 : Google Sheets. Colonnes : `event_id`, `timestamp`, `gmail_message_id`,
`gmail_thread_id`, `attachment_name`, `attachment_hash`, `supplier_name`,
`supplier_siret`, `invoice_number`, `invoice_date`, `amount_excluding_tax`,
`vat_amount`, `amount_including_tax`, `confidence`, `status`, `anomaly_reason`,
`axonaut_supplier_id` (Plan B), `axonaut_expense_id` (Plan B), `drive_original_url`,
`drive_processed_url`, `processing_duration`, `ai_model`, `scenario_version`.

Statuts V1 : `received`, `extracted`, `validated`, `sent_to_axonaut`, `duplicate`,
`anomaly`, `completed`, `failed` (les statuts `supplier_created` / `expense_created`
sont réservés au Plan B).

## 9. Gestion des erreurs

- **Techniques** (Gmail/Drive/IA indisponibles, timeout) : gestionnaire *Break*,
  3 tentatives, délai progressif ; au-delà → Route C + alerte. L'email **conserve**
  `FACTURES AXONAUT`, l'original reste archivé, rien n'est envoyé à Axonaut.
- **Fonctionnelles** (JSON invalide, incohérence, doublon) : pas de retry — B ou C.
- Aucune erreur silencieuse : ligne `failed`/`anomaly` au journal + alerte email
  détaillée (données sensibles masquées).
- Idempotence garantie par la séquence §7 : un rejeu ne renvoie jamais une facture
  déjà transmise.

## 10. Plan B documenté — « Axonaut — Create an Expense »

À activer **uniquement** si l'import par `expense@axonaut.com` ne traite pas
correctement les factures fournisseurs (constaté en Phase 4). Bascule = décision
explicite, jamais un cumul :

- Route A remplacée par : recherche fournisseur Axonaut (SIRET puis nom) → création
  du fournisseur si absent et données fiables (SIRET valide, `confidence >= 0.98`,
  adresse/pays) → **Axonaut — Create an Expense** (non payée, mention « Créée
  automatiquement — validation requise ») → journal avec `axonaut_expense_id`.
- Les noms exacts des champs du module seront relevés **dans le module Make connecté
  au compte** — ne pas les inventer ni les figer à l'avance.
- ⚠️ **Le rattachement du justificatif à la dépense via l'API reste NON confirmé et
  ne doit pas être présenté comme fonctionnel sans test réel.** Repli obligatoire :
  lien Drive du justificatif dans la description de la dépense ; jamais de simulation
  de réussite ; jamais de suppression du fichier Drive.
- Interdits identiques : jamais `POST /expenses/payments`, jamais de statut « payé ».

## 11. Sécurité et RGPD

- Clés uniquement dans les connexions Make / variables d'environnement / coffre-fort ;
  `.env` ignoré par Git, `.env.example` vide.
- Masquage : IBAN, clés API, tokens, données bancaires — dans les logs, le journal et
  les alertes.
- Moindre privilège : Gmail (lecture + libellés + envoi), Drive limité au dossier
  `FACTURES FOURNISSEURS/`, clé Axonaut réservée au Plan B.
- Factures réelles jamais versionnées dans Git ; journal limité aux données
  comptables nécessaires.

## 12. Extension multi-sociétés (préparée, non construite)

Société isolée dans : champ `company` du JSON, sous-dossier Drive, préfixe de clé
Data Store, table de configuration (société → dossiers, libellés, destinataire
d'ingestion Axonaut propre à chaque compte). Ajouter BUSINESS ou MIX TERROIR = une
ligne de configuration + une branche de Router. V1 : `company ≠ HD ECOMMERCE` → Route C.
