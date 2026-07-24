# Audit Phase 1 — Intégrations Make & API Axonaut

**Date : 2026-07-24 — Statut : terminé. Points bloquants tranchés le 2026-07-24
(vérification HD ECOMMERCE) — voir §5, décisions actées dans `architecture.md`.**

> **Résumé des décisions :**
> 1. Le connecteur Make Axonaut permet bien de **créer des dépenses**
>    (« Create an Expense ») — confirmé par la documentation du connecteur.
>    Les noms exacts des champs seront relevés dans le module connecté au compte,
>    jamais figés à l'avance.
> 2. **V1 retenue : envoi des factures à `expense@axonaut.com`** (ingestion officielle
>    Axonaut : réception, OCR, création d'une dépense « à traiter » avec justificatif).
>    Le rattachement du justificatif par API n'a plus à être résolu en V1.
> 3. **Une seule méthode d'import à la fois** : jamais « Create an Expense » ET envoi
>    email pour une même facture. Le Plan B (module Create an Expense) est documenté
>    dans `architecture.md` §10 et `make-scenario.md` §10, avec sa limitation
>    (justificatif non confirmé par API — à ne pas présenter comme fonctionnel sans
>    test réel).

## 0. Méthode et honnêteté des sources

La documentation officielle Axonaut (`https://axonaut.com/api/v2/doc`) et les pages
`apps.make.com` / `make.com` étaient **inaccessibles depuis l'environnement d'audit**
(blocage réseau/anti-bot). L'audit s'appuie donc sur :

1. **Le code source de clients open-source de l'API Axonaut v2** — preuves d'appels réels :
   - nœud n8n communautaire `n8n-nodes-axonaut-antislash` (github.com/Lamouller/Axonaut_n8n_node),
     qui revendique la couverture de « tous les endpoints documentés » ;
   - composants Pipedream officiels (`PipedreamHQ/pipedream`, `components/axonaut`).
2. **Les fiches d'intégration Make indexées** (make.com/en/integrations/axonaut,
   apps.make.com/axonaut via moteur de recherche).
3. La connaissance stable des modules génériques Make (Gmail, Drive, Data Store, Router…).

Chaque affirmation ci-dessous est marquée : ✅ vérifié (source code / doc), 🟡 annoncé
mais à confirmer dans l'interface réelle, ❌ non trouvé / non supporté.

> **Règle de ce projet : rien de 🟡 ne sert de fondation. Les points §5 doivent être
> confirmés en ouvrant le compte Make et la doc Axonaut authentifiée avant la Phase 3.**

---

## 1. API Axonaut v2 — faits vérifiés

| Élément | Valeur | Statut |
|---|---|---|
| Base URL | `https://axonaut.com/api/v2` | ✅ (Pipedream + n8n) |
| Authentification | Header HTTP `userApiKey: <clé>` | ✅ (Pipedream + n8n) |
| Format | JSON (`Content-Type: application/json`) | ✅ |
| Pagination | Headers `page` et `per_page` | ✅ (n8n `axonautApiRequestWithPagination`) |
| Limites de taux (rate limits) | Non trouvées dans les sources accessibles | 🟡 à lire dans la doc officielle |

### Endpoints confirmés (appelés par les clients open-source)

**Sociétés / fournisseurs**

| Méthode + chemin | Usage |
|---|---|
| `GET /companies` | Liste des sociétés (clients/prospects) |
| `POST /companies` · `PATCH /companies/{id}` | Créer / modifier une société |
| `GET /suppliers` | Liste des fournisseurs |
| `GET /suppliers/{id}` | Détail d'un fournisseur |
| `POST /suppliers` | **Créer un fournisseur** (champ `name` requis) |
| `GET /supplier-contracts` · `POST /supplier-contracts` | Contrats fournisseurs |

⚠️ Aucun paramètre de recherche par SIRET n'a été observé sur `GET /suppliers` : le nœud
n8n applique un **filtrage côté client** (« Client-side filtering to handle API
limitations »). Hypothèse de travail : la recherche par SIRET se fait en récupérant la
liste paginée et en filtrant dans Make/code. À confirmer (la doc officielle peut exposer
des query params non utilisés par ces clients).

**Dépenses**

| Méthode + chemin | Usage | Statut |
|---|---|---|
| `GET /expenses` | Lister les dépenses | ✅ |
| `GET /expenses/{id}` | Détail d'une dépense | ✅ |
| `POST /expenses/payments` | Créer un **paiement** de dépense — **interdit dans ce projet** | ✅ (existe, ne sera jamais utilisé) |
| `POST /expenses` (créer une dépense) | **NON observé dans les clients open-source** | 🟡 voir §5.1 — point bloquant n°1 |

**Documents**

