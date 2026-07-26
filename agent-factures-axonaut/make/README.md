# Import du scénario dans Make

`blueprint-v0.json` est le scénario V0 complet (« je glisse → ça part à Axonaut »),
prêt à importer dans Make au lieu de construire les 8 modules à la main.

## Avant l'import (une seule fois, ~12 min)

1. **Connexions** : dans Make, créez les connexions **Gmail** et **Google Drive**
   avec `hdecommerce63@gmail.com` (un module quelconque → « Create a connection »).
2. **Data Store** : menu **Data stores** → **Add data store** →
   `hd_ecommerce_invoice_registry` → structure : `status` (Text),
   `original_filename` (Text), `gmail_message_id` (Text), `drive_original_url`
   (Text), `created_at` (Date), `sent_at` (Date).
3. **Drive** : dossier `FACTURES FOURNISSEURS/HD ECOMMERCE/00_ARCHIVES_ORIGINALES`.

## Import

1. Make → **Scenarios** → **Create a new scenario**.
2. En bas de l'éditeur : bouton **⋯ (More)** → **Import Blueprint** →
   sélectionner `blueprint-v0.json`.
3. Ouvrir chaque module et compléter ce que l'import ne peut pas transporter :
   - la **connexion** (Gmail ou Drive) dans chaque module Google ;
   - module 1 : vérifier la requête `label:FACTURES-AXONAUT has:attachment` et
     activer la récupération des pièces jointes ;
   - module 4 : sélectionner le dossier `00_ARCHIVES_ORIGINALES` ;
   - modules 5, 9, 11 : sélectionner le Data Store `hd_ecommerce_invoice_registry`
     et vérifier le mapping des champs ;
   - modules 7 et 12 : sélectionner les libellés dans les listes déroulantes.
4. Planification : toutes les **5 minutes**.

## Si l'import échoue ou si des modules apparaissent « inconnus »

Les identifiants internes des modules Make (`google-email:…`, `datastore:…`)
varient selon les versions du connecteur — ce fichier utilise les plus probables
mais ils n'ont pas pu être vérifiés depuis cet environnement. Dans ce cas :

1. Créez un scénario vide, posez sur le canevas les 8 modules listés dans
   `../docs/make-scenario-v0-minimal.md` (sans rien configurer) ;
2. **⋯ → Export Blueprint** → envoyez le JSON exporté dans la conversation Claude ;
3. Claude renvoie le blueprint complété avec tous les paramètres, filtres et
   mappings — vous le réimportez, tout est configuré.

## Rappels de sécurité

- Le module 10 (email vers `expense@axonaut.com`) est le **seul** point de sortie
  vers Axonaut. Aucun module Axonaut ne doit être ajouté à ce scénario.
- Jamais de clé API en clair dans un module ; jamais de blueprint exporté committé
  avec des secrets (les blueprints Make n'exportent pas les connexions, mais
  vérifiez avant tout partage).
