# Agent IA — Factures fournisseurs (Axonaut + Make)

Agent de traitement automatisé des factures d'achat pour **HD ECOMMERCE** (France, EUR).

Le système surveille une boîte Gmail dédiée, extrait les données des factures fournisseurs
(PDF/JPG/PNG) par IA documentaire, contrôle la cohérence, détecte les doublons, crée les
dépenses dans **Axonaut**, archive les justificatifs dans **Google Drive** et journalise
chaque action. L'orchestration est assurée par **Make**.

> **Principe fondateur : l'agent ne paie rien, ne supprime rien, ne valide rien.**
> Toute dépense créée porte la mention « Créée automatiquement — validation requise »
> et reste soumise à validation humaine.

## Décision d'architecture V1 (2026-07-24)

L'import dans Axonaut se fait par **envoi de la facture validée à
`expense@axonaut.com`** — l'ingestion officielle Axonaut réceptionne le document,
lance son OCR et crée une dépense dans « Dépenses à traiter » avec le justificatif
joint. Le module Make « Axonaut — Create an Expense » (confirmé disponible) est
réservé au **Plan B** documenté — jamais utilisé en même temps que l'envoi email,
pour ne jamais créer de doublon dans Axonaut.

## Statut du projet

| Phase | Contenu | Statut |
|---|---|---|
| Phase 1 | Audit des intégrations Make / Axonaut, structure du projet | ✅ Terminée — [`docs/audit-make-axonaut.md`](docs/audit-make-axonaut.md) |
| Phase 2 | Architecture définitive + spécification du scénario Make | ✅ Terminée — [`docs/architecture.md`](docs/architecture.md), [`docs/make-scenario.md`](docs/make-scenario.md) |
| Phase 3 | Prototype — livrables hors-ligne (code, tests, docs, prompts, modèles) | ✅ Livrés — actions manuelles restantes : [`docs/manual-setup-checklist.md`](docs/manual-setup-checklist.md) |
| Phase 3 (suite) | T0 puis construction du scénario dans Make | 🔜 Première action : **T0** ([`docs/test-t0-axonaut.md`](docs/test-t0-axonaut.md)) |
| Phase 4 | Tests (T1 → T8) | ⏳ |
| Phase 5 | Mise en production | ⏳ |

**Tests unitaires** : `python3 -m unittest discover -s tests/unit` (59 tests, aucune
dépendance externe). **PDF de test** : `python3 scripts/generate_test_invoice.py`.

## Ce que fait l'agent

1. Surveille le libellé Gmail `FACTURES AXONAUT` (emails avec pièce jointe).
2. Filtre les pièces jointes : `application/pdf`, `image/jpeg`, `image/png`, ≥ 15 Ko.
3. Archive immédiatement l'original dans Drive (`ARCHIVES ORIGINALES/`) — jamais modifié, jamais supprimé.
4. Extrait les données comptables par IA (JSON strict, score de confiance).
5. Contrôle la cohérence HT / TVA / TTC (tolérance 0,02 €), la société destinataire, le SIRET, les dates.
6. Détecte les doublons via une clé normalisée (fournisseur + n° facture + TTC) + hash SHA-256 du fichier (Data Store) — un même document ne peut jamais être envoyé deux fois.
7. Route la facture : **A — Valide** (envoi à `expense@axonaut.com`, statut « envoyée à Axonaut — validation requise »), **B — Doublon** (aucun envoi, alerte), **C — Anomalie** (aucun envoi, alerte).
8. Classe le fichier dans Drive (`ENVOYÉES AXONAUT/`, `DOUBLONS/`, `ANOMALIES/`) et met à jour les libellés Gmail (`FACTURES AXONAUT/ENVOYEES`, `FACTURES AXONAUT/DOUBLONS`, `FACTURES AXONAUT/ANOMALIES`).
9. Journalise chaque événement (journal d'audit complet).
10. Laisse Axonaut créer la dépense « à traiter » via son OCR — la validation finale reste humaine, dans Axonaut.

## Ce que l'agent ne fait jamais

- Payer une facture ou déclencher un virement.
- Marquer une dépense comme payée.
- Modifier ou supprimer une facture, une dépense validée ou un document original.
- Envoyer des données sensibles (IBAN, clés, tokens) vers un service non autorisé ou dans les logs.
- Créer une écriture sans trace dans le journal d'audit.

## Architecture (résumé)

```
Gmail (Watch Emails, label FACTURES AXONAUT)
  → Iterator pièces jointes → Filtre (PDF/JPG/PNG, ≥15 Ko)
  → Archivage original Google Drive (ARCHIVES ORIGINALES)
  → Analyse IA (Claude API) → Parse JSON → Normalisation
  → Contrôles de cohérence → Détection doublons (Data Store)
  → Router Make
      ├─ Route A (valide)   : Data Store (anti-second-envoi) → email vers expense@axonaut.com
      │                       → Journal → Drive ENVOYÉES AXONAUT → Libellés Gmail
      ├─ Route B (doublon)  : AUCUN envoi → Journal → Alerte → Libellés
      └─ Route C (anomalie) : AUCUN envoi → Drive ANOMALIES → Journal → Alerte → Libellés
```

Détail : [`docs/architecture.md`](docs/architecture.md) ·
Spécification opérationnelle complète (modules, filtres, expressions, tests) :
[`docs/make-scenario.md`](docs/make-scenario.md) ·
Plan B (« Create an Expense ») : `architecture.md` §10 — justificatif par API non
confirmé, à ne pas présenter comme fonctionnel sans test réel.

## Structure du dépôt

```
agent-factures-axonaut/
├── README.md · CHANGELOG.md · requirements.txt (stdlib uniquement)
├── .env.example · .gitignore          # jamais de vraies clés
├── docs/
│   ├── architecture.md                # Architecture V1 (expense@axonaut.com) + Plan B
│   ├── audit-make-axonaut.md          # Audit Phase 1 (points bloquants résolus)
│   ├── make-scenario-phase-3.md       # ★ Référence de construction : modules A/B/C/E
│   ├── make-filters.md                # Filtres + expressions Make exactes
│   ├── make-data-store.md             # Structure hd_ecommerce_invoice_registry
│   ├── make-scenario.md               # (historique Phase 2 ; tests T0–T8)
│   ├── test-t0-axonaut.md             # ★ Test fondateur de l'ingestion Axonaut
│   ├── gmail-labels.md                # Libellés + filtres Gmail
│   ├── google-drive-structure.md      # Arborescence Drive + nommage
│   ├── google-sheets-journal.md       # Journal d'audit
│   └── manual-setup-checklist.md      # ★ Actions manuelles B1→B10, dans l'ordre
├── prompts/                           # Prompts système + utilisateur de l'extraction
├── schemas/invoice-extraction.schema.json
├── templates/invoice-processing-journal.csv
├── scripts/generate_test_invoice.py   # PDF fictif sans dépendance
├── examples/invoice-output.json
├── src/                               # Fonctions testées : normalisation, noms de
│   ├── utils/  validation/  duplicates/   # fichiers, hash, clé doublon, SIRET/TVA/dates,
│   └── ...                                # codes d'anomalies
└── tests/
    ├── unit/       # 59 tests (unittest, stdlib)
    └── fixtures/   # 5 cas JSON + invoice-standard-fr.pdf (fictifs)
```

Le code n'est créé que lorsque Make ne suffit pas (contrôles complexes, normalisation,
hash). L'orchestration reste dans Make ; les expressions Make et les fonctions Python
sont maintenues équivalentes (mêmes entrées → mêmes sorties).

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