| Méthode + chemin | Usage | Statut |
|---|---|---|
| `GET /companies/{id}/documents` | Documents d'une société | ✅ |
| `POST /companies/{id}/documents` | Ajouter un document à une **société** (corps JSON) | ✅ appel observé ; le support d'un vrai upload de fichier (multipart/base64) reste 🟡 |
| `PATCH /companies/{id}/documents/{docId}` | Modifier un document | ✅ |
| `GET /documents/{id}` · `GET /documents/{id}/download` | Lire / télécharger | ✅ |
| Rattacher un fichier à une **dépense** | **NON trouvé** | ❌ voir §5.2 — point bloquant n°2 |

**Autres ressources confirmées** (non utilisées en V1) : `/employees`, `/events`,
`/invoices`, `/quotations`, `/products`, `/projects`, `/opportunities`, `/tickets`,
`/payments`, `/tax-rates`, `/bank-accounts`, `/accounting-codes`, `/timetrackings`.

---

## 2. Connecteur Axonaut dans Make

La fiche officielle Make annonce un connecteur Axonaut avec, entre autres :

| Capacité annoncée | Utile pour | Statut |
|---|---|---|
| Search Suppliers / Create a Supplier | Étapes fournisseur (Route A) | 🟡 annoncé — vérifier noms exacts et champs |
| Watch / **Create** / Retrieve / Search Expenses | Création de la dépense | 🟡 « Creates a new expense » listé sur la fiche — **contradiction apparente avec §1 (pas de `POST /expenses` observé)** ; à trancher §5.1 |
| Add a Document (pour une société) | Justificatif via la fiche société | 🟡 |
| Watch/Create/Update/Search Companies, Invoices, Payments, etc. | Hors périmètre V1 | 🟡 |
| Module universel « Make an API Call » | Secours pour tout endpoint manquant | 🟡 (standard sur les connecteurs Make, à confirmer) |

Si un module manque ou est incomplet : **HTTP — Make a Request** vers l'API Axonaut avec
le header `userApiKey` (vérifié §1) remplace n'importe quel module du connecteur.

---

## 3. Modules Make génériques (colonne vertébrale du scénario)

