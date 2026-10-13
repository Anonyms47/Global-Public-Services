import { describe, expect, it, beforeAll } from "vitest";
import type { Db } from "@/server/db/client";
import { demoDb, userByRole, variantBySku } from "./helpers";
import {
  createOrder,
  advanceOrder,
  cancelOrder,
  getOrder,
  processReturn,
  recordPayment,
  refund,
  reversePayment,
  correctDeliveryFee,
} from "@/server/domain/orders";
import {
  restock,
  applyInventory,
  inventoryPreview,
  adjustStock,
} from "@/server/domain/stock";
import {
  publishedProducts,
  saveProduct,
  productForEdit,
  filterProducts,
} from "@/server/domain/catalog";
import { checkCart } from "@/server/domain/cart";
import { assertCan, login, userFromToken } from "@/server/domain/auth";
import { createCustomer, phoneMatches } from "@/server/domain/customers";
import { report, periodFromKey } from "@/server/domain/reports";
import { purgeDemo, DEMO_PASSWORD } from "@/server/demo/seed";
import { getSettings, saveSettingsSection } from "@/server/domain/settings";
import { buildOrderMessage } from "@/lib/whatsapp";

let db: Db;
let manager: { id: string; name: string };
const key = () => crypto.randomUUID();

beforeAll(async () => {
  db = await demoDb();
  manager = await userByRole(db, "manager");
});

describe("Commande, réservation, paiement, remise", () => {
  it("réserve à la confirmation, sort le stock à la remise, gère paiement partiel et solde", async () => {
    const v0 = await variantBySku(db, "SON-ST2-NO");
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "whatsapp",
      reception: "pickup",
      customerName: "Test",
      customerPhone: "000",
      lines: [{ variantId: v0.id, quantity: 2 }],
    });
    let v = await variantBySku(db, "SON-ST2-NO");
    expect(v.on_hand).toBe(v0.on_hand);
    expect(v.reserved).toBe(v0.reserved + 2);

    await recordPayment(db, manager, o.id, { method: "cash", amount: 30000 });
    let d = (await getOrder(db, o.id))!;
    expect(d.due).toBe(90000);
    expect(d.balance).toBe(60000);
    expect(d.payment).toBe("partial");
    await expect(
      recordPayment(db, manager, o.id, { method: "cash", amount: 70000 }),
    ).rejects.toThrow(/solde/);
    await recordPayment(db, manager, o.id, {
      method: "mobile_money",
      amount: 60000,
    });
    d = (await getOrder(db, o.id))!;
    expect(d.payment).toBe("paid");

    await advanceOrder(db, manager, o.id, "ready");
    await expect(advanceOrder(db, manager, o.id, "ready")).rejects.toThrow();
    await advanceOrder(db, manager, o.id, "handed_over");
    v = await variantBySku(db, "SON-ST2-NO");
    expect(v.on_hand).toBe(v0.on_hand - 2);
    expect(v.reserved).toBe(v0.reserved);
    d = (await getOrder(db, o.id))!;
    expect(d.status).toBe("completed");
  });

  it("ignore un double envoi (clé d'idempotence)", async () => {
    const v = await variantBySku(db, "VOL-PB20");
    const k = key();
    const input = {
      idempotencyKey: k,
      channel: "whatsapp" as const,
      reception: "pickup" as const,
      customerName: "X",
      lines: [{ variantId: v.id, quantity: 1 }],
    };
    const a = await createOrder(db, manager, input);
    const b = await createOrder(db, manager, input);
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
    expect((await variantBySku(db, "VOL-PB20")).reserved).toBe(v.reserved + 1);
  });

  it("annulation : libère la réservation", async () => {
    const v0 = await variantBySku(db, "LUM-RIV-EC");
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "telephone",
      reception: "pickup",
      customerName: "Y",
      lines: [{ variantId: v0.id, quantity: 3 }],
    });
    expect((await variantBySku(db, "LUM-RIV-EC")).reserved).toBe(
      v0.reserved + 3,
    );
    await expect(cancelOrder(db, manager, o.id, "")).rejects.toThrow(/motif/);
    await cancelOrder(db, manager, o.id, "Client injoignable");
    const v = await variantBySku(db, "LUM-RIV-EC");
    expect(v.reserved).toBe(v0.reserved);
    expect(v.on_hand).toBe(v0.on_hand);
    expect((await getOrder(db, o.id))!.status).toBe("cancelled");
  });

  it("retour : remise en stock seulement si l'état est validé, remboursement tracé", async () => {
    const v0 = await variantBySku(db, "ORB-FIT-NO");
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v0.id, quantity: 2 }],
      payment: { method: "cash", amount: 44000 },
    });
    expect((await variantBySku(db, "ORB-FIT-NO")).on_hand).toBe(v0.on_hand - 2);
    const line = (await getOrder(db, o.id))!.lines[0];
    await processReturn(db, manager, o.id, {
      lines: [{ lineId: line.id, quantity: 1 }],
      resellable: false,
      reason: "Écran rayé",
      refund: { method: "cash", amount: 22000 },
    });
    expect((await variantBySku(db, "ORB-FIT-NO")).on_hand).toBe(v0.on_hand - 2);
    await processReturn(db, manager, o.id, {
      lines: [{ lineId: line.id, quantity: 1 }],
      resellable: true,
      reason: "Ne convient pas",
    });
    expect((await variantBySku(db, "ORB-FIT-NO")).on_hand).toBe(v0.on_hand - 1);
    await expect(
      processReturn(db, manager, o.id, {
        lines: [{ lineId: line.id, quantity: 1 }],
        resellable: true,
        reason: "x",
      }),
    ).rejects.toThrow(/au plus/);
    const d = (await getOrder(db, o.id))!;
    expect(d.due).toBe(0);
    expect(d.refunded).toBe(22000);
    expect(d.balance).toBe(-22000);
    expect(d.payment).toBe("to_refund");
    await refund(db, manager, o.id, {
      method: "cash",
      amount: 22000,
      note: "Solde du retour",
    });
    expect((await getOrder(db, o.id))!.balance).toBe(0);
  });

  it("correction d'encaissement et de frais conservent l'historique", async () => {
    const v = await variantBySku(db, "ACC-ET-N12-RG");
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "whatsapp",
      reception: "delivery",
      customerName: "Z",
      deliveryAddress: "Quelque part",
      deliveryFee: null,
      lines: [{ variantId: v.id, quantity: 1 }],
    });
    let d = (await getOrder(db, o.id))!;
    expect(d.feeUnknown).toBe(true);
    await correctDeliveryFee(db, manager, o.id, 1500, "Frais confirmés");
    await recordPayment(db, manager, o.id, { method: "cash", amount: 6500 });
    d = (await getOrder(db, o.id))!;
    await reversePayment(
      db,
      manager,
      d.payments[0].id,
      "Saisie sur la mauvaise commande",
    );
    d = (await getOrder(db, o.id))!;
    expect(d.payments).toHaveLength(2);
    expect(d.net).toBe(0);
    expect(d.events.some((e) => e.kind === "correction")).toBe(true);
    await expect(
      reversePayment(db, manager, d.payments[0].id, "encore"),
    ).rejects.toThrow(/déjà/);
  });
});

