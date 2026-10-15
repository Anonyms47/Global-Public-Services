/**
 * Catalogue et activité de DÉMONSTRATION.
 * Marques, produits, prix, clients et commandes sont fictifs (is_demo = true).
 * `purgeDemo` les supprime sans toucher à la configuration (table settings).
 */
import type { Db } from "../db/client";
import { newId } from "../domain/errors";
import { createUser } from "../domain/auth";
import { saveProduct, type ProductInput } from "../domain/catalog";
import { createOrder, advanceOrder, recordPayment } from "../domain/orders";
import { createCustomer } from "../domain/customers";
import { getSettings, saveSettingsSection } from "../domain/settings";

export const DEMO_PASSWORD = "demo-gps-2026";
export const demoAccounts = [
  {
    email: "proprietaire@demo.gps",
    name: "Awa (propriétaire, démo)",
    role: "owner" as const,
  },
  {
    email: "gestion@demo.gps",
    name: "Koffi (gestionnaire, démo)",
    role: "manager" as const,
  },
  {
    email: "vente@demo.gps",
    name: "Mariam (vendeuse, démo)",
    role: "seller" as const,
  },
];

/**
 * Photos d'exemple issues d'Unsplash (licence Unsplash : usage commercial libre,
 * sans attribution obligatoire). Elles illustrent la catégorie, pas le modèle
 * fictif exact : à remplacer par les photos réelles des articles GPS.
 */
const photo = (id: string, alt: string) => ({
  url: `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&h=1500&q=80`,
  alt,
  color: null,
});

type DemoProduct = Omit<ProductInput, "status" | "featured" | "categoryId" | "isDemo"> & {
  category: string;
  featured?: boolean;
  stock: Record<string, number>;
  costs?: Record<string, number>;
  ageDays: number;
};

const categories = [
  {
    slug: "telephones",
    name: "Téléphones",
    description: "Smartphones neufs et reconditionnés, plusieurs capacités.",
  },
  {
    slug: "airpods-ecouteurs",
    name: "AirPods & écouteurs",
    description: "Écouteurs sans fil et filaires.",
  },
  {
    slug: "casques",
    name: "Casques",
    description: "Casques audio pour la maison et les trajets.",
  },
  {
    slug: "chargeurs",
    name: "Chargeurs",
    description: "Chargeurs secteur, câbles et batteries externes.",
  },
  {
    slug: "accessoires",
    name: "Accessoires",
    description: "Étuis, protections et petits indispensables.",
  },
  {
    slug: "lunettes",
    name: "Lunettes",
    description: "Lunettes de soleil et montures.",
  },
  {
    slug: "chaussures",
    name: "Chaussures",
    description: "Baskets et chaussures de ville.",
  },
  {
    slug: "montres",
    name: "Montres",
    description: "Montres classiques et connectées.",
  },
  {
    slug: "autres-articles",
    name: "Autres articles",
    description: "Objets du quotidien.",
  },
];