| Besoin du cahier des charges | Module Make réel | Statut / écart |
|---|---|---|
| Surveillance Gmail | **Gmail — Watch Emails** (trigger, requête `label:... has:attachment`) | ✅ existe |
| Itération des pièces jointes | **Iterator** (Flow Control) sur le tableau `Attachments[]` | ✅ existe |
| « Gmail — Download an Attachment » | **N'existe pas sous ce nom.** *Watch Emails* récupère le contenu des pièces jointes (option à activer) ; l'Iterator expose alors les données binaires de chaque pièce jointe | ⚠️ écart de nom, fonctionnellement couvert |
| Filtre type/taille | Filtre Make natif entre modules (conditions sur `mimeType`, `size`) | ✅ |
| Upload Drive | **Google Drive — Upload a File** | ✅ |
| Déplacement Drive | **Google Drive — Move a File/Folder** | ✅ |
| Analyse IA | App **Anthropic Claude** (ou OpenAI) dans Make | 🟡 vérifier que le module accepte un PDF en entrée ; sinon **HTTP — Make a Request** vers `api.anthropic.com/v1/messages` avec bloc `document` (PDF base64) — supporté nativement par l'API Claude ✅ |
| Parse JSON | **JSON — Parse JSON** | ✅ |
| Variables | **Tools — Set Multiple Variables** | ✅ |
| Anti-doublons | **Data Store — Check the existence of a record** / **Add/replace a record** | ✅ |
| Routage A/B/C | **Router** (Flow Control) avec filtres par route | ✅ |
| Libellés Gmail | **Gmail — Modify Email Labels** (ajout/retrait) | ✅ (vérifier le nom exact dans l'interface : « Modify email labels ») |
| Alertes | **Gmail — Send an Email** (ou Email — Send) | ✅ |
| Journal | **Google Sheets — Add a Row** (V1) ; Supabase/PostgreSQL possibles ensuite | ✅ |
| Hash SHA-256 | Fonction Make `sha256()` | 🟡 vérifier son comportement sur données **binaires** ; repli : micro-service / module Code |
| Gestion d'erreurs | Gestionnaires d'erreur Make : *Break* (retry ×3, délai progressif), *Resume*, *Ignore* | ✅ |

---

## 4. Analyse IA — capacités vérifiées

- L'API Anthropic (Messages) accepte les **PDF nativement** (bloc de contenu `document`,
  base64, jusqu'à 100 pages / 32 Mo par requête) et les images (`image`). ✅
- Sortie JSON stricte : consigne système + validation côté Make (Parse JSON avec
  gestionnaire d'erreur) ; jamais de confiance aveugle au JSON retourné. ✅
- OpenAI en secours : l'API vision accepte les images ; les PDF nécessitent l'API
  Files/Responses. 🟡 (le choix V1 se porte sur Claude, PDF natif plus simple).

---

## 5. Points bloquants — RÉSOLUS (2026-07-24)

### 5.1 — Création d'une dépense — ✅ résolu

**Résolution :** la documentation officielle du connecteur Make Axonaut confirme que
l'intégration permet de créer des dépenses. « Axonaut — Create an Expense » est donc
considéré comme disponible dans Make — **mais réservé au Plan B** ; les noms exacts
des champs seront relevés directement dans le module Make connecté au compte Axonaut
avant toute utilisation. Contexte d'origine du doute (conservé pour traçabilité) :

#### Analyse initiale (historique)

- La fiche Make annonce « Creates a new expense » ;
- mais **aucun client open-source n'appelle `POST /expenses`** (le nœud n8n « couverture
  complète » ne propose que lecture + création de paiement).

Deux explications possibles : (a) l'endpoint existe et les clients ne l'ont pas
implémenté ; (b) le connecteur Make utilise un endpoint non public ou la fiche marketing
est imprécise. **Action requise** (5 minutes, compte requis) :
1. ouvrir la doc authentifiée `https://axonaut.com/api/v2/doc` → section *Expenses* ;
2. dans Make, ajouter le module Axonaut → vérifier l'existence réelle de
   « Create an Expense » et lister ses champs (HT, TVA, TTC, n° facture, dates, statut payé).

Sans création de dépense par API, le plan B documenté est l'**adresse email d'ingestion
Axonaut** (Axonaut sait recevoir des factures fournisseurs par email avec OCR intégré —
à vérifier dans les paramètres du compte) — mais on perdrait le contrôle amont ; ce
serait un changement d'architecture à valider ensemble.

### 5.2 — Rattachement du justificatif — ✅ résolu par changement de méthode

**Résolution :** on n'utilise plus aucun endpoint API non confirmé pour le
justificatif. Axonaut permet officiellement d'envoyer factures et justificatifs à
**`expense@axonaut.com`** : Axonaut réceptionne le document, lance son OCR et crée
une dépense dans « Dépenses à traiter » **avec le justificatif joint**. C'est la
méthode retenue pour la V1 (architecture mise à jour dans `architecture.md`).

Point de vigilance à valider en test T0 (`make-scenario.md` §8) : l'adresse Gmail
expéditrice doit être reconnue par Axonaut pour que l'ingestion aboutisse.

**Pour le Plan B uniquement** (« Create an Expense ») : le rattachement du fichier à
la dépense via l'API reste **non confirmé** et ne doit pas être présenté comme
fonctionnel sans test réel — repli : lien Drive dans la description de la dépense ;
jamais de simulation de réussite, jamais de suppression du fichier Drive.

### 5.3 — Recherche fournisseur par SIRET — sans objet en V1

En V1 (ingestion email), c'est Axonaut qui rattache le fournisseur lors de l'OCR.
Reste pertinent **pour le Plan B uniquement** : recherche non prouvée par SIRET côté
API (§1) — prévoir liste paginée + filtre côté scénario, et vérifier les query params
réels de `GET /suppliers` et le nom exact du champ SIRET dans la réponse.

### 5.4 — Divers à confirmer (non bloquants)

- Rate limits Axonaut (pour calibrer les retries).
- Noms exacts des modules dans l'interface Make (« Modify email labels », etc.).
- Support PDF du module Anthropic Claude dans Make (sinon HTTP, déjà prévu).
- Comportement de `sha256()` Make sur du binaire (sinon hash dans un module Code).
- Taille max des pièces jointes traitables par Make selon le plan souscrit
  (les scénarios Make ont une limite de taille de fichier par plan).

---

## 6. Limitations identifiées (assumées en V1)

1. Pas de paiement, pas de validation, pas de suppression — par conception.
2. Archives ZIP et pièces jointes < 15 Ko ignorées.
3. Factures non-EUR, avoirs, proformas, tickets → Route C (anomalies), traitement manuel.
4. V1 : le rattachement du fournisseur et la saisie fine des montants dans Axonaut
   dépendent de l'OCR Axonaut (dépense créée « à traiter », corrigeable à la
   validation humaine). Le pré-contrôle IA en amont bloque les documents douteux.
5. Plan B uniquement : recherche fournisseur paginée + filtrée côté client, et
   justificatif non rattachable à la dépense par API sans test réel probant (§5.2).
6. Une seule société (HD ECOMMERCE) ; multi-sociétés préparé mais non construit.
7. Une seule méthode d'import Axonaut à la fois — jamais email + API pour une même
   facture (règle anti-doublons structurelle).

## 7. Prochaines actions

1. ✅ §5.1 et §5.2 confirmés par HD ECOMMERCE — architecture V1 = ingestion
   `expense@axonaut.com`, Plan B = « Create an Expense » (documenté, non construit).
2. ✅ Phase 2 livrée : `make-scenario.md` (modules ordonnés, filtres, expressions,
   Data Store, prompt IA, procédure de test, check-list de configuration).
3. **Suivant — Phase 3 (prototype)** : exécuter T0 (validation de l'ingestion
   `expense@axonaut.com` depuis la boîte Gmail dédiée), créer libellés/dossiers/
   Data Store/journal, construire le scénario dans Make, dérouler T1 à T8.