describe("Stock", () => {
  it("empêche deux réservations concurrentes du dernier article", async () => {
    const v = await variantBySku(db, "ORB-N12-512-GR");
    expect(v.on_hand - v.reserved).toBe(1);
    const attempt = () =>
      createOrder(db, manager, {
        idempotencyKey: key(),
        channel: "whatsapp",
        reception: "pickup",
        customerName: "C",
        lines: [{ variantId: v.id, quantity: 1 }],
      });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult[];
    expect(rejected[0].reason.message).toMatch(/Stock insuffisant/);
    const after = await variantBySku(db, "ORB-N12-512-GR");
    expect(after.reserved).toBe(v.reserved + 1);
  });

  it("vente en boutique ne peut pas prendre un article réservé", async () => {
    const v = await variantBySku(db, "ORB-N12-512-GR");
    await expect(
      createOrder(db, manager, {
        idempotencyKey: key(),
        channel: "boutique",
        reception: "immediate",
        lines: [{ variantId: v.id, quantity: 1 }],
      }),
    ).rejects.toThrow(/Stock insuffisant/);
  });

  it("réapprovisionnement par lot, inventaire et ajustement avec motif", async () => {
    const a = await variantBySku(db, "ORB-N12-512-SA");
    const b = await variantBySku(db, "SON-BA-BN");
    await restock(db, {
      lines: [
        { variantId: a.id, quantity: 3 },
        { variantId: b.id, quantity: 10 },
      ],
      reference: "BL-001",
      supplier: "Fournisseur test",
      note: "",
      userId: manager.id,
    });
    expect((await variantBySku(db, "ORB-N12-512-SA")).on_hand).toBe(3);
    expect((await variantBySku(db, "SON-BA-BN")).on_hand).toBe(10);
    const prev = await inventoryPreview(db, [{ variantId: b.id, counted: 8 }]);
    expect(prev[0].delta).toBe(-2);
    await applyInventory(db, {
      counts: [{ variantId: b.id, counted: 8 }],
      note: "Comptage",
      userId: manager.id,
    });
    expect((await variantBySku(db, "SON-BA-BN")).on_hand).toBe(8);
    await expect(
      adjustStock(db, {
        variantId: b.id,
        delta: -1,
        reason: "",
        userId: manager.id,
      }),
    ).rejects.toThrow(/motif/);
    await expect(
      adjustStock(db, {
        variantId: b.id,
        delta: -100,
        reason: "Casse",
        userId: manager.id,
      }),
    ).rejects.toThrow(/Stock insuffisant/);
    const mv = await db.query<{ kind: string; user_id: string }>(
      "select kind, user_id from stock_movements where variant_id = $1 order by created_at",
      [b.id],
    );
    expect(mv.map((m) => m.kind)).toEqual(["restock", "inventory"]);
    expect(mv.every((m) => m.user_id === manager.id)).toBe(true);
  });

  it("l'inventaire refuse un comptage inférieur aux réservations", async () => {
    const v = await variantBySku(db, "ORB-N12-512-GR");
    await expect(
      applyInventory(db, {
        counts: [{ variantId: v.id, counted: 0 }],
        note: "",
        userId: manager.id,
      }),
    ).rejects.toThrow(/réservé/);
  });
});

