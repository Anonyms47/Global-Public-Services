@AGENTS.md

## Commandes

- `npm run dev` — serveur de développement (base PGlite de démonstration dans `.data/pglite`)
- `npm run check` — lint + typecheck + format (à lancer avant chaque commit)
- `npm test` — tests métier ; `npm run build && npm run test:e2e` — parcours navigateur

## Repères

- Logique métier : `src/server/domain` (SQL explicite, testée hors Next).
- Chaque action du Comptoir passe par `guarded()` (`src/server/admin.ts`) : session et droits vérifiés côté serveur.
- Données d'exemple : `is_demo = true`, jamais dans `settings`.
