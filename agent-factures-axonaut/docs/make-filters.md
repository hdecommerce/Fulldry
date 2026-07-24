# Filtres et expressions Make

Référence des filtres du scénario `make-scenario-phase-3.md` et des expressions
associées. Les fonctions Python équivalentes (mêmes résultats, testées) sont dans
`src/` — toute divergence entre les deux est un bug.

> Syntaxe : chaque filtre Make est un ensemble de **groupes OR**, chaque groupe
> contenant des **conditions AND**. Les opérateurs indiqués (« Equal to »,
> « Greater than or equal to (numeric) »…) sont à sélectionner dans la liste
> déroulante de l'interface.

---

## 1. Filtre F1 — « Pièce jointe exploitable » (entre Iterator 3 et module 6)

Trois groupes OR (un par type MIME), chacun avec toutes ces conditions AND :

| Condition | Opérateur | Valeur |
|---|---|---|
| `{{3.mimeType}}` | Equal to | `application/pdf` *(groupe 1)* / `image/jpeg` *(groupe 2)* / `image/png` *(groupe 3)* |
| `{{3.size}}` | Greater than or equal to (numeric) | `15000` |
| `{{3.fileName}}` | Exists / Not equal to (vide) | — |
| `{{lower(3.fileName)}}` | Does not contain | `logo` |
| `{{lower(3.fileName)}}` | Does not contain | `signature` |
| `{{lower(3.fileName)}}` | Does not contain | `image00` |
| `{{lower(3.fileName)}}` | Does not contain | `smime` |

Une pièce jointe écartée par F1 est ignorée silencieusement (ni journal, ni alerte) —
c'est le comportement voulu pour les signatures et logos.

## 2. Filtre Route A — « Facture valide » (branche 2 du Router)

Un seul groupe, toutes conditions AND :

| # | Condition | Opérateur | Valeur |
|---|---|---|---|
| 1 | `{{12.exists}}` | Equal to | `false` |
| 2 | `{{12b.total}}` *(recherche hash)* | Equal to (numeric) | `0` |
| 3 | `{{9.confidence}}` | Greater than or equal to (numeric) | `0.95` |
| 4 | `{{upper(9.company)}}` | Equal to | `HD ECOMMERCE` |
| 5 | `{{9.document_type}}` | Equal to | `invoice` |
| 6 | `{{9.invoice_number}}` | Exists + Not equal to (vide) | — |
| 7 | `{{9.supplier_name}}` | Exists + Not equal to (vide) | — |
| 8 | `{{upper(9.currency)}}` | Equal to | `EUR` |
| 9 | `{{9.amount_including_tax}}` | Greater than (numeric) | `0` |
| 10 | `{{11.amounts_coherent}}` | Equal to | `true` |
| 11 | `{{11.vat_breakdown_ok}}` | Equal to | `true` |
| 12 | `{{11.siret_ok}}` | Equal to | `true` |
| 13 | `{{11.dates_ok}}` | Equal to | `true` |
| 14 | `{{11.amount_reasonable}}` | Equal to | `true` |
| 15 | `{{11.blocking_anomaly}}` | Equal to | `false` |

La condition 15 (« aucune anomalie bloquante ») synthétise les codes retournés par
l'IA : voir l'expression `blocking_anomaly` au §5. `MULTIPLE_VAT_RATES` seul n'est
**pas** bloquant (facture multi-taux cohérente → Route A, code journalisé).

## 3. Filtre Route B — « Doublon » (branche 1 du Router, évaluée en premier)

Deux groupes OR :

| Groupe | Condition | Opérateur | Valeur |
|---|---|---|---|
| 1 | `{{12.exists}}` | Equal to | `true` |
| 2 | `{{12b.total}}` | Greater than or equal to (numeric) | `1` |

(Clé métier identique **ou** même fichier déjà vu — les deux mènent en B.)

## 4. Filtre Route C — « Anomalie »

**Aucun filtre : Route C est la route par défaut (fallback) du Router.** Elle
capte mécaniquement : `confidence < 0.95`, `document_type ≠ invoice`, société
inconnue, numéro ou fournisseur absent, montants incohérents, devise ≠ EUR,
dates invalides, SIRET invalide, anomalie bloquante — c'est la contraposée exacte
du filtre A, sans doublon (capté avant par B). Ne pas écrire ces conditions à la
main : une divergence entre A et C créerait des factures perdues.

## 5. Expressions Make

### Module 10 — normalisation

