# Scénario Make Phase 3 — Spécification module par module

Ce document remplace la vue Phase 2 (`make-scenario.md`) comme référence de
construction. Numérotation : tronc commun **1–13**, puis routes **A14–A19** (valide),
**B14–B19** (doublon), **C14–C19** (anomalie), **E14–E19** (erreur technique).

> Les références de mapping (`{{3.data}}`, `{{9.confidence}}`…) utilisent cette
> numérotation ; Make attribue ses propres numéros à la création — adapter.
> Les intitulés de modules marqués `MANUAL_CONFIRMATION_REQUIRED` doivent être
> vérifiés dans l'interface Make ; l'équivalent de repli est toujours indiqué.
> **Règle absolue : le module A15 est le SEUL point de sortie vers Axonaut.
> Aucun module du connecteur Axonaut ne doit exister dans ce scénario V1.**

---

## Tronc commun

### 1. Gmail — Watch Emails *(déclencheur)*

| | |
|---|---|
| Application / action | Gmail / Watch Emails (trigger « instant » non requis ; polling) |
| Valeurs fixes | Requête : `label:FACTURES-AXONAUT has:attachment` · Max results : `5` · Mark as read : `Non` |
| Option critique | Récupération du **contenu des pièces jointes** activée (« Attachments » / fetch attachments) — c'est elle qui remplace le « téléchargement » (étape 5 du plan : il n'existe pas de module Gmail « Download an Attachment » séparé — `MANUAL_CONFIRMATION_REQUIRED` ; si votre version du connecteur en propose un, il peut s'insérer après l'Iterator sans rien changer d'autre) |
| Planification | Toutes les 15 min |
| Données produites | `id` (message), `threadId`, `subject`, `from`, `date`, `attachments[]` (nom, MIME, taille, données) |
| Erreurs | Gmail indisponible → le cycle échoue proprement, Make réessaie au cycle suivant ; rien n'a été entamé |

*L'étape « 2. Filtre : email avec pièce jointe » du plan est couverte par la requête
`has:attachment` du déclencheur — un filtre Make séparé est inutile ici (un filtre
Make n'est pas un module : c'est une condition posée sur un lien entre modules).*

### 3. Flow Control — Iterator

| | |
|---|---|
| Valeur dynamique | Array : `{{1.attachments[]}}` |
| Données produites | Par pièce jointe : `fileName`, `mimeType`, `size`, `data` (binaire) |
| Filtre sortant | **F1 « Pièce jointe exploitable »** (`make-filters.md` §1) — posé sur le lien vers le module 6 |

### 6. Tools — Set Multiple Variables *(hash et contexte)*

| | |
|---|---|
| Variables | `file_sha256` = `{{sha256(3.data)}}` — `MANUAL_CONFIRMATION_REQUIRED` : valider sur binaire au premier run (relancer 2× le même fichier → même hash ; sinon voir repli) · `received_at` = `{{now}}` · `scenario_version` = `1.0.0` · `ai_model` = `claude-sonnet-5` |
| Repli hash | Si `sha256()` est instable sur binaire : supprimer le contrôle secondaire par hash en V1 (la clé métier suffit) et noter la limitation — ou calculer le hash via un micro-webhook de code (V1.1). Ne pas bricoler un hash sur `base64()` sans le documenter dans le Data Store |
| Données produites | `file_sha256`, `received_at`, `scenario_version`, `ai_model` |

### 7. Google Drive — Upload a File *(archivage original — AVANT toute analyse)*

| | |
|---|---|
| Valeurs fixes | Dossier cible : ID de `00_ARCHIVES_ORIGINALES/2026/07_JUILLET` |
| Valeurs dynamiques | Nom : `{{formatDate(now; "YYYY-MM-DD_HHmmss")}}_{{3.fileName}}` · Données : `{{3.data}}` |
| Gestion d'erreurs | **Break** (retry ×3, intervalle 2 min) ; échec final → branche E (le libellé `FACTURES AXONAUT` reste, rien n'est perdu, retraitement au cycle suivant) |
| Données produites | `id` (fichier), `webViewLink` |

### 8. Analyse IA — HTTP — Make a Request *(Claude)*

