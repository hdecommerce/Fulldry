# Connexion Gmail (compte personnel @gmail.com) dans Make — client OAuth personnalisé

## Pourquoi cette étape

Google n'autorise pas les comptes personnels `@gmail.com` à utiliser le client OAuth
standard de Make pour l'app Gmail (erreur « Il est impossible d'utiliser des
autorisations restreintes avec les comptes client @gmail.com »). La solution
officielle documentée par Make : créer son propre client OAuth dans Google Cloud
(gratuit) et le renseigner dans les **Paramètres avancés** de la connexion.

Une seule fois ; ~10-15 minutes. Concerne uniquement l'app **Gmail** de Make —
la connexion **Google Drive** utilise des autorisations non restreintes et se crée
normalement, sans cette procédure.

## Étape 1 — Créer le projet Google Cloud

1. Ouvrir [console.cloud.google.com](https://console.cloud.google.com) connecté avec
   `hdecommerce63@gmail.com`.
2. Bandeau du haut → sélecteur de projet → **Nouveau projet** → nom : `Make-Gmail`
   → **Créer** → sélectionner ce projet.

## Étape 2 — Activer l'API Gmail

1. Menu ☰ → **API et services** → **Bibliothèque**.
2. Chercher **Gmail API** → **Activer**.

## Étape 3 — Écran de consentement OAuth

1. **API et services** → **Écran de consentement OAuth** (ou « Google Auth Platform »).
2. Type d'utilisateur : **Externe** → Créer.
3. Nom de l'application : `Make HD ECOMMERCE` · Email d'assistance et contact
   développeur : `hdecommerce63@gmail.com` → Enregistrer et continuer.
4. Écran **Champs d'application (Scopes)** → **Ajouter ou supprimer des champs
   d'application** → cocher (ou saisir manuellement) :
   `https://mail.google.com/` → Mettre à jour → Enregistrer et continuer.
5. Écran **Utilisateurs test** → **Add users** → `hdecommerce63@gmail.com`
   → Enregistrer et continuer.
6. **Important** : revenir sur l'écran de consentement et cliquer
   **Publier l'application** (passage « En production »). En mode « Test »,
   Google fait expirer la connexion **tous les 7 jours** — en production, la
   connexion tient. L'avertissement « application non validée » est normal pour
   un usage personnel.

## Étape 4 — Créer l'identifiant OAuth

1. **API et services** → **Identifiants** → **Créer des identifiants** →
   **ID client OAuth**.
2. Type : **Application Web** · Nom : `Make`.
3. **URI de redirection autorisés** → ajouter les deux :
   - `https://www.integromat.com/oauth/cb/google-restricted`
   - `https://www.make.com/oauth/cb/google-restricted`
4. **Créer** → copier le **Client ID** et le **Code secret du client**
   (les garder sous la main, ne jamais les committer).

## Étape 5 — Créer la connexion dans Make

1. Retour dans Make → module Gmail → **Create a connection**.
2. Activer le bouton **Paramètres avancés** (en bas de la fenêtre).
3. Coller **Client ID** et **Client Secret**.
4. **Se connecter avec Google** → choisir `hdecommerce63@gmail.com` →
   écran « Google n'a pas validé cette application » → **Paramètres avancés** →
   **Accéder à Make (non sécurisé)** → tout autoriser.
5. La connexion est créée — elle sert pour TOUS les modules Gmail du scénario
   (Watch Emails, Send an Email ×2, Modify email labels ×2).

## Dépannage

- **« redirect_uri_mismatch »** : l'URI de redirection copiée à l'étape 4.3 ne
  correspond pas — vérifier l'orthographe exacte, attendre 1-2 min après ajout.
- **« access_denied »** : votre adresse n'est pas dans les utilisateurs test
  (étape 3.5) ou l'application n'est pas publiée (étape 3.6).
- **Connexion qui expire au bout de 7 jours** : l'application est restée en mode
  « Test » — la publier (étape 3.6) puis recréer la connexion.
- La connexion **Google Drive** n'a pas besoin de tout cela ; si Make la refuse
  aussi, réessayer sans paramètres avancés (app « Google Drive », pas « Gmail »).
