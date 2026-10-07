# Traçabilité colis SaucBack

Application tablette pour tracer les expéditions : la préparatrice photographie l'étiquette de chaque produit mis dans le colis, Claude lit le produit, le numéro de lot et la DLC/DDM, l'app vérifie que la commande est complète, puis écrit la traçabilité dans la commande Shopify (bloc dans la note + tag « Traça OK »). Le registre et la recherche par lot (rappel produit) sont lus directement depuis Shopify : il n'y a pas d'autre base de données.

Stack : Next.js (App Router, TypeScript), API Anthropic côté serveur, Shopify Admin GraphQL. Aucune clé ne quitte le serveur ; la tablette ne parle qu'aux routes `/api`.

## 1. Préparer les accès

### Clé API Anthropic
1. Va sur https://platform.claude.com → **API Keys** → **Create key**.
2. Copie la clé (`sk-ant-…`) : c'est `ANTHROPIC_API_KEY`.

### App Shopify (Dev Dashboard)
Depuis 2026, les « apps personnalisées » ne se créent plus dans l'admin Shopify mais dans le Dev Dashboard.
1. Ouvre https://dev.shopify.com (connecté avec le compte propriétaire de la boutique) → **Apps** → **Create app** → **Start from Dev Dashboard** → nomme-la « Traça SaucBack ».
2. Onglet **Versions** → **Create version** : laisse l'App URL par défaut, choisis la version d'API la plus récente, et coche les scopes `read_orders`, `write_orders`, `read_products`. Puis **Release**.
3. Onglet **Installs** → **Install app** → choisis la boutique → **Install**.
4. **App settings** → copie le **Client ID** et le **Client secret** : ce sont `SHOPIFY_CLIENT_ID` et `SHOPIFY_CLIENT_SECRET`. L'app obtient elle-même un token (renouvelé toutes les 24 h).

Si tu as déjà une app personnalisée ancienne avec un token `shpat_…`, renseigne plutôt `SHOPIFY_ADMIN_TOKEN` (il a priorité).

Si le Dev Dashboard refuse avec `shop_not_permitted`, la boutique et l'app ne sont pas dans la même organisation Shopify : vérifie dans le Dev Dashboard que la boutique apparaît bien sous **Dev stores** / la même organisation.

### Code PIN et secret de session
- `APP_PIN` : 4 à 8 chiffres, demandé une fois par tablette.
- `SESSION_SECRET` : chaîne aléatoire d'au moins 32 caractères (`openssl rand -hex 32`).

## 2. Lancer en local

```bash
cd saucback-traca
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev                  # http://localhost:3000
```

La caméra en direct (`getUserMedia`) n'est autorisée qu'en HTTPS ou sur `localhost`. Pour tester depuis la tablette sur le réseau local, passe par le déploiement Vercel (HTTPS), ou utilise le bouton « Depuis l'appareil photo ».

## 3. Déployer sur Vercel

1. Pousse ce dossier dans un repo Git (ou garde-le dans ce monorepo).
2. Sur https://vercel.com → **Add New Project** → importe le repo. Si le repo contient d'autres dossiers, mets **Root Directory** = `saucback-traca`.
3. **Environment Variables** : ajoute toutes les variables de `.env.example` (`ANTHROPIC_API_KEY`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` ou `SHOPIFY_ADMIN_TOKEN`, `APP_PIN`, `SESSION_SECRET`). Les variables de modèle sont facultatives.
4. **Deploy**. L'URL est du type `https://saucback-traca.vercel.app`.

Le plan gratuit de Vercel suffit. Les lectures de photo durent 3 à 15 s ; la route est configurée avec `maxDuration = 60`.

## 4. Installer sur la tablette

1. Ouvre l'URL dans **Chrome** sur la tablette Android, entre le PIN.
2. Menu ⋮ → **Ajouter à l'écran d'accueil** (ou « Installer l'application »).
3. Au premier « Ouvrir la caméra », autorise la caméra. La lampe apparaît si la tablette la supporte.
4. Dans les réglages Android, règle la mise en veille de l'écran sur une durée longue (l'app demande aussi un « wake lock »).

## 5. Comment ça marche

- **Commandes** : `orders(query: "fulfillment_status:unfulfilled status:open")`, filtrées côté serveur (non annulées, non fermées, sans tag Traça). Rafraîchies toutes les 60 s et à chaque retour sur l'app.
- **Photos** : réduites à 1600 px côté tablette, envoyées à `/api/read-label`, lues par le modèle rapide ; relecture automatique par le modèle précis si un lot ou une date est douteux. 2 lectures en parallèle, file d'attente au-delà. Hors ligne, les photos attendent le retour du réseau.
- **Contrôle** : `/api/check-order` demande à Claude d'associer étiquettes et lignes de commande (contenu des box lu dans le titre ou la fiche produit), puis le serveur recalcule les quantités depuis les indices renvoyés. Le total de l'IA n'est jamais repris.
- **Validation** : quand tout est ✓ et qu'aucune ligne n'est bloquante, compte à rebours de 2 s (bouton « Attendre »), puis `/api/shipments` : relit la note, remplace un éventuel ancien bloc `--- Traça SaucBack --- … --- fin traça ---`, écrit la note, pose le tag. Un bandeau « Annuler » reste 8 s et retire bloc + tag.
- **Blocages** sans forçage possible : date dépassée, lot ou date manquant, date mal formée. Forçage possible (tag « Traça forcée ») : produit manquant, en trop, ou contrôle en échec.
- **Registre / recherche / CSV** : lus depuis les commandes portant un tag Traça (300 dernières), bloc de note analysé. CSV `;` avec BOM UTF-8 pour Excel.

## 6. Tests

```bash
npm test            # Vitest : dates, lots, fusion, « complet », bloc de note, CSV
npx playwright test # bout en bout avec Shopify et Claude simulés (e2e/mock-server.mjs)
```

Le test de bout en bout rejoue le scénario : commande box 4 produits → 4 photos → validation automatique → note écrite (note client conservée) → recherche par lot → export CSV → annulation.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic |
| `CLAUDE_MODEL_FAST` | Modèle de 1re lecture et de contrôle (défaut `claude-sonnet-5-5`) |
| `CLAUDE_MODEL_PRECISE` | Modèle de relecture (défaut `claude-opus-5-5`) |
| `SHOPIFY_STORE_DOMAIN` | `xxx.myshopify.com` |
| `SHOPIFY_API_VERSION` | Défaut `2026-10` |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | App Dev Dashboard (client credentials) |
| `SHOPIFY_ADMIN_TOKEN` | Alternative : token `shpat_…` d'une app personnalisée existante |
| `APP_PIN` | Code PIN de la tablette |
| `SESSION_SECRET` | Signature du cookie de session (≥ 16 caractères) |
