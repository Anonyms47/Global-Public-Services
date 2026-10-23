import type { Db } from "../db/client";
import { fail } from "./errors";
import { hasRealOwner } from "./auth";
import { audit } from "./audit";
import { getSettings, saveSettingsSection, type Settings, type ShopMode } from "./settings";
import { listStores } from "./stores";
import { DAYS } from "@/lib/stores";

export type CheckStatus = "todo" | "incomplete" | "verify" | "ok" | "blocking";

export const checkStatusLabels: Record<CheckStatus, string> = {
  todo: "À faire",
  incomplete: "Incomplet",
  verify: "À vérifier",
  ok: "Validé",
  blocking: "Bloquant",
};

export interface LaunchCheck {
  key: string;
  level: 1 | 2 | 3;
  label: string;
  status: CheckStatus;
  detail: string;
  fix: string;
}

export const levelLabels = { 1: "Essentiel", 2: "Recommandé", 3: "Finitions" } as const;

export const modeLabels: Record<ShopMode, { label: string; text: string }> = {
  demo: {
    label: "Démonstration",
    text: "Catalogue d'exemple, comptes d'exemple, site non indexé. Rien n'engage GPS.",
  },
  test: {
    label: "Test privé",
    text: "Données réelles, comptes réels, site toujours non indexé : GPS teste avec quelques clients de confiance.",
  },
  open: {
    label: "Ouvert",
    text: "Boutique publique : vrai catalogue, coordonnées validées, site indexable par les moteurs de recherche.",
  },
};

export interface Env {
  demoMode: boolean;
  indexable: boolean;
  siteUrl: string;
  protectedDemo: boolean;
}

/** Mode réellement en vigueur, déduit de la configuration du serveur. */
export function currentMode(env: Env): ShopMode {
  if (env.demoMode) return "demo";
  return env.indexable ? "open" : "test";
}

const filled = (values: string[]) => {
  const n = values.filter((v) => v.trim()).length;
  return n === values.length ? "ok" : n === 0 ? "todo" : "incomplete";
};

