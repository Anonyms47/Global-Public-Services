# Médias : stockage, diffusion, migration et retour arrière

## Principe

Les photos et vidéos ne sont plus enregistrées dans PostgreSQL. Les fichiers sont
dans **Supabase Storage** et la table `media` ne garde que les informations utiles :

- type et taille ;
- nom et description ;
- auteur de l'envoi ;
- chemin dans le stockage (`storage_backend`, `storage_path`) ;
- état (`status` : `pending` pendant l'envoi, `ready` une fois vérifié) ;
- empreinte SHA-256 (`checksum`, pour les fichiers migrés) ;
- date de migration et corbeille.

Les relations ne changent pas. Une fiche produit référence un fichier par son
adresse `/media/<id>` (table `product_images` : ordre, couverture, couleur de la
variante, photo ou vidéo). La vitrine fait de même via `settings`.

| Stockage   | Quand                                                         | Limites                                                             |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `supabase` | `SUPABASE_URL` et `SUPABASE_SECRET_KEY` définies (production) | photo 4 Mo après réduction, vidéo 50 Mo                             |
| `local`    | sans `DATABASE_URL` (démonstration locale, tests)             | idem, dans `MEDIA_LOCAL_DIR` ou `<PGLITE_DIR>-media`                |
| `database` | `MEDIA_STORAGE=database` (secours, retour arrière)            | photo 3 Mo, vidéo 4 Mo                                              |
| aucun      | production sans configuration                                 | nouveaux envois suspendus, message sur la médiathèque et dans Santé |

## Compartiment et droits d'accès

- Compartiment **privé** `gps-media` (variable `MEDIA_BUCKET`), avec :
  - une taille maximale de 50 Mo par fichier ;
  - les seuls types JPEG, PNG, WebP, MP4, MOV et WebM.

  Le serveur le crée au besoin. Il peut aussi être créé à l'avance par SQL, voir plus bas.

- **Aucune règle d'accès** n'est définie sur `storage.objects` pour les rôles `anon` et `authenticated`. La sécurité au niveau des lignes est active par défaut, donc personne n'y accède directement. Seul le serveur, avec la clé secrète, lit et écrit. La clé n'est jamais envoyée au navigateur.
- Chemins : `catalogue/AAAA/MM/<id>.<ext>` pour les fichiers réels et `demo/AAAA/MM/<id>.<ext>` pour la démonstration. Les deux restent séparés et repérables.

## Diffusion (`/media/<id>`)

- **Public** : un fichier utilisé par une fiche **publiée** (hors corbeille), la vitrine ou une catégorie visible. Cache court (5 min, versions optimisées comprises) : un fichier dépublié ou mis à la corbeille cesse d’être servi au plus tard 5 min après ; un fichier remplacé change d’adresse. Un fichier non publié n’est jamais mis en cache partagé (`private, no-store`).
- **Privé** : les brouillons, les fichiers non utilisés et la corbeille sont réservés à l'équipe connectée. Ailleurs, la réponse est « introuvable », sans rien révéler.
- **Photos** : relayées par le serveur, avec requêtes partielles (Range).
- **Vidéos** : redirection vers une adresse de lecture signée valable 1 h. Le navigateur les charge par plages (`preload="metadata"`), sans tout télécharger.
- **Côté Comptoir** : les vignettes de fichiers privés sont chargées directement, avec la session, sans l'optimiseur d'images qui n'a pas les cookies.

## Envoi depuis le Comptoir

1. Le navigateur réduit les photos : 2 000 px au plus, WebP ou JPEG à 85 %.
2. `POST /comptoir/mediatheque/envoi` `{action:"start"}` crée la ligne `pending` et une adresse d'envoi signée, à usage unique.
3. Le navigateur envoie le fichier **directement à Supabase**, avec sa propre barre de progression. Plusieurs fichiers partent à la suite.
4. `{action:"finish"}` relit les premiers octets dans le stockage et vérifie le type **réel** et la taille. Si quelque chose ne va pas, le fichier est supprimé.
5. En cas d'échec, `{action:"abort"}` nettoie, puis « Réessayer » relance le même fichier. Un envoi jamais terminé est nettoyé au bout de 24 h.

Suppression définitive : seulement depuis la corbeille et si le fichier n'est plus utilisé. La ligne est retirée, puis l'objet stocké.

## Mise en service (production)

1. Dans Supabase, ouvrez **Project Settings → API Keys** et créez une clé secrète (`sb_secret_…`), ou utilisez la clé `service_role`.
2. Dans Vercel, ouvrez **Settings → Environment Variables** et ajoutez `SUPABASE_SECRET_KEY` en type _Sensitive_, pour Production et Preview. `SUPABASE_URL` est déjà renseignée.
3. Redéployez. La page **Santé** doit indiquer « Supabase Storage (privé) ».

## Migration des fichiers existants (non destructive)

À lancer depuis un poste disposant de `DATABASE_URL`, `SUPABASE_URL` et `SUPABASE_SECRET_KEY` :

```bash
npx tsx scripts/media-storage.ts status            # état
npx tsx scripts/media-storage.ts migrate --dry-run # ce qui serait copié
npx tsx scripts/media-storage.ts migrate           # copie, relecture et comparaison SHA-256, bascule
npx tsx scripts/media-storage.ts verify            # présence, taille et empreinte de chaque fichier
```

- Les octets **restent en base** après la migration. Si le stockage est indisponible, le fichier est servi depuis la base.
- La migration peut être relancée : elle ne refait que ce qui reste.
- Elle ne touche ni aux adresses `/media/<id>`, ni aux fiches, commandes et mouvements.

Plus tard, une fois `verify` sans problème et **après une sauvegarde de la base** :
`npx tsx scripts/media-storage.ts release --confirm` libère les copies en base. Cette étape est irréversible côté base, mais les fichiers restent dans le stockage.

État au 16/10/2026 : la base de production ne contient **aucun** fichier téléversé. Les photos de démonstration sont des fichiers statiques (`/demo/…`) ou des photos Unsplash. Il n'y a donc rien à migrer.

## Retour arrière

1. `npx tsx scripts/media-storage.ts rollback` ramène chaque fichier en base. Si la copie en base a été libérée, il est retéléchargé et son empreinte vérifiée. Il est ensuite servi depuis la base. Les objets stockés ne sont pas supprimés.
2. Définissez `MEDIA_STORAGE=database` dans Vercel, puis redéployez : les nouveaux envois restent en base, avec des limites de 3 Mo et 4 Mo.
3. Pour revenir à une version antérieure de l'application, la colonne `media.data` doit être remplie pour tous les fichiers. C'est le cas après l'étape 1.

Le schéma n'a reçu que des ajouts : colonnes `storage_backend`, `storage_path`, `status`, `checksum`, `migrated_at`, et `data` devenue facultative. Aucune donnée n'a été supprimée.

## Création du compartiment par SQL (facultatif)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gps-media', 'gps-media', false, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;
```

## Limites connues

- **Vidéos** : elles ne sont pas réencodées. Une vidéo MOV d'iPhone en HEVC peut ne pas se lire sur certains navigateurs Android ou Windows. Le format MP4 (H.264) est conseillé.
- **Optimisation** : les photos sont réduites dans le navigateur. Les variantes de taille pour le site sont produites par Next/Image, à partir des fichiers publics seulement.
- **Cache** : un fichier dépublié peut rester visible jusqu’à 5 min.
