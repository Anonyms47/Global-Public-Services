# GPS — Global Public Services

**Le service qui rassure.** Boutique en ligne (catalogue, variantes, panier, commande préparée sur WhatsApp) et espace de gestion **« Le Comptoir GPS »** (commandes, vente rapide, stock, catalogue, clients, rapports, équipe).

> **Version de présentation.** Le catalogue, les prix, les stocks, les clients et les commandes livrés avec le projet sont des **exemples fictifs** (marques inventées, visuels d'illustration SVG). Ils sont marqués comme tels sur le site et dans le Comptoir, et se suppriment en un clic avant le lancement, sans toucher à la configuration.

## Démarrer la démonstration

```bash
npm install
npm run dev            # http://localhost:3000
```

Sans `DATABASE_URL`, une base PostgreSQL intégrée (PGlite) est créée dans `.data/pglite` et remplie avec la démonstration au premier lancement.

| Espace                                  | Accès                          |
| --------------------------------------- | ------------------------------ |
| Site public                             | http://localhost:3000          |
| Le Comptoir GPS                         | http://localhost:3000/comptoir |
| Propriétaire (tous les droits)          | `proprietaire@demo.gps`        |
| Gestionnaire (sans coûts ni paramètres) | `gestion@demo.gps`             |
| Vendeur (vente, commandes, clients)     | `vente@demo.gps`               |

Le mot de passe local des comptes de démonstration s'affiche sur la page de connexion **en local uniquement**. Les comptes de démonstration n'existent que dans les données d'exemple et **ne peuvent se connecter que si le mode démonstration est actif**. Sur Vercel, la démonstration est protégée : ces comptes n'ont accès ni aux paramètres, ni à l'équipe, ni aux exports, ni à la purge, et ils sont refusés dès qu'un propriétaire réel existe.

## Ce que fait le site

**Public** : accueil (vitrine 40/60 avec une seule vedette, univers, Sélection GPS, focus, comptoir services, boutique, infos pratiques), boutique (recherche par nom, marque, référence et catégorie, filtres et tri partageables dans l'URL, filtres actifs effaçables, retour aux résultats à la même position), univers, fiche produit (galerie et zoom, variantes avec disponibilité, quantité, ajout au panier, question WhatsApp), panier (conservé sur l'appareil, suppression annulable, prix et stocks revérifiés par le serveur avec explication des changements), préparation de commande WhatsApp (retrait ou livraison, frais connus ou « À confirmer avec GPS », message copiable), transfert d'argent, à propos, contact, FAQ, conditions de vente, confidentialité, 404.

Le message WhatsApp reprend références, noms, variantes, quantités, total des produits, réception, coordonnées et frais. **Ouvrir WhatsApp ne vaut ni envoi, ni confirmation, ni réservation** : le site l'explique au client. Sans numéro WhatsApp configuré, le bouton d'envoi est désactivé (mode démonstration) et le message reste prévisualisable et copiable.

**Le Comptoir GPS** :

- **Aujourd'hui** : commandes à préparer, retraits prêts, livraisons, stocks faibles (chaque indicateur ouvre la liste filtrée), raccourcis, ventes enregistrées / encaissements / soldes restants sur une période, détail des opérations.
- **Commandes** : vues par étape, recherche, saisie d'une commande confirmée (réserve le stock), fiche avec état, préparation/réception et paiement distincts, action principale = étape suivante, encaissements partiels, corrections par contre-passation, frais de livraison corrigés avec motif, remboursements, retours (remise en stock seulement si l'état est validé), annulation (libère la réservation), notes internes, chronologie, messages WhatsApp préparés pour le client, reçu imprimable ou téléchargeable.
- **Vente rapide** : catalogue à gauche, vente à droite (onglets sur mobile), variante, quantité, paiement, monnaie rendue, vérification puis confirmation ; vente, paiement et sortie de stock dans une seule transaction ; brouillon conservé en cas d'échec ; reçu et nouvelle vente.
- **Catalogue** : vues visuelle et liste, statuts, actions groupées (publier, brouillon, archiver, catégorie, variation de prix avec aperçu), formulaire en trois étapes (présenter, configurer, publier) avec vérifications avant publication, brouillon local et avertissement avant de quitter, photos téléversées et réordonnables, variantes avec référence, prix, coût et stock propres, duplication, archivage des articles déjà vendus, catégories ordonnées, promotions programmées.
- **Stock** : physique / réservé / disponible par variante, seuils d'alerte, réapprovisionnement par lots, inventaire avec aperçu des écarts, ajustements motivés, historique des mouvements (motif, auteur, commande).
- **Clients** : fiches, historique, notes, alerte de numéro déjà connu avant création, export CSV (propriétaire).
- **Vitrine & services** : vedette, focus, ordre de la Sélection GPS, présentation et photo de la boutique, services de transfert (affichés « confirmés » seulement après validation).
- **Rapports** : ventes, encaissements par moyen, remboursements, soldes, meilleurs produits, marge **uniquement** pour le propriétaire et si tous les coûts d'achat sont renseignés (méthode affichée). Les transferts d'argent ne sont jamais mélangés aux ventes.
- **Paramètres & équipe** : entreprise, WhatsApp, réception et frais par zone, garantie, retours, paiement, seuils, reçus, membres et rôles, purge des données de démonstration.

