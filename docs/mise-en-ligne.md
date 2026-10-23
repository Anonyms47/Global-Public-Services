# Mise en ligne de GPS

Déjà fait :

- **Base de données Supabase** `gps-global-public-services` (région Paris, `eu-west-3`) : schéma installé, accès par l'API publique de Supabase fermé sur toutes les tables (RLS activé sans règle ; seule l'application y accède).
- **Projet Vercel** `gps-global-public-services`, relié au dépôt GitHub : chaque push sur `main` déploie la production, chaque autre branche une préversion.
- Variables Vercel (état au départ) : `DEMO_MODE=true`, `SITE_INDEXABLE=false`, `NEXT_PUBLIC_SITE_URL=https://gps-global-public-services.vercel.app`.

## État actuel (23/10/2026)

- **Domaine** : `globalpublicservices.com` (acheté chez Spaceship, ajouté au projet Vercel). L'adresse officielle est `https://www.globalpublicservices.com` ; le domaine sans « www » redirige vers elle (308). L'ancienne adresse `gps-global-public-services.vercel.app` répond toujours.
- **Comptoir** : `https://www.globalpublicservices.com/comptoir`.
- **Variables Vercel** : `DEMO_MODE=false`, `NEXT_PUBLIC_SITE_URL=https://www.globalpublicservices.com`, `SITE_INDEXABLE=true` en **production uniquement** (les préversions restent fermées aux moteurs de recherche).
- **Indexation** : `robots.txt` autorise tout sauf `/comptoir` et `/panier` ; le plan du site (`/sitemap.xml`) ne liste que les produits publiés et les catégories non vides. Pour accélérer l'apparition dans Google : Google Search Console → ajouter la propriété `globalpublicservices.com` → envoyer `https://www.globalpublicservices.com/sitemap.xml`.
- **Retour en arrière** : remettre `SITE_INDEXABLE=false` dans Vercel puis redéployer ferme le site aux moteurs de recherche.

## Ce qu'il reste à faire (5 minutes)

Le mot de passe de la base n'est jamais transmis à Claude : c'est à vous de le coller dans Vercel.

1. **Supabase** → projet `gps-global-public-services` → bouton **Connect** → onglet **Connection string** → **Transaction pooler** → copier l'adresse (`postgresql://postgres.<projet>:[YOUR-PASSWORD]@<hôte-pooler>:6543/postgres`).
   Remplacez `[YOUR-PASSWORD]` par le mot de passe de la base. Si vous ne le connaissez pas : **Project Settings → Database → Reset database password**.
2. **Vercel** → projet `gps-global-public-services` → **Settings → Environment Variables** → ajouter `DATABASE_URL` avec cette adresse, type **Sensitive**, environnements **Production** et **Preview**.
3. **Fusionner la pull request** vers `main` (ou relancer le dernier déploiement) : Vercel publie le site.
4. Ouvrir l'adresse du site (voir « État actuel ») : le Comptoir est sur `/comptoir`.

Si le journal Vercel affiche une erreur de certificat (`self-signed certificate`), ajoutez la variable `DATABASE_SSL=no-verify` puis redéployez.

## Passage en production réelle

1. Comptoir → **Paramètres** : coordonnées, numéro WhatsApp, réception, frais, textes (bouton « Utiliser la proposition GPS »), raison sociale.
2. Créer le compte du propriétaire réel : dans Vercel → Settings → Environment Variables, ajouter `COMPTOIR_SETUP_CODE` (un code de 16 caractères minimum, choisi par vous, à ne communiquer à personne), redéployer, puis ouvrir `/comptoir/installation`. Dès que ce compte existe, les comptes de démonstration ne peuvent plus se connecter en production. Vous pouvez ensuite supprimer la variable.
3. Comptoir → Paramètres → **PURGER** les données d'exemple, puis dans Vercel `DEMO_MODE=false`.
4. Saisir le vrai catalogue avec les vraies photos, puis `SITE_INDEXABLE=true` et, si besoin, un nom de domaine (Vercel → Settings → Domains) en mettant à jour `NEXT_PUBLIC_SITE_URL`.
5. Supabase → **Database → Backups** : vérifier les sauvegardes (quotidiennes sur les offres payantes ; exporter régulièrement sur l'offre gratuite).
