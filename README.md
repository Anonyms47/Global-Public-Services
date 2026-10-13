# Global Public Services

Application web construite avec [Next.js](https://nextjs.org) (App Router), TypeScript et Tailwind CSS.

## Prérequis

- Node.js ≥ 20.9 (version recommandée dans `.nvmrc` : `nvm use`)
- npm

## Démarrage

```bash
npm install
cp .env.example .env.local
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

## Scripts

| Commande            | Rôle                                      |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Serveur de développement (Turbopack)      |
| `npm run build`     | Build de production                       |
| `npm run start`     | Lance le build de production              |
| `npm run lint`      | ESLint                                    |
| `npm run typecheck` | Vérification TypeScript                   |
| `npm run format`    | Formate le code avec Prettier             |
| `npm run check`     | Lint + typecheck + vérification du format |

## Structure

```
src/app/      Routes, layouts et pages (App Router)
public/       Fichiers statiques
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) exécute lint, typecheck, format et build sur chaque PR et push sur `main`. Dependabot met à jour les dépendances chaque semaine.

## Déploiement

Le projet est prêt pour [Vercel](https://vercel.com/new) : importer le dépôt, aucune configuration supplémentaire requise.

## Licence

[MIT](./LICENSE)