export async function launchChecks(db: Db, settings: Settings, env: Env): Promise<LaunchCheck[]> {
  const c = settings.company;
  const [realOwner, catalog, demo, team, stores] = await Promise.all([
    hasRealOwner(db),
    db.one<{ published: number; no_image: number; no_cost: number }>(
      `select
         count(*) filter (where p.status = 'published')::int as published,
         count(*) filter (where p.status = 'published' and not exists (select 1 from product_images i where i.product_id = p.id))::int as no_image,
         (select count(*)::int from variants v join products q on q.id = v.product_id
           where not q.is_demo and v.active and v.cost_price is null) as no_cost
       from products p where not p.is_demo`,
    ),
    db.one<{ n: number }>("select count(*)::int as n from products where is_demo"),
    db.one<{ n: number }>("select count(*)::int as n from users where active and not is_demo"),
    listStores(db, { publishedOnly: true }),
  ]);
  // Points de vente : ce qui manque à chacun (rien n'est deviné à la place de GPS).
  const storesMissing = (test: (s: (typeof stores)[number]) => boolean) =>
    stores.filter((s) => !test(s)).map((s) => s.name);
  const storeCheck = (missing: string[]): CheckStatus =>
    !stores.length ? "todo" : missing.length === stores.length ? "todo" : missing.length ? "incomplete" : "ok";
  const noDays = storesMissing((s) => DAYS.some(([k]) => s.hours?.days?.[k]?.enabled));
  const noPlace = storesMissing((s) => !!s.address.trim() && !!s.landmark.trim());
  const noPhoto = storesMissing((s) => !!s.photo_url);
  const missingIn = (names: string[], what: string) =>
    !stores.length
      ? "Aucun point de vente publié."
      : names.length
        ? `${what} : ${names.join(", ")}.`
        : "Renseigné pour chaque point de vente.";
  const wa = c.whatsapp.replace(/\D/g, "");
  const r = settings.reception;
  // Aucun tarif publié : choix assumé, les frais sont donnés au client sur WhatsApp.
  const feesOnWhatsApp = r.zones.length > 0 && r.zones.every((z) => z.fee === null);
  const checks: LaunchCheck[] = [
    {
      key: "owner",
      level: 1,
      label: "Compte du propriétaire réel",
      status: realOwner ? "ok" : "blocking",
      detail: realOwner
        ? "Un propriétaire réel existe."
        : "Aucun propriétaire réel : la boutique ne peut pas ouvrir avec des comptes d'exemple.",
      fix: "/comptoir/installation",
    },
    {
      key: "whatsapp",
      level: 1,
      label: "Numéro WhatsApp de GPS",
      status: wa.length >= 8 ? "verify" : "blocking",
      detail:
        wa.length >= 8
          ? `+${wa} : envoyez-vous un message test depuis le site pour confirmer.`
          : "Sans numéro, les clients ne peuvent pas envoyer leur commande.",
      fix: "/comptoir/parametres#t-entreprise",
    },
    {
      key: "contact",
      level: 1,
      label: "Adresse, ville, horaires et téléphone",
      status: (() => {
        const st = filled([c.address, c.city, c.hours, c.phone]);
        return st === "todo" ? "blocking" : st;
      })(),
      detail: "Affichés dans le pied de page, la page Contact et les reçus.",
      fix: "/comptoir/parametres#t-entreprise",
    },
    {
      key: "catalog",
      level: 1,
      label: "Catalogue réel publié",
      status: catalog?.published ? "ok" : "blocking",
      detail: catalog?.published
        ? `${catalog.published} produit${catalog.published > 1 ? "s" : ""} réel${catalog.published > 1 ? "s" : ""} publié${catalog.published > 1 ? "s" : ""}.`
        : "Aucun produit publié pour l'instant.",
      fix: "/comptoir/catalogue/nouveau",
    },
    // Contrôle affiché seulement s'il reste des données d'exemple à retirer.
    ...((demo?.n ?? 0) > 0 || env.demoMode
      ? [
          {
            key: "demo",
            level: 1 as const,
            label: "Données d'exemple retirées",
            status: (demo?.n ? "blocking" : "ok") as CheckStatus,
            detail: demo?.n
              ? `${demo.n} produit${demo.n > 1 ? "s" : ""} d'exemple en ligne. À purger au moment de l'ouverture, pas avant.`
              : "Aucune donnée d'exemple.",
            fix: "/comptoir/parametres#t-demo",
          },
        ]
      : []),
    {
      key: "reception",
      level: 1,
      label: "Retrait et livraison",
      status:
        !r.pickupEnabled && !r.deliveryEnabled
          ? "blocking"
          : r.deliveryEnabled && r.zones.length === 0
            ? "incomplete"
            : r.zones.some((z) => z.fee === null) && !feesOnWhatsApp
              ? "verify"
              : "ok",
      detail:
        r.deliveryEnabled && r.zones.length === 0
          ? "Livraison activée sans zone : les frais seront « à confirmer » pour tous."
          : "Modes de réception et frais par zone.",
      fix: "/comptoir/parametres#t-reception",
    },
    {
      key: "delivery",
      level: 1,
      label: "Zones et frais de livraison",
      status: !r.zones.length
        ? "todo"
        : feesOnWhatsApp
          ? "ok"
          : r.zones.some((z) => z.fee === null)
            ? "incomplete"
            : "ok",
      detail: !r.zones.length
        ? "Aucune zone de livraison saisie."
        : feesOnWhatsApp
          ? `${r.zones.length} zone${r.zones.length > 1 ? "s" : ""}, frais précisés au client sur WhatsApp.`
          : r.zones.some((z) => z.fee === null)
            ? `Frais à saisir : ${r.zones
                .filter((z) => z.fee === null)
                .map((z) => z.name)
                .join(", ")}.`
            : `${r.zones.length} zone${r.zones.length > 1 ? "s" : ""} avec frais.`,
      fix: "/comptoir/parametres#t-reception",
    },
    ...(
      [
        ["warranty", "Garantie", settings.policies.warranty],
        ["returns", "Retours", settings.policies.returns],
        ["payment", "Moyens de paiement", settings.policies.payment],
      ] as const
    ).map(([key, label, value]) => ({
      key: `policy-${key}`,
      level: 1 as const,
      label: `Texte « ${label} »`,
      status: (value.trim() ? "ok" : "todo") as CheckStatus,
      detail: "Repris sur les fiches produits et les conditions de vente. Rien n'est inventé à la place de GPS.",
      fix: "/comptoir/parametres#t-politiques",
    })),
    {
      key: "store-days",
      level: 1,
      label: "Jours d'ouverture des points de vente",
      status: storeCheck(noDays),
      detail: noDays.length
        ? `${missingIn(noDays, "Jours à confirmer")} En attendant, seule la plage horaire s'affiche.`
        : missingIn(noDays, ""),
      fix: "/comptoir/parametres/points-de-vente",
    },
    {
      key: "store-place",
      level: 1,
      label: "Adresse et repère de chaque point de vente",
      status: storeCheck(noPlace),
      detail: missingIn(noPlace, "À compléter"),
      fix: "/comptoir/parametres/points-de-vente",
    },
    {
      key: "legal",
      level: 2,
      label: "Raison sociale et immatriculation",
      status: filled([c.legalName, c.ninea || c.legalId, c.rccm || c.legalId]),
      detail: "Raison sociale, NINEA et RCCM, imprimés sur les reçus.",
      fix: "/comptoir/parametres#t-entreprise",
    },
    {
      key: "photos",
      level: 2,
      label: "Photos des produits",
      status: !catalog?.published ? "todo" : catalog.no_image ? "incomplete" : "ok",
      detail: catalog?.no_image
        ? `${catalog.no_image} produit${catalog.no_image > 1 ? "s" : ""} publié${catalog.no_image > 1 ? "s" : ""} sans photo.`
        : "Chaque produit publié a au moins une photo.",
      fix: "/comptoir/catalogue",
    },
    {
      key: "costs",
      level: 2,
      label: "Coûts d'achat",
      status: !catalog?.published ? "todo" : catalog.no_cost ? "incomplete" : "ok",
      detail: catalog?.no_cost
        ? `${catalog.no_cost} variante${catalog.no_cost > 1 ? "s" : ""} sans coût d'achat : la marge ne peut pas être calculée.`
        : "La marge brute est calculable.",
      fix: "/comptoir/catalogue",
    },
    {
      key: "texts",
      level: 2,
      label: "Texte À propos (« Notre histoire » et « La boutique »)",
      status: filled([c.aboutText, c.storeText]),
      detail: "Page À propos et accueil : masqués tant qu'ils sont vides.",
      fix: "/comptoir/parametres#t-entreprise",
    },
    {
      key: "store-photos",
      level: 2,
      label: "Photos des points de vente",
      status: storeCheck(noPhoto),
      detail: missingIn(noPhoto, "Sans photo"),
      fix: "/comptoir/parametres/points-de-vente",
    },
    {
      key: "team",
      level: 3,
      label: "Équipe",
      status: (team?.n ?? 0) > 1 ? "ok" : "verify",
      detail: `${team?.n ?? 0} compte${(team?.n ?? 0) > 1 ? "s" : ""} réel${(team?.n ?? 0) > 1 ? "s" : ""} actif${(team?.n ?? 0) > 1 ? "s" : ""}. Un compte par personne, jamais de mot de passe partagé.`,
      fix: "/comptoir/parametres/equipe",
    },
    {
      key: "backups",
      level: 3,
      label: "Sauvegardes de la base",
      status: "verify",
      detail: "À vérifier chez l'hébergeur de la base (Supabase → Database → Backups).",
      fix: "/comptoir/sante",
    },
    {
      key: "domain",
      level: 3,
      label: "Adresse du site",
      status: !env.siteUrl ? "todo" : /vercel\.app/.test(env.siteUrl) ? "verify" : "ok",
      detail: env.siteUrl ? `Adresse déclarée : ${env.siteUrl}` : "NEXT_PUBLIC_SITE_URL n'est pas renseignée.",
      fix: "/comptoir/sante",
    },
    {
      key: "indexing",
      level: 3,
      label: "Indexation par les moteurs de recherche",
      status: env.indexable && !env.demoMode ? "ok" : "todo",
      detail: "Dernière étape : seulement quand tout le reste est validé.",
      fix: "/comptoir/sante",
    },
  ];
  return checks;
}

