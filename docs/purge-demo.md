# Purge des données de démonstration : sauvegarde et restauration

1. **Essai à blanc** (Paramètres → Données de démonstration → « Essai à blanc ») : la purge s'exécute puis est annulée. Elle affiche les compteurs avant et après, sans rien modifier.
2. **Purge** (« Sauvegarder puis supprimer », propriétaire seulement, saisir PURGER) :
   - une sauvegarde datée (`demo-AAAA-MM-JJ-…`) est enregistrée dans la table `data_backups` ;
   - les données d'exemple sont supprimées dans une seule transaction ;
   - les fichiers d'exemple inutilisés sont retirés du stockage ;
   - l'opération est inscrite au journal d'audit (`demo.purge`, compteurs avant/après).

   La purge peut être relancée sans erreur.

3. **Conservé** :
   - les comptes réels, les rôles et les paramètres ;
   - les catégories, qui deviennent des données réelles ;
   - le stockage, les journaux et les migrations.

## Restaurer

La sauvegarde contient, table par table, les lignes supprimées : `payload->'products'`, `payload->'orders'`, etc. Les comptes d'exemple y figurent sans mot de passe. Pour restaurer, insérez les tables dans l'ordre du `payload`, par exemple :

```sql
insert into products select * from jsonb_populate_recordset(null::products,
  (select payload->'products' from data_backups where label = 'demo-…'))
on conflict (id) do nothing;
```

Ensuite, faites de même pour `variants`, `product_images`, `promotions`, `customers`, `orders`, `order_lines`, `payments`, `order_events`, `stock_movements` et `services`. Remettez enfin `DEMO_MODE=true` si besoin.
