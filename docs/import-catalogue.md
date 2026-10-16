# Import du catalogue relevé en boutique

Manifeste versionné : `data/gps-catalogue-reel-2026-10-16.json` (74 produits, 106 variantes), préparé selon
`docs/PROMPT-IMPORT-CATALOGUE-GPS.md`.

- **En production** : Comptoir → Catalogue → Import → « Catalogue relevé en boutique » (propriétaire seulement).
  La page affiche la simulation ; l'import demande de taper `IMPORTER`.
- **En local** : `npm run catalogue:import:gps -- --dry-run`, puis
  `npm run catalogue:import:gps -- --apply --confirm=IMPORTER` (option `--only=cle1,cle2` pour une reprise ciblée).

Garanties :

- tout est créé en **brouillon privé**, prix à 0 (publication impossible tant qu'un prix n'est pas saisi), sans coût,
  stock ni code-barres ;
- idempotent par clé externe (`products.internal->>'externalKey'`, index unique) : relancer ne crée aucun doublon ;
  un produit saisi à la main sous le même nom est ignoré ;
- sauvegarde datée dans `data_backups` (`catalogue-avant-import-…`) avant toute écriture ;
- journal : `product.import` par produit, `catalog.import` pour l'ensemble ;
- sources, notes et vérifications humaines restent internes (`products.internal`), affichées sur la fiche du
  Comptoir, jamais sur le site.

Photos : déposer `IMG_3638.jpeg` à `IMG_3719.jpeg` (sans `IMG_3680`) dans `data/photos-boutique/`. Elles
n'étaient pas disponibles lors de la préparation : les fiches sont créées sans média, à compléter depuis chaque fiche.