| Variable | Expression |
|---|---|
| `supplier_name_norm` | `{{replace(ascii(lower(9.supplier_name); true); "/[^a-z0-9]/g"; "")}}` |
| `invoice_number_norm` | `{{replace(ascii(lower(9.invoice_number); true); "/[^a-z0-9]/g"; "")}}` |
| `ttc_2dec` | `{{formatNumber(9.amount_including_tax; 2; "."; "")}}` |
| `supplier_clean` | `{{upper(replace(replace(ascii(9.supplier_name; true); "/[\\/\\\\:*?\"<>\\|]/g"; ""); "/\\s+/g"; "-"))}}` |

### Module 11 — contrôles et clé

| Variable | Expression |
|---|---|
| `dedup_key` | `{{if(length(replace(ifempty(9.supplier_siret; ""); "/[^0-9]/g"; "")) = 14; replace(9.supplier_siret; "/[^0-9]/g"; ""); 10.supplier_name_norm)}}-{{10.invoice_number_norm}}-{{10.ttc_2dec}}` |
| `amounts_coherent` | `{{if(abs(9.amount_excluding_tax + 9.vat_amount - 9.amount_including_tax) <= 0.02; true; false)}}` |
| `vat_breakdown_ok` | `{{if(length(9.vat_breakdown) = 0; true; if(abs(sum(map(9.vat_breakdown; "taxable_amount")) - 9.amount_excluding_tax) <= 0.02 & abs(sum(map(9.vat_breakdown; "vat_amount")) - 9.vat_amount) <= 0.02; true; false))}}` |
| `siret_ok` | `{{if(9.supplier_siret = null; true; if(length(replace(9.supplier_siret; "/[^0-9]/g"; "")) = 14; true; false))}}` — *le contrôle de clé de Luhn n'est pas exprimable raisonnablement en expression Make ; il est implémenté dans `src/validation/validators.py` et appliqué par Axonaut/l'humain — limitation documentée* |
| `dates_ok` | `{{if(formatDate(parseDate(9.invoice_date; "YYYY-MM-DD"); "YYYY-MM-DD") = 9.invoice_date; if(9.due_date = null; true; if(parseDate(9.due_date; "YYYY-MM-DD") >= parseDate(9.invoice_date; "YYYY-MM-DD"); true; false)); false)}}` |
| `amount_reasonable` | `{{if(9.amount_including_tax <= 50000; true; false)}}` *(plafond paramétrable)* |
| `blocking_anomaly` | `{{if(length(9.anomalies) = 0; false; if(contains(join(9.anomalies; "\|"); "MULTIPLE_VAT_RATES") & length(9.anomalies) = 1; false; true))}}` — *bloquant sauf si la SEULE anomalie est MULTIPLE_VAT_RATES* |
| `anomaly_codes_local` | Concaténation des contrôles locaux échoués, ex. : `{{if(11.amounts_coherent; ""; "AMOUNT_MISMATCH\|")}}{{if(11.dates_ok; ""; "INVALID_DATE\|")}}{{if(11.siret_ok; ""; "INVALID_SIRET\|")}}` *(à poser dans un module suivant ou inline dans C15, car elle référence le module 11 lui-même)* |
| `normalized_filename` | `{{9.invoice_date}}_{{10.supplier_clean}}_{{upper(10.invoice_number_norm)}}_{{10.ttc_2dec}}_EUR.{{if(3.mimeType = "application/pdf"; "pdf"; if(3.mimeType = "image/png"; "png"; "jpg"))}}` |
| `iban_masked` | `{{if(9.iban = null; ""; substring(9.iban; 0; 4) + "••••••••")}}` |

### Notes de validation

- `MANUAL_CONFIRMATION_REQUIRED` — vérifier dans votre instance, via « Run this
  module only » : la signature exacte de `ascii(texte; true)` (2ᵉ paramètre =
  translittération des accents), le comportement de `sha256()` sur un binaire, et
  les fonctions `map`/`sum` sur un tableau d'objets. Chaque fonction a son
  équivalent Python testé dans `src/` : comparer les sorties sur
  `tests/fixtures/invoice-standard-fr.json` (résultats attendus : clé
  `99900000110000-ft2026001-211.00`, fichier
  `2026-07-01_FOURNITEST-SARL_FT-2026-001_211.00_EUR.pdf`).
- L'échappement des `|` dans `join(...)` s'écrit sans antislash dans l'interface
  Make (l'antislash ci-dessus n'est là que pour le rendu Markdown des tableaux).