const products: DemoProduct[] = [
  {
    name: "Orbis Nova 12",
    brand: "Orbis",
    category: "telephones",
    featured: true,
    ageDays: 3,
    condition: "Neuf",
    description:
      "Grand écran lumineux, triple appareil photo et autonomie confortable pour la journée. Trois capacités pour choisir l'espace dont vous avez besoin.",
    specs: [
      { label: "Écran", value: "6,7 pouces" },
      { label: "Appareil photo", value: "Triple capteur arrière" },
      { label: "Double SIM", value: "Oui" },
      { label: "Contenu de la boîte", value: "Téléphone, câble USB-C" },
    ],
    axes: ["Capacité", "Couleur"],
    images: [
      photo("1598327105666-5b89351aff97", "Smartphone Orbis Nova 12 (photo d'exemple)"),
      photo("1511707171634-5f897ff02aa9", "Smartphone Orbis Nova 12 posé sur une table (photo d'exemple)"),
    ],
    variants: [
      {
        sku: "ORB-N12-128-GR",
        options: { Capacité: "128 Go", Couleur: "Graphite" },
        price: 185000,
      },
      {
        sku: "ORB-N12-128-SA",
        options: { Capacité: "128 Go", Couleur: "Sable" },
        price: 185000,
      },
      {
        sku: "ORB-N12-256-GR",
        options: { Capacité: "256 Go", Couleur: "Graphite" },
        price: 215000,
      },
      {
        sku: "ORB-N12-256-SA",
        options: { Capacité: "256 Go", Couleur: "Sable" },
        price: 215000,
      },
      {
        sku: "ORB-N12-512-GR",
        options: { Capacité: "512 Go", Couleur: "Graphite" },
        price: 265000,
      },
      {
        sku: "ORB-N12-512-SA",
        options: { Capacité: "512 Go", Couleur: "Sable" },
        price: 265000,
      },
    ],
    stock: {
      "ORB-N12-128-GR": 6,
      "ORB-N12-128-SA": 4,
      "ORB-N12-256-GR": 3,
      "ORB-N12-256-SA": 2,
      "ORB-N12-512-GR": 1,
      "ORB-N12-512-SA": 0,
    },
    costs: {
      "ORB-N12-128-GR": 158000,
      "ORB-N12-128-SA": 158000,
      "ORB-N12-256-GR": 184000,
      "ORB-N12-256-SA": 184000,
      "ORB-N12-512-GR": 228000,
      "ORB-N12-512-SA": 228000,
    },
  },
  {
    name: "Orbis Lite 8",
    brand: "Orbis",
    category: "telephones",
    ageDays: 20,
    condition: "Reconditionné — très bon état",
    description:
      "Un téléphone simple et fiable, contrôlé et remis en état. Idéal comme premier smartphone ou téléphone de secours.",
    specs: [
      { label: "Écran", value: "6,1 pouces" },
      {
        label: "État",
        value: "Reconditionné, traces d'usage légères possibles",
      },
      { label: "Contenu de la boîte", value: "Téléphone, câble" },
    ],
    axes: ["Capacité", "Couleur"],
    images: [
      photo("1565849904461-04a58ad377e0", "Smartphone Orbis Lite 8 en main (photo d'exemple)"),
      photo("1610945265064-0e34e5519bbf", "Smartphone Orbis Lite 8 (photo d'exemple)"),
    ],
    variants: [
      {
        sku: "ORB-L8-64-BN",
        options: { Capacité: "64 Go", Couleur: "Bleu nuit" },
        price: 69000,
      },
      {
        sku: "ORB-L8-64-BL",
        options: { Capacité: "64 Go", Couleur: "Blanc" },
        price: 69000,
      },
      {
        sku: "ORB-L8-128-BN",
        options: { Capacité: "128 Go", Couleur: "Bleu nuit" },
        price: 82000,
      },
      {
        sku: "ORB-L8-128-BL",
        options: { Capacité: "128 Go", Couleur: "Blanc" },
        price: 82000,
      },
    ],
    stock: {
      "ORB-L8-64-BN": 3,
      "ORB-L8-64-BL": 2,
      "ORB-L8-128-BN": 2,
      "ORB-L8-128-BL": 1,
    },
  },
  {
    name: "Sonna Buds Air",
    brand: "Sonna",
    category: "airpods-ecouteurs",
    featured: true,
    ageDays: 8,
    condition: "Neuf",
    description:
      "Écouteurs sans fil légers avec boîtier de charge compact. Appairage rapide, commandes tactiles et son clair pour les appels.",
    specs: [
      { label: "Connexion", value: "Bluetooth" },
      { label: "Boîtier", value: "Charge USB-C" },
      { label: "Contenu", value: "Écouteurs, boîtier, embouts" },
    ],
    axes: ["Couleur"],
    images: [
      photo("1572569511254-d8f925fe2cbb", "Écouteurs sans fil Sonna Buds Air (photo d'exemple)"),
      photo("1600294037681-c80b4cb5b434", "Écouteurs Sonna Buds Air et leur boîtier (photo d'exemple)"),
      photo("1606220945770-b5b6c2c55bf1", "Écouteurs Sonna Buds Air noirs (photo d'exemple)"),
    ],
    variants: [
      { sku: "SON-BA-BL", options: { Couleur: "Blanc" }, price: 25000 },
      { sku: "SON-BA-NO", options: { Couleur: "Noir" }, price: 25000 },
      { sku: "SON-BA-BN", options: { Couleur: "Bleu nuit" }, price: 25000 },
    ],
    stock: { "SON-BA-BL": 12, "SON-BA-NO": 7, "SON-BA-BN": 0 },
    costs: { "SON-BA-BL": 16000, "SON-BA-NO": 16000, "SON-BA-BN": 16000 },
  },
  {
    name: "Sonna Studio 2",
    brand: "Sonna",
    category: "casques",
    featured: true,
    ageDays: 30,
    condition: "Neuf",
    description:
      "Casque circum-auriculaire confortable, coussinets souples et arceau réglable. Sans fil ou avec câble jack.",
    specs: [
      { label: "Type", value: "Circum-auriculaire" },
      { label: "Connexion", value: "Bluetooth et jack 3,5 mm" },
    ],
    axes: ["Couleur"],
    images: [
      photo("1505740420928-5e560c06d30e", "Casque Sonna Studio 2 (photo d'exemple)"),
      photo("1546435770-a3e426bf472b", "Casque Sonna Studio 2 de profil (photo d'exemple)"),
    ],
    variants: [
      { sku: "SON-ST2-NO", options: { Couleur: "Noir" }, price: 45000 },
      { sku: "SON-ST2-CR", options: { Couleur: "Crème" }, price: 45000 },
    ],
    stock: { "SON-ST2-NO": 5, "SON-ST2-CR": 2 },
  },
  {
    name: "Volta Chargeur 25W",
    brand: "Volta",
    category: "chargeurs",
    ageDays: 45,
    condition: "Neuf",
    description:
      "Chargeur secteur USB-C compact pour téléphones et écouteurs. Disponible seul ou avec câble USB-C d'un mètre.",
    specs: [
      { label: "Puissance", value: "25 W" },
      { label: "Port", value: "USB-C" },
    ],
    axes: ["Contenu"],
    images: [photo("1583863788434-e58a36330cf0", "Chargeur Volta 25W (photo d'exemple)")],
    variants: [
      {
        sku: "VOL-25-CAB",
        options: { Contenu: "Avec câble USB-C" },
        price: 8000,
      },
      {
        sku: "VOL-25-SEUL",
        options: { Contenu: "Chargeur seul" },
        price: 6500,
      },
    ],
    stock: { "VOL-25-CAB": 25, "VOL-25-SEUL": 2 },
    costs: { "VOL-25-CAB": 4500, "VOL-25-SEUL": 3500 },
  },
  {
    name: "Volta Batterie 20 000 mAh",
    brand: "Volta",
    category: "chargeurs",
    ageDays: 60,
    condition: "Neuf",
    description:
      "Batterie externe pour recharger un téléphone plusieurs fois en déplacement. Deux sorties, indicateur de charge.",
    specs: [
      { label: "Capacité", value: "20 000 mAh" },
      { label: "Sorties", value: "USB-C et USB-A" },
    ],
    axes: [],
    images: [photo("1618410320928-25228d811631", "Batterie externe Volta (photo d'exemple)")],
    variants: [{ sku: "VOL-PB20", options: {}, price: 15000 }],
    stock: { "VOL-PB20": 9 },
  },
  {
    name: "Étui silicone Nova 12",
    brand: "Orbis",
    category: "accessoires",
    ageDays: 5,
    condition: null,
    description:
      "Étui souple au toucher doux, bords relevés pour protéger l'écran et l'appareil photo. Conçu pour l'Orbis Nova 12.",
    specs: [
      { label: "Compatibilité", value: "Orbis Nova 12" },
      { label: "Matière", value: "Silicone" },
    ],
    axes: ["Couleur"],
    images: [
      photo("1603313011101-320f26a4f6f6", "Étui de téléphone (photo d'exemple)"),
      photo("1556656793-08538906a9f8", "Étuis de téléphone (photo d'exemple)"),
    ],
    variants: [
      { sku: "ACC-ET-N12-RG", options: { Couleur: "Rouge" }, price: 5000 },
      { sku: "ACC-ET-N12-NO", options: { Couleur: "Noir" }, price: 5000 },
      { sku: "ACC-ET-N12-SA", options: { Couleur: "Sable" }, price: 5000 },
    ],
    stock: { "ACC-ET-N12-RG": 10, "ACC-ET-N12-NO": 8, "ACC-ET-N12-SA": 4 },
  },
  {
    name: "Lumen Rive",
    brand: "Lumen",
    category: "lunettes",
    featured: true,
    ageDays: 12,
    condition: "Neuf",
    description: "Lunettes de soleil à monture ronde, verres teintés. Livrées avec étui et chiffon.",
    specs: [
      { label: "Forme", value: "Ronde" },
      { label: "Livrées avec", value: "Étui et chiffon" },
    ],
    axes: ["Monture"],
    images: [
      photo("1572635196237-14b3f281503f", "Lunettes de soleil Lumen Rive (photo d'exemple)"),
      photo("1511499767150-a48a237f0083", "Lunettes Lumen Rive de face (photo d'exemple)"),
    ],
    variants: [
      { sku: "LUM-RIV-EC", options: { Monture: "Écaille" }, price: 18000 },
      { sku: "LUM-RIV-NO", options: { Monture: "Noir" }, price: 18000 },
    ],
    stock: { "LUM-RIV-EC": 4, "LUM-RIV-NO": 6 },
  },
  {
    name: "Pas Urbain",
    brand: "Pas",
    category: "chaussures",
    featured: true,
    ageDays: 2,
    condition: "Neuf",
    description:
      "Basket de ville en toile renforcée, semelle souple et légère. Taille habituellement : prenez votre pointure.",
    specs: [
      { label: "Dessus", value: "Toile renforcée" },
      { label: "Semelle", value: "Caoutchouc" },
    ],
    axes: ["Couleur", "Pointure"],
    images: [
      photo("1600269452121-4f2416e55c28", "Baskets Pas Urbain (photo d'exemple)"),
      photo("1549298916-b41d501d3772", "Baskets Pas Urbain, paire (photo d'exemple)"),
    ],
    variants: ["Blanc", "Noir"].flatMap((c) =>
      ["39", "40", "41", "42", "43", "44", "45"].map((p) => ({
        sku: `PAS-URB-${c === "Blanc" ? "BL" : "NO"}-${p}`,
        options: { Couleur: c, Pointure: p },
        price: 32000,
      })),
    ),
    stock: {
      "PAS-URB-BL-39": 2,
      "PAS-URB-BL-40": 3,
      "PAS-URB-BL-41": 4,
      "PAS-URB-BL-42": 3,
      "PAS-URB-BL-43": 2,
      "PAS-URB-BL-44": 1,
      "PAS-URB-BL-45": 0,
      "PAS-URB-NO-39": 1,
      "PAS-URB-NO-40": 2,
      "PAS-URB-NO-41": 3,
      "PAS-URB-NO-42": 0,
      "PAS-URB-NO-43": 2,
      "PAS-URB-NO-44": 2,
      "PAS-URB-NO-45": 1,
    },
  },
  {
    name: "Pas Course",
    brand: "Pas",
    category: "chaussures",
    ageDays: 25,
    condition: "Neuf",
    description: "Chaussure de sport respirante pour la marche et la course légère.",
    specs: [{ label: "Dessus", value: "Maille respirante" }],
    axes: ["Pointure"],
    images: [
      photo("1606107557195-0e29a4b5b4aa", "Chaussures de course Pas Course (photo d'exemple)"),
      photo("1551107696-a4b0c5a0d9a2", "Chaussure de course Pas Course de profil (photo d'exemple)"),
    ],
    variants: ["40", "41", "42", "43", "44"].map((p) => ({
      sku: `PAS-CRS-GR-${p}`,
      options: { Pointure: p },
      price: 28000,
    })),
    stock: {
      "PAS-CRS-GR-40": 2,
      "PAS-CRS-GR-41": 2,
      "PAS-CRS-GR-42": 3,
      "PAS-CRS-GR-43": 1,
      "PAS-CRS-GR-44": 1,
    },
  },
  {
    name: "Orbis Fit",
    brand: "Orbis",
    category: "montres",
    ageDays: 15,
    condition: "Neuf",
    description: "Montre connectée pour suivre ses pas et recevoir ses notifications. Bracelet souple.",
    specs: [{ label: "Compatibilité", value: "Android et iOS" }],
    axes: ["Couleur"],
    images: [
      photo("1546868871-7041f2a55e12", "Montre connectée Orbis Fit (photo d'exemple)"),
      photo("1579586337278-3befd40fd17a", "Montre Orbis Fit au poignet (photo d'exemple)"),
    ],
    variants: [
      { sku: "ORB-FIT-NO", options: { Couleur: "Noir" }, price: 22000 },
      { sku: "ORB-FIT-VE", options: { Couleur: "Vert" }, price: 22000 },
    ],
    stock: { "ORB-FIT-NO": 3, "ORB-FIT-VE": 3 },
  },
];

