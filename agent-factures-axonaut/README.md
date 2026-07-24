# Agent IA — Factures fournisseurs (Axonaut + Make)

Agent de traitement automatisé des factures d'achat pour **HD ECOMMERCE** (France, EUR).

Le système surveille une boîte Gmail dédiée, extrait les données des factures fournisseurs
(PDF/JPG/PNG) par IA documentaire, contrôle la cohérence, détecte les doublons, crée les
dépenses dans **Axonaut**, archive les justificatifs dans **Google Drive** et journalise
chaque action. L'orchestration est assurée par **Make**.

> **Principe fondateur : l'agent ne paie rien, ne supprime rien, ne valide rien.**
> Toute dépense créée porte la mention « Créée automatiquement — validation requise »
> et reste soumise à validation humaine.

## Statut du projet

| Phase | Contenu | Statut |
|---|---|---|
| Phase 1 | Audit des intégrations Make / Axonaut, structure du projet | ✅ Terminée — voir [`docs/audit-make-axonaut.md`](docs/audit-make-axonaut.md) |
| Phase 2 | Architecture définitive | 🔜 En attente de levée des points bloquants de l'audit |
| Phase 3 | Prototype (1 boîte Gmail, 1 société, 1 facture) | ⏳ |
| Phase 4 | Tests (10 scénarios) | ⏳ |
| Phase 5 | Mise en production | ⏳ |

## Ce que fait l'agent

1. Surveille le libellé Gmail `FACTURES/À TRAITER` (emails avec pièce jointe).
2. Filtre les pièces jointes : `application/pdf`, `image/jpeg`, `image/png`, ≥ 15 Ko.
3. Archive immédiatement l'original dans Drive (`ARCHIVES ORIGINALES/`) — jamais modifié, jamais supprimé.
4. Extrait les données comptables par IA (JSON strict, score de confiance).
5. Contrôle la cohérence HT / TVA / TTC (tolérance 0,02 €), la société destinataire, le SIRET, les dates.
6. Détecte les doublons via une clé normalisée + hash SHA-256 du fichier (Data Store).
7. Route la facture : **A — Valide** (création dépense Axonaut), **B — Doublon** (alerte), **C — Anomalie** (alerte).
8. Recherche le fournisseur dans Axonaut ; le crée uniquement si les données sont fiables (SIRET valide, confiance ≥ 0,98).
9. Classe le fichier dans Drive (`TRAITÉES/`, `DOUBLONS/`, `ANOMALIES/`) et met à jour les libellés Gmail.
10. Journalise chaque événement (journal d'audit complet).

## Ce que l'agent ne fait jamais

- Payer une facture ou déclencher un virement.
- Marquer une dépense comme payée.
- Modifier ou supprimer une facture, une dépense validée ou un document original.
- Envoyer des données sensibles (IBAN, clés, tokens) vers un service non autorisé ou dans les logs.
- Créer une écriture sans trace dans le journal d'audit.

## Architecture (résumé)

```
Gmail (Watch Emails, label FACTURES/À TRAITER)
  → Iterator pièces jointes → Filtre (PDF/JPG/PNG, ≥15 Ko)
  → Archivage original Google Drive
  → Analyse IA (Claude API) → Parse JSON → Normalisation
  → Contrôles de cohérence → Détection doublons (Data Store)
  → Router Make
      ├─ Route A (valide)   : Fournisseur Axonaut (recherche/création) → Dépense → Justificatif → Journal → Drive TRAITÉES → Libellés Gmail
      ├─ Route B (doublon)  : Drive DOUBLONS → Libellés → Alerte → Journal
      └─ Route C (anomalie) : Drive ANOMALIES → Libellés → Alerte → Journal
```

Détail complet : [`docs/architecture.md`](docs/architecture.md).

## Structure du dépôt

```
agent-factures-axonaut/
├── README.md
├── CHANGELOG.md
├── .env.example          # Modèle de variables d'environnement (jamais de vraies clés)
├── .gitignore
├── docs/
│   ├── architecture.md           # Architecture cible détaillée
│   └── audit-make-axonaut.md     # Audit Phase 1 : modules Make & API Axonaut vérifiés
├── examples/             # Exemples de payloads (JSON extraction, dépense Axonaut) — Phase 2+
├── src/                  # Code complémentaire (contrôles, normalisation, hash) — Phase 2+
│   ├── config/  api/{axonaut,ai,google}/  extraction/  validation/
│   ├── duplicates/  logging/  security/  utils/
└── tests/
    ├── unit/  integration/  fixtures/
```

Le code n'est créé que lorsque Make ne suffit pas (contrôles complexes, normalisation,
hash, appels API absents du connecteur). L'orchestration reste dans Make.

## Sécurité

- Toutes les clés vivent dans les connexions Make, un coffre-fort de secrets ou des
  variables d'environnement. **Jamais dans Git.**
- `.env` est ignoré par Git ; seul `.env.example` (vide) est versionné.
- IBAN, clés API, tokens et données bancaires sont masqués dans les logs et le journal.
- Droits minimaux : Gmail (lecture + libellés), Drive (dossier comptable uniquement),
  Axonaut (fonctions nécessaires uniquement).

## Démarrage rapide

1. Lire l'audit : [`docs/audit-make-axonaut.md`](docs/audit-make-axonaut.md) — il liste les
   fonctions vérifiées, les limitations et **les points à confirmer dans vos comptes Make
   et Axonaut avant toute construction**.
2. Copier `.env.example` en `.env` et renseigner les valeurs (ne jamais committer `.env`).
3. Créer les libellés Gmail et l'arborescence Drive décrits dans `docs/architecture.md`.
4. Suivre les phases dans l'ordre — pas de mise en production avant validation des tests.
