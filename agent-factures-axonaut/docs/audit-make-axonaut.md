# Audit Phase 1 — Intégrations Make & API Axonaut

**Date : 2026-07-24 — Statut : terminé, avec points bloquants à confirmer avant Phase 3.**

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

## 5. Points bloquants à confirmer AVANT la Phase 3

### 5.1 — Création d'une dépense (`POST /expenses`) — **bloquant n°1**

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

### 5.2 — Rattachement du justificatif à la dépense — **bloquant n°2**

Aucun endpoint « attacher un fichier à une dépense » n'a été trouvé. Conformément au
cahier des charges, la limitation est documentée et la solution de repli actée :
- lien Drive du justificatif dans la **description de la dépense** (toujours fait) ;
- document ajouté à la **fiche société** (`POST /companies/{id}/documents`) si l'upload
  de fichier y est réellement supporté (le format exact du corps — multipart ou base64 —
  n'est pas prouvé par les sources) ;
- jamais de simulation de réussite, jamais de suppression du fichier Drive.

À confirmer dans la doc officielle : si `POST /expenses` existe, accepte-t-il un champ
fichier/pièce jointe à la création ?

### 5.3 — Recherche fournisseur par SIRET

Non prouvée côté API (§1). Prévoir dès l'architecture le filtrage côté scénario
(liste paginée + filtre sur le champ SIRET/TVA du fournisseur), et vérifier dans la doc
officielle les query params réels de `GET /suppliers` et le nom exact du champ SIRET
dans la réponse (`siret` ? `company_number` ? `thirdparty_code` ?).

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
4. Recherche fournisseur potentiellement paginée + filtrée côté client (coût en
   opérations Make si le nombre de fournisseurs est grand).
5. Le justificatif pourrait n'être rattachable qu'à la société, pas à la dépense (§5.2).
6. Une seule société (HD ECOMMERCE) ; multi-sociétés préparé mais non construit.

## 7. Prochaines actions

1. **Vous** : confirmer §5.1 et §5.2 (doc Axonaut authentifiée + interface Make — je
   fournis la check-list exacte ci-dessus). Créer les libellés Gmail et l'arborescence Drive.
2. **Moi (Phase 2)** : architecture définitive gelée une fois §5.1/§5.2 tranchés,
   puis liste ordonnée des modules, filtres et expressions Make, payloads Axonaut
   d'exemple, structure Data Store/journal prête à importer.
3. **Phase 3** : prototype sur une facture PDF réelle avec un fournisseur existant.
