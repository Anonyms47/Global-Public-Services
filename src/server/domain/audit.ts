import type { Db } from "../db/client";
import { newId } from "./errors";

/** Trace une action sensible. Ne jamais y mettre de mot de passe ou de secret. */
export async function audit(db: Db, userId: string | null, action: string, target = "", detail: object = {}) {
  await db.query("insert into audit_log (id, action, target, detail, user_id) values ($1, $2, $3, $4, $5)", [
    newId(),
    action,
    target,
    JSON.stringify(detail),
    userId,
  ]);
}

export async function listAudit(db: Db, limit = 50) {
  return db.query<{
    id: string;
    action: string;
    target: string;
    detail: Record<string, unknown>;
    created_at: Date;
    user_name: string | null;
  }>(
    `select a.id, a.action, a.target, a.detail, a.created_at, u.name as user_name
       from audit_log a left join users u on u.id = a.user_id order by a.created_at desc limit $1`,
    [limit],
  );
}

export const auditLabels: Record<string, string> = {
  "launch.target_mode": "Mode de boutique visé",
  "settings.update": "Configuration modifiée",
  "team.create": "Compte créé",
  "team.update": "Compte modifié",
  "account.password": "Mot de passe changé (par son titulaire)",
  "account.sessions": "Autres appareils déconnectés",
  "demo.purge": "Données d'exemple purgées",
  "auth.lockout": "Connexions bloquées (trop d'échecs)",
  "auth.unlock": "Connexions débloquées",
  "category.create": "Catégorie créée",
  "category.update": "Catégorie modifiée",
  "category.profile": "Profil de saisie de catégorie modifié",
  "catalog.restructure": "Catalogue restructuré",
  "category.archive": "Catégorie archivée",
  "category.delete": "Catégorie supprimée",
  "demo.backup": "Sauvegarde des données d'exemple",
  "store.create": "Point de vente créé",
  "store.update": "Point de vente modifié",
  "product.create": "Produit créé",
  "product.update": "Produit modifié",
  "product.publish": "Produit publié",
  "product.unpublish": "Produit retiré du site",
  "product.import": "Produit importé (brouillon)",
  "catalog.import": "Import du catalogue de la boutique",
  "product.checks_done": "Vérifications d'une fiche importée faites",
  "variant.quick_update": "Prix ou seuil modifié (catalogue)",
  "variant.grid_update": "Prix ou coût saisi en grille",
  "media.import_url": "Photo importée depuis une adresse",
  "settings.quick_values": "Valeurs rapides de saisie modifiées",
};
