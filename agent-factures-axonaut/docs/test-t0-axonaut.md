# Test T0 — Validation de l'ingestion `expense@axonaut.com`

**T0 est le test fondateur de l'architecture V1.** Il vérifie, sans aucun scénario
Make, qu'un email envoyé depuis la boîte Gmail dédiée à `expense@axonaut.com` crée
bien une dépense « à traiter » dans Axonaut avec le justificatif joint.
**Tant que T0 n'est pas vert, ne rien construire dans Make.**
Si T0 est définitivement rouge, l'architecture bascule sur le Plan B
(`architecture.md` §10) — décision à prendre ensemble.

Durée : ~15 minutes. Aucune clé API nécessaire.

---

## 1. Préparer la facture PDF de test

Option A (recommandée) — générer le PDF fictif fourni par le projet :

```bash
python3 scripts/generate_test_invoice.py
# → tests/fixtures/invoice-standard-fr.pdf (~21 Ko)
```

Option B — le créer à la main (traitement de texte → exporter en PDF) avec exactement :

| Champ | Valeur |
|---|---|
| Titre | FACTURE |
| Fournisseur | FOURNITEST SARL, 1 rue du Test, 63000 Clermont-Ferrand |
| SIRET | 999 000 001 10000 *(fictif, série 999 jamais attribuée, clé Luhn valide)* |
| TVA intracom. | FR36999000001 *(fictif, clé cohérente)* |
| Client | HD ECOMMERCE |
| N° | FT-2026-001 |
| Dates | facture 01/07/2026 — échéance 31/07/2026 |
| Montants | HT 200,00 € · TVA 5,5 % : 11,00 € · TTC 211,00 € |
| Mention | « Document strictement fictif — ne pas payer » |

Ne jamais utiliser une vraie société, un vrai SIRET ou un vrai IBAN dans un test.

## 2. Adresse Gmail à utiliser

Envoyer **depuis la boîte Gmail dédiée aux factures fournisseurs** — celle que Make
utilisera (même connexion, même adresse d'expéditeur). C'est le point critique :
Axonaut associe l'email entrant à votre compte, très probablement via l'adresse de
l'expéditeur. `MANUAL_CONFIRMATION_REQUIRED` — vérifier dans
Axonaut → Paramètres (roue dentée) → rubrique Dépenses / Emails autorisés, quelles
adresses sont reconnues, et y ajouter l'adresse de la boîte dédiée si nécessaire.

## 3. Envoyer l'email de test

1. Ouvrir la boîte Gmail dédiée → « Nouveau message ».
2. Destinataire : `expense@axonaut.com`
3. Objet : `Facture FOURNITEST SARL - FT-2026-001` *(même convention que le module
   Make 14 : `Facture {fournisseur} - {numéro}`)*
4. Corps (neutre, sans donnée sensible) :
   `Facture fournisseur transmise pour traitement. Société : HD ECOMMERCE. Test T0.`
5. **Joindre** `invoice-standard-fr.pdf` (vérifier que la pièce jointe est bien
   attachée, pas insérée en lien Drive).
6. Envoyer, noter l'heure d'envoi.

## 4. Vérifier l'arrivée dans Axonaut

1. Attendre 5 à 15 minutes (l'ingestion + OCR ne sont pas instantanés).
2. Ouvrir Axonaut → menu **Dépenses** (ou Achats/Dépenses selon votre affichage).
3. Chercher l'onglet ou le filtre **« Dépenses à traiter »** (dépenses en attente de
   validation, créées par l'ingestion email/OCR). `MANUAL_CONFIRMATION_REQUIRED` —
   l'intitulé exact de l'écran peut varier selon la version d'Axonaut.
4. La dépense de test doit y apparaître.

## 5. Vérifications détaillées

Ouvrir la dépense créée et contrôler :

- **Justificatif attaché** : le PDF est visible/téléchargeable depuis la fiche de la
  dépense, et son contenu correspond à la facture envoyée.
- **OCR** : les montants lus par Axonaut (HT 200,00 / TVA 11,00 / TTC 211,00), la
  date (01/07/2026) et le fournisseur (FOURNITEST SARL) sont pré-remplis ou
  proposés. Des écarts mineurs d'OCR sont tolérables (la validation humaine corrige) ;
  une absence totale d'extraction est un point d'attention, pas un échec de T0.
- **Statut** : la dépense est « à traiter » / non validée, et **non payée**.

## 6. Checklist T0 (à cocher)

| # | Contrôle | OK ? |
|---|---|---|
| 1 | Facture reçue par Axonaut (email accepté, pas de rejet/bounce) | ☐ |
| 2 | Dépense créée dans « Dépenses à traiter » | ☐ |
| 3 | PDF visible sur la fiche de la dépense | ☐ |
| 4 | Fournisseur identifié (FOURNITEST SARL) | ☐ |
| 5 | Date identifiée (01/07/2026) | ☐ |
| 6 | HT identifié (200,00 €) | ☐ |
| 7 | TVA identifiée (11,00 €) | ☐ |
| 8 | TTC identifié (211,00 €) | ☐ |
| 9 | Aucune dépense dupliquée (une seule dépense créée) | ☐ |
| 10 | Aucun paiement déclenché, statut non payé | ☐ |

## 7. Interprétation

**T0 VERT** — lignes 1, 2, 3, 9 et 10 cochées, et au moins le TTC (ligne 8) reconnu
par l'OCR. Les lignes 4–7 partiellement reconnues restent acceptables : la
validation humaine dans Axonaut complète. → Feu vert pour construire le scénario Make.

**T0 ROUGE** — l'un des cas suivants :
- aucune dépense créée après 1 heure ;
- email rejeté (message d'erreur / bounce reçu dans Gmail) ;
- dépense créée **sans** justificatif joint ;
- plusieurs dépenses créées pour un seul envoi ;
- un paiement ou une écriture validée a été généré automatiquement (rédhibitoire).

## 8. Diagnostic en cas d'échec

Dans l'ordre :

1. **Vérifier le bounce** : un message « Undelivered » dans la boîte d'envoi ?
   → adresse mal saisie ou rejet serveur. Corriger, renvoyer.
2. **Adresse expéditrice non reconnue** (cause la plus probable) : Axonaut n'a pas
   pu associer l'email à votre compte. Vérifier dans Axonaut → Paramètres → gestion
   des emails de dépenses / utilisateurs, que l'adresse de la boîte dédiée est
   déclarée. `MANUAL_CONFIRMATION_REQUIRED` — si l'écran n'existe pas, contacter le
   support Axonaut en demandant explicitement : « quelles adresses d'expéditeur sont
   autorisées pour expense@axonaut.com sur mon compte ? ».
3. **Pièce jointe** : re-tester avec un PDF simple non compressé ; vérifier que le
   fichier fait entre 15 Ko et quelques Mo ; éviter les PDF protégés par mot de passe.
4. **Délai** : re-vérifier après 1 h avant de conclure.
5. **Support Axonaut** : fournir l'heure d'envoi, l'adresse expéditrice, l'objet.
6. **Échec définitif** : documenter la cause dans ce fichier (section ci-dessous),
   puis décider ensemble de la bascule Plan B (`architecture.md` §10).

## 9. Résultat du test (à remplir après exécution)

| Date | Exécutant | Résultat | Notes |
|---|---|---|---|
| _à remplir_ | | VERT / ROUGE | |

## 10. Nettoyage après T0

- Supprimer **manuellement** la dépense de test dans Axonaut (c'est la seule
  suppression autorisée : une donnée de test, par un humain).
- Garder l'email envoyé (trace du test).