/**
 * Remplace, sur une base déjà amorcée, les anciennes illustrations vectorielles
 * des produits d'exemple par les photos actuelles. Sans effet sur les produits
 * réels ni sur les photos modifiées depuis le Comptoir.
 */
export async function refreshDemoImages(db: Db) {
  for (const p of products) {
    const row = await db.one<{ id: string }>(
      `select id from products where is_demo and name = $1
         and exists (select 1 from product_images where product_id = products.id and url like '/demo/%')`,
      [p.name],
    );
    if (!row) continue;
    await db.query("delete from product_images where product_id = $1", [row.id]);
    for (const [i, im] of p.images.entries()) {
      await db.query(
        "insert into product_images (id, product_id, url, alt, color, position) values ($1,$2,$3,$4,$5,$6)",
        [newId(), row.id, im.url, im.alt, im.color ?? null, i],
      );
    }
  }
}

export async function hasDemoData(db: Db) {
  const r = await db.one<{ n: number }>("select count(*)::int as n from products where is_demo");
  return (r?.n ?? 0) > 0;
}

export async function seedDemo(db: Db, opts: { onlyIfEmpty?: boolean; now?: Date } = {}) {
  if (opts.onlyIfEmpty) {
    const any = await db.one<{ n: number }>("select count(*)::int as n from products");
    const seeded = await db.one("select 1 from settings where key = 'demo_seeded'");
    if ((any?.n ?? 0) > 0 || seeded) return false;
  }
  const now = opts.now ?? new Date();
  const day = 86400_000;

  const userIds: Record<string, string> = {};
  for (const a of demoAccounts) {
    const existing = await db.one<{ id: string }>("select id from users where email = $1", [a.email]);
    userIds[a.role] = existing?.id ?? (await createUser(db, { ...a, password: DEMO_PASSWORD, isDemo: true }));
  }

  const catIds: Record<string, string> = {};
  for (const [i, c] of categories.entries()) {
    const existing = await db.one<{ id: string }>("select id from categories where slug = $1", [c.slug]);
    if (existing) {
      catIds[c.slug] = existing.id;
      continue;
    }
    const id = newId();
    await db.query(
      "insert into categories (id, slug, name, description, position, is_demo) values ($1,$2,$3,$4,$5,true)",
      [id, c.slug, c.name, c.description, i],
    );
    catIds[c.slug] = id;
  }

  const productIds: Record<string, string> = {};
  for (const [i, p] of products.entries()) {
    const saved = await saveProduct(
      db,
      {
        name: p.name,
        brand: p.brand,
        categoryId: catIds[p.category],
        description: p.description,
        specs: p.specs,
        condition: p.condition,
        axes: p.axes,
        images: p.images,
        status: "published",
        featured: !!p.featured,
        isDemo: true,
        variants: p.variants.map((v) => ({
          ...v,
          initialStock: p.stock[v.sku] ?? 0,
          costPrice: p.costs?.[v.sku] ?? null,
        })),
      },
      { userId: userIds.owner, withCosts: true },
    );
    productIds[p.name] = saved.id;
    const created = new Date(now.getTime() - p.ageDays * day);
    await db.query("update products set created_at = $2, published_at = $2, featured_position = $3 where id = $1", [
      saved.id,
      created,
      i,
    ]);
  }

  // Promotion en cours (se termine automatiquement) + promotion terminée pour vérifier la fin programmée.
  await db.query(
    `insert into promotions (id, name, product_id, kind, value, starts_at, ends_at, is_demo) values
       ($1, 'Offre de lancement (exemple)', $2, 'percent', 20, $3, $4, true),
       ($5, 'Promotion terminée (exemple)', $6, 'amount', 5000, $7, $8, true)`,
    [
      newId(),
      productIds["Sonna Buds Air"],
      new Date(now.getTime() - 2 * day),
      new Date(now.getTime() + 5 * day),
      newId(),
      productIds["Sonna Studio 2"],
      new Date(now.getTime() - 20 * day),
      new Date(now.getTime() - 1 * day),
    ],
  );

  await db.query(
    `insert into services (id, title, summary, operators, operations, hours, confirmed, position, is_demo) values
      ($1, 'Transfert d''argent', 'Envoi et retrait d''argent au comptoir GPS.', '', '', '', false, 0, true)`,
    [newId()],
  );

  // Clients et commandes d'exemple (numéros volontairement factices).
  const actor = { id: userIds.manager, name: "Koffi (gestionnaire, démo)" };
  const c1 = await createCustomer(
    db,
    {
      name: "Client exemple A",
      phone: "000 00 00 01",
      notes: "Préfère être contacté l'après-midi (exemple).",
    },
    { isDemo: true },
  );
  const c2 = await createCustomer(
    db,
    {
      name: "Client exemple B",
      phone: "000 00 00 02",
      address: "Adresse d'exemple",
    },
    { isDemo: true },
  );
  const variant = async (sku: string) =>
    (await db.one<{ id: string }>("select id from variants where sku = $1", [sku]))!.id;

  const o1 = await createOrder(db, actor, {
    idempotencyKey: newId(),
    channel: "whatsapp",
    reception: "pickup",
    customerId: c1,
    lines: [
      { variantId: await variant("ORB-N12-256-GR"), quantity: 1 },
      { variantId: await variant("ACC-ET-N12-NO"), quantity: 1 },
    ],
    isDemo: true,
  });
  await recordPayment(db, actor, o1.id, {
    method: "mobile_money",
    amount: 100000,
    note: "Acompte (exemple)",
  });

  const o2 = await createOrder(db, actor, {
    idempotencyKey: newId(),
    channel: "whatsapp",
    reception: "delivery",
    customerId: c2,
    deliveryAddress: "Adresse d'exemple",
    deliveryFee: null,
    lines: [{ variantId: await variant("PAS-URB-BL-42"), quantity: 1 }],
    isDemo: true,
  });
  await advanceOrder(db, actor, o2.id, "ready");

  const o3 = await createOrder(
    db,
    { id: userIds.seller, name: "Mariam (vendeuse, démo)" },
    {
      idempotencyKey: newId(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: await variant("VOL-25-CAB"), quantity: 2 }],
      payment: { method: "cash", amount: 16000 },
      isDemo: true,
    },
  );
  void o3;

  // La configuration n'est pas une donnée de démonstration : on ne renseigne que des références à la vitrine.
  const settings = await getSettings(db);
  if (!settings.storefront.heroProductId) {
    await saveSettingsSection(db, "storefront", {
      ...settings.storefront,
      heroProductId: productIds["Orbis Nova 12"],
      focusProductId: productIds["Pas Urbain"],
      focusText: "",
    });
  }
  await db.query("insert into settings (key, value) values ('demo_seeded', 'true') on conflict (key) do nothing");
  return true;
}

