# Scénario Make V1 — « FACTURES-HD-V1 » (Phase 2)

> **⚠️ Document historique (Phase 2).** La référence de construction est désormais
> **[`make-scenario-phase-3.md`](make-scenario-phase-3.md)** (numérotation des
> modules, route E « erreur technique », Data Store `hd_ecommerce_invoice_registry`,
> filtres détaillés dans [`make-filters.md`](make-filters.md)). Les procédures de
> test T0–T8 de ce document restent valables (T0 détaillé dans
> [`test-t0-axonaut.md`](test-t0-axonaut.md)).

Livrable Phase 2 : liste ordonnée des modules, filtres, expressions, Data Store,
prompt IA, procédure de test et check-list de configuration manuelle.

> Conventions de lecture :
> - `1.` , `2.` … = numéro du module dans le scénario (les références Make du type
>   `{{2.data}}` utilisent ces numéros ; ils peuvent différer dans votre scénario réel —
>   adapter les mappings en conséquence).
> - Les noms de modules sont ceux de l'interface Make ; si un intitulé diffère
>   légèrement dans votre compte (langue, version du connecteur), prendre l'équivalent —
>   **ne jamais prendre un module qui fait autre chose**.

---

## 1. Liste ordonnée exacte des modules

### Tronc commun

| # | Module Make | Configuration essentielle |
|---|---|---|
| 1 | **Gmail — Watch Emails** (déclencheur) | Dossier/requête : `label:FACTURES-A-TRAITER has:attachment` · « Mark as read » : NON · récupération des pièces jointes : OUI · Limite : 5 emails/cycle · Planification : toutes les 15 min |
| 2 | **Flow Control — Iterator** | Tableau : `{{1.attachments[]}}` |
| — | **Filtre F1 « Pièce jointe exploitable »** (entre 2 et 3) | voir §2 |
| 3 | **Google Drive — Upload a File** | Dossier : `ARCHIVES ORIGINALES` · Nom : `{{formatDate(now; "YYYY-MM-DD_HHmmss")}}_{{2.fileName}}` · Données : `{{2.data}}` · Gestionnaire d'erreur : Break (retry ×3) |
| 4 | **HTTP — Make a Request** (analyse Claude) *ou* module **Anthropic Claude** équivalent s'il accepte les fichiers | voir payload §6 · Gestionnaire d'erreur : Break (retry ×3) |
| 5 | **JSON — Parse JSON** | Source : texte du bloc de réponse Claude · Gestionnaire d'erreur : **Resume** avec sortie vide → la ligne « JSON invalide » part en Route C |
| 6 | **Tools — Set Multiple Variables** (normalisation) | voir expressions §4.1 |
| 7 | **Tools — Set Multiple Variables** (contrôles + clé de déduplication) | voir expressions §4.2 — séparé de 6 car une variable ne peut pas référencer une autre variable définie dans le même module |
| 8 | **Data Store — Check the existence of a record** | Data Store : `invoices_processed` · Clé : `{{7.dedup_key}}` |
| 9 | **Flow Control — Router** | 3 routes, dans cet ordre : B (doublon), A (valide), C (par défaut/fallback) |

### Route B — Doublon (première branche du Router)

| # | Module | Configuration |
|---|---|---|
| 10 | **Google Sheets — Add a Row** (journal) | `status = duplicate`, `anomaly_reason = "Doublon : clé {{7.dedup_key}} déjà traitée"` |
| 11 | **Gmail — Send an Email** (alerte) | Destinataire : adresse d'alerte interne · contenu §5.3 |
| 12 | **Gmail — Modify email labels** | Message : `{{1.id}}` · Ajouter : `FACTURES/DOUBLONS` · Retirer : `FACTURES/A-TRAITER` |
| 12b | *(optionnel)* **Google Drive — Upload a File** | Copie du fichier dans `DOUBLONS/` pour consultation visuelle |

**Aucun envoi à `expense@axonaut.com` sur cette route.**

### Route A — Facture valide (deuxième branche)