| | |
|---|---|
| Application / action | HTTP / Make a Request — ou le module **Anthropic Claude** de votre compte s'il accepte un fichier en entrée (`MANUAL_CONFIRMATION_REQUIRED`) |
| URL / méthode | `POST https://api.anthropic.com/v1/messages` |
| Headers | `x-api-key` : clé stockée dans la connexion/keychain (jamais en clair) · `anthropic-version: 2023-06-01` · `content-type: application/json` |
| Body | Voir modèle ci-dessous. `system` = contenu de `prompts/invoice-extraction-system.txt` ; texte utilisateur = `prompts/invoice-extraction-user.txt` |
| Valeurs dynamiques | Type de bloc : `{{if(3.mimeType = "application/pdf"; "document"; "image")}}` · `media_type` : `{{3.mimeType}}` · `data` : `{{base64(3.data)}}` |
| Valeurs fixes | `model`: `claude-sonnet-5` · `max_tokens`: `2000` · `temperature`: `0` |
| Gestion d'erreurs | **Break** (retry ×3, intervalle 5 min — couvre l'indisponibilité API et le rate limit) ; échec final → branche E |
| Données produites | Réponse JSON ; le texte extrait est `data.content[0].text` |

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 2000,
  "temperature": 0,
  "system": "<prompts/invoice-extraction-system.txt>",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "<document|image>", "source": { "type": "base64", "media_type": "<mime>", "data": "<base64>" } },
      { "type": "text", "text": "<prompts/invoice-extraction-user.txt>" }
    ]
  }]
}
```

### 9. JSON — Parse JSON

| | |
|---|---|
| Valeur dynamique | JSON string : `{{8.data.content[].text}}` (premier élément) |
| Structure | Générer la structure depuis `examples/invoice-output.json` (bouton « Generate ») |
| Gestion d'erreurs | **Resume** avec valeurs de substitution (`document_type` = `unknown`, `confidence` = `0`, `anomalies` = `["UNREADABLE_DOCUMENT : JSON invalide"]`) → le flux continue et part naturellement en Route C |
| Données produites | Tous les champs du schéma (`company`, `supplier_name`, montants, `confidence`…) |

### 10. Tools — Set Multiple Variables *(normalisation)*

Expressions complètes dans `make-filters.md` §5. Variables : `supplier_name_norm`,
`invoice_number_norm`, `ttc_2dec`, `supplier_clean`.

### 11. Tools — Set Multiple Variables *(contrôles + clé)*

Variables : `dedup_key`, `amounts_coherent`, `vat_breakdown_ok`, `siret_ok`,
`dates_ok`, `amount_reasonable`, `normalized_filename`, `iban_masked`,
`anomaly_codes_local`. (Séparé du module 10 : une variable ne peut pas référencer
une variable définie dans le même module.)

### 12. Data Store — Check the existence of a record *(+ recherche hash)*

| | |
|---|---|
| Application / action | Data store / **Check the existence of a record** — Data store : `hd_ecommerce_invoice_registry` · Key : `{{11.dedup_key}}` |
| Module 12b | Data store / **Search records** — filtre : `file_sha256` *Equal to* `{{6.file_sha256}}` · Limit : 1 — détecte le même fichier renvoyé sous une autre référence |
| Gestion d'erreurs | Break (retry ×3) ; échec final → branche E |
| Données produites | 12 : `exists` (booléen) et le record · 12b : bundles trouvés (`total ≥ 1` = hash déjà vu) |

### 13. Flow Control — Router

Trois branches **dans cet ordre** : **B — Doublon**, **A — Valide**, **C — Anomalie
(route par défaut/fallback)**. Les filtres de branche sont dans `make-filters.md`
§2–§4. La branche **E** n'est pas une branche du Router : c'est la convergence des
**gestionnaires d'erreurs** des modules 7, 8, 12, A15 (voir plus bas).

---

## Route A — Facture valide

### A14. Data Store — Add/Replace a Record *(verrou AVANT envoi)*

| | |
|---|---|
| Action | Add/replace a record — Key : `{{11.dedup_key}}` |
| Champs | Tous les champs de `make-data-store.md` §2 · `processing_status` = **`sending`** · `validation_status` = `pending_axonaut_validation` · `axonaut_import_method` = `email_forward` · `created_at` = `updated_at` = `{{now}}` · `retry_count` = 0 |
| Pourquoi avant l'envoi | Si le scénario plante entre A14 et A15, le record existe → aucun rejeu ne renverra la facture (elle ressortira en « B » avec statut `sending` → alerte → arbitrage humain) |

### A15. Gmail — Send an Email → `expense@axonaut.com` *(SEULE sortie vers Axonaut)*

| | |
|---|---|
| Application / action | Gmail / **Send an Email**. Le plan demandait « Forward an Email » : ce module n'existe pas dans le connecteur Gmail de Make à notre connaissance — `MANUAL_CONFIRMATION_REQUIRED`. L'équivalent fonctionnel est un Send an Email qui joint la **pièce jointe originale conservée en binaire** (`{{3.data}}`), ce qui transmet le document à l'identique — c'est le fichier qui compte pour l'OCR Axonaut, pas le corps du message |
| Valeurs fixes | To : `expense@axonaut.com` |
| Valeurs dynamiques | Subject : `Facture {{9.supplier_name}} - {{9.invoice_number}}` · Corps : texte neutre (société, fournisseur, n°, TTC — **jamais d'IBAN**) · Attachment : nom `{{3.fileName}}`, données `{{3.data}}` |
| Gestion d'erreurs | **Break** (retry ×3, 2 min) ; échec final → branche E (le record reste en `sending` : c'est voulu) |
| Données produites | ID du message envoyé |

### A16. Data Store — Add/Replace a Record *(confirmation)*

Même clé ; `processing_status` = `sent_to_axonaut` · `axonaut_forwarded_at` = `{{now}}`
· `updated_at` = `{{now}}` · `drive_processed_url` complété après A18 si l'ordre est
ajusté (sinon laisser vide et compléter en V1.1).

### A17. Google Sheets — Add a Row *(journal)*

Mapping : colonnes du modèle ← `event_id` = `{{11.dedup_key}}-{{formatDate(now; "YYYYMMDDHHmmss")}}`,
`processing_status` = `sent_to_axonaut`, `validation_status` = `pending_axonaut_validation`,
montants/IDs/URLs des modules 1, 3, 6, 7, 9, 11, A18. `manual_review_notes` : vide.

### A18. Google Drive — Upload a File *(copie classée)*

Dossier : `02_ENVOYEES_AXONAUT/2026/07_JUILLET` · Nom : `{{11.normalized_filename}}`
· Données : `{{3.data}}`. (Copie : l'original de 7 ne bouge jamais — le plan « 17.
déplacement ou copie » est tranché en **copie**.)

### A19. Gmail — Modify email labels

| | |
|---|---|
| Application / action | Gmail / Modify email labels — `MANUAL_CONFIRMATION_REQUIRED` sur l'intitulé exact (« Modify email labels » / « Add/remove labels ») ; à défaut, deux modules successifs « Add a label » + « Remove a label » |
| Valeurs | Message : `{{1.id}}` · Ajouter : `FACTURES AXONAUT/ENVOYEES` · Retirer : `FACTURES AXONAUT` |

---

## Route B — Doublon

*Filtre de branche : `make-filters.md` §3. Ne modifie JAMAIS le record existant.*

| # | Module | Configuration |
|---|---|---|
| B14 | *(pas de module Data Store)* | Le plan prévoyait « mise à jour du statut duplicate » : volontairement **non fait** — le record décrit le premier traitement, qui fait foi ; écraser son statut détruirait l'audit. Le doublon vit dans le journal et l'alerte |
| B15 | Google Sheets — Add a Row | `processing_status` = `duplicate` · `validation_status` = `not_applicable` · `anomaly_codes` = `POSSIBLE_DUPLICATE` · la référence du premier traitement (date, statut, URL Drive, tirés du record retourné par le module 12) est portée par l'alerte B19 — `manual_review_notes` reste réservée aux humains |
| B16 | Google Drive — Upload a File | Dossier `04_DOUBLONS` · nom `{{formatDate(now; "YYYY-MM-DD")}}_DOUBLON_{{3.fileName}}` · données `{{3.data}}` |
| B17–B18 | Gmail — Modify email labels | Ajouter `FACTURES AXONAUT/DOUBLONS` · Retirer `FACTURES AXONAUT` (un seul module si l'action combinée existe) |
| B19 | Gmail — Send an Email *(alerte)* | Objet : `[FACTURES][DOUBLON] {{9.supplier_name}} {{9.invoice_number}}` · corps : clé `{{11.dedup_key}}`, données du record d'origine (date de 1er traitement, URLs Drive), lien Gmail du nouvel email. **Signale aussi le cas particulier : record trouvé avec `processing_status = sending`** (envoi incertain → vérifier dans Axonaut avant toute action) |

**Aucun envoi à `expense@axonaut.com`.**

## Route C — Anomalie *(route par défaut)*

| # | Module | Configuration |
|---|---|---|
| C14 | *(pas de record sous la clé principale)* | Une facture en anomalie doit rester retraitable après correction — créer un record la ferait passer pour un doublon au retraitement. L'anomalie est enregistrée au journal (C15) |
| C15 | Google Sheets — Add a Row | `processing_status` = `anomaly` · `validation_status` = `not_applicable` · `anomaly_codes` = `{{join(9.anomalies; "\|")}}` complété des contrôles locaux échoués (`11.anomaly_codes_local`) |
| C16 | Google Drive — Upload a File | Dossier `05_ANOMALIES` · nom `{{formatDate(now; "YYYY-MM-DD")}}_ANOMALIE_{{3.fileName}}` |
| C17–C18 | Gmail — Modify email labels | Ajouter `FACTURES AXONAUT/ANOMALIES` · Retirer `FACTURES AXONAUT` |
| C19 | Gmail — Send an Email *(alerte)* | Objet : `[FACTURES][ANOMALIE] {{9.supplier_name}} {{9.invoice_number}}` · corps : codes d'anomalie, `confidence`, montants, liens Drive/Gmail — IBAN masqué (`{{11.iban_masked}}`) |

**Aucun envoi à `expense@axonaut.com`.**

## Route E — Erreur technique *(gestionnaires d'erreurs, pas une branche du Router)*

Attachée en **error handler** aux modules 7, 8, 12 et A15. Dans Make : clic droit sur
le module → **Add error handler** → directive **Break** (retries : 3, intervalle :
2–5 min, « Allow storing incomplete executions » activé au niveau du scénario) ;
après épuisement des retries, la branche du handler exécute :

| # | Module | Configuration |
|---|---|---|
| E14 | Google Sheets — Add a Row | `processing_status` = `technical_error` · `last_error` = message d'erreur du module (sans secrets) · `retry_count` = 3 |
| E15 | Data Store — Update a Record *(conditionnel)* | Uniquement si un record existe déjà (échec de A15 après A14) : `retry_count` +1, `last_error`, `updated_at`. Filtre entrant : `{{12.exists}} = true` OU erreur survenue en A15. `MANUAL_CONFIRMATION_REQUIRED` : intitulé exact « Update a record » |
| E16 | Google Drive — Upload a File *(si pertinent)* | Dossier `06_ERREURS_TECHNIQUES` · uniquement si l'erreur survient APRÈS l'archivage (modules 8+) ; si l'archivage 7 lui-même a échoué, ne rien uploader (le fichier reste dans Gmail) |
| E17 | Gmail — Modify email labels | Ajouter `FACTURES AXONAUT/ERREURS-TECHNIQUES` · **NE PAS retirer `FACTURES AXONAUT`** : l'email reste dans la file → le cycle suivant retente automatiquement ; l'idempotence (A14 avant A15 + clé Data Store) garantit qu'aucun renvoi en double n'est possible |
| E18 | Gmail — Send an Email *(alerte)* | Objet : `[FACTURES][ERREUR TECHNIQUE] {{3.fileName}}` · module en échec, message d'erreur, nombre de tentatives, lien Gmail |
| E19 | — | Fin de la branche ; l'exécution est marquée en erreur gérée (visible dans l'historique Make) |

> Cas particulier — erreurs **fonctionnelles** (JSON invalide) : traitées par le
> **Resume** du module 9, qui route en C. Le handler Break est réservé aux pannes
> techniques. Ne jamais mettre de retry sur une erreur fonctionnelle.

---

## Données produites — récapitulatif des mappings clés

| Donnée | Source |
|---|---|
| Binaire de la pièce jointe | `{{3.data}}` (utilisé en 6, 7, 8, A15, A18, B16, C16, E16 — jamais retéléchargé) |
| Hash | `{{6.file_sha256}}` |
| URL originale Drive | `{{7.webViewLink}}` |
| Extraction | `{{9.*}}` |
| Clé + contrôles | `{{11.*}}` |
| Existence doublon | `{{12.exists}}`, `{{12b.total}}` |