describe("Catalogue, panier et promotions", () => {
  it("la promotion s'applique pendant sa période puis s'arrête seule", async () => {
    const now = new Date();
    const during = (await publishedProducts(db, now)).find(
      (p) => p.name === "Sonna Buds Air",
    )!;
    expect(during.promo).not.toBeNull();
    expect(during.minPrice).toBe(20000);
    const after = (
      await publishedProducts(db, new Date(now.getTime() + 6 * 86400_000))
    ).find((p) => p.name === "Sonna Buds Air")!;
    expect(after.promo).toBeNull();
    expect(after.minPrice).toBe(25000);
    const studio = (await publishedProducts(db, now)).find(
      (p) => p.name === "Sonna Studio 2",
    )!;
    expect(studio.promo).toBeNull();
  });

  it("le panier signale changement de prix, quantité réduite et article épuisé", async () => {
    const buds = await variantBySku(db, "SON-BA-BL");
    const shoe = await variantBySku(db, "PAS-URB-BL-45");
    const cable = await variantBySku(db, "VOL-25-SEUL");
    const res = await checkCart(db, [
      { variantId: buds.id, quantity: 1, seenPrice: 25000 },
      { variantId: shoe.id, quantity: 1, seenPrice: 32000 },
      { variantId: cable.id, quantity: 5, seenPrice: 6500 },
    ]);
    expect(res[0].issues).toEqual([{ kind: "price", from: 25000, to: 20000 }]);
    expect(res[1].issues).toEqual([{ kind: "unavailable" }]);
    expect(res[2].issues).toEqual([
      { kind: "reduced", requested: 5, available: 2 },
    ]);
    expect(res[2].quantity).toBe(2);
  });

  it("le message WhatsApp reprend références, variantes, quantités et frais à confirmer", () => {
    const msg = buildOrderMessage({
      lines: [
        {
          sku: "PAS-URB-NO-41",
          name: "Pas Urbain",
          optionsLabel: "Couleur : Noir · Pointure : 41",
          quantity: 2,
          unitPrice: 32000,
        },
      ],
      reception: "delivery",
      deliveryFee: null,
      address: "Rue test",
      name: "Aïcha",
    });
    expect(msg).toContain("Réf. PAS-URB-NO-41");
    expect(msg).toContain("Couleur : Noir · Pointure : 41");
    expect(msg).toContain("Qté 2");
    expect(msg).toMatch(/Total des produits : 64\s000\sFCFA/);
    expect(msg).toContain("Frais de livraison : À confirmer avec GPS");
  });

  it("une modification du catalogue ne réécrit pas l'historique des commandes", async () => {
    const o = await db.one<{ id: string }>(
      "select order_id as id from order_lines where sku = 'ORB-N12-256-GR' limit 1",
    );
    const before = (await getOrder(db, o!.id))!.lines[0];
    const p = await db.one<{ id: string }>(
      "select product_id as id from variants where sku = 'ORB-N12-256-GR'",
    );
    const edit = (await productForEdit(db, p!.id, { withCosts: true }))!;
    await saveProduct(
      db,
      {
        ...edit,
        name: "Orbis Nova 12 (nouveau nom)",
        variants: edit.variants.map((v) => ({ ...v, price: v.price + 10000 })),
      },
      { userId: manager.id, withCosts: true },
    );
    const after = (await getOrder(db, o!.id))!.lines[0];
    expect(after.name).toBe(before.name);
    expect(after.unit_price).toBe(before.unit_price);
  });

  it("refuse la publication d'un produit incomplet et préserve le brouillon", async () => {
    await expect(
      saveProduct(
        db,
        {
          name: "Brouillon",
          brand: "",
          categoryId: null,
          description: "",
          specs: [],
          condition: null,
          axes: [],
          images: [],
          variants: [],
          status: "published",
          featured: false,
        },
        { userId: manager.id, withCosts: false },
      ),
    ).rejects.toThrow(/Publication impossible/);
    const draft = await saveProduct(
      db,
      {
        name: "Brouillon",
        brand: "",
        categoryId: null,
        description: "",
        specs: [],
        condition: null,
        axes: [],
        images: [],
        variants: [],
        status: "draft",
        featured: false,
      },
      { userId: manager.id, withCosts: false },
    );
    expect(draft.id).toBeTruthy();
    expect(
      filterProducts(await publishedProducts(db), { q: "Brouillon" }),
    ).toHaveLength(0);
  });

  it("recherche par référence et par catégorie", async () => {
    const all = await publishedProducts(db);
    expect(filterProducts(all, { q: "pas-urb-no" }).map((p) => p.name)).toEqual(
      ["Pas Urbain"],
    );
    expect(
      filterProducts(all, { q: "ecouteurs" }).map((p) => p.name),
    ).toContain("Sonna Buds Air");
    const asc = filterProducts(all, { tri: "prix-asc" });
    expect(asc[0].minPrice).toBeLessThanOrEqual(asc[asc.length - 1].minPrice);
  });
});