/**
 * Supprime toutes les données d'exemple. La configuration (coordonnées,
 * réception, reçus, équipe réelle) n'est pas touchée ; seules les références
 * de vitrine pointant vers des produits d'exemple sont remises à zéro.
 */
export async function purgeDemo(db: Db) {
  return db.tx(async (tx) => {
    const realOnDemo = await tx.one<{ n: number }>(
      `select count(*)::int as n from order_lines l join orders o on o.id = l.order_id join products p on p.id = l.product_id
        where not o.is_demo and p.is_demo`,
    );
    if (realOnDemo?.n) {
      throw new Error(
        "Des commandes réelles contiennent des produits d'exemple : archivez ces produits au lieu de les purger.",
      );
    }
    await tx.query("delete from orders where is_demo");
    await tx.query("delete from customers where is_demo");
    await tx.query("delete from promotions where is_demo");
    await tx.query("delete from stock_batches where is_demo");
    await tx.query("delete from products where is_demo");
    await tx.query(
      "delete from categories c where is_demo and not exists (select 1 from products p where p.category_id = c.id)",
    );
    await tx.query("delete from services where is_demo");
    await tx.query("delete from users where is_demo");
    const s = await getSettings(tx);
    const exists = async (id: string | null) => !!id && !!(await tx.one("select 1 from products where id = $1", [id]));
    await saveSettingsSection(tx, "storefront", {
      ...s.storefront,
      heroProductId: (await exists(s.storefront.heroProductId)) ? s.storefront.heroProductId : null,
      focusProductId: (await exists(s.storefront.focusProductId)) ? s.storefront.focusProductId : null,
    });
    await tx.query("insert into settings (key, value) values ('demo_seeded', 'true') on conflict (key) do nothing");
  });
}