export function summarize(checks: LaunchCheck[]) {
  const by = (s: CheckStatus) => checks.filter((c) => c.status === s).length;
  return {
    total: checks.length,
    ok: by("ok"),
    blocking: by("blocking"),
    progress: Math.round((by("ok") / Math.max(1, checks.length)) * 100),
  };
}

/**
 * Prépare le mode visé. Ne modifie aucune variable du serveur : le basculement
 * réel (DEMO_MODE, SITE_INDEXABLE, purge) reste une opération distincte.
 */
export async function setTargetMode(
  db: Db,
  actor: { id: string; name: string },
  mode: ShopMode,
  confirmation: string,
  checks: LaunchCheck[],
) {
  if (!["demo", "test", "open"].includes(mode)) fail("validation", "Mode inconnu.");
  const expected = modeLabels[mode].label.toUpperCase();
  if (confirmation.trim().toUpperCase() !== expected) {
    fail("validation", `Tapez « ${expected} » pour confirmer.`, { confirmation: "Confirmation incorrecte." });
  }
  const blocking = checks.filter((c) => c.status === "blocking" && (mode === "open" || c.key === "owner"));
  if (mode !== "demo" && blocking.length) {
    fail("conflict", `Impossible tant que ces points sont bloquants : ${blocking.map((c) => c.label).join(", ")}.`);
  }
  const s = await getSettings(db);
  const from = s.launch.targetMode;
  await db.tx(async (tx) => {
    await saveSettingsSection(tx, "launch", {
      targetMode: mode,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.name,
    });
    await audit(tx, actor.id, "launch.target_mode", mode, { from, to: mode });
  });
}
