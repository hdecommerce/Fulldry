# Configuration Gmail — Libellés et filtres

## 1. Libellés à créer

Cinq libellés, tous sous le libellé parent `FACTURES`.
**Identifiants techniques sans accents ni espaces** (les requêtes `label:` sur des
libellés accentués/espacés sont fragiles) — le tableau donne les deux formes :

| Libellé technique (à créer tel quel) | Rôle |
|---|---|
| `FACTURES/A-TRAITER` | File d'attente d'entrée du scénario |
| `FACTURES/ENVOYEES-AXONAUT` | Facture transmise à Axonaut — validation requise |
| `FACTURES/DOUBLONS` | Doublon détecté — non transmise |
| `FACTURES/ANOMALIES` | Anomalie fonctionnelle — non transmise |
| `FACTURES/ERREURS-TECHNIQUES` | Erreur technique (API indisponible, etc.) — retraitable |

> Si vous tenez aux accents à l'affichage (« À TRAITER »), sachez que Gmail utilise
> alors ce nom accentué comme identifiant : le scénario Make fonctionnera (il
> sélectionne les libellés par ID dans une liste déroulante), mais la requête du
> déclencheur devra être testée avec soin. **Recommandation ferme : versions sans
> accents ci-dessus.**

### Procédure de création (interface Gmail web)

1. Ouvrir Gmail avec la boîte dédiée aux factures.
2. Colonne de gauche → tout en bas → **« Créer un libellé »**
   (ou roue dentée → **Voir tous les paramètres** → onglet **Libellés** →
   **Créer un libellé**).
3. Nom du libellé : `FACTURES` → **Créer** (libellé parent).
4. De nouveau **Créer un libellé** → Nom : `A-TRAITER` → cocher
   **« Imbriquer le libellé sous »** → choisir `FACTURES` → **Créer**.
5. Répéter l'étape 4 pour : `ENVOYEES-AXONAUT`, `DOUBLONS`, `ANOMALIES`,
   `ERREURS-TECHNIQUES`.
6. **Vérification** : la colonne de gauche montre `FACTURES` avec 5 sous-libellés ;
   dans la barre de recherche Gmail, taper `label:FACTURES-A-TRAITER` → Gmail
   propose le libellé (résultat vide, mais reconnu — pas de message « introuvable »).

> Note : dans les requêtes de recherche, Gmail représente `FACTURES/A-TRAITER`
> par `label:FACTURES-A-TRAITER` (le `/` devient `-`). C'est cette forme qu'utilise
> le déclencheur Make.

## 2. Filtre d'entrée recommandé

Objectif : appliquer automatiquement `FACTURES/A-TRAITER` aux emails candidats.

> ⚠️ **Interdiction de conception : aucun filtre Gmail ne doit transférer quoi que
> ce soit vers `expense@axonaut.com`.** Le transfert est effectué exclusivement par
> Make, APRÈS extraction, contrôles de cohérence et déduplication. Un filtre de
> transfert automatique contournerait tous les contrôles et créerait des doublons.

### Filtre principal

1. Gmail → roue dentée → **Voir tous les paramètres** → onglet **Filtres et adresses
   bloquées** → **Créer un filtre**.
2. Champ **« Contient les mots »** :
   ```
   has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) (subject:(facture) OR subject:(invoice) OR subject:(avoir) OR subject:(justificatif))
   ```
3. **Créer un filtre** → cocher uniquement :
   - **Appliquer le libellé** : `FACTURES/A-TRAITER`
   - (optionnel) **Ne jamais envoyer dans le spam**
4. **Créer le filtre**.

### Limites connues de ce filtre (assumées)

- Gmail ne sait pas filtrer sur la **taille d'une pièce jointe** ni exclure
  « signatures » et « logos » : cette exclusion est faite par le **filtre F1 de
  Make** (MIME + taille ≥ 15 Ko + exclusions de noms — voir `make-filters.md` §1).
  Un email dont seule la signature est une image passera le filtre Gmail puis sera
  ignoré proprement par Make.
- Une facture reçue **sans** mot-clé dans l'objet ne sera pas libellée : prévoir le
  geste manuel (glisser le libellé `FACTURES/A-TRAITER` sur l'email) — c'est aussi
  la porte d'entrée volontaire pour tout email à faire traiter.

### Variante plus large (optionnelle)

Si trop de factures passent à côté du filtre principal, créer un second filtre par
expéditeurs connus :
```
from:(fournisseur1.com OR fournisseur2.com) has:attachment
```
avec la même action (libellé `FACTURES/A-TRAITER`). À enrichir au fil de l'eau.

## 3. Vérification finale

1. S'envoyer un email de test avec `invoice-standard-fr.pdf` en pièce jointe et
   l'objet `Facture de test FOURNITEST` → le libellé `FACTURES/A-TRAITER` doit
   apparaître automatiquement.
2. La recherche `label:FACTURES-A-TRAITER has:attachment` doit retourner cet email —
   c'est exactement la requête que le déclencheur Make utilisera.