### Règles de stock

| Événement                     | Effet                                        |
| ----------------------------- | -------------------------------------------- |
| Panier, ouverture de WhatsApp | Aucun                                        |
| Commande confirmée (Comptoir) | Réservation                                  |
| Remise au client              | Sortie définitive (physique et réservé)      |
| Annulation                    | Réservation libérée                          |
| Retour                        | Remise en stock seulement si état revendable |
| Vente au comptoir             | Sortie immédiate, sans toucher aux réservés  |

Chaque mouvement passe par une mise à jour conditionnelle unique, et la base refuse que le réservé dépasse le physique (`check reserved <= on_hand`) : deux réservations simultanées du dernier article ne peuvent pas réussir ensemble (testé sur PGlite et sur PostgreSQL 16).

## Architecture

- **Next.js 16** (App Router, composants serveur, actions serveur), TypeScript, Tailwind CSS 4.
- **PostgreSQL** en SQL explicite (`src/server/db`) : PGlite pour la démonstration locale, `pg` pour la production via `DATABASE_URL`.
- **Logique métier** dans `src/server/domain` (catalogue, stock, commandes, clients, rapports, droits), indépendante de Next et testée.
- **Droits** : matrice dans `src/lib/permissions.ts`, vérifiée côté serveur dans chaque page et chaque action (`src/server/admin.ts`). Sessions par cookie `httpOnly` ; mots de passe hachés avec scrypt.
- **Historique** : désignations, options, prix et coûts sont figés dans chaque ligne de commande ; une modification du catalogue ne réécrit rien.
- **Données d'exemple** : colonne `is_demo` sur les tables métier ; la purge ne touche pas la table `settings`.
- **Indexation** : le site est en `noindex` et `robots.txt` bloque tout tant qu'il y a des données d'exemple ou que `SITE_INDEXABLE` n'est pas à `true`. Le Comptoir est toujours `noindex`. Les fiches produits ont des métadonnées, des URL stables et un balisage `Product` lorsqu'elles deviennent indexables.

## Mise en production

La base Supabase et le projet Vercel sont déjà créés : voir [`docs/mise-en-ligne.md`](docs/mise-en-ligne.md) pour les deux étapes restantes.

1. Créer une base PostgreSQL gérée (Supabase, Neon…) et renseigner `DATABASE_URL`. Le schéma est créé au démarrage.
2. Mettre `DEMO_MODE=false` : aucune donnée d'exemple n'est chargée et les comptes de démonstration ne peuvent pas se connecter.
3. Créer le premier propriétaire : définir `COMPTOIR_SETUP_CODE` (16 caractères minimum, gardé secret) dans l'hébergeur, puis ouvrir `/comptoir/installation`. Alternative en ligne de commande : `DATABASE_URL=… npm run admin:create -- "Nom" email@domaine`.
4. Dans **Paramètres**, renseigner coordonnées, numéro WhatsApp (format international), réception, frais, garantie, retours et paiement.
5. Saisir le vrai catalogue, puis mettre `SITE_INDEXABLE=true` et `NEXT_PUBLIC_SITE_URL`.
6. Déployer (Vercel ou serveur Node). Sauvegardes automatiques de la base à activer chez l'hébergeur.

Si une base de démonstration a servi de base réelle : **Paramètres → Données de démonstration → PURGER**, puis passer `DEMO_MODE=false`.

