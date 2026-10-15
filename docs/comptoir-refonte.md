# Refonte du Comptoir GPS — audit et plan

## 1. Audit (état de départ, commit `2993bfb`)

**Architecture.** Next.js 16 (App Router) ; logique métier en SQL explicite dans `src/server/domain`, testée hors Next (`tests/domain.test.ts`, PGlite). Schéma idempotent (`src/server/db/schema.ts`, `create table if not exists`) rejoué au démarrage sous verrou consultatif. Production : Supabase Postgres (Paris), Vercel (cdg1), `DEMO_MODE=true`, `SITE_INDEXABLE=false`.

**Ce qui existe et est fiable (conservé tel quel) :**

| Domaine       | Existant                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| Commandes     | États séparés (statut / préparation / réception), paiements partiels, corrections tracées, retours, historique |
| Vente rapide  | Transactionnelle, idempotente, reçu imprimable                                                                 |
| Stock         | Physique / réservé / disponible, contrainte `reserved <= on_hand` en base, lots, inventaire, mouvements        |
| Catalogue     | Formulaire en étapes, brouillon / publié / archivé, duplication, actions groupées, catégories, promotions      |
| Droits        | Matrice `src/lib/permissions.ts`, vérifiée côté serveur par `guarded()`                                        |
| Rapports      | Ventes, encaissements, remboursements, soldes ; marge réservée au propriétaire et seulement si coûts complets  |
| Démonstration | Colonne `is_demo`, purge qui conserve `settings`                                                               |

**Problème de sécurité constaté.** Le dépôt GitHub est public ; le mot de passe partagé des comptes de démonstration figurait dans le README, dans le code d'amorçage et sur la page de connexion de production. Avec `DEMO_MODE=true`, n'importe qui pouvait ouvrir le Comptoir de production en propriétaire (modifier le numéro WhatsApp public, créer des comptes). Aucune trace d'intrusion constatée (3 comptes, tous de démonstration, aucune session ouverte au moment de l'audit). Correction : lot 1.

**Manques par rapport à la mission :** navigation en trois niveaux, palette de commandes avec actions, tableau de bord à formules centralisées et comparaisons, file de travail (File GPS), centre de lancement et santé, modes de boutique, corbeille / restauration / versions du catalogue, médiathèque, import CSV, référence de demande WhatsApp (GPS-R-…), modes de paiement Wave / Orange Money / mixte, stock non vendable, configuration légale (NINEA, RCCM, fuseau), modèles WhatsApp, journal d'audit.

## 2. Principes

- Migrations **additives uniquement** (`add column if not exists`, nouvelles tables, contraintes élargies). Retour arrière : l'ancien code ignore les colonnes et tables ajoutées ; aucune donnée supprimée.
- Aucune donnée d'exemple purgée, `DEMO_MODE` et `SITE_INDEXABLE` inchangés, aucun mode de boutique basculé.
- Aucune coordonnée, opérateur, garantie ou donnée légale inventée : les champs vides restent « À confirmer ».
- Chaque lot : `npm run check`, `npm test`, e2e, CI verte avant mise en production.

## 3. Lots

1. **Sécurité** — démonstration protégée, installation du propriétaire réel, retrait du mot de passe du README.
2. **Navigation** — Piloter / Exploiter / Développer, palette Ctrl/⌘+K (recherche + actions), bouton d'action rapide mobile.
3. **Indicateurs** — module `metrics.ts` (formules documentées), tableau de bord avec période, comparaison et détail de chaque chiffre.
4. **File GPS et Aujourd'hui** — tâches dérivées (à préparer, soldes, stocks faibles, demandes) et tâches manuelles (assigner, noter, reporter, résoudre).
5. **Centre de lancement, santé, modes** — contrôles automatiques avec statut et lien « Corriger » ; modes Démonstration / Test privé / Ouvert préparés, réservés au propriétaire, confirmés et journalisés, non basculés.
6. **Catalogue** — corbeille et restauration, programmation, historique des versions, détection de conflit à l'enregistrement.
7. **Médiathèque** — envoi multiple, corbeille, limites documentées.
8. **Import CSV** — aperçu, erreurs ligne par ligne, création en masse.
9. **Demandes WhatsApp** — référence GPS-R-xxxx dans le message, rattachement à la commande.
10. **Encaissement** — Wave, Orange Money, paiement mixte.
11. **Stock non vendable.**
12. **Configuration** — entreprise (NINEA, RCCM, fuseau Africa/Dakar), modèles WhatsApp.
13. **Équipe et journal d'audit.**
14. **Finitions, tests, documentation, rapport final.**
