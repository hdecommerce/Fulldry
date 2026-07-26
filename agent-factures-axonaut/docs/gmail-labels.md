# Configuration Gmail — Libellés et flux « glisser-déposer »

## 0. Principe de fonctionnement retenu

**Le libellé `FACTURES AXONAUT` est le dossier de dépôt.** Le geste quotidien :

1. Une facture arrive dans la boîte (ou vous en recevez une ailleurs et vous la
   transférez à cette boîte).
2. **Glisser l'email sur le libellé `FACTURES AXONAUT`** dans la colonne de gauche
   (ou : ouvrir l'email → icône libellé 🏷 → cocher `FACTURES AXONAUT`).
3. Au cycle suivant (≤ 15 min), Make prend l'email, archive la pièce jointe dans
   Drive, l'analyse, contrôle, déduplique, et si tout est bon l'envoie à
   `expense@axonaut.com`. Le libellé `FACTURES AXONAUT` est retiré et remplacé par
   le sous-libellé de résultat (`ENVOYEES`, `DOUBLONS`, `ANOMALIES` ou
   `ERREURS-TECHNIQUES`).
4. Vous validez la dépense dans Axonaut (« Dépenses à traiter »).

Un email **sans** le libellé n'est jamais touché. Glisser deux fois le même email
(ou la même facture reçue deux fois) ne crée jamais de doublon : la déduplication
(Data Store) route en `DOUBLONS`.

## 1. Libellés à créer

| Libellé technique (à créer tel quel) | Couleur conseillée | Rôle |
|---|---|---|
| `FACTURES AXONAUT` | Jaune | **Dossier de dépôt** — file d'attente du scénario |
| `FACTURES AXONAUT/ENVOYEES` | Vert | Transmise à Axonaut — à valider là-bas |
| `FACTURES AXONAUT/DOUBLONS` | Orange | Doublon — non transmise |
| `FACTURES AXONAUT/ANOMALIES` | Rouge | Anomalie — non transmise, à regarder |
| `FACTURES AXONAUT/ERREURS-TECHNIQUES` | Gris | Panne technique — sera retentée |

Identifiants **sans accents** ; l'espace dans `FACTURES AXONAUT` est accepté (la
requête de recherche devient `label:FACTURES-AXONAUT`, Gmail convertit espaces et
`/` en tirets).

### Procédure de création (interface Gmail web)

1. Ouvrir Gmail → colonne de gauche, tout en bas → **« Créer un libellé »**.
2. Nom : `FACTURES AXONAUT` → **Créer**.
3. De nouveau « Créer un libellé » → Nom : `ENVOYEES` → cocher **« Imbriquer le
   libellé sous »** → `FACTURES AXONAUT` → **Créer**.
4. Répéter pour `DOUBLONS`, `ANOMALIES`, `ERREURS-TECHNIQUES`.
5. Couleurs : survoler le libellé dans la colonne de gauche → ⋮ → **Couleur du
   libellé** (jaune / vert / orange / rouge / gris).
6. **Vérification** : la recherche `label:FACTURES-AXONAUT` est reconnue (Gmail la
   propose sans « introuvable »).

> Ces libellés peuvent aussi être créés automatiquement via le connecteur Gmail de
> la session Claude (sur approbation) — le résultat est identique.

## 2. Filtre d'entrée automatique (OPTIONNEL)

Le flux principal est **manuel** (glisser-déposer) : c'est vous qui décidez ce qui
part dans le circuit. Si vous voulez en plus un pré-tri automatique, ce filtre
applique le libellé de dépôt aux emails qui ressemblent à des factures :

1. Gmail → roue dentée → Voir tous les paramètres → **Filtres et adresses
   bloquées** → **Créer un filtre**.
2. « Contient les mots » :
   ```
   has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) (subject:(facture) OR subject:(invoice) OR subject:(avoir) OR subject:(justificatif))
   ```
3. Actions : **Appliquer le libellé `FACTURES AXONAUT`** (+ éventuellement « Ne
   jamais envoyer dans le spam »). Rien d'autre.

> ⚠️ **Jamais de filtre Gmail qui transfère vers `expense@axonaut.com`.** Le
> transfert est réservé à Make, après contrôles et déduplication. Un transfert
> direct contournerait tout (doublons, anomalies, journal).

Limites : Gmail ne filtre ni la taille des pièces jointes ni les signatures/logos —
c'est le filtre F1 de Make qui s'en charge (≥ 15 Ko, exclusions de noms). Un email
libellé par erreur (ex. simple signature en pièce jointe) est simplement ignoré par
Make, sans bruit.

## 3. Vérification finale

1. S'envoyer `tests/fixtures/invoice-standard-fr.pdf` en pièce jointe.
2. Glisser l'email sur `FACTURES AXONAUT`.
3. La recherche `label:FACTURES-AXONAUT has:attachment` retourne l'email — c'est
   exactement la requête du déclencheur Make.
