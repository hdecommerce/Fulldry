# Scénario Make V0 minimal — « je glisse → ça part à Axonaut »

Version volontairement réduite pour obtenir l'automatisation de base en ~30 minutes :
**glisser un email sur le libellé `FACTURES AXONAUT` → Make envoie la pièce jointe à
`expense@axonaut.com` → Axonaut crée la dépense « à traiter » avec le justificatif.**

Garde-fous conservés en V0 : anti-doublon (hash du fichier), archivage Drive de
l'original, remplacement des libellés, aucun paiement, aucune suppression.
Reportés en V1 (spec complète : `make-scenario-phase-3.md`) : analyse IA, contrôles
de cohérence, route anomalies, journal détaillé.

> **Prérequis absolu : le test T0 doit être VERT** (`test-t0-axonaut.md`). Si Axonaut
> ne reconnaît pas l'adresse expéditrice, le scénario enverrait des emails dans le
> vide. Ne construisez rien avant T0.

## Limites assumées de la V0 (à connaître)

1. Le doublon n'est détecté que si c'est **exactement le même fichier** (même hash).
   La même facture re-scannée ou renvoyée dans un autre PDF passera — Axonaut la
   verra en double et l'humain la rejettera à la validation.
2. Aucun tri qualité : un document illisible ou une proforma glissés par erreur
   partiront chez Axonaut (l'humain les rejettera à la validation).
3. Pas de journal comptable détaillé (juste le Data Store + l'historique Make).

Ces trois limites sont exactement ce que la V1 (analyse IA) corrige.

## Les 8 modules, dans l'ordre

| # | Module | Configuration exacte |
|---|---|---|
| 1 | **Gmail — Watch Emails** | Requête : `label:FACTURES-AXONAUT has:attachment` · Max results : `5` · Mark as read : Non · récupération des pièces jointes : OUI · Planification : toutes les **5 min** (réactivité du geste « je glisse ») |
| 2 | **Flow Control — Iterator** | Array : les pièces jointes du module 1 |
| — | *Filtre sur le lien 2→3 : « Pièce jointe exploitable »* | MIME ∈ {`application/pdf`, `image/jpeg`, `image/png`} **ET** taille ≥ `15000` octets **ET** nom ne contient pas `logo`, `signature`, `image00`, `smime` (3 groupes OR, un par MIME — détail : `make-filters.md` §1) |
| 3 | **Tools — Set Variable** | `file_sha256` = `{{sha256(2.data)}}` *(valider la stabilité au premier run — relancer le même fichier doit donner le même hash)* |
| 4 | **Google Drive — Upload a File** | Dossier : `00_ARCHIVES_ORIGINALES` · Nom : `{{formatDate(now; "YYYY-MM-DD_HHmmss")}}_{{2.fileName}}` · Données : `{{2.data}}` |
| 5 | **Data Store — Check the existence of a record** | Data store : `hd_ecommerce_invoice_registry` · Key : `{{3.file_sha256}}` *(en V0 la clé est le hash ; la V1 passera à la clé métier SIRET+numéro+TTC)* |
| 6 | **Flow Control — Router** | 2 branches : **Doublon** puis **Envoi** |

### Branche Doublon (filtre : `exists = true`)

| # | Module | Configuration |
|---|---|---|
| 7a | **Gmail — Modify email labels** | Message : `{{1.id}}` · Ajouter `FACTURES AXONAUT/DOUBLONS` · Retirer `FACTURES AXONAUT` |
| 7b | **Gmail — Send an Email** *(alerte, optionnel)* | À vous-même : « Doublon détecté : {{2.fileName}} — déjà envoyé le {{5.record.sent_at}} » |

### Branche Envoi (filtre : `exists = false`)

| # | Module | Configuration |
|---|---|---|
| 8a | **Data Store — Add/Replace a Record** | Key : `{{3.file_sha256}}` · champs : `status` = `sending`, `original_filename` = `{{2.fileName}}`, `gmail_message_id` = `{{1.id}}`, `drive_original_url` = `{{4.webViewLink}}`, `created_at` = `{{now}}` — **écrit AVANT l'envoi** (un plantage ne pourra jamais provoquer un double envoi) |
| 8b | **Gmail — Send an Email** → `expense@axonaut.com` | Objet : `Facture fournisseur - {{2.fileName}}` · Corps : `Facture fournisseur HD ECOMMERCE transmise pour traitement. Validation requise dans Axonaut.` · **Pièce jointe : nom `{{2.fileName}}`, données `{{2.data}}`** |
| 8c | **Data Store — Add/Replace a Record** | Même clé · `status` = `sent_to_axonaut` · `sent_at` = `{{now}}` |
| 8d | **Gmail — Modify email labels** | Ajouter `FACTURES AXONAUT/ENVOYEES` · Retirer `FACTURES AXONAUT` |

Gestion d'erreurs V0 : sur les modules 4 et 8b, gestionnaire **Break** (3 tentatives,
2 min) ; en cas d'échec final, l'email **garde** le libellé `FACTURES AXONAUT` (il
sera retenté au cycle suivant) et le Data Store empêche tout double envoi.

## Data Store V0 (structure réduite)

Créer `hd_ecommerce_invoice_registry` avec : clé = hash SHA-256, champs
`status` (Text), `original_filename` (Text), `gmail_message_id` (Text),
`drive_original_url` (Text), `created_at` (Date), `sent_at` (Date).
*(La V1 ajoutera les champs métier — la structure Make est extensible sans migration.)*

## Checklist de mise en route (dans l'ordre)

1. ✅ Libellés Gmail — déjà créés.
2. ☐ **T0 vert** (`test-t0-axonaut.md`) — 15 min.
3. ☐ Dossier Drive `FACTURES FOURNISSEURS/HD ECOMMERCE/00_ARCHIVES_ORIGINALES` — 2 min.
4. ☐ Make : connexions Gmail + Drive — 5 min.
5. ☐ Make : Data Store V0 (structure ci-dessus) — 5 min.
6. ☐ Make : construire les 8 modules ci-dessus — ~30 min.
7. ☐ Test : glisser l'email contenant `invoice-standard-fr.pdf` sur `FACTURES AXONAUT`
   → « Run once » → vérifier : archive Drive, dépense dans Axonaut avec PDF, libellé
   passé à `ENVOYEES`.
8. ☐ Test doublon : reglisser le même email (ou le renvoyer) → libellé `DOUBLONS`,
   **une seule** dépense dans Axonaut.
9. ☐ Activer la planification (ON) → l'automatisation tourne toute seule.

## Passage V0 → V1

La V1 (spec `make-scenario-phase-3.md`) s'insère **entre** les modules 4 et 5 :
analyse Claude → Parse JSON → contrôles → clé métier → route Anomalies. Rien de la
V0 n'est jeté : mêmes libellés, même Data Store (enrichi), mêmes modules d'envoi.