| # | Module | Configuration |
|---|---|---|
| 13 | **Data Store — Add/Replace a Record** | Clé : `{{7.dedup_key}}` · `status = "sending"` + tous les champs §3 — **écrit AVANT l'envoi** : si le scénario plante ensuite, aucun rejeu ne pourra renvoyer la facture |
| 14 | **Gmail — Send an Email** → **`expense@axonaut.com`** | Expéditeur : la connexion Gmail dédiée (adresse reconnue par Axonaut — voir §9 point 3) · Objet : `Facture {{5.supplier_name}} - {{5.invoice_number}}` · Corps : bref texte neutre (pas d'IBAN, pas de données sensibles) · **Pièce jointe : `{{2.data}}` avec le nom original `{{2.fileName}}`** · Gestionnaire d'erreur : Break (retry ×3) ; si échec définitif → alerte + le record reste en `sending` (arbitrage humain) |
| 15 | **Data Store — Add/Replace a Record** | Même clé · `status = "sent_to_axonaut"` · `sent_to_axonaut_at = {{now}}` |
| 16 | **Google Sheets — Add a Row** (journal) | `status = sent_to_axonaut` |
| 17 | **Google Drive — Upload a File** | Dossier : `ENVOYÉES AXONAUT` · Nom normalisé : `{{7.normalized_filename}}` · Données : `{{2.data}}` (l'original de 3 n'est jamais déplacé) |
| 18 | **Gmail — Modify email labels** | Ajouter : `FACTURES/ENVOYEES-AXONAUT` · Retirer : `FACTURES/A-TRAITER` |

### Route C — Anomalie (route par défaut / fallback)

| # | Module | Configuration |
|---|---|---|
| 19 | **Google Drive — Upload a File** | Dossier : `ANOMALIES/` · Nom : `{{formatDate(now; "YYYY-MM-DD")}}_ANOMALIE_{{2.fileName}}` |
| 20 | **Google Sheets — Add a Row** (journal) | `status = anomaly` · `anomaly_reason = {{join(5.anomalies; " | ")}}` + motif du contrôle échoué |
| 21 | **Gmail — Send an Email** (alerte détaillée) | contenu §5.3, IBAN masqué |
| 22 | **Gmail — Modify email labels** | Ajouter : `FACTURES/ANOMALIES` · Retirer : `FACTURES/A-TRAITER` |

**Aucun envoi à `expense@axonaut.com` sur cette route.**

> ⚠️ **Règle absolue V1 : le module 14 (email vers `expense@axonaut.com`) est le SEUL
> point d'entrée vers Axonaut. Aucun module « Axonaut — Create an Expense » ne doit
> exister dans ce scénario. Les deux méthodes ne doivent jamais coexister.**

---

## 2. Filtres

### F1 — « Pièce jointe exploitable » (entre Iterator 2 et module 3)

Trois groupes **OR**, chacun avec conditions **AND** :

| Groupe | Conditions (AND) |
|---|---|
| PDF | `{{2.mimeType}}` *Equal to* `application/pdf` **ET** `{{2.size}}` *Greater than or equal* `15360` |
| JPEG | `{{2.mimeType}}` *Equal to* `image/jpeg` **ET** `{{2.size}}` ≥ `15360` |
| PNG | `{{2.mimeType}}` *Equal to* `image/png` **ET** `{{2.size}}` ≥ `15360` |

(Les `.exe`/`.zip`/`.rar`/`.7z` sont exclus de fait par le filtre MIME strict.)

### Filtre Route B — « Doublon »

| Condition |
|---|
| `{{8.exists}}` *Equal to* `true` |

### Filtre Route A — « Facture valide » (toutes conditions AND)

| # | Condition Make | Contrôle |
|---|---|---|
| 1 | `{{8.exists}}` = `false` | jamais traitée |
| 2 | `{{5.confidence}}` *≥ (numeric)* `0.95` | confiance IA |
| 3 | `{{5.company}}` = `HD ECOMMERCE` | bonne société |
| 4 | `{{5.document_type}}` = `invoice` | ni avoir, ni proforma, ni BL |
| 5 | `{{5.currency}}` = `EUR` | devise gérée |
| 6 | `{{5.invoice_number}}` *Exists* et *Not equal to* (vide) | n° présent |
| 7 | `{{5.supplier_name}}` *Exists* et *Not equal to* (vide) | fournisseur identifié |
| 8 | `{{5.amount_including_tax}}` *> (numeric)* `0` | TTC positif |
| 9 | `{{7.amounts_coherent}}` = `true` | HT + TVA = TTC ± 0,02 |
| 10 | `{{7.vat_breakdown_ok}}` = `true` | multi-taux cohérent |
| 11 | `{{7.siret_ok}}` = `true` | SIRET absent OU 14 chiffres |
| 12 | `{{7.dates_ok}}` = `true` | dates valides, échéance ≥ facture |
| 13 | `{{7.amount_reasonable}}` = `true` | TTC ≤ plafond (50 000 €) |
| 14 | `{{length(5.anomalies)}}` = `0` | aucune anomalie signalée par l'IA |

### Route C — pas de filtre

Configurée comme **route par défaut (fallback)** du Router : tout ce qui n'est ni B ni A.

---

## 3. Data Store `invoices_processed`

À créer dans Make (Data Stores) avec cette structure :

| Champ | Type Make | Rempli avec |
|---|---|---|
| *(clé du record)* | — | `{{7.dedup_key}}` |
| `file_hash_sha256` | Text | `{{7.file_hash}}` |
| `supplier_name` | Text | `{{5.supplier_name}}` |
| `supplier_siret` | Text | `{{5.supplier_siret}}` |
| `invoice_number` | Text | `{{5.invoice_number}}` |
| `invoice_date` | Text (ISO) | `{{5.invoice_date}}` |
| `amount_including_tax` | Number | `{{5.amount_including_tax}}` |
| `gmail_message_id` | Text | `{{1.id}}` |
| `gmail_thread_id` | Text | `{{1.threadId}}` |
| `drive_original_url` | Text | `{{3.webViewLink}}` |
| `drive_processed_url` | Text | `{{17.webViewLink}}` (mis à jour en fin de Route A) |
| `sent_to_axonaut_at` | Date | `{{now}}` (module 15) |
| `status` | Text | `sending` → `sent_to_axonaut` |
| `scenario_version` | Text | `1.0.0` |

Taille estimée : ~1 Ko/facture — dimensionner le Data Store en conséquence.

## Journal Google Sheets

Feuille `journal_factures`, ligne 1 (en-têtes) :
`event_id | timestamp | gmail_message_id | gmail_thread_id | attachment_name |
attachment_hash | supplier_name | supplier_siret | invoice_number | invoice_date |
amount_excluding_tax | vat_amount | amount_including_tax | confidence | status |
anomaly_reason | axonaut_supplier_id | axonaut_expense_id | drive_original_url |
drive_processed_url | processing_duration | ai_model | scenario_version`

`event_id` : `{{7.dedup_key}}-{{formatDate(now; "YYYYMMDDHHmmss")}}` ·
`axonaut_*` : vides en V1 (réservés Plan B) ·
`processing_duration` : `{{round((timestamp - 1.receivedTimestamp) )}}` (à adapter au
format réel du trigger ; sinon laisser vide en V1).

---

## 4. Expressions Make

### 4.1 Module 6 — normalisation

| Variable | Expression Make |
|---|---|
| `supplier_name_norm` | `{{replace(ascii(lower(5.supplier_name); true); "/[^a-z0-9]/g"; "")}}` |
| `invoice_number_norm` | `{{replace(ascii(lower(5.invoice_number); true); "/[^a-z0-9]/g"; "")}}` |
| `ttc_2dec` | `{{formatNumber(5.amount_including_tax; 2; "."; "")}}` |
| `file_hash` | `{{sha256(2.data)}}` — ⚠️ à valider sur données **binaires** au premier test (§8, T1) ; si le résultat est instable, calculer le hash dans un module de code ou ignorer le contrôle secondaire en V1 |
| `supplier_clean` | `{{upper(replace(ascii(5.supplier_name; true); "/[\\/\\\\:*?\"<>|\\s]+/g"; "-"))}}` (pour le nom de fichier) |

### 4.2 Module 7 — contrôles + clé

| Variable | Expression Make |
|---|---|
| `dedup_key` | `{{if(length(5.supplier_siret) = 14; 5.supplier_siret; 6.supplier_name_norm)}}-{{6.invoice_number_norm}}-{{6.ttc_2dec}}` |
| `amounts_coherent` | `{{if(abs(5.amount_excluding_tax + 5.vat_amount - 5.amount_including_tax) <= 0.02; true; false)}}` |
| `vat_breakdown_ok` | `{{if(length(5.vat_breakdown) = 0; true; if(abs(sum(map(5.vat_breakdown; "taxable_amount")) - 5.amount_excluding_tax) <= 0.02 & abs(sum(map(5.vat_breakdown; "vat_amount")) - 5.vat_amount) <= 0.02; true; false))}}` |
| `siret_ok` | `{{if(5.supplier_siret = null; true; if(length(replace(5.supplier_siret; "/[^0-9]/g"; "")) = 14; true; false))}}` |
| `dates_ok` | `{{if(formatDate(parseDate(5.invoice_date; "YYYY-MM-DD"); "YYYY-MM-DD") = 5.invoice_date; if(5.due_date = null; true; if(parseDate(5.due_date; "YYYY-MM-DD") >= parseDate(5.invoice_date; "YYYY-MM-DD"); true; false)); false)}}` |
| `amount_reasonable` | `{{if(5.amount_including_tax <= 50000; true; false)}}` |
| `normalized_filename` | `{{5.invoice_date}}_{{6.supplier_clean}}_{{upper(6.invoice_number_norm)}}_{{6.ttc_2dec}}_EUR.{{if(2.mimeType = "application/pdf"; "pdf"; if(2.mimeType = "image/png"; "png"; "jpg"))}}` |
| `iban_masked` | `{{if(5.iban = null; ""; substring(5.iban; 0; 4) + "••••••••")}}` |

> Tester chaque expression avec le module « Run this module only » de Make avant de
> câbler les filtres — les signatures exactes (`ascii`, `map`, `sum`, `parseDate`)
> doivent être validées dans votre instance (voir §9 point 10).

### 4.3 Contenus d'emails

**Module 14 (vers Axonaut)** — corps volontairement minimal :
```
Facture fournisseur transmise automatiquement pour traitement.
Société : HD ECOMMERCE
Fournisseur : {{5.supplier_name}} — Facture {{5.invoice_number}} du {{5.invoice_date}}
Montant TTC : {{6.ttc_2dec}} EUR
Validation requise dans Axonaut avant tout paiement.
```

**Alertes (11 et 21)** — objet : `[FACTURES][{{if(8.exists; "DOUBLON"; "ANOMALIE")}}] {{5.supplier_name}} {{5.invoice_number}}` ; corps : société, fournisseur, n° facture, montants, `confidence`, motif exact, liens Drive (`{{3.webViewLink}}`), lien Gmail. **Jamais l'IBAN en clair** (utiliser `{{7.iban_masked}}`).

---

## 5. Prompt IA final

### Message système

```
Tu es un moteur d'extraction documentaire spécialisé dans les factures fournisseurs
françaises. Analyse le document fourni. Retourne exclusivement un JSON valide conforme
au schéma demandé. Ne retourne aucun commentaire, aucune balise Markdown et aucun
texte en dehors du JSON. N'invente jamais une donnée absente. Utilise null lorsqu'une
donnée n'est pas disponible. Vérifie mathématiquement les montants. Identifie les
éventuelles anomalies. Le score confidence doit refléter la qualité réelle de
l'extraction.

Règles impératives :
- Ne devine jamais le SIRET : s'il n'est pas lisible sur le document, mets null.
- Ne confonds pas le client (destinataire, ici la société facturée) et le fournisseur
  (émetteur de la facture). "company" = la société DESTINATAIRE de la facture.
- Ne confonds pas la date de facture et la date d'échéance.
- Ne confonds pas les montants HT et TTC.
- Conserve les décimales exactes ; les montants sont des nombres, pas des chaînes.
- Toutes les dates sont au format ISO AAAA-MM-JJ.
- Conserve la devise réellement détectée sur le document (code ISO 4217).
- Signale toute incohérence arithmétique dans le tableau "anomalies".
- Si la facture contient plusieurs taux de TVA, détaille chaque taux dans
  "vat_breakdown" et signale-le dans "anomalies" par la mention "multi_taux_tva".
- Un devis, une proforma, un bon de livraison ou un ticket ne sont PAS des factures :
  utilise la bonne valeur de "document_type" (invoice, credit_note, receipt, proforma,
  delivery_note, unknown).
- Si le document est illisible ou n'est pas une facture, retourne quand même le JSON
  complet : champs indisponibles à null, "document_type" adapté, "confidence" bas et
  "anomalies" expliquant le problème.
```

### Message utilisateur

```
Analyse ce document et retourne uniquement le JSON conforme à ce schéma :
{ "company": string, "supplier_name": string|null, "supplier_siret": string|null,
  "supplier_vat_number": string|null, "supplier_address": string|null,
  "supplier_country": string|null, "invoice_number": string|null,
  "invoice_date": "AAAA-MM-JJ"|null, "due_date": "AAAA-MM-JJ"|null,
  "currency": string|null, "amount_excluding_tax": number|null,
  "vat_amount": number|null, "amount_including_tax": number|null,
  "vat_breakdown": [ { "rate": number, "taxable_amount": number,
  "vat_amount": number } ], "document_type": "invoice"|"credit_note"|"receipt"|
  "proforma"|"delivery_note"|"unknown", "purchase_order_number": string|null,
  "iban": string|null, "confidence": number, "anomalies": [string],
  "raw_summary": string }
```

---

## 6. Appel Claude (module 4 — HTTP Make a Request)

- **URL** : `POST https://api.anthropic.com/v1/messages`
- **Headers** : `x-api-key: <connexion/clé Anthropic>` · `anthropic-version: 2023-06-01` · `content-type: application/json`
- **Body** (type JSON) :

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 2000,
  "temperature": 0,
  "system": "<message système du §5>",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "{{if(2.mimeType = \"application/pdf\"; \"document\"; \"image\")}}",
          "source": {
            "type": "base64",
            "media_type": "{{2.mimeType}}",
            "data": "{{base64(2.data)}}"
          }
        },
        { "type": "text", "text": "<message utilisateur du §5>" }
      ]
    }
  ]
}
```

- Réponse : le JSON extrait est dans `content[0].text` → source du module 5 (Parse JSON).
- Limites API : PDF ≤ 100 pages / ≤ 32 Mo par requête — le filtre F1 et la limite de
  taille Make protègent déjà en amont.
- Si le module natif « Anthropic Claude » de votre compte accepte les fichiers PDF,
  il peut remplacer ce module HTTP — à vérifier dans l'interface (§9 point 9).

---

## 7. Libellés Gmail et arborescence Drive

### Libellés (à créer dans Gmail)

| Libellé | Usage |
|---|---|
| `FACTURES/A-TRAITER` | Entrée — appliqué manuellement ou par filtre Gmail sur la boîte dédiée |
| `FACTURES/ENVOYEES-AXONAUT` | Route A — transmise, validation requise dans Axonaut |
| `FACTURES/DOUBLONS` | Route B |
| `FACTURES/ANOMALIES` | Route C |

### Drive (à créer, relever les IDs de dossiers)

```
FACTURES FOURNISSEURS/
└── HD ECOMMERCE/
    ├── ENVOYÉES AXONAUT/
    ├── DOUBLONS/
    ├── ANOMALIES/
    ├── À CONTROLER/          (réservé, non utilisé par le scénario V1)
    └── ARCHIVES ORIGINALES/
