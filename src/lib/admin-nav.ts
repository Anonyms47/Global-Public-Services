import type { Permission } from "./permissions";

export interface NavItem {
  href: string;
  label: string;
  perm: Permission;
  icon: string;
  /** Mots-clés supplémentaires pour la palette de commandes. */
  keywords?: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/** Navigation du Comptoir en trois niveaux. */
export const adminNavGroups: NavGroup[] = [
  {
    key: "piloter",
    label: "Piloter",
    items: [
      { href: "/comptoir", label: "Aujourd'hui", perm: "orders.view", icon: "today", keywords: "accueil journée" },
      {
        href: "/comptoir/file",
        label: "File GPS",
        perm: "queue.manage",
        icon: "inbox",
        keywords: "tâches à faire boîte",
      },
      {
        href: "/comptoir/tableau-de-bord",
        label: "Tableau de bord",
        perm: "orders.view",
        icon: "dashboard",
        keywords: "chiffres indicateurs kpi chiffre d'affaires",
      },
      { href: "/comptoir/rapports", label: "Rapports", perm: "reports.view", icon: "reports", keywords: "marge" },
      {
        href: "/comptoir/lancement",
        label: "Centre de lancement",
        perm: "launch.view",
        icon: "launch",
        keywords: "ouverture mode démonstration test",
      },
    ],
  },
  {
    key: "exploiter",
    label: "Exploiter",
    items: [
      {
        href: "/comptoir/vente",
        label: "Vente rapide",
        perm: "sales.quick",
        icon: "sale",
        keywords: "caisse encaisser",
      },
      {
        href: "/comptoir/demandes",
        label: "Demandes WhatsApp",
        perm: "orders.view",
        icon: "request",
        keywords: "panier site GPS-R",
      },
      { href: "/comptoir/commandes", label: "Commandes", perm: "orders.view", icon: "orders", keywords: "whatsapp" },
      { href: "/comptoir/stock", label: "Stock", perm: "stock.view", icon: "stock", keywords: "inventaire" },
      { href: "/comptoir/clients", label: "Clients", perm: "customers.view", icon: "customers" },
    ],
  },
  {
    key: "developper",
    label: "Développer",
    items: [
      { href: "/comptoir/catalogue", label: "Catalogue", perm: "catalog.view", icon: "catalog", keywords: "produits" },
      {
        href: "/comptoir/vitrine",
        label: "Vitrine & services",
        perm: "storefront.edit",
        icon: "storefront",
        keywords: "accueil transfert",
      },
      {
        href: "/comptoir/parametres",
        label: "Configuration",
        perm: "settings.edit",
        icon: "settings",
        keywords: "paramètres coordonnées whatsapp livraison",
      },
      {
        href: "/comptoir/parametres/equipe",
        label: "Équipe",
        perm: "team.manage",
        icon: "team",
        keywords: "comptes droits",
      },
      {
        href: "/comptoir/sante",
        label: "Santé du Comptoir",
        perm: "launch.view",
        icon: "health",
        keywords: "contrôles journal",
      },
    ],
  },
];

export interface QuickAction {
  href: string;
  label: string;
  perm: Permission;
  keywords?: string;
}

/** Actions de la palette et du bouton d'action rapide (mobile). */
export const quickActions: QuickAction[] = [
  { href: "/comptoir/vente", label: "Nouvelle vente", perm: "sales.quick", keywords: "caisse" },
  {
    href: "/comptoir/commandes/nouvelle",
    label: "Enregistrer une commande",
    perm: "orders.create",
    keywords: "whatsapp",
  },
  { href: "/comptoir/catalogue/nouveau", label: "Ajouter un produit", perm: "catalog.edit" },
  { href: "/comptoir/stock/reapprovisionner", label: "Réapprovisionner", perm: "stock.restock", keywords: "arrivage" },
  { href: "/comptoir/stock/inventaire", label: "Faire un inventaire", perm: "stock.inventory" },
  { href: "/comptoir/commandes?vue=a-preparer", label: "Voir les commandes à préparer", perm: "orders.view" },
  { href: "/comptoir/file", label: "Ajouter une tâche à la file", perm: "queue.manage", keywords: "rappel" },
];