## Commandes

| Commande               | Rôle                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Développement                                               |
| `npm run build`        | Build de production                                         |
| `npm run check`        | Lint, types, format                                         |
| `npm test`             | Tests métier (PGlite ; `TEST_DATABASE_URL` pour PostgreSQL) |
| `npm run test:e2e`     | Parcours navigateur sur le build (après `npm run build`)    |
| `npm run admin:create` | Créer un compte propriétaire réel                           |
| `npm run demo:images`  | Regénérer les visuels d'illustration                        |

## Vérifications effectuées

- **20 tests métier**, sur PGlite et sur PostgreSQL 16 : réservation à la confirmation et sortie à la remise, paiement partiel et solde, double envoi ignoré (clé d'idempotence), annulation et libération, retour avec ou sans remise en stock, remboursement, correction d'encaissement, réservation concurrente du dernier article (une seule réussit), vente en boutique qui ne prend pas un article réservé, réapprovisionnement, inventaire (refus sous les réservations), ajustement motivé, fin programmée d'une promotion, panier (prix changé, quantité réduite, épuisé), message WhatsApp, historique non réécrit, publication incomplète refusée, recherche par référence, permissions, comptes de démo bloqués hors démo, doublon de numéro, rapports et marge conditionnelle, purge qui conserve la configuration.
- **12 parcours navigateur** sur le build de production (PGlite et PostgreSQL) : message WhatsApp exact (variantes, quantités, total, frais à confirmer), variante épuisée impossible à commander, panier conservé avec prix mis à jour et suppression annulable, recherche et filtres partageables avec retour aux résultats, pages publiques, 404 et `noindex`, accès refusé sans session et droits insuffisants (dont export CSV 403), commande avec réservation, acompte, solde et remise, annulation, vente en boutique puis retour remboursé, réapprovisionnement et inventaire tracés, mobile (deux colonnes, pas de défilement horizontal, menu et filtres fermés par Échap) et ajout au panier au clavier.
- Lint, typage strict, format et build de production.

## Limites connues

- **Photos** : les photos téléversées sont stockées dans la base (simple et sauvegardé avec elle). Pour un gros catalogue, prévoir un stockage objet (Supabase Storage, S3…).
- **Connexion Supabase** : certificat vérifié avec l'autorité racine de Supabase ; `DATABASE_SSL=no-verify` en dernier recours.
- **Démonstration sur Vercel** : sans `DATABASE_URL`, chaque instance aurait sa propre base PGlite éphémère. Pour une démonstration en ligne, utiliser une base PostgreSQL.
- **Visuels** : les illustrations SVG ne remplacent pas des photos ; le rendu final dépendra des photos fournies.
- **Accessibilité** : navigation clavier, focus visible, Échap, libellés et zones tactiles traités et testés en partie ; un audit complet avec lecteur d'écran reste à faire.
- **Notifications** : aucun envoi automatique (WhatsApp, SMS, e-mail) ; les messages sont préparés pour être envoyés par GPS.
- **Paiement en ligne** : volontairement absent de cette version.

## Contenus proposés

Tous les textes du site ont une proposition rédigée (présentation, histoire, retrait, livraison, garantie, retours, paiement, reçus, transfert d'argent) : bouton **« Utiliser la proposition GPS »** dans Paramètres et Vitrine & services. Le fichier [`docs/kit-contenu-gps.md`](docs/kit-contenu-gps.md) les regroupe, avec les textes WhatsApp Business (profil, accueil, absence, réponses rapides), Google Business, réseaux sociaux, un modèle de fiche produit et un guide photo. Aucun fait n'y est inventé : les éléments à compléter sont entre crochets.

## Informations GPS à fournir ou valider

Logo original (fourni ; version vectorielle souhaitable) · numéro WhatsApp · téléphone · e-mail · adresse et lien d'itinéraire · horaires · photo de la boutique et du point de service · texte de présentation · services de transfert réellement proposés (opérateurs, opérations, horaires) · modes de réception, zones et frais de livraison · garantie · retours · moyens de paiement · mentions légales et raison sociale (reçus, conditions de vente, confidentialité) · catalogue réel : produits, marques, photos, variantes, prix, coûts d'achat, stocks, seuils · comptes de l'équipe et rôles.

## Licence

[MIT](./LICENSE)