```

---

## 8. Procédure de test complète (facture fictive)

### Préparation — facture de test

Créer un PDF « FACTURE » strictement fictif :

| Champ | Valeur |
|---|---|
| Fournisseur | `FOURNITEST SARL` (fictif) |
| SIRET | `12345678900012` (fictif, 14 chiffres) |
| N° TVA | `FR12123456789` (fictif) |
| Adresse | `1 rue du Test, 63000 Clermont-Ferrand` |
| Client (destinataire) | `HD ECOMMERCE` |
| N° de facture | `FT-2026-001` |
| Date / échéance | `2026-07-01` / `2026-07-31` |
| HT / TVA 20 % / TTC | `100.00` / `20.00` / `120.00` EUR |

Préparer aussi : `FT-2026-002` avec montants **incohérents** (HT 100, TVA 20, TTC 150),
un PDF « DEVIS/PROFORMA », et une image illisible (photo floue > 15 Ko).

### T0 — Prérequis Axonaut (à faire AVANT de construire le reste)

1. Depuis la boîte Gmail dédiée, envoyer **manuellement** la facture `FT-2026-001` à
   `expense@axonaut.com`.
2. Vérifier dans Axonaut → Dépenses → « Dépenses à traiter » : la dépense apparaît,
   le justificatif est joint, l'OCR a lu le document.
3. **Si rien n'apparaît** : l'adresse expéditrice n'est probablement pas reconnue par
   Axonaut — vérifier dans les paramètres Axonaut quelles adresses sont autorisées
   (utilisateurs du compte), corriger, retester. **Ne pas construire la Route A tant
   que T0 n'est pas vert.**
4. Supprimer manuellement la dépense de test dans Axonaut.

### T1 — Passage nominal (Route A)

1. S'envoyer la facture `FT-2026-001` sur la boîte dédiée, libellé `FACTURES/A-TRAITER`.
2. Make : « Run once ». Vérifier module par module (bulles d'exécution) :
   - 1–2 : email détecté, 1 pièce jointe itérée ; F1 passé ;
   - 3 : original présent dans `ARCHIVES ORIGINALES/` ;
   - 4–5 : JSON conforme, `confidence ≥ 0.95`, `document_type = invoice` ;
   - 6–7 : `dedup_key = 12345678900012-ft2026001-120.00` ; `file_hash` non vide et
     **stable** (relancer une fois pour comparer — valide `sha256()` sur binaire) ;
   - 8 : `exists = false` ; Router → Route A ;
   - 13→15 : record Data Store `sending` puis `sent_to_axonaut` ;
   - 14 : email reçu par Axonaut → dépense visible dans « Dépenses à traiter »,
     justificatif joint, **statut non payé** ;
   - 16 : ligne journal `sent_to_axonaut` complète ;
   - 17 : copie `2026-07-01_FOURNITEST-SARL_FT2026001_120.00_EUR.pdf` dans
     `ENVOYÉES AXONAUT/` ;
   - 18 : libellés mis à jour.
3. Vérifier qu'**aucun paiement** n'existe côté Axonaut.

### T2 — Doublon (Route B)

Renvoyer le même PDF (nouvel email) → le scénario doit router en B : aucun nouvel
email vers Axonaut (vérifier les éléments envoyés Gmail), libellé `DOUBLONS`, ligne
journal `duplicate`, alerte reçue avec la clé et les références du premier traitement.
Vérifier dans Axonaut qu'il n'y a **qu'une seule** dépense.

### T3 — Montants incohérents (Route C)

Envoyer `FT-2026-002` → Route C : pas d'envoi Axonaut, copie dans `ANOMALIES/`,
journal `anomaly` avec motif, alerte, libellé `ANOMALIES`.

### T4 — Proforma (Route C)

Le document `document_type = proforma` doit partir en C même si les montants sont cohérents.

### T5 — Illisible (Route C)

Image floue : `confidence < 0.95` et/ou champs null → Route C.

### T6 — Pièce jointe ignorée

Email avec un logo < 15 Ko : F1 doit l'écarter silencieusement (aucune ligne, aucun envoi).

### T7 — Panne simulée

Désactiver temporairement la connexion Drive (ou renommer le dossier cible) → le
gestionnaire Break doit réessayer ×3 puis alerter ; l'email **garde** `A-TRAITER` ;
rien n'est envoyé à Axonaut ; le rejeu après correction fonctionne sans doublon.

### T8 — Nettoyage

Supprimer les dépenses de test dans Axonaut (manuellement), les records de test du
Data Store, les lignes de test du journal, les fichiers de test dans Drive.
**Critère de passage en Phase 4/5 : T0 à T7 tous verts.**

---

## 9. Éléments à configurer manuellement dans Make (check-list)

1. **Connexion Gmail** (boîte factures dédiée) — scopes lecture, libellés, envoi.
2. **Connexion Google Drive** (même compte ou compte ayant accès au dossier).
3. **Vérification Axonaut** : confirmer dans les paramètres Axonaut que l'adresse
   Gmail expéditrice est reconnue pour l'ingestion `expense@axonaut.com` (test T0).
4. **Connexion Google Sheets** + création de la feuille `journal_factures` avec la
   ligne d'en-têtes du §3.
5. **Clé API Anthropic** : créer la connexion (ou un header `x-api-key` stocké dans
   la connexion HTTP « Keychain » de Make) — jamais en clair dans le module.
6. **Data Store `invoices_processed`** : créer la structure du §3 et allouer la taille.
7. **Libellés Gmail** du §7 (les 4) + filtre Gmail automatique appliquant
   `FACTURES/A-TRAITER` aux emails entrants de la boîte dédiée (optionnel).
8. **Dossiers Drive** du §7 — relever les IDs et les renseigner dans les modules 3,
   17, 19 (et 12b si activé).
9. **Vérifier le connecteur Anthropic Claude** de votre compte : s'il accepte les
   fichiers PDF en entrée, remplacer le module HTTP 4 ; sinon garder HTTP.
10. **Valider les expressions du §4** une par une (« Run this module only ») —
    signatures `ascii`, `sha256` (binaire), `map`, `sum`, `parseDate`.
11. **Planification** : toutes les 15 minutes ; limite 5 emails/cycle au départ.
12. **Adresse d'alerte interne** (modules 11 et 21).
13. **Gestionnaires d'erreurs** : Break (×3, délai progressif) sur 3, 4, 14 ;
    Resume sur 5 ; alerte + arrêt propre ailleurs.
14. **Relever les noms exacts des champs** du module « Axonaut — Create an Expense »
    (module ajouté puis retiré sans exécution) — documentation du Plan B uniquement.

---

## 10. Plan B — « Axonaut — Create an Expense » (documenté, non construit)

Bascule **uniquement** si l'ingestion `expense@axonaut.com` s'avère inadaptée en
Phase 4 (OCR insuffisant, fournisseur mal rattaché, limites de volume…). Décision
explicite et exclusive : on retire le module 14 **avant** d'ajouter tout module Axonaut.

Remplacement de la Route A :

1. **Axonaut — Search Suppliers** (par SIRET si possible, sinon liste + filtre sur le
   champ SIRET/TVA — paramètres réels à relever dans le module connecté) ;
2. si absent et données fiables (`supplier_siret` 14 chiffres, `confidence ≥ 0.98`,
   adresse ou pays) : **Axonaut — Create a Supplier** ; sinon → Route C ;
3. **Axonaut — Create an Expense** : non payée, mention « Créée automatiquement —
   validation requise », lien Drive du justificatif dans la description ;
   les noms de champs exacts seront relevés dans le module Make connecté — **ne pas
   les inventer** ;
4. journal avec `axonaut_supplier_id` / `axonaut_expense_id`.

> ⚠️ **Limitation à maintenir visible : le rattachement du fichier justificatif à la
> dépense créée par API n'est PAS confirmé. Tant qu'un test réel n'a pas prouvé le
> contraire, le Plan B doit être présenté comme « dépense sans pièce jointe native,
> justificatif accessible par lien Drive ». Ne jamais simuler une réussite.**
