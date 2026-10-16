export type Role = "owner" | "manager" | "seller";

export const roleLabels: Record<Role, string> = {
  owner: "Propriétaire",
  manager: "Gestionnaire",
  seller: "Vendeur",
};

/**
 * Matrice des droits. Vérifiée côté serveur dans chaque action ;
 * l'interface s'en sert seulement pour masquer ce qui n'est pas permis.
 */
export const permissions = {
  "account.self": ["owner", "manager", "seller"],
  "orders.view": ["owner", "manager", "seller"],
  "orders.create": ["owner", "manager", "seller"],
  "orders.progress": ["owner", "manager", "seller"],
  "orders.cancel": ["owner", "manager"],
  "orders.correct": ["owner", "manager"],
  "payments.record": ["owner", "manager", "seller"],
  "payments.refund": ["owner", "manager"],
  "returns.process": ["owner", "manager"],
  "sales.quick": ["owner", "manager", "seller"],
  "catalog.view": ["owner", "manager", "seller"],
  "catalog.edit": ["owner", "manager"],
  "catalog.bulk": ["owner", "manager"],
  "catalog.costs": ["owner"],
  "stock.view": ["owner", "manager", "seller"],
  "stock.restock": ["owner", "manager"],
  "stock.inventory": ["owner", "manager"],
  "customers.view": ["owner", "manager", "seller"],
  "customers.edit": ["owner", "manager", "seller"],
  "customers.export": ["owner"],
  "storefront.edit": ["owner", "manager"],
  "reports.view": ["owner", "manager"],
  "dashboard.finance": ["owner", "manager"],
  "queue.manage": ["owner", "manager", "seller"],
  "launch.view": ["owner", "manager"],
  "shop.mode": ["owner"],
  "reports.margin": ["owner"],
  "settings.edit": ["owner"],
  "team.manage": ["owner"],
  "demo.purge": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

/**
 * Droits retirés aux comptes de démonstration quand la démonstration est
 * protégée (production) : tout ce qui touche aux coordonnées publiques,
 * à l'équipe, aux exports de données et au mode de la boutique.
 */
export const demoRestricted: readonly Permission[] = ["settings.edit", "team.manage", "demo.purge", "customers.export"];

type Who = Role | { role: Role; restricted?: boolean } | undefined | null;

export function can(who: Who, permission: Permission) {
  if (!who) return false;
  const role = typeof who === "string" ? who : who.role;
  if (typeof who !== "string" && who.restricted && demoRestricted.includes(permission)) return false;
  return (permissions[permission] as readonly Role[]).includes(role);
}