describe("Droits, clients, rapports, démonstration", () => {
  it("permissions vérifiées côté serveur", async () => {
    const seller = await userByRole(db, "seller");
    expect(() => assertCan(seller, "sales.quick")).not.toThrow();
    expect(() => assertCan(seller, "catalog.costs")).toThrow(/droits/);
    expect(() => assertCan(seller, "customers.export")).toThrow(/droits/);
    expect(() => assertCan(seller, "orders.cancel")).toThrow(/droits/);
    expect(() => assertCan(null, "orders.view")).toThrow(/session/i);
  });

  it("comptes de démonstration refusés hors mode démonstration", async () => {
    await expect(
      login(db, "vente@demo.gps", DEMO_PASSWORD, { allowDemo: false }),
    ).rejects.toThrow(/désactivés/);
    const { token } = await login(db, "vente@demo.gps", DEMO_PASSWORD, {
      allowDemo: true,
    });
    expect(await userFromToken(db, token, { allowDemo: true })).not.toBeNull();
    expect(await userFromToken(db, token, { allowDemo: false })).toBeNull();
    await expect(
      login(db, "vente@demo.gps", "mauvais", { allowDemo: true }),
    ).rejects.toThrow(/incorrect/);
  });

  it("signale un numéro déjà connu avant de créer un doublon", async () => {
    expect((await phoneMatches(db, "+000 00 00 00 01")).length).toBeGreaterThan(
      0,
    );
    await expect(
      createCustomer(db, { name: "Doublon", phone: "00 00 00 01" }),
    ).rejects.toThrow(/correspond/);
    await expect(
      createCustomer(
        db,
        { name: "Doublon", phone: "00 00 00 01" },
        { allowDuplicate: true },
      ),
    ).resolves.toBeTruthy();
  });

  it("rapports : ventes, encaissements, remboursements et marge seulement si coûts complets", async () => {
    const r = await report(db, periodFromKey("jour"), { withMargin: true });
    expect(r.sales.count).toBeGreaterThan(0);
    expect(r.encaissements).toBeGreaterThan(0);
    expect(r.remboursements).toBeGreaterThan(0);
    expect(r.margin.available).toBe(false);
    const hidden = await report(db, periodFromKey("jour"), {
      withMargin: false,
    });
    expect(hidden.margin.available).toBe(false);
  });

  it("la purge de démonstration conserve la configuration", async () => {
    const s = await getSettings(db);
    await saveSettingsSection(db, "company", {
      ...s.company,
      whatsapp: "22500000000",
      hours: "Lun–Sam",
    });
    // Une commande réelle sur un produit d'exemple bloque la purge (l'historique doit rester intact).
    await expect(purgeDemo(db)).rejects.toThrow(/commandes réelles/);
    // En mode démonstration, les opérations saisies sont marquées comme données d'exemple.
    await db.query("update orders set is_demo = true");
    await db.query("update customers set is_demo = true");
    await purgeDemo(db);
    const n = await db.one<{ n: number }>(
      "select count(*)::int as n from products where is_demo",
    );
    expect(n!.n).toBe(0);
    expect(
      (await db.one<{ n: number }>(
        "select count(*)::int as n from users where is_demo",
      ))!.n,
    ).toBe(0);
    const after = await getSettings(db);
    expect(after.company.whatsapp).toBe("22500000000");
    expect(after.company.hours).toBe("Lun–Sam");
    expect(after.storefront.heroProductId).toBeNull();
  });
});
