# Structure Google Drive

## 1. Arborescence à créer

Noms techniques **sans accents** (à utiliser tels quels) — l'affichage accentué est
possible mais les noms ASCII évitent tout problème d'API, de tri et de recherche.
Le scénario Make référence les dossiers par **ID**, donc le nom reste modifiable
ensuite sans casser le scénario.

```
FACTURES FOURNISSEURS/
└── HD ECOMMERCE/
    ├── 00_ARCHIVES_ORIGINALES/
    ├── 01_A_CONTROLER/
    ├── 02_ENVOYEES_AXONAUT/
    ├── 03_TRAITEES/
    ├── 04_DOUBLONS/
    ├── 05_ANOMALIES/
    └── 06_ERREURS_TECHNIQUES/
```

| Dossier | Rôle |
|---|---|
| `00_ARCHIVES_ORIGINALES` | Copie brute de CHAQUE pièce jointe, avant toute analyse. Jamais modifiée, jamais déplacée, jamais supprimée. |
| `01_A_CONTROLER` | Réservé — option future de validation humaine renforcée avant envoi. |
| `02_ENVOYEES_AXONAUT` | Copies renommées des factures transmises à `expense@axonaut.com` (Route A). |
| `03_TRAITEES` | Classement manuel ou futur : factures validées dans Axonaut. Le scénario V1 n'y écrit pas. |
| `04_DOUBLONS` | Copies des doublons détectés (Route B). |
| `05_ANOMALIES` | Copies des documents en anomalie (Route C). |
| `06_ERREURS_TECHNIQUES` | Copies des documents dont le traitement a échoué techniquement (route E), pour reprise. |

### Sous-organisation par année et mois

À l'intérieur de chaque dossier de flux (00, 02, 04, 05, 06), organiser par année
puis mois :

```
02_ENVOYEES_AXONAUT/
└── 2026/
    ├── 07_JUILLET/
    ├── 08_AOUT/
    └── ...
```

Noms de mois techniques sans accents : `01_JANVIER`, `02_FEVRIER`, `03_MARS`,
`04_AVRIL`, `05_MAI`, `06_JUIN`, `07_JUILLET`, `08_AOUT`, `09_SEPTEMBRE`,
`10_OCTOBRE`, `11_NOVEMBRE`, `12_DECEMBRE`.

**V1 pragmatique** : créer manuellement `2026/07_JUILLET/` (et le mois suivant) dans
`00_ARCHIVES_ORIGINALES` et `02_ENVOYEES_AXONAUT`. L'automatisation de la création
mensuelle (module Drive « Create a Folder » conditionnel, ou rotation manuelle
mensuelle) est un raffinement de V1.1 — la rotation **manuelle** en début de mois est
retenue pour V1 : changer l'ID du dossier cible dans les modules Drive du scénario
(2 modules), ou pointer les modules sur le dossier de flux sans sous-dossier au
départ. `MANUAL_CONFIRMATION_REQUIRED` — choisir l'option au moment de la
construction du scénario.

### Procédure de création

1. Ouvrir Google Drive avec le compte connecté à Make.
2. **Nouveau → Dossier** : `FACTURES FOURNISSEURS` → à l'intérieur : `HD ECOMMERCE`
   → à l'intérieur : les 7 dossiers numérotés ci-dessus.
3. Créer `2026/07_JUILLET` dans `00_ARCHIVES_ORIGINALES` et `02_ENVOYEES_AXONAUT`.
4. **Relever l'ID de chaque dossier** : ouvrir le dossier → l'URL est
   `https://drive.google.com/drive/folders/<ID>` → copier `<ID>` dans le tableau :

| Dossier | ID (à remplir) |
|---|---|
| 00_ARCHIVES_ORIGINALES/2026/07_JUILLET | |
| 02_ENVOYEES_AXONAUT/2026/07_JUILLET | |
| 04_DOUBLONS | |
| 05_ANOMALIES | |
| 06_ERREURS_TECHNIQUES | |

5. **Vérification** : dans Make, lors du mapping du module « Upload a File », ces
   dossiers doivent apparaître dans le sélecteur d'arborescence.

## 2. Convention de nommage des fichiers

```
AAAA-MM-JJ_FOURNISSEUR_NUMERO_FACTURE_MONTANT_TTC_EUR.ext
```

Exemple : `2026-07-01_FOURNITEST-SARL_FT-2026-001_211.00_EUR.pdf`

Règles (implémentées dans `src/utils/filenames.py`, testées dans
`tests/unit/test_filenames.py`) :

1. **Caractères interdits supprimés** : `/ \ : * ? " < > |` et caractères de contrôle.
2. **Espaces multiples réduits** puis espaces → tirets.
3. **Accents translittérés** (`Électricité` → `Electricite`).
4. **Longueur totale limitée à 140 caractères** (troncature du nom de fournisseur en
   priorité, jamais du numéro ni du montant).
5. **Extension conservée** (`pdf`, `jpg`, `png`, en minuscules).
6. **Anti-écrasement** : si le nom existe déjà dans le dossier cible, suffixe `_2`,
   `_3`… avant l'extension. Côté Make : Google Drive crée nativement des fichiers
   distincts à noms identiques (pas d'écrasement), mais la fonction garantit des noms
   uniques lisibles si elle est utilisée.
7. Fichier **original** de `00_ARCHIVES_ORIGINALES` : nom horodaté
   `AAAA-MM-JJ_HHMMSS_<nom-original>` — on ne renomme jamais selon des données
   extraites (elles n'existent pas encore à ce stade).

Équivalent Make (expression complète dans `make-filters.md` §5) :
le composant fournisseur = `upper(replace(ascii(x; true); "/[\s\/\\:*?\"<>|]+/g"; "-"))`.

## 3. Droits d'accès

- Le compte Google connecté à Make doit avoir accès en écriture à
  `FACTURES FOURNISSEURS/` **et à rien d'autre de sensible** — idéalement le dossier
  appartient à ce compte dédié.
- Ne pas partager le dossier publiquement : les liens `webViewLink` insérés dans le
  journal ne doivent être accessibles qu'aux comptes internes autorisés.
