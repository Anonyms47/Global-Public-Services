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
import { restock, applyInventory, inventoryPreview, adjustStock, moveUnsellable } from "@/server/domain/stock";
import {
  publishedProducts,
  saveProduct,
  productForEdit,
  filterProducts,
  trashProduct,
  restoreProduct,
  purgeProduct,
  listVersions,
  restoreVersion,
  adminProducts,
  duplicateProduct,
  setProductsStatus,
  previewPriceChange,
  applyPriceChange,
  previewProductById,
  publishedProductById,
  setProductDisabled,
  setVariantDisabled,
} from "@/server/domain/catalog";
import { checkCart } from "@/server/domain/cart";
import { assertCan, claimOwner, hasRealOwner, login, userFromToken } from "@/server/domain/auth";
import { can } from "@/lib/permissions";
import { createCustomer, phoneMatches } from "@/server/domain/customers";
import { report, periodFromKey } from "@/server/domain/reports";
import { createRequest, convertRequest, dismissRequest, getRequest } from "@/server/domain/requests";
import {
  storeMedia,
  listMedia,
  trashMedia,
  restoreMedia,
  purgeMedia,
  sniffMime,
  startUpload,
  receiveUpload,
  finishUpload,
  abortUpload,
  cleanupStaleUploads,
  mediaFile,
  readMediaBytes,
  migrateMediaToStore,
  verifyMediaStore,
  rollbackMediaFromStore,
  releaseDatabaseCopies,
  mediaStorageStatus,
} from "@/server/domain/media";
import { localStore, supabaseStore, type StorageConfig } from "@/server/storage";
import { previewImport, applyImport, importTemplate } from "@/server/domain/import";
import { parseCsv } from "@/lib/csv";
import { listQueue, updateQueueItem, addManualTask } from "@/server/domain/queue";
import { launchChecks, setTargetMode, currentMode, summarize } from "@/server/domain/launch";
import { healthChecks } from "@/server/domain/health";
import {
  computeMetrics,
  metricDetail,
  previousPeriod,
  change,
  metricSeries,
  marginDetail,
  paymentsByMethod,
  demoOrdersIn,
} from "@/server/domain/metrics";
import { addLateDemoProducts, purgeDemo, refreshDemoImages, DEMO_PASSWORD } from "@/server/demo/seed";
import { getSettings, saveSettingsSection } from "@/server/domain/settings";
import { buildOrderMessage } from "@/lib/whatsapp";
import { renderTemplate, defaultTemplates } from "@/lib/templates";

let db: Db;
const all = { includeDemo: true };
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
    await expect(recordPayment(db, manager, o.id, { method: "cash", amount: 70000 })).rejects.toThrow(/solde/);
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
    expect((await variantBySku(db, "LUM-RIV-EC")).reserved).toBe(v0.reserved + 3);
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
    await reversePayment(db, manager, d.payments[0].id, "Saisie sur la mauvaise commande");
    d = (await getOrder(db, o.id))!;
    expect(d.payments).toHaveLength(2);
    expect(d.net).toBe(0);
    expect(d.events.some((e) => e.kind === "correction")).toBe(true);
    await expect(reversePayment(db, manager, d.payments[0].id, "encore")).rejects.toThrow(/déjà/);
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
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
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

  it("stock non vendable : exclu du disponible, ni réservé ni vendu, sortie tracée", async () => {
    const owner = await userByRole(db, "owner");
    const v0 = await variantBySku(db, "VOL-PB20");
    const avail0 = v0.on_hand - v0.reserved;
    await moveUnsellable(db, {
      variantId: v0.id,
      action: "unsellable",
      quantity: 1,
      reason: "Boîte abîmée",
      userId: owner.id,
    });
    let v = await db.one<{ on_hand: number; reserved: number; unsellable: number }>(
      "select on_hand, reserved, unsellable from variants where id = $1",
      [v0.id],
    );
    expect(v!.on_hand).toBe(v0.on_hand);
    expect(v!.unsellable).toBe(1);
    const cart = await checkCart(db, [{ variantId: v0.id, quantity: 1, seenPrice: v0.price }]);
    expect(cart[0].available).toBe(avail0 - 1);
    // On ne peut pas vendre plus que le disponible : l'unité non vendable est protégée.
    await expect(
      createOrder(db, manager, {
        idempotencyKey: key(),
        channel: "boutique",
        reception: "immediate",
        lines: [{ variantId: v0.id, quantity: avail0 }],
      }),
    ).rejects.toThrow(/Stock insuffisant/);
    await expect(
      moveUnsellable(db, { variantId: v0.id, action: "writeoff", quantity: 2, reason: "x", userId: owner.id }),
    ).rejects.toThrow(/Seulement 1/);
    await expect(
      moveUnsellable(db, { variantId: v0.id, action: "unsellable", quantity: 1, reason: " ", userId: owner.id }),
    ).rejects.toThrow(/motif/);
    await moveUnsellable(db, { variantId: v0.id, action: "writeoff", quantity: 1, reason: "Casse", userId: owner.id });
    v = await db.one("select on_hand, reserved, unsellable from variants where id = $1", [v0.id]);
    expect(v!.on_hand).toBe(v0.on_hand - 1);
    expect(v!.unsellable).toBe(0);
    const m = await db.one<{ kind: string; unsellable_delta: number }>(
      "select kind, unsellable_delta from stock_movements where variant_id = $1 order by created_at desc limit 1",
      [v0.id],
    );
    expect(m).toEqual({ kind: "writeoff", unsellable_delta: -1 });
  });

  it("vente rapide : paiement mixte Wave + espèces, plafonné au montant dû", async () => {
    const v = await variantBySku(db, "VOL-PB20");
    await expect(
      createOrder(db, manager, {
        idempotencyKey: key(),
        channel: "boutique",
        reception: "immediate",
        lines: [{ variantId: v.id, quantity: 1 }],
        payment: { method: "cash", amount: v.price },
        payments: [{ method: "wave", amount: 1000 }],
      }),
    ).rejects.toThrow(/dépasse/);
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v.id, quantity: 1 }],
      payment: { method: "cash", amount: v.price - 5000 },
      payments: [
        { method: "wave", amount: 3000 },
        { method: "orange_money", amount: 2000 },
      ],
    });
    const d = (await getOrder(db, o.id))!;
    expect(d.payment).toBe("paid");
    expect(d.payments.map((p) => p.method).sort()).toEqual(["cash", "orange_money", "wave"]);
  });

  it("vente rapide : monnaie rendue enregistrée, paiement partiel, double envoi ignoré", async () => {
    const v = await variantBySku(db, "VOL-PB20");
    // Wave 5 000 + espèces : 20 000 remis pour le reste → monnaie rendue enregistrée à part.
    const cashDue = v.price - 5000;
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v.id, quantity: 1 }],
      payment: { method: "wave", amount: 5000 },
      payments: [{ method: "cash", amount: cashDue, tendered: cashDue + 5000 }],
    });
    const d = (await getOrder(db, o.id))!;
    const cash = d.payments.find((p) => p.method === "cash")!;
    expect(cash).toMatchObject({ amount: cashDue, tendered: cashDue + 5000, change_given: 5000 });
    expect(d.payment).toBe("paid");
    expect(d.events.some((e) => /rendu 5/.test(e.message))).toBe(true);
    // La monnaie ne se rend pas sur un paiement mobile, ni avec une somme remise inférieure.
    for (const bad of [
      { method: "wave" as const, amount: v.price, tendered: v.price + 1000 },
      { method: "cash" as const, amount: v.price, tendered: v.price - 1 },
    ]) {
      await expect(
        createOrder(db, manager, {
          idempotencyKey: key(),
          channel: "boutique",
          reception: "immediate",
          lines: [{ variantId: v.id, quantity: 1 }],
          payment: bad,
        }),
      ).rejects.toThrow(/espèces/);
    }
    // Paiement partiel : la vente est remise, le solde reste dû.
    const k = key();
    const partial = await createOrder(db, manager, {
      idempotencyKey: k,
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v.id, quantity: 1 }],
      payment: { method: "cash", amount: 5000 },
    });
    const p = (await getOrder(db, partial.id))!;
    expect(p.payment).toBe("partial");
    expect(p.balance).toBe(v.price - 5000);
    // Double envoi de la même vente : une seule vente, un seul mouvement de stock.
    const again = await createOrder(db, manager, {
      idempotencyKey: k,
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v.id, quantity: 1 }],
      payment: { method: "cash", amount: 5000 },
    });
    expect(again).toMatchObject({ id: partial.id, duplicate: true });
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

describe("Article manquant : désactivation et stock non suivi", () => {
  it("une version désactivée n'est plus vendable ; un produit désactivé disparaît du site", async () => {
    const v = await variantBySku(db, "VOL-PB20");
    await setVariantDisabled(db, v.id, true);
    const cart = await checkCart(db, [{ variantId: v.id, quantity: 1, seenPrice: v.price }]);
    expect(cart[0].available).toBe(0);
    await expect(
      createOrder(db, manager, {
        idempotencyKey: key(),
        channel: "boutique",
        reception: "immediate",
        lines: [{ variantId: v.id, quantity: 1 }],
      }),
    ).rejects.toThrow(/désactivé/);
    await setVariantDisabled(db, v.id, false);
    expect((await checkCart(db, [{ variantId: v.id, quantity: 1, seenPrice: v.price }]))[0].available).toBeGreaterThan(
      0,
    );

    const p = (await db.one<{ id: string }>("select product_id as id from variants where id = $1", [v.id]))!;
    await setProductDisabled(db, p.id, true);
    expect((await publishedProducts(db)).some((x) => x.id === p.id)).toBe(false);
    expect((await checkCart(db, [{ variantId: v.id, quantity: 1, seenPrice: v.price }]))[0].available).toBe(0);
    await setProductDisabled(db, p.id, false);
    expect((await publishedProducts(db)).some((x) => x.id === p.id)).toBe(true);
  });

  it("stock non suivi : tout est vendable sans toucher aux quantités", async () => {
    const s = await getSettings(db);
    await saveSettingsSection(db, "stock", { ...s.stock, tracking: false });
    try {
      const v = await variantBySku(db, "SON-ST2-NO");
      const cart = await checkCart(db, [{ variantId: v.id, quantity: 1, seenPrice: v.price }]);
      expect(cart[0].available).toBe(99);
      const o = await createOrder(db, manager, {
        idempotencyKey: key(),
        channel: "whatsapp",
        reception: "pickup",
        customerName: "Sans stock",
        lines: [{ variantId: v.id, quantity: v.on_hand + 5 }],
      });
      const after = await variantBySku(db, "SON-ST2-NO");
      expect({ on_hand: after.on_hand, reserved: after.reserved }).toEqual({
        on_hand: v.on_hand,
        reserved: v.reserved,
      });
      await cancelOrder(db, manager, o.id, "test");
      expect((await variantBySku(db, "SON-ST2-NO")).reserved).toBe(v.reserved);
    } finally {
      await saveSettingsSection(db, "stock", { ...s.stock, tracking: true });
    }
  });
});

describe("Catalogue, panier et promotions", () => {
  it("la promotion s'applique pendant sa période puis s'arrête seule", async () => {
    const now = new Date();
    const during = (await publishedProducts(db, now)).find((p) => p.name === "Sonna Buds Air")!;
    expect(during.promo).not.toBeNull();
    expect(during.minPrice).toBe(20000);
    const after = (await publishedProducts(db, new Date(now.getTime() + 6 * 86400_000))).find(
      (p) => p.name === "Sonna Buds Air",
    )!;
    expect(after.promo).toBeNull();
    expect(after.minPrice).toBe(25000);
    const studio = (await publishedProducts(db, now)).find((p) => p.name === "Sonna Studio 2")!;
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
    expect(res[2].issues).toEqual([{ kind: "reduced", requested: 5, available: 2 }]);
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
    expect(msg).toContain("Frais de livraison : Précisé par GPS sur WhatsApp");
  });

  it("une modification du catalogue ne réécrit pas l'historique des commandes", async () => {
    const o = await db.one<{ id: string }>(
      "select order_id as id from order_lines where sku = 'ORB-N12-256-GR' limit 1",
    );
    const before = (await getOrder(db, o!.id))!.lines[0];
    const p = await db.one<{ id: string }>("select product_id as id from variants where sku = 'ORB-N12-256-GR'");
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
    expect(filterProducts(await publishedProducts(db), { q: "Brouillon" })).toHaveLength(0);
  });

  it("catalogue : corbeille restaurable, suppression définitive encadrée, programmation, versions", async () => {
    const owner = await userByRole(db, "owner");
    const ctx = { userId: owner.id, withCosts: true };
    const base = (await productForEdit(db, (await publishedProducts(db))[0].id, { withCosts: true }))!;
    const created = await saveProduct(
      db,
      {
        ...base,
        id: undefined,
        slug: undefined,
        name: "Produit Corbeille",
        status: "draft",
        featured: false,
        variants: [{ sku: "CORB-1", options: {}, price: 1000, initialStock: 0 }],
        axes: [],
      },
      ctx,
    );
    // Versions : chaque modification conserve l'état précédent.
    const p1 = (await productForEdit(db, created.id, { withCosts: true }))!;
    await saveProduct(db, { ...p1, name: "Produit Corbeille v2" }, { ...ctx, expectedUpdatedAt: p1.updatedAt });
    await expect(
      saveProduct(db, { ...p1, name: "Conflit" }, { ...ctx, expectedUpdatedAt: p1.updatedAt }),
    ).rejects.toThrow(/modifié par ailleurs/);
    const versions = await listVersions(db, created.id);
    expect(versions[0].name).toBe("Produit Corbeille");
    await restoreVersion(db, versions[0].id, ctx);
    expect((await productForEdit(db, created.id, { withCosts: true }))!.name).toBe("Produit Corbeille");

    // Programmation : publié automatiquement une fois l'heure passée.
    const p2 = (await productForEdit(db, created.id, { withCosts: true }))!;
    await saveProduct(db, { ...p2, publishAt: new Date(Date.now() - 1000).toISOString() }, ctx);
    expect((await publishedProducts(db)).some((p) => p.id === created.id)).toBe(true);

    // Corbeille : retiré du site, restaurable en brouillon, supprimable seulement depuis la corbeille.
    await expect(purgeProduct(db, created.id)).rejects.toThrow(/corbeille/);
    await trashProduct(db, created.id);
    expect((await publishedProducts(db)).some((p) => p.id === created.id)).toBe(false);
    expect((await adminProducts(db, { status: "trash" })).map((r) => r.id)).toContain(created.id);
    expect((await adminProducts(db, { status: "all" })).map((r) => r.id)).not.toContain(created.id);
    await restoreProduct(db, created.id);
    expect((await productForEdit(db, created.id, { withCosts: false }))!.status).toBe("draft");
    await trashProduct(db, created.id);
    await purgeProduct(db, created.id);
    expect(await productForEdit(db, created.id, { withCosts: false })).toBeNull();

    // Un produit déjà vendu ne peut pas être supprimé définitivement.
    const sold = await db.one<{ product_id: string }>("select product_id from order_lines limit 1");
    await trashProduct(db, sold!.product_id);
    await expect(purgeProduct(db, sold!.product_id)).rejects.toThrow(/commandes/);
    await restoreProduct(db, sold!.product_id);
    await db.query("update products set status = 'published' where id = $1", [sold!.product_id]);
  });

  it("catalogue : duplication, variantes, actions groupées, retrait programmé, aperçu des brouillons", async () => {
    const owner = await userByRole(db, "owner");
    const ctx = { userId: owner.id, withCosts: true };
    const base = (await productForEdit(db, (await publishedProducts(db))[0].id, { withCosts: true }))!;
    const created = await saveProduct(
      db,
      {
        ...base,
        id: undefined,
        slug: undefined,
        name: "Recette catalogue",
        status: "published",
        featured: false,
        axes: ["Couleur"],
        variants: [
          { sku: "REC-NO", options: { Couleur: "Noir" }, price: 10000, initialStock: 2 },
          { sku: "REC-BL", options: { Couleur: "Blanc" }, price: 11000, initialStock: 0 },
        ],
      },
      ctx,
    );
    // Variantes : prix et stock propres à chacune.
    const live = (await publishedProductById(db, created.id))!;
    expect(live.variants.map((v) => [v.sku, v.price, v.available])).toEqual([
      ["REC-NO", 10000, 2],
      ["REC-BL", 11000, 0],
    ]);
    // Duplication : brouillon, références nouvelles, stock à zéro.
    const copy = await duplicateProduct(db, created.id, owner.id);
    const dup = (await productForEdit(db, copy.id, { withCosts: true }))!;
    expect(dup).toMatchObject({ name: "Recette catalogue (copie)", status: "draft" });
    expect(dup.variants.every((v) => !["REC-NO", "REC-BL"].includes(v.sku))).toBe(true);
    // Aperçu : un brouillon est visible dans l'aperçu interne, jamais sur le site.
    expect(await publishedProductById(db, copy.id)).toBeNull();
    expect((await previewProductById(db, copy.id))?.name).toBe("Recette catalogue (copie)");
    // Actions groupées : prix (+10 %, arrondi à 50 FCFA), statut.
    const preview = await previewPriceChange(db, [created.id], 10);
    expect(preview.map((p) => p.newPrice)).toEqual([11000, 12100]);
    await applyPriceChange(db, [created.id], 10);
    expect((await publishedProductById(db, created.id))!.variants.map((v) => v.price)).toEqual([11000, 12100]);
    await setProductsStatus(db, [created.id, copy.id], "draft");
    expect(await publishedProductById(db, created.id)).toBeNull();
    // Retrait programmé : publié, puis repassé en brouillon à l'heure dite.
    const p1 = (await productForEdit(db, created.id, { withCosts: true }))!;
    await expect(
      saveProduct(db, { ...p1, status: "published", unpublishAt: new Date(Date.now() - 60_000).toISOString() }, ctx),
    ).rejects.toThrow(/retrait/);
    await saveProduct(
      db,
      { ...p1, status: "published", unpublishAt: new Date(Date.now() + 60_000).toISOString() },
      ctx,
    );
    expect(await publishedProductById(db, created.id)).not.toBeNull();
    await db.query("update products set unpublish_at = now() - interval '1 second' where id = $1", [created.id]);
    expect(await publishedProductById(db, created.id)).toBeNull();
    expect((await productForEdit(db, created.id, { withCosts: false }))!.status).toBe("draft");
    // Nettoyage.
    for (const id of [created.id, copy.id]) {
      await trashProduct(db, id);
      await purgeProduct(db, id);
    }
  });

  it("médiathèque : type vérifié sur le contenu, fichier utilisé protégé, corbeille", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypmp42"), 0, 0]);
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(mp4)).toBe("video/mp4");
    expect(sniffMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    await expect(
      storeMedia(db, { bytes: new TextEncoder().encode("GIF89a"), name: "x.gif", userId: null, isDemo: true }),
    ).rejects.toThrow(/Format/);
    await expect(
      storeMedia(db, { bytes: mp4, name: "v.mp4", userId: null, isDemo: true, imagesOnly: true }),
    ).rejects.toThrow(/JPEG/);
    // Limites : 4 Mo par photo en stockage objet, 3 Mo dans l'ancien mode (en base).
    const heavy = new Uint8Array(4 * 1024 * 1024 + 1);
    heavy.set(png);
    await expect(storeMedia(db, { bytes: heavy, name: "big.png", userId: null, isDemo: true })).rejects.toThrow(
      /trop lourd/,
    );
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    big.set(png);
    await expect(
      storeMedia(db, { bytes: big, name: "big.png", userId: null, isDemo: true }, { backend: "database", store: null }),
    ).rejects.toThrow(/3 Mo/);
    const img = await storeMedia(db, { bytes: png, name: "photo.png", userId: null, isDemo: true });
    const vid = await storeMedia(db, { bytes: mp4, name: "clip.mp4", userId: null, isDemo: true });
    expect((await listMedia(db, { view: "unused" })).map((m) => m.id)).toEqual(
      expect.arrayContaining([img.id, vid.id]),
    );
    const product = (await publishedProducts(db))[0];
    await db.query("insert into product_images (id, product_id, url, position) values ($1, $2, $3, 99)", [
      crypto.randomUUID(),
      product.id,
      img.url,
    ]);
    await expect(trashMedia(db, img.id)).rejects.toThrow(/utilisé/);
    await trashMedia(db, vid.id);
    expect((await listMedia(db, { view: "trash" })).map((m) => m.id)).toContain(vid.id);
    await restoreMedia(db, vid.id);
    await expect(purgeMedia(db, vid.id)).rejects.toThrow(/corbeille/);
    await trashMedia(db, vid.id);
    await purgeMedia(db, vid.id);
    expect((await listMedia(db, { view: "trash" })).map((m) => m.id)).not.toContain(vid.id);
    await db.query("delete from product_images where url = $1", [img.url]);
  });

  it("médias : vidéo dans une fiche, photo principale obligatoire, fichier de la vitrine protégé, limites", async () => {
    const owner = await userByRole(db, "owner");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const mp4 = (n: number) => {
      const b = new Uint8Array(n);
      b.set([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypmp42")]);
      return b;
    };
    // Vidéos : 50 Mo en stockage objet ; 4 Mo seulement dans l'ancien mode en base.
    const clip = await storeMedia(db, { bytes: mp4(12 * 1024 * 1024), name: "clip.mp4", userId: null, isDemo: true });
    expect(clip.mime).toBe("video/mp4");
    await expect(
      storeMedia(db, { bytes: mp4(50 * 1024 * 1024 + 1), name: "long.mp4", userId: null, isDemo: true }),
    ).rejects.toThrow(/50 Mo/);
    await expect(
      storeMedia(
        db,
        { bytes: mp4(4 * 1024 * 1024 + 1), name: "long.mp4", userId: null, isDemo: true },
        { backend: "database", store: null },
      ),
    ).rejects.toThrow(/4 Mo/);
    const photo = await storeMedia(db, { bytes: png, name: "p.png", userId: null, isDemo: true });

    // Fiche produit : la vidéo s'affiche à part, la photo principale doit être une photo.
    const ctx = { userId: owner.id, withCosts: true };
    const base = (await productForEdit(db, (await publishedProducts(db))[0].id, { withCosts: true }))!;
    const input = {
      ...base,
      id: undefined,
      slug: undefined,
      name: "Recette vidéo",
      status: "published" as const,
      featured: false,
      axes: [],
      variants: [{ sku: "VID-1", options: {}, price: 5000, initialStock: 1 }],
    };
    await expect(
      saveProduct(
        db,
        {
          ...input,
          images: [
            { url: clip.url, alt: "", kind: "video" },
            { url: photo.url, alt: "", kind: "image" },
          ],
        },
        ctx,
      ),
    ).rejects.toThrow(/photo principale/);
    const saved = await saveProduct(
      db,
      {
        ...input,
        images: [
          { url: photo.url, alt: "", kind: "image" },
          { url: clip.url, alt: "Démonstration", kind: "video" },
        ],
      },
      ctx,
    );
    const pub = (await publishedProductById(db, saved.id))!;
    expect(pub.images.map((i) => i.url)).toEqual([photo.url]);
    expect(pub.videos).toEqual([{ url: clip.url, alt: "Démonstration" }]);
    expect((await productForEdit(db, saved.id, { withCosts: false }))!.images.map((i) => i.kind)).toEqual([
      "image",
      "video",
    ]);

    // Photo de la boutique (réglages) : comptée comme utilisée, protégée contre la suppression.
    const storePhoto = await storeMedia(db, { bytes: png, name: "boutique.png", userId: null, isDemo: true });
    const company = (await getSettings(db)).company;
    await saveSettingsSection(db, "company", { ...company, storePhotoUrl: storePhoto.url });
    expect((await listMedia(db, { view: "all" })).find((m) => m.id === storePhoto.id)?.used_by).toBe(1);
    await expect(trashMedia(db, storePhoto.id)).rejects.toThrow(/vitrine, une catégorie ou la configuration/);
    await saveSettingsSection(db, "company", company);
    await trashMedia(db, storePhoto.id);

    await trashProduct(db, saved.id);
    await purgeProduct(db, saved.id);
  });

  it("médias hors base : envoi en trois temps, contenu vérifié, visibilité, suppression du fichier stocké", async () => {
    const owner = await userByRole(db, "owner");
    const { mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const store = localStore(mkdtempSync(join(tmpdir(), "gps-store-")));
    const cfg: StorageConfig = { backend: "local", store };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
    const mov = new Uint8Array([0, 0, 0, 0x14, ...new TextEncoder().encode("ftypqt  "), 0, 0, 0, 0]);
    expect(sniffMime(mov)).toBe("video/quicktime");

    // 1. Préparation → envoi → validation : la base ne garde que les métadonnées.
    const up = await startUpload(
      db,
      { name: "photo.png", size: png.length, type: "image/png", userId: owner.id, isDemo: false },
      cfg,
    );
    expect(up.target).toMatchObject({ method: "PUT", url: `/comptoir/mediatheque/envoi?id=${up.id}` });
    // Pas encore validé : invisible dans la médiathèque et non servi.
    expect((await listMedia(db, { view: "all" })).map((m) => m.id)).not.toContain(up.id);
    expect(await mediaFile(db, up.id)).toBeNull();
    // Un autre utilisateur ne peut pas compléter cet envoi.
    await expect(receiveUpload(db, up.id, crypto.randomUUID(), png, cfg)).rejects.toThrow(/introuvable/);
    await receiveUpload(db, up.id, owner.id, png, cfg);
    const done = await finishUpload(db, up.id, owner.id, {}, cfg);
    expect(done).toMatchObject({ id: up.id, url: `/media/${up.id}`, mime: "image/png" });
    const row = await db.one<{
      data: Uint8Array | null;
      storage_backend: string;
      storage_path: string;
      status: string;
    }>("select data, storage_backend, storage_path, status from media where id = $1", [up.id]);
    expect(row).toMatchObject({ data: null, storage_backend: "local", status: "ready" });
    expect(row!.storage_path).toMatch(new RegExp(`^catalogue/\\d{4}/\\d{2}/${up.id}\\.png$`));

    // 2. Lecture, y compris partielle (Range).
    const file = (await mediaFile(db, up.id))!;
    expect(file.public).toBe(false);
    const full = await readMediaBytes(db, file, null, cfg);
    expect(Array.from(full!.body as Uint8Array)).toEqual(Array.from(png));
    const part = await readMediaBytes(db, file, "bytes=0-3", cfg);
    expect(part).toMatchObject({ status: 206, length: 4, contentRange: `bytes 0-3/${png.length}` });
    expect((await readMediaBytes(db, file, "bytes=999-", cfg))!.status).toBe(416);

    // 3. Visibilité : public seulement une fois utilisé par une fiche publiée.
    const product = (await publishedProducts(db))[0];
    await db.query("insert into product_images (id, product_id, url, position) values ($1, $2, $3, 98)", [
      crypto.randomUUID(),
      product.id,
      done.url,
    ]);
    expect((await mediaFile(db, up.id))!.public).toBe(true);
    await db.query("update products set status = 'draft' where id = $1", [product.id]);
    expect((await mediaFile(db, up.id))!.public).toBe(false);
    await db.query("update products set status = 'published' where id = $1", [product.id]);
    await db.query("delete from product_images where url = $1", [done.url]);

    // 4. Contenu réel contrôlé : un faux « .jpg » est refusé et nettoyé.
    const fake = await startUpload(
      db,
      { name: "x.jpg", size: 10, type: "image/jpeg", userId: owner.id, isDemo: false },
      cfg,
    );
    await expect(receiveUpload(db, fake.id, owner.id, new TextEncoder().encode("<html>…"), cfg)).rejects.toThrow(
      /Format/,
    );
    await abortUpload(db, fake.id, owner.id, cfg);
    expect(await db.one("select 1 from media where id = $1", [fake.id])).toBeNull();
    // Photo seulement : une vidéo est refusée à la validation et son fichier supprimé.
    const vid = await startUpload(
      db,
      { name: "clip.mov", size: mov.length, type: "", userId: owner.id, isDemo: false },
      cfg,
    );
    await receiveUpload(db, vid.id, owner.id, mov, cfg);
    const vidPath = (await db.one<{ storage_path: string }>("select storage_path from media where id = $1", [vid.id]))!
      .storage_path;
    await expect(finishUpload(db, vid.id, owner.id, { imagesOnly: true }, cfg)).rejects.toThrow(/JPEG/);
    expect(await store.head(vidPath)).toBeNull();
    // Taille annoncée trop grande : refus avant tout envoi.
    await expect(
      startUpload(
        db,
        { name: "v.mp4", size: 60 * 1024 * 1024, type: "video/mp4", userId: owner.id, isDemo: false },
        cfg,
      ),
    ).rejects.toThrow(/50 Mo/);

    // 5. Envoi abandonné depuis plus de 24 h : nettoyé.
    const stale = await startUpload(
      db,
      { name: "z.png", size: png.length, type: "image/png", userId: owner.id, isDemo: false },
      cfg,
    );
    await receiveUpload(db, stale.id, owner.id, png, cfg);
    await db.query("update media set created_at = now() - interval '25 hours' where id = $1", [stale.id]);
    expect(await cleanupStaleUploads(db, cfg)).toBeGreaterThanOrEqual(1);
    expect(await db.one("select 1 from media where id = $1", [stale.id])).toBeNull();

    // 6. Suppression sécurisée : corbeille, puis suppression définitive du fichier stocké.
    await trashMedia(db, up.id);
    expect((await mediaFile(db, up.id))!.public).toBe(false);
    await purgeMedia(db, up.id, cfg);
    expect(await store.head(row!.storage_path)).toBeNull();
  });

  it("migration des médias : non destructive, vérifiée, reprise, retour arrière et libération explicite", async () => {
    // Même dossier que le stockage configuré pour les tests : la vérification porte sur tous les fichiers.
    const store = localStore(process.env.MEDIA_LOCAL_DIR!);
    const legacy: StorageConfig = { backend: "database", store: null };
    const jpg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n + 1, n + 2]);
    // Fichiers « historiques » enregistrés en base, dont un utilisé par une fiche publiée.
    const a = await storeMedia(db, { bytes: jpg(1), name: "a.jpg", userId: null, isDemo: true }, legacy);
    const b = await storeMedia(db, { bytes: jpg(2), name: "b.jpg", userId: null, isDemo: false }, legacy);
    const product = (await publishedProducts(db))[0];
    await db.query("insert into product_images (id, product_id, url, position) values ($1, $2, $3, 97)", [
      crypto.randomUUID(),
      product.id,
      a.url,
    ]);
    const counts = async () =>
      db.one<{ media: number; images: number; products: number; orders: number; movements: number }>(
        `select (select count(*)::int from media) as media, (select count(*)::int from product_images) as images,
                (select count(*)::int from products) as products, (select count(*)::int from orders) as orders,
                (select count(*)::int from stock_movements) as movements`,
      );
    const before = await counts();

    // Essai à blanc : rien ne bouge.
    expect((await migrateMediaToStore(db, store, { dryRun: true })).migrated).toBe(0);
    expect((await mediaFile(db, a.id))!.storage_backend).toBe("database");

    // Migration : copie relue et comparée ; octets en base conservés.
    const report = await migrateMediaToStore(db, store);
    expect(report.failed, JSON.stringify(report.failed)).toEqual([]);
    expect(report.migrated).toBeGreaterThanOrEqual(2);
    const ra = await db.one<{ storage_backend: string; storage_path: string; has_data: boolean; checksum: string }>(
      "select storage_backend, storage_path, data is not null as has_data, checksum from media where id = $1",
      [a.id],
    );
    expect(ra).toMatchObject({ storage_backend: "local", has_data: true });
    expect(ra!.storage_path).toMatch(/^demo\//);
    expect(ra!.checksum).toMatch(/^[0-9a-f]{64}$/);
    // Reprise : relancée, elle ne refait rien.
    expect((await migrateMediaToStore(db, store)).scanned).toBe(0);
    // Le fichier reste servi à la même adresse, avec le même contenu, et la fiche le montre toujours.
    const fa = (await mediaFile(db, a.id))!;
    expect(fa.public).toBe(true);
    const cfg: StorageConfig = { backend: "local", store };
    expect(Array.from((await readMediaBytes(db, fa, null, cfg))!.body as Uint8Array)).toEqual(Array.from(jpg(1)));
    expect((await verifyMediaStore(db, store)).problems).toEqual([]);
    // Rien de perdu : médias, images de fiches, produits, commandes et mouvements identiques.
    expect(await counts()).toEqual(before);

    // Libération des copies en base : refusée sans confirmation explicite.
    await expect(releaseDatabaseCopies(db, store, { confirm: false })).rejects.toThrow(/Confirmation/);
    expect(await releaseDatabaseCopies(db, store, { confirm: true })).toBeGreaterThanOrEqual(2);
    expect((await db.one<{ d: boolean }>("select data is not null as d from media where id = $1", [b.id]))!.d).toBe(
      false,
    );
    // Fichier altéré dans le stockage : détecté par la vérification.
    await store.put(ra!.storage_path, jpg(9), "image/jpeg");
    expect((await verifyMediaStore(db, store)).problems.map((p) => p.id)).toContain(a.id);
    await store.put(ra!.storage_path, jpg(1), "image/jpeg");

    // Retour arrière : octets ramenés en base (retéléchargés), servis depuis la base.
    const back = await rollbackMediaFromStore(db, store);
    expect(back.failed).toEqual([]);
    const fb = (await mediaFile(db, b.id))!;
    expect(fb.storage_backend).toBe("database");
    expect(Array.from((await readMediaBytes(db, fb, null, legacy))!.body as Uint8Array)).toEqual(Array.from(jpg(2)));
    expect(await counts()).toEqual(before);
    expect((await mediaStorageStatus(db)).some((r) => r.backend === "database")).toBe(true);

    await db.query("delete from product_images where url = $1", [a.url]);
  });

  it("Supabase Storage : compartiment privé, envoi signé, lecture par plages, sans clé dans les erreurs", async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = [];
    const fake: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      calls.push({ url, method: init?.method ?? "GET", headers, body: init?.body });
      if (url.endsWith("/bucket/gps-media")) return new Response("{}", { status: 404 });
      if (url.endsWith("/bucket")) return Response.json({ name: "gps-media" });
      if (url.includes("/object/upload/sign/"))
        return Response.json({ url: "/object/upload/sign/gps-media/catalogue/x.png?token=t" });
      if (url.includes("/object/sign/")) return Response.json({ signedURL: "/object/sign/gps-media/v.mp4?token=s" });
      if (url.includes("missing.png")) return new Response("not found", { status: 400 });
      if (url.includes("/object/authenticated/") && headers.range === "bytes=0-63")
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 206,
          headers: { "content-range": "bytes 0-3/1234", "content-length": "4" },
        });
      if (url.includes("missing.png")) return new Response("not found", { status: 400 });
      if (init?.method === "DELETE") return Response.json([]);
      return new Response("refusé", { status: 403 });
    };
    const store = supabaseStore({
      url: "https://exemple.supabase.co",
      key: "cle-secrete-test",
      bucket: "gps-media",
      fetch: fake,
    });
    await store.ensureReady!();
    const created = calls.find((c) => c.url.endsWith("/storage/v1/bucket"))!;
    expect(JSON.parse(String(created.body))).toMatchObject({ id: "gps-media", public: false });
    expect(JSON.parse(String(created.body)).allowed_mime_types).toContain("video/quicktime");
    const target = await store.uploadTarget!("catalogue/x.png", "image/png");
    expect(target.url).toBe(
      "https://exemple.supabase.co/storage/v1/object/upload/sign/gps-media/catalogue/x.png?token=t",
    );
    expect(target.headers).toEqual({ "Content-Type": "image/png", "x-upsert": "false" });
    // La clé reste côté serveur : jamais dans l'adresse donnée au navigateur.
    expect(target.url).not.toContain("cle-secrete-test");
    expect(await store.head("catalogue/x.png")).toEqual({
      size: 1234,
      start: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(await store.head("missing.png")).toBeNull();
    expect(await store.signedUrl!("v.mp4", 3600)).toContain("/storage/v1/object/sign/gps-media/v.mp4?token=s");
    await store.remove(["catalogue/x.png"]);
    expect(JSON.parse(String(calls.at(-1)!.body))).toEqual({ prefixes: ["catalogue/x.png"] });
    const err = await store.put("a.png", new Uint8Array([1]), "image/png").catch((e: Error) => e.message);
    expect(err).toMatch(/envoi impossible \(403\)/);
    expect(err).not.toContain("cle-secrete-test");
    expect(calls.every((c) => c.headers.apikey === "cle-secrete-test")).toBe(true);
  });

  it("catégories : création, adresse unique, masquage, accueil, ordre, archivage avec déplacement, restauration", async () => {
    const cat = await import("@/server/domain/catalog");
    const owner = await userByRole(db, "owner");
    const id = await cat.saveCategory(db, { name: "Tablettes & liseuses", description: "" });
    const created = (await cat.listCategories(db, { scope: "all" })).find((c) => c.id === id)!;
    expect(created).toMatchObject({ slug: "tablettes-liseuses", visible: true, featured: false });
    await expect(cat.saveCategory(db, { name: "Autre", description: "", slug: "tablettes-liseuses" })).rejects.toThrow(
      /adresse/,
    );
    await expect(cat.saveCategory(db, { name: " ", description: "" })).rejects.toThrow(/obligatoire/);
    // Vide : jamais affichée sur le site public, même publiée.
    const pub = async () => (await cat.listCategories(db)).filter((c) => c.product_count > 0).map((c) => c.id);
    expect(await pub()).not.toContain(id);
    // Un produit publié dans la nouvelle catégorie : présente sur le site, la recherche et l'import.
    const base = (await productForEdit(db, (await publishedProducts(db))[0].id, { withCosts: true }))!;
    const p = await saveProduct(
      db,
      {
        ...base,
        id: undefined,
        slug: undefined,
        name: "Liseuse Test",
        categoryId: id,
        status: "published",
        featured: false,
        axes: [],
        variants: [{ sku: "LIS-1", options: {}, price: 70000, initialStock: 2 }],
      },
      { userId: owner.id, withCosts: true },
    );
    expect(await pub()).toContain(id);
    expect(
      (await filterProducts(await publishedProducts(db), { categorie: "tablettes-liseuses" })).map((x) => x.id),
    ).toContain(p.id);
    expect(
      (await previewImport(db, "nom;reference;prix;categorie\nX;LIS-CSV;1000;Tablettes & liseuses")).errors,
    ).toEqual([]);
    // Renommer, nouvelle adresse, masquer, mettre en avant.
    await cat.saveCategory(db, {
      id,
      name: "Liseuses",
      description: "Lire partout",
      slug: "liseuses",
      visible: false,
      featured: true,
    });
    expect(await cat.categoryBySlug(db, "liseuses")).toBeNull();
    expect(await pub()).not.toContain(id);
    await cat.saveCategory(db, {
      id,
      name: "Liseuses",
      description: "",
      slug: "liseuses",
      visible: true,
      featured: true,
    });
    expect((await cat.categoryBySlug(db, "liseuses"))?.featured).toBe(true);
    // Réorganiser.
    const order = async () => (await cat.listCategories(db, { scope: "active" })).map((c) => c.id);
    const pos = (await order()).indexOf(id);
    await cat.moveCategory(db, id, -1);
    expect((await order()).indexOf(id)).toBe(pos - 1);
    // Archivage : refusé tant qu'il reste des produits, sauf en les déplaçant ; suppression seulement archivée et vide.
    await expect(cat.archiveCategory(db, id)).rejects.toThrow(/1 produit/);
    await expect(cat.deleteCategory(db, id)).rejects.toThrow(/produit/);
    const other = (await cat.listCategories(db, { scope: "active" })).find((c) => c.id !== id)!;
    await cat.archiveCategory(db, id, { moveTo: other.id });
    expect((await productForEdit(db, p.id, { withCosts: false }))!.categoryId).toBe(other.id);
    expect((await cat.listCategories(db, { scope: "active" })).map((c) => c.id)).not.toContain(id);
    await cat.restoreCategory(db, id);
    expect((await cat.listCategories(db, { scope: "active" })).map((c) => c.id)).toContain(id);
    await expect(cat.deleteCategory(db, id)).rejects.toThrow(/Archivez/);
    await cat.archiveCategory(db, id);
    await cat.deleteCategory(db, id);
    expect((await cat.listCategories(db, { scope: "all" })).map((c) => c.id)).not.toContain(id);
    await trashProduct(db, p.id);
    await purgeProduct(db, p.id);
  });

  it("import CSV : aperçu, erreurs par ligne, regroupement en variantes, tout ou rien", async () => {
    const owner = await userByRole(db, "owner");
    expect(parseCsv('a;b\n"x;1";"di""t"\n')).toEqual([
      ["a", "b"],
      ["x;1", 'di"t'],
    ]);
    const tpl = await previewImport(db, importTemplate());
    expect(tpl.errors).toEqual([]);
    expect(tpl.products).toHaveLength(1);
    expect(tpl.products[0].variants.map((v) => v.sku)).toEqual(["EX-ECO-NO", "EX-ECO-BL"]);

    const bad = [
      "nom;reference;prix;categorie;options",
      "Lot A;IMP-1;1000;;Couleur=Rouge",
      "Lot A;IMP-1;1000;;Couleur=Bleu",
      "Lot B;IMP-2;abc;;",
      "Lot C;SON-ST2-NO;1000;;",
      "Lot D;IMP-3;1000;Inconnue;",
      "Lot A;IMP-4;1000;;Taille=M",
    ].join("\n");
    const p = await previewImport(db, bad);
    expect(p.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(p.errors[0].message).toMatch(/double/);
    expect(p.errors[1].message).toMatch(/prix/);
    expect(p.errors[2].message).toMatch(/déjà utilisée/);
    expect(p.errors[3].message).toMatch(/catégorie/);
    expect(p.errors[4].message).toMatch(/axes/);
    const before = await db.one<{ n: number }>("select count(*)::int as n from products");
    await expect(applyImport(db, bad, { userId: owner.id, withCosts: true, isDemo: true })).rejects.toThrow(/erreur/);
    expect((await db.one<{ n: number }>("select count(*)::int as n from products"))?.n).toBe(before?.n);

    const ok =
      "nom;marque;reference;prix;cout;stock;options\nImport Test;GPS;IMP-OK-1;2000;1200;4;Couleur=Noir\nImport Test;GPS;IMP-OK-2;2000;1200;2;Couleur=Blanc\n";
    const r = await applyImport(db, ok, { userId: owner.id, withCosts: true, isDemo: true });
    expect(r).toMatchObject({ products: 1, variants: 2, skipped: [] });
    expect(r.created).toEqual([{ id: expect.any(String), name: "Import Test", variants: 2 }]);
    const v = await variantBySku(db, "IMP-OK-1");
    expect(v.on_hand).toBe(4);
    const prod = await db.one<{ status: string; axes: string[] }>(
      "select p.status, p.axes from products p join variants v on v.product_id = p.id where v.sku = $1",
      ["IMP-OK-1"],
    );
    expect(prod).toEqual({ status: "draft", axes: ["Couleur"] });
    await expect(applyImport(db, ok, { userId: owner.id, withCosts: true, isDemo: true })).rejects.toThrow(/erreur/);
  });

  it("import CSV : association des colonnes, doublons, import partiel et rapport", async () => {
    const owner = await userByRole(db, "owner");
    const ctx = { userId: owner.id, withCosts: true, isDemo: true };
    // Intitulés d'un autre logiciel : reconnus automatiquement (désignation, code, prix de vente, quantité).
    const other = "Désignation;Code;Prix de vente;Quantité\nCâble Recette;REC-CAB-1;2500;7\n";
    const auto = await previewImport(db, other);
    expect(auto.missing).toEqual([]);
    expect(auto.products[0]).toMatchObject({ name: "Câble Recette" });
    expect(auto.products[0].variants[0]).toMatchObject({ sku: "REC-CAB-1", price: 2500, stock: 7 });
    // Intitulés inconnus : l'aperçu demande l'association, puis l'applique.
    const odd = "A;B;C\nCâble Recette 2;REC-CAB-2;3000\n";
    const ask = await previewImport(db, odd);
    expect(ask.missing).toEqual(["nom", "reference", "prix"]);
    expect(ask.headers).toEqual(["A", "B", "C"]);
    await expect(applyImport(db, odd, ctx)).rejects.toThrow(/Associez/);
    const mapped = await previewImport(db, odd, { nom: 0, reference: 1, prix: 2 });
    expect(mapped.missing).toEqual([]);
    expect(mapped.products[0].variants[0]).toMatchObject({ sku: "REC-CAB-2", price: 3000 });
    // Doublons : mêmes options dans un produit ; produit déjà présent au catalogue signalé.
    const dup = [
      "nom;reference;prix;options",
      "Câble Recette;REC-CAB-3;1000;Longueur=1 m",
      "Câble Recette;REC-CAB-4;1000;Longueur=1 m",
      "Câble Recette;;1000;Longueur=2 m",
      "Câble Recette;REC-CAB-5;1200;Longueur=2 m",
    ].join("\n");
    const pd = await previewImport(db, dup);
    expect(pd.errors.map((e) => [e.line, /double|manquante/.test(e.message)])).toEqual([
      [3, true],
      [4, true],
    ]);
    expect(pd.errors[0].raw).toEqual(["Câble Recette", "REC-CAB-4", "1000", "Longueur=1 m"]);
    await applyImport(db, other, ctx);
    expect((await previewImport(db, dup)).warnings[0]).toMatch(/existe déjà/);
    // Import partiel : lignes valides importées, lignes en erreur rendues dans le rapport.
    await expect(applyImport(db, dup, ctx)).rejects.toThrow(/erreur/);
    const rep = await applyImport(db, dup, ctx, { partial: true });
    expect(rep).toMatchObject({ products: 1, variants: 2 });
    expect(rep.skipped.map((e) => e.line)).toEqual([3, 4]);
    expect((await variantBySku(db, "REC-CAB-5")).price).toBe(1200);
  });

  it("recherche par référence et par catégorie", async () => {
    const all = await publishedProducts(db);
    expect(filterProducts(all, { q: "pas-urb-no" }).map((p) => p.name)).toEqual(["Pas Urbain"]);
    expect(filterProducts(all, { q: "ecouteurs" }).map((p) => p.name)).toContain("Sonna Buds Air");
    const asc = filterProducts(all, { tri: "prix-asc" });
    expect(asc[0].minPrice).toBeLessThanOrEqual(asc[asc.length - 1].minPrice);
  });

  it("saisie rapide : brouillon minimal, référence proposée, code-barres unique, création idempotente, stock commun", async () => {
    const { codeClashes, listCategories } = await import("@/server/domain/catalog");
    const { publicationHints, publicationIssues } = await import("@/lib/publication");
    const manager = await userByRole(db, "manager");
    const owner = await userByRole(db, "owner");
    const ctx = { userId: manager.id, withCosts: false };
    const categoryId = (await listCategories(db, { scope: "active" }))[0].id;
    const base = {
      name: "Saisie Rapide",
      brand: "",
      categoryId,
      description: "",
      specs: [],
      condition: null,
      axes: [] as string[],
      images: [] as { url: string; alt: string; kind?: "image" | "video" }[],
      status: "draft" as const,
      featured: false,
    };
    // Brouillon : nom seul suffit, référence vide proposée à partir du nom, stock initial tracé.
    const createId = crypto.randomUUID();
    const input = {
      ...base,
      createId,
      warranty: "6 mois",
      variants: [{ sku: "", barcode: "600 1234 567890", options: {}, price: 5000, initialStock: 3 }],
    };
    const first = await saveProduct(db, input, ctx);
    // Double clic ou réseau lent : le même envoi ne crée pas un second produit.
    const again = await saveProduct(db, input, ctx);
    expect(again.id).toBe(first.id);
    expect(first.id).toBe(createId);
    expect(
      (await db.one<{ n: number }>("select count(*)::int as n from products where name = 'Saisie Rapide'"))!.n,
    ).toBe(1);
    const p = (await productForEdit(db, first.id, { withCosts: false }))!;
    expect(p.variants[0].sku).toBe("SAISIERA");
    expect(p.variants[0].barcode).toBe("6001234567890");
    expect(p.variants[0].onHand).toBe(3);
    expect(p.warranty).toBe("6 mois");
    const moves = await db.query<{ kind: string; on_hand_delta: number }>(
      "select kind, on_hand_delta from stock_movements where variant_id = $1",
      [p.variants[0].id],
    );
    expect(moves).toEqual([{ kind: "initial", on_hand_delta: 3 }]);

    // Code-barres et référence déjà pris : signalés pendant la saisie, refusés à l'enregistrement.
    const clash = await codeClashes(db, { skus: ["saisiera"], barcodes: ["6001234567890"] }, null);
    expect(clash.skus[0]).toMatchObject({ code: "SAISIERA", name: "Saisie Rapide" });
    expect(clash.barcodes[0]).toMatchObject({ code: "6001234567890", name: "Saisie Rapide" });
    expect(await codeClashes(db, { skus: ["SAISIERA"], barcodes: [] }, first.id)).toEqual({ skus: [], barcodes: [] });
    await expect(
      saveProduct(
        db,
        { ...base, name: "Autre", variants: [{ sku: "", barcode: "6001234567890", options: {}, price: 1 }] },
        ctx,
      ),
    ).rejects.toThrow(/code-barres 6001234567890 est déjà utilisé/);

    // Variantes sans référence : références uniques générées (suffixe si le nom existe déjà).
    const twin = await saveProduct(
      db,
      {
        ...base,
        axes: ["Couleur"],
        variants: [
          { sku: "", options: { Couleur: "Noir" }, price: 5000 },
          { sku: "", options: { Couleur: "Bleu" }, price: 5000 },
        ],
      },
      ctx,
    );
    const skus = (await productForEdit(db, twin.id, { withCosts: false }))!.variants.map((v) => v.sku);
    expect(skus).toEqual(["SAISIERA-NOIR", "SAISIERA-BLEU"]);
    const third = await saveProduct(db, { ...base, variants: [{ sku: "", options: {}, price: 1 }] }, ctx);
    expect((await productForEdit(db, third.id, { withCosts: false }))!.variants[0].sku).toBe("SAISIERA-2");

    // Publication : nom, catégorie, prix valide et photo principale ; la description guide sans bloquer.
    const check = { ...base, variants: [{ sku: "", price: 5000, costPrice: 6000, options: {} }] };
    expect(publicationIssues(check)).toEqual(["Ajoutez au moins une photo."]);
    expect(publicationHints(check)).toEqual([
      "Une description de quelques lignes aide les clients.",
      "Prix de vente inférieur au coût d'achat.",
    ]);
    await expect(
      saveProduct(db, { ...input, id: first.id, createId: undefined, status: "published" }, ctx),
    ).rejects.toThrow(/Publication impossible : Ajoutez au moins une photo/);
    expect((await productForEdit(db, first.id, { withCosts: false }))!.status).toBe("draft");

    // Stock commun : aucune quantité par point de vente, aucun transfert.
    const perStore = await db.one<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_name in ('variants', 'stock_movements', 'stock_batches') and column_name = 'store_id'`,
    );
    expect(perStore!.n).toBe(0);
    // Droits : coût réservé au propriétaire, catalogue fermé aux vendeurs.
    const seller = await userByRole(db, "seller");
    expect(can(seller, "catalog.edit")).toBe(false);
    expect(can(manager, "catalog.costs")).toBe(false);
    expect(can(owner, "catalog.costs")).toBe(true);
    await db.query("delete from products where name in ('Saisie Rapide', 'Autre')");
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
    await expect(login(db, "vente@demo.gps", DEMO_PASSWORD, { allowDemo: false })).rejects.toThrow(/désactivés/);
    const { token } = await login(db, "vente@demo.gps", DEMO_PASSWORD, {
      allowDemo: true,
    });
    expect(await userFromToken(db, token, { allowDemo: true })).not.toBeNull();
    expect(await userFromToken(db, token, { allowDemo: false })).toBeNull();
    await expect(login(db, "vente@demo.gps", "mauvais", { allowDemo: true })).rejects.toThrow(/incorrect/);
  });

  it("démonstration protégée : comptes d'exemple bridés, puis propriétaire réel par code d'installation", async () => {
    const owner = await userByRole(db, "owner");
    expect(can(owner, "settings.edit")).toBe(true);
    const bridled = { ...owner, restricted: true };
    for (const p of ["settings.edit", "team.manage", "demo.purge", "customers.export"] as const) {
      expect(() => assertCan(bridled, p)).toThrow(/droits/);
    }
    expect(() => assertCan(bridled, "orders.view")).not.toThrow();

    const code = "code-installation-test-1234";
    const input = { code, name: "Propriétaire réel", email: "reel@exemple.test", password: "un-mot-de-passe-solide" };
    expect(await hasRealOwner(db)).toBe(false);
    await expect(claimOwner(db, undefined, input)).rejects.toThrow(/pas ouverte/);
    await expect(claimOwner(db, "court", input)).rejects.toThrow(/pas ouverte/);
    await expect(claimOwner(db, code, { ...input, code: "mauvais" })).rejects.toThrow(/incorrect/);
    await expect(claimOwner(db, code, { ...input, password: "court" })).rejects.toThrow(/12/);
    await claimOwner(db, code, input);
    expect(await hasRealOwner(db)).toBe(true);
    const real = await db.one<{ is_demo: boolean; role: string }>("select is_demo, role from users where email = $1", [
      input.email,
    ]);
    expect(real).toEqual({ is_demo: false, role: "owner" });
    await expect(claimOwner(db, code, { ...input, email: "autre@exemple.test" })).rejects.toThrow(/existe déjà/);
    // Identifiant simple accepté à la place d'un e-mail.
    const { createUser: cu, isLoginId } = await import("@/server/domain/auth");
    expect(isLoginId("Ndiogou")).toBe(true);
    expect(isLoginId("a b")).toBe(false);
    await cu(db, { name: "Ndiogou", email: "Ndiogou", role: "seller", password: "un-mot-de-passe-solide" });
    const t = await login(db, "ndiogou", "un-mot-de-passe-solide", { allowDemo: false });
    expect(t.token).toBeTruthy();
    await db.query("delete from users where email = 'ndiogou'");
    // Remise à l'état initial pour les autres tests.
    await db.query("delete from users where email = $1", [input.email]);
  });

  it("sécurité : limitation des connexions, mot de passe provisoire, révocation, inactivité, empreintes", async () => {
    const auth = await import("@/server/domain/auth");
    const owner = await userByRole(db, "owner");
    const pw = "provisoire-1234";
    // Compte créé par un tiers : mot de passe provisoire, changement exigé.
    const id = await auth.createUser(db, { name: "Fatou", email: "fatou.test", role: "seller", password: pw });
    const first = await auth.login(db, "fatou.test", pw, { allowDemo: false, ip: "10.0.0.1" });
    expect(first.mustChangePassword).toBe(true);
    const fatou = (await auth.userFromToken(db, first.token, { allowDemo: false }))!;
    expect(fatou.must_change_password).toBe(true);
    // Changement : ancien mot de passe exigé, nouveau différent, autres appareils déconnectés.
    const second = await auth.login(db, "fatou.test", pw, { allowDemo: false, ip: "10.0.0.2" });
    await expect(
      auth.changeOwnPassword(db, fatou, first.token, {
        current: "faux",
        password: "nouveau-mdp-1",
        confirm: "nouveau-mdp-1",
      }),
    ).rejects.toThrow(/actuel incorrect/);
    await expect(
      auth.changeOwnPassword(db, fatou, first.token, { current: pw, password: pw, confirm: pw }),
    ).rejects.toThrow(/différent/);
    await auth.changeOwnPassword(db, fatou, first.token, {
      current: pw,
      password: "nouveau-mdp-1",
      confirm: "nouveau-mdp-1",
    });
    expect((await auth.userFromToken(db, first.token, { allowDemo: false }))?.must_change_password).toBe(false);
    expect(await auth.userFromToken(db, second.token, { allowDemo: false })).toBeNull();

    // Limitation (détaillée dans le test suivant) : 5 échecs du même poste bloquent même le bon mot de passe.
    for (let i = 0; i < 5; i++) {
      await expect(auth.login(db, "fatou.test", "faux", { allowDemo: false, ip: "10.0.0.3" })).rejects.toThrow(
        /incorrect/,
      );
    }
    await expect(auth.login(db, "fatou.test", "nouveau-mdp-1", { allowDemo: false, ip: "10.0.0.3" })).rejects.toThrow(
      /Trop de tentatives/,
    );
    // La fenêtre passée, la connexion redevient possible.
    await db.query("update login_attempts set created_at = now() - interval '2 hours'");
    const third = await auth.login(db, "fatou.test", "nouveau-mdp-1", { allowDemo: false, ip: "10.0.0.3" });
    expect(third.mustChangePassword).toBe(false);

    // Inactivité : une session sans activité depuis plus de 2 h est refusée.
    await db.query("update sessions set last_seen_at = now() - interval '3 hours' where user_id = $1", [id]);
    expect(await auth.userFromToken(db, third.token, { allowDemo: false })).toBeNull();

    // Réinitialisation par le propriétaire : provisoire à nouveau, sessions fermées.
    const fourth = await auth.login(db, "fatou.test", "nouveau-mdp-1", { allowDemo: false });
    await auth.updateUser(db, { ...owner, role: "owner" } as never, id, { password: "remise-a-zero-1" });
    expect(await auth.userFromToken(db, fourth.token, { allowDemo: false })).toBeNull();
    expect((await auth.login(db, "fatou.test", "remise-a-zero-1", { allowDemo: false })).mustChangePassword).toBe(true);
    await expect(
      auth.updateUser(db, { ...owner, role: "owner" } as never, owner.id, { password: "x".repeat(12) }),
    ).rejects.toThrow(/Mon compte/);
    // Désactivation : accès révoqué immédiatement.
    const fifth = await auth.login(db, "fatou.test", "remise-a-zero-1", { allowDemo: false });
    await auth.updateUser(db, { ...owner, role: "owner" } as never, id, { active: false });
    expect(await auth.userFromToken(db, fifth.token, { allowDemo: false })).toBeNull();

    // Empreintes : paramètres scrypt renforcés, ancien format accepté puis mis à niveau à la connexion.
    expect((await auth.hashPassword("x")).split("$")).toHaveLength(6);
    const { scryptSync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const legacy = `scrypt$${salt.toString("hex")}$${scryptSync("ancien-format-1", salt, 64).toString("hex")}`;
    expect(await auth.verifyPassword("ancien-format-1", legacy)).toBe(true);
    await db.query("update users set password_hash = $2, active = true where id = $1", [id, legacy]);
    await auth.login(db, "fatou.test", "ancien-format-1", { allowDemo: false });
    const upgraded = await db.one<{ password_hash: string }>("select password_hash from users where id = $1", [id]);
    expect(auth.needsRehash(upgraded!.password_hash)).toBe(false);

    await db.query("delete from users where id = $1", [id]);
    await db.query("delete from login_attempts");
  });

  it("limite les connexions par identifiant, couple identifiant-adresse et adresse, sans gêner un Wi-Fi partagé", async () => {
    const auth = await import("@/server/domain/auth");
    await db.query("delete from login_attempts");
    const opts = (ip: string) => ({ allowDemo: false, ip, userAgent: "test" });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(
        await auth.createUser(db, {
          name: `Collègue ${i}`,
          email: `collegue${i}`,
          role: "seller",
          password: `motdepasse-${i}-ok`,
          temporary: false,
        }),
      );
    }
    const wifi = "41.82.10.10";

    // Délai progressif : rien avant le seuil, puis l'attente double à chaque échec, plafonnée.
    const r = auth.LOGIN_RULES.pair;
    expect(auth.progressiveDelay(r.threshold - 1, r)).toBe(0);
    expect(auth.progressiveDelay(r.threshold, r)).toBe(30);
    expect(auth.progressiveDelay(r.threshold + 1, r)).toBe(60);
    expect(auth.progressiveDelay(r.threshold + 2, r)).toBe(120);
    expect(auth.progressiveDelay(r.threshold + 30, r)).toBe(r.capSec);

    // 1. Huit collègues derrière le même Wi-Fi, chacun avec deux fautes de frappe : tous se connectent.
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 2; k++) {
        await expect(auth.login(db, `collegue${i}`, "faute", opts(wifi))).rejects.toThrow(/incorrect/);
      }
      expect((await auth.login(db, `collegue${i}`, `motdepasse-${i}-ok`, opts(wifi))).token).toBeTruthy();
    }

    // 2. Attaque répétée sur un identifiant depuis ce Wi-Fi : bloqué au 5e échec…
    for (let k = 0; k < 5; k++) {
      await expect(auth.login(db, "collegue0", "devine", opts(wifi))).rejects.toThrow(/incorrect/);
    }
    await expect(auth.login(db, "collegue0", "motdepasse-0-ok", opts(wifi))).rejects.toThrow(
      /Trop de tentatives\. Réessayez dans 30 secondes/,
    );
    // … sans bloquer les collègues sur la même adresse, ni le titulaire depuis son téléphone (autre adresse).
    expect((await auth.login(db, "collegue1", "motdepasse-1-ok", opts(wifi))).token).toBeTruthy();
    expect((await auth.login(db, "collegue0", "motdepasse-0-ok", opts("41.82.99.1"))).token).toBeTruthy();
    // Les essais pendant le blocage sont journalisés mais ne prolongent pas le compte des échecs.
    const logged = await db.query<{ reason: string; n: number }>(
      "select reason, count(*)::int as n from login_attempts where identifier = 'collegue0' group by reason order by reason",
    );
    expect(Object.fromEntries(logged.map((x) => [x.reason, x.n]))).toMatchObject({
      bad_credentials: 7,
      locked: 1,
      success: 2,
    });
    // Le seuil franchi laisse une trace dans le journal d'audit.
    expect(
      (await db.one<{ n: number }>("select count(*)::int as n from audit_log where action = 'auth.lockout'"))!.n,
    ).toBeGreaterThan(0);
    // Délai progressif : un échec de plus pendant que l'attente court la double.
    await db.query(
      "update login_attempts set created_at = created_at - interval '31 seconds' where identifier = 'collegue0' and ip = $1",
      [wifi],
    );
    await expect(auth.login(db, "collegue0", "devine", opts(wifi))).rejects.toThrow(/incorrect/);
    await expect(auth.login(db, "collegue0", "devine", opts(wifi))).rejects.toThrow(/1 minute/);

    // 3. Attaque répartie sur un identifiant (20 adresses différentes) : l'identifiant est bloqué partout.
    for (let k = 0; k < 20; k++) {
      await expect(auth.login(db, "collegue2", "devine", opts(`198.51.100.${k}`))).rejects.toThrow(/incorrect/);
    }
    await expect(auth.login(db, "collegue2", "motdepasse-2-ok", opts("203.0.113.9"))).rejects.toThrow(
      /Trop de tentatives/,
    );

    // 4. Attaque sur de nombreux identifiants depuis une adresse : l'adresse est bloquée, même pour un compte inconnu.
    const attacker = "203.0.113.66";
    for (let k = 0; k < auth.LOGIN_RULES.ip.distinct; k++) {
      await expect(auth.login(db, `cible${k}`, "devine", opts(attacker))).rejects.toThrow(/incorrect/);
    }
    await expect(auth.login(db, "collegue3", "motdepasse-3-ok", opts(attacker))).rejects.toThrow(/Trop de tentatives/);
    // Message identique pour un compte existant et inexistant (pas d'énumération).
    await expect(auth.login(db, "personne-inconnue", "x", opts(attacker))).rejects.toThrow(/Trop de tentatives/);
    await expect(auth.login(db, "collegue3", "faux", opts("192.0.2.1"))).rejects.toThrow(
      "Identifiant ou mot de passe incorrect.",
    );
    await expect(auth.login(db, "personne-inconnue", "faux", opts("192.0.2.1"))).rejects.toThrow(
      "Identifiant ou mot de passe incorrect.",
    );

    // Écran Équipe : blocages listés, puis levés manuellement (les échecs restent au journal).
    const locks = await auth.listLoginLocks(db);
    expect(locks.map((l) => `${l.kind}:${l.value}`)).toEqual(
      expect.arrayContaining(["identifier:collegue0", "identifier:collegue2", `ip:${attacker}`]),
    );
    expect(locks.find((l) => l.value === "collegue1")).toBeUndefined();
    expect(await auth.clearLoginLock(db, "identifier", "collegue2")).toBe(20);
    expect((await auth.login(db, "collegue2", "motdepasse-2-ok", opts("203.0.113.9"))).token).toBeTruthy();
    await auth.clearLoginLock(db, "ip", attacker);
    expect((await auth.login(db, "collegue3", "motdepasse-3-ok", opts(attacker))).token).toBeTruthy();
    expect(
      (await db.one<{ n: number }>("select count(*)::int as n from login_attempts where cleared"))!.n,
    ).toBeGreaterThan(0);

    // Expiration automatique : passée la fenêtre, plus aucun blocage.
    await db.query("update login_attempts set created_at = now() - interval '2 hours'");
    expect(await auth.listLoginLocks(db)).toEqual([]);
    expect((await auth.login(db, "collegue0", "motdepasse-0-ok", opts(wifi))).token).toBeTruthy();

    for (const id of ids) await db.query("delete from users where id = $1", [id]);
    await db.query("delete from login_attempts");
  });

  it("signale un numéro déjà connu avant de créer un doublon", async () => {
    expect((await phoneMatches(db, "+000 00 00 00 01")).length).toBeGreaterThan(0);
    await expect(createCustomer(db, { name: "Doublon", phone: "00 00 00 01" })).rejects.toThrow(/correspond/);
    await expect(
      createCustomer(db, { name: "Doublon", phone: "00 00 00 01" }, { allowDuplicate: true }),
    ).resolves.toBeTruthy();
  });

  // Ces scénarios portent sur le catalogue d'exemple : périmètre « démonstration incluse ».
  it("rapports : ventes, encaissements, remboursements et marge seulement si coûts complets", async () => {
    const r = await report(db, periodFromKey("jour"), { withMargin: true, scope: all });
    expect(r.sales.count).toBeGreaterThan(0);
    expect(r.encaissements).toBeGreaterThan(0);
    expect(r.remboursements).toBeGreaterThan(0);
    expect(r.margin.available).toBe(false);
    const hidden = await report(db, periodFromKey("jour"), {
      withMargin: false,
      scope: all,
    });
    expect(hidden.margin.available).toBe(false);
  });

  it("tableau de bord : formules centralisées et détail de chaque chiffre", async () => {
    const period = periodFromKey("jour");
    const before = await computeMetrics(db, period, all);
    const v = await variantBySku(db, "SON-ST2-NO");
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "whatsapp",
      reception: "pickup",
      customerName: "Indicateurs",
      customerPhone: "000",
      lines: [{ variantId: v.id, quantity: 1 }],
    });
    await recordPayment(db, manager, o.id, { method: "cash", amount: 10000 });
    const after = await computeMetrics(db, period, all);
    expect(after.commandes - before.commandes).toBe(1);
    expect(after.ca - before.ca).toBe(v.price);
    expect(after.encaissements - before.encaissements).toBe(10000);
    expect(after.reste - before.reste).toBe(v.price - 10000);
    expect(after.panier).toBe(Math.round(after.ca / after.commandes));
    const rows = await metricDetail(db, "reste", period, all);
    expect(rows.find((r) => r.reference === o.reference)?.amount).toBe(v.price - 10000);
    // Le détail retombe exactement sur le chiffre affiché.
    expect((await metricDetail(db, "ca", period, all)).reduce((s, r) => s + (r.amount ?? 0), 0)).toBe(after.ca);
    expect((await metricDetail(db, "encaissements", period, all)).reduce((s, r) => s + (r.amount ?? 0), 0)).toBe(
      after.encaissements,
    );
    const prev = previousPeriod(period);
    expect(prev.to.getTime()).toBe(period.from.getTime());
    expect(change(150, 100)).toBe(50);
    expect(change(5, 0)).toBeNull();
    await cancelOrder(db, manager, o.id, "test");
  });

  it("tableau de bord : montant, remboursements, annulations, graphiques et marge détaillée", async () => {
    const period = periodFromKey("jour");
    const before = await computeMetrics(db, period, all);
    const v = await variantBySku(db, "SON-ST2-NO");
    // Vente payée puis remboursée en partie ; commande annulée.
    const sale = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v.id, quantity: 1 }],
      payment: { method: "wave", amount: v.price },
    });
    await refund(db, manager, sale.id, { method: "wave", amount: 1000, note: "Geste commercial" });
    const cancelled = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "whatsapp",
      reception: "pickup",
      customerName: "Annulation",
      customerPhone: "000",
      lines: [{ variantId: v.id, quantity: 1 }],
    });
    await cancelOrder(db, manager, cancelled.id, "test");
    const after = await computeMetrics(db, period, all);
    expect(after.montant - before.montant).toBe(v.price);
    expect(after.remboursements - before.remboursements).toBe(1000);
    expect(after.annulees - before.annulees).toBe(1);
    expect(after.finalisees - before.finalisees).toBe(1);
    // Indicateurs de nombre : pas de montant dans le détail ; le détail des remboursements retombe sur le chiffre.
    expect((await metricDetail(db, "annulees", period, all)).every((r) => r.amount === null)).toBe(true);
    expect((await metricDetail(db, "remboursements", period, all)).reduce((s, r) => s + (r.amount ?? 0), 0)).toBe(
      after.remboursements,
    );
    // Graphique : la somme des tranches est égale aux chiffres affichés.
    const series = await metricSeries(db, period, all);
    expect(series).toHaveLength(24);
    expect(series.reduce((s, p) => s + p.ca, 0)).toBe(after.ca);
    expect(series.reduce((s, p) => s + p.encaissements, 0)).toBe(after.encaissements);
    expect(await metricSeries(db, periodFromKey("30j"), all)).toHaveLength(30);
    expect((await paymentsByMethod(db, period, all)).reduce((s, m) => s + m.amount, 0)).toBe(after.encaissements);
    // Marge par commande : connue seulement si chaque ligne a un coût d'achat.
    await db.query("update order_lines set cost_price = unit_price - 2000 where order_id = $1", [sale.id]);
    const m = (await marginDetail(db, period, all)).find((r) => r.reference.length && r.href.endsWith(sale.id))!;
    expect(m).toMatchObject({ revenue: v.price, cost: v.price - 2000, margin: 2000, missing: 0 });
    await db.query("update order_lines set cost_price = null where order_id = $1", [sale.id]);
    expect((await marginDetail(db, period, all)).find((r) => r.href.endsWith(sale.id))).toMatchObject({
      margin: null,
      missing: 1,
    });
    expect(await demoOrdersIn(db, periodFromKey("30j"))).toBeGreaterThanOrEqual(0);
  });

  it("démonstration exclue par défaut de tous les indicateurs, incluse sur demande", async () => {
    const owner = await userByRole(db, "owner");
    const period = periodFromKey("jour");
    const [realBefore, allBefore, demoBefore] = await Promise.all([
      computeMetrics(db, period),
      computeMetrics(db, period, all),
      demoOrdersIn(db, period),
    ]);
    // Un produit réel (hors démonstration) et une vente réelle.
    const base = (await productForEdit(db, (await publishedProducts(db))[0].id, { withCosts: true }))!;
    const real = await saveProduct(
      db,
      {
        ...base,
        id: undefined,
        slug: undefined,
        name: "Produit réel de contrôle",
        status: "published",
        featured: false,
        isDemo: false,
        axes: [],
        variants: [{ sku: "REEL-CTRL-1", options: {}, price: 20000, costPrice: 15000, initialStock: 5 }],
      },
      { userId: owner.id, withCosts: true },
    );
    const rv = await variantBySku(db, "REEL-CTRL-1");
    const realSale = await createOrder(db, owner, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: rv.id, quantity: 1 }],
      payment: { method: "cash", amount: 20000 },
    });
    await refund(db, owner, realSale.id, { method: "cash", amount: 500, note: "contrôle" });
    // Une vente sur un produit d'exemple (commande non marquée, mais produit de démonstration) …
    const dv = await variantBySku(db, "SON-ST2-NO");
    const startedAt = new Date();
    const demoSale = await createOrder(db, owner, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: dv.id, quantity: 1 }],
      payment: { method: "wave", amount: dv.price },
    });
    // … et une commande marquée démonstration contenant le produit réel.
    const flagged = await createOrder(db, owner, {
      idempotencyKey: key(),
      channel: "whatsapp",
      reception: "pickup",
      customerName: "Exemple",
      customerPhone: "000",
      lines: [{ variantId: rv.id, quantity: 1 }],
      isDemo: true,
    });
    await recordPayment(db, owner, flagged.id, { method: "cash", amount: 5000 });

    const realNow = await computeMetrics(db, period);
    const allNow = await computeMetrics(db, period, all);
    // Périmètre réel : seule la vente réelle compte (CA, montant, encaissements, remboursements, panier, soldes).
    expect(realNow.ca - realBefore.ca).toBe(20000);
    expect(realNow.montant - realBefore.montant).toBe(20000);
    expect(realNow.encaissements - realBefore.encaissements).toBe(20000);
    expect(realNow.remboursements - realBefore.remboursements).toBe(500);
    expect(realNow.commandes - realBefore.commandes).toBe(1);
    // Remboursement après paiement complet : 500 FCFA restent dus au solde.
    expect(realNow.reste - realBefore.reste).toBe(500);
    // Démonstration incluse : les trois commandes.
    expect(allNow.commandes - allBefore.commandes).toBe(3);
    expect(allNow.ca - allBefore.ca).toBe(20000 + dv.price + 20000);
    expect(allNow.encaissements - allBefore.encaissements).toBe(20000 + dv.price + 5000);
    expect(allNow.reste - allBefore.reste).toBe(500 + 15000);
    expect(await demoOrdersIn(db, period)).toBe(demoBefore + 2);
    // Détails, graphiques et moyens de paiement suivent le même périmètre.
    const refs = (await metricDetail(db, "ca", period)).map((r) => r.reference);
    expect(refs).toContain(realSale.reference);
    expect(refs).not.toContain(demoSale.reference);
    expect(refs).not.toContain(flagged.reference);
    const series = await metricSeries(db, period);
    expect(series.reduce((t, p) => t + p.ca, 0)).toBe(realNow.ca);
    expect((await paymentsByMethod(db, period)).find((m) => m.method === "wave")?.amount ?? 0).toBe(
      (await paymentsByMethod(db, periodFromKey("jour"))).find((m) => m.method === "wave")?.amount ?? 0,
    );
    expect((await paymentsByMethod(db, period)).reduce((t, m) => t + m.amount, 0)).toBe(realNow.encaissements);
    // Marge et meilleurs produits : uniquement le réel.
    const margins = await marginDetail(db, period);
    expect(margins.map((m) => m.reference)).toEqual([realSale.reference]);
    expect(margins[0]).toMatchObject({ revenue: 20000, cost: 15000, margin: 5000 });
    const r = await report(db, period, { withMargin: true });
    expect(r.best.map((b) => b.sku)).toEqual(["REEL-CTRL-1"]);
    expect(r.margin).toMatchObject({ available: true, value: 5000 });
    expect(r.encaissements).toBe(realNow.encaissements);
    expect(r.remboursements).toBe(realNow.remboursements);
    expect(r.openBalances.map((o) => o.reference)).not.toContain(flagged.reference);
    const withDemo = await report(db, period, { withMargin: true, scope: all });
    expect(withDemo.best.map((b) => b.sku)).toEqual(expect.arrayContaining(["REEL-CTRL-1", "SON-ST2-NO"]));
    expect(withDemo.openBalances.map((o) => o.reference)).toContain(flagged.reference);
    // Comparaisons : la période précédente applique le même périmètre.
    expect((await computeMetrics(db, previousPeriod(period))).commandes).toBe(0);
    // Stock commercial : seul le produit réel (4 en stock après la vente, 1 réservé par la commande d'exemple).
    const { stockSummary } = await import("@/server/domain/reports");
    const stock = await stockSummary(db, { withCost: true, defaultThreshold: 2 });
    expect(stock).toMatchObject({ variants: 1, units: 4, available: 3, saleValue: 80000, costValue: 60000 });
    const stockAll = await stockSummary(db, { withCost: true, defaultThreshold: 2, scope: all });
    expect(stockAll.variants).toBeGreaterThan(1);

    // Nettoyage : commandes de contrôle retirées, stock d'exemple remis tel quel.
    await db.query("delete from stock_movements where variant_id = $1 and created_at >= $2", [dv.id, startedAt]);
    await db.query("update variants set on_hand = $2, reserved = $3 where id = $1", [dv.id, dv.on_hand, dv.reserved]);
    for (const o of [realSale, demoSale, flagged]) await db.query("delete from orders where id = $1", [o.id]);
    await db.query("delete from stock_movements where variant_id = $1", [rv.id]);
    await db.query("delete from products where id = $1", [real.id]);
  });

  it("File GPS : éléments dérivés, attribution, report, résolution et tâche manuelle", async () => {
    const owner = await userByRole(db, "owner");
    const v = await variantBySku(db, "SON-ST2-NO");
    const o = await createOrder(db, manager, {
      idempotencyKey: key(),
      channel: "whatsapp",
      reception: "pickup",
      customerName: "File",
      customerPhone: "000",
      lines: [{ variantId: v.id, quantity: 1 }],
    });
    const opts = { view: "a-faire" as const, userId: owner.id, lowThreshold: 1 };
    let q = await listQueue(db, opts);
    const prep = q.items.find((i) => i.key === `order:${o.id}:prepare`);
    expect(prep?.title).toContain(o.reference);
    expect(q.items.some((i) => i.key.startsWith(`order:${o.id}:balance:`))).toBe(true);
    // Stock bas : une seule tâche regroupée, qui mène à la liste filtrée.
    const stockItems = q.items.filter((i) => i.kind === "stock");
    expect(stockItems.length).toBeLessThanOrEqual(1);
    if (stockItems[0]) expect(stockItems[0].href).toBe("/comptoir/stock?faible=1");

    await updateQueueItem(db, owner, prep!.key, { action: "assign", userId: owner.id }, 1);
    expect((await listQueue(db, { ...opts, view: "moi" })).items.map((i) => i.key)).toContain(prep!.key);
    await updateQueueItem(db, owner, prep!.key, { action: "snooze", until: new Date(Date.now() + 3600_000) }, 1);
    q = await listQueue(db, opts);
    expect(q.items.map((i) => i.key)).not.toContain(prep!.key);
    expect((await listQueue(db, { ...opts, view: "reportees" })).items.map((i) => i.key)).toContain(prep!.key);
    await updateQueueItem(db, owner, prep!.key, { action: "resolve" }, 1);
    expect((await listQueue(db, { ...opts, view: "resolues" })).items.map((i) => i.key)).toContain(prep!.key);
    await expect(updateQueueItem(db, owner, "order:inconnu:prepare", { action: "resolve" }, 1)).rejects.toThrow(
      /plus d'actualité/,
    );

    // Une fois prête, la commande change de clé : l'élément « à préparer » n'existe plus.
    await advanceOrder(db, manager, o.id, "ready");
    q = await listQueue(db, opts);
    expect(q.items.some((i) => i.key === `order:${o.id}:pickup`)).toBe(true);

    const k = await addManualTask(db, owner, { title: "Appeler le fournisseur" });
    expect((await listQueue(db, opts)).items.find((i) => i.key === k)?.kind).toBe("manual");
    await expect(addManualTask(db, owner, { title: "  " })).rejects.toThrow(/Indiquez/);
    await cancelOrder(db, manager, o.id, "test");
  });

  it("centre de lancement : contrôles, modes journalisés sans bascule, santé", async () => {
    const owner = await userByRole(db, "owner");
    const env = { demoMode: true, indexable: false, siteUrl: "", protectedDemo: false };
    const settings = await getSettings(db);
    const checks = await launchChecks(db, settings, env);
    const by = (k: string) => checks.find((c) => c.key === k)!;
    expect(by("owner").status).toBe("blocking");
    expect(by("demo").status).toBe("blocking");
    expect(by("catalog").status).toBe("blocking");
    expect(checks.every((c) => c.fix.startsWith("/comptoir"))).toBe(true);
    expect(summarize(checks).blocking).toBeGreaterThan(0);
    expect(currentMode(env)).toBe("demo");
    expect(currentMode({ ...env, demoMode: false })).toBe("test");
    expect(currentMode({ ...env, demoMode: false, indexable: true })).toBe("open");

    await expect(setTargetMode(db, owner, "open", "OUVERT", checks)).rejects.toThrow(/bloquants/);
    await expect(setTargetMode(db, owner, "demo", "oui", checks)).rejects.toThrow(/Tapez/);
    await setTargetMode(db, owner, "demo", "démonstration", checks);
    expect((await getSettings(db)).launch.targetMode).toBe("demo");
    const log = await db.one<{ n: number }>(
      "select count(*)::int as n from audit_log where action = 'launch.target_mode'",
    );
    expect(log?.n).toBeGreaterThan(0);

    const health = await healthChecks(db, { ...env, postgres: false, region: "" });
    expect(health.find((h) => h.key === "schema")?.status).toBe("ok");
    expect(health.find((h) => h.key === "stock")?.status).not.toBe("error");
  });

  it("demande WhatsApp : référence GPS-R, aucune réservation, conversion en commande, classement", async () => {
    const owner = await userByRole(db, "owner");
    const v0 = await variantBySku(db, "SON-ST2-NO");
    const input = {
      items: [{ variantId: v0.id, quantity: 2, seenPrice: 1 }],
      name: "Cliente Demande",
      phone: "000 11 22 33",
      reception: "pickup" as const,
      deliveryFee: 0,
    };
    const r = await createRequest(db, input);
    expect(r.reference).toMatch(/^GPS-R-\d{4,}$/);
    // Prix recalculé côté serveur, pas celui envoyé par le navigateur.
    expect(r.lines[0].unitPrice).toBe(v0.price);
    expect((await variantBySku(db, "SON-ST2-NO")).reserved).toBe(v0.reserved);
    const msg = buildOrderMessage({
      reference: r.reference,
      lines: r.lines,
      reception: "pickup",
      deliveryFee: 0,
      name: input.name,
    });
    expect(msg.split("\n")[1]).toBe(`Demande ${r.reference}`);
    const q = await listQueue(db, { view: "a-faire", userId: owner.id, lowThreshold: 1 });
    expect(q.items.some((i) => i.key === `request:${r.id}`)).toBe(true);

    const order = await convertRequest(db, owner, r.id, { isDemo: true });
    const after = await variantBySku(db, "SON-ST2-NO");
    expect(after.reserved).toBe(v0.reserved + 2);
    const req = await getRequest(db, r.id);
    expect(req?.status).toBe("converted");
    expect(req?.order_reference).toBe(order.reference);
    await expect(convertRequest(db, owner, r.id, { isDemo: true })).rejects.toThrow(/déjà/);
    const d = (await getOrder(db, order.id))!;
    expect(d.events.some((e) => e.message.includes(r.reference))).toBe(true);
    await cancelOrder(db, manager, order.id, "test");

    // Le client modifie son panier : la demande précédente est remplacée, pas dupliquée.
    const r2 = await createRequest(db, input);
    const r3 = await createRequest(db, { ...input, replacesId: r2.id });
    expect((await getRequest(db, r2.id))?.status).toBe("dismissed");
    await expect(dismissRequest(db, owner, r3.id, "")).rejects.toThrow(/raison/);
    await dismissRequest(db, owner, r3.id, "Doublon");
    expect((await getRequest(db, r3.id))?.status).toBe("dismissed");
    await expect(createRequest(db, { ...input, name: " " })).rejects.toThrow(/nom/);
  });

  it("configuration : modèles WhatsApp, immatriculations, moyens de paiement", async () => {
    const txt = renderTemplate(defaultTemplates.readyPickup, {
      prenom: "Awa",
      reference: "GPS-1",
      boutique: "en boutique",
      horaires: "",
      reste: "",
    });
    expect(txt.split("\n")[0]).toBe(
      "Bonjour Awa, votre commande GPS-1 est prête. Vous pouvez venir la retirer en boutique.",
    );
    expect(txt).not.toMatch(/\{|\n\n/);

    // Un message par situation : le premier proposé est le bon.
    const { requestMessages, orderMessages } = await import("@/lib/messages");
    const { templateMeta, withDefaultTemplates, legacyTemplates } = await import("@/lib/templates");
    const req = {
      reference: "GPS-R-1",
      customer_name: "Awa Ndiaye",
      reception: "delivery" as const,
      delivery_zone: "Zone 1",
      delivery_fee: 1000,
      lines: [
        { variantId: "a", name: "Écouteurs", optionsLabel: "Noir", quantity: 1, unitPrice: 10000 },
        { variantId: "b", name: "Câble", optionsLabel: "", quantity: 2, unitPrice: 2500 },
      ],
    };
    const all = requestMessages(
      req,
      new Map([
        ["a", 3],
        ["b", 5],
      ]),
      defaultTemplates,
      templateMeta,
    );
    expect(all[0]).toMatchObject({ key: "requestAvailable", recommended: true });
    expect(all[0].text).toMatch(/Total à payer : 16\s000\sFCFA/);
    expect(all[0].text).toMatch(/Livraison \(Zone 1\) : 1\s000\sFCFA/);
    const part = requestMessages(
      req,
      new Map([
        ["a", 3],
        ["b", 1],
      ]),
      defaultTemplates,
      templateMeta,
    );
    expect(part[0].key).toBe("requestPartial");
    expect(part[0].text).toMatch(/Disponible :\n• Écouteurs \(Noir\) × 1/);
    expect(part[0].text).toMatch(/Câble \(seulement 1 en stock sur 2 demandés\)/);
    expect(
      requestMessages(
        req,
        new Map([
          ["a", 0],
          ["b", 0],
        ]),
        defaultTemplates,
        templateMeta,
      )[0].key,
    ).toBe("requestUnavailable");
    expect(requestMessages(req, new Map(), defaultTemplates, templateMeta)[0].key).toBe("requestReceived");

    const base = {
      reference: "GPS-1",
      customer_name: "Awa",
      status: "confirmed" as const,
      fulfillment: "to_prepare" as const,
      reception: "delivery" as const,
      subtotal: 10000,
      delivery_fee: null,
      delivery_address: "",
      delivery_zone: "Zone 3",
      balance: 10000,
      net: 0,
      refunded: 0,
      lines: [{ name: "Écouteurs", options_label: "", quantity: 1 }],
    };
    const ctx = { hours: "9 h – 22 h", store: { name: "GPS Petit Mbao 1", address: "Dabakh Malick", landmark: "" } };
    const keys = (o: typeof base | Record<string, unknown>) =>
      orderMessages({ ...base, ...o } as typeof base, ctx, defaultTemplates, templateMeta).map((m) => m.key);
    expect(keys({})[0]).toBe("addressRequest");
    expect(keys({ delivery_fee: 1000, delivery_address: "Rue 1" })[0]).toBe("confirmation");
    expect(keys({ reception: "pickup", fulfillment: "ready" })[0]).toBe("readyPickup");
    expect(keys({ fulfillment: "out_for_delivery", delivery_fee: 1000, delivery_address: "Rue 1" })[0]).toBe(
      "outForDelivery",
    );
    expect(keys({ status: "completed", fulfillment: "handed_over", balance: 0, net: 10000 })[0]).toBe("thanks");
    expect(keys({ status: "cancelled", balance: -5000, net: 5000 })).toEqual(["cancelled", "refund"]);
    const ready = orderMessages(
      { ...base, reception: "pickup", fulfillment: "ready", balance: 4000, net: 6000 },
      ctx,
      defaultTemplates,
      templateMeta,
    )[0].text;
    expect(ready).toContain("à GPS Petit Mbao 1, Dabakh Malick (9 h – 22 h)");
    expect(ready).toMatch(/Reste à régler au retrait/);
    expect(ready).not.toMatch(/\{/);
    // Les anciens textes jamais modifiés passent à la nouvelle version ; un texte personnalisé est conservé.
    const up = withDefaultTemplates({ readyPickup: legacyTemplates.readyPickup![0], balance: "Mon texte {solde}" });
    expect(up.readyPickup).toBe(defaultTemplates.readyPickup);
    expect(up.balance).toBe("Mon texte {solde}");
    expect(up.thanks).toBe(defaultTemplates.thanks);
    const s = await getSettings(db);
    expect(s.company.timezone).toBe("Africa/Dakar");
    expect(s.payments.methods).toContain("wave");
    expect(s.messages.balance).toBe(defaultTemplates.balance);
    const { legalIds } = await import("@/server/domain/settings");
    expect(legalIds({ ...s.company, ninea: "123", rccm: "SN-DKR-1", legalId: "" })).toBe("NINEA 123 · RCCM SN-DKR-1");
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
    // Essai à blanc : compte rendu exact, rien ne bouge.
    const dry = await purgeDemo(db, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.before.demo.products).toBeGreaterThan(0);
    expect(dry.after.demo.products).toBe(0);
    expect((await db.one<{ n: number }>("select count(*)::int as n from products where is_demo"))!.n).toBe(
      dry.before.demo.products,
    );
    expect((await db.one<{ n: number }>("select count(*)::int as n from data_backups"))!.n).toBe(0);
    const catsBefore = (await db.one<{ n: number }>("select count(*)::int as n from categories"))!.n;
    // Purge réelle : sauvegarde datée d'abord, puis suppression ; relançable sans erreur.
    const done = await purgeDemo(db);
    expect(done.backup?.label).toMatch(/^demo-\d{4}-/);
    const saved = await db.one<{ counts: Record<string, number>; payload: Record<string, unknown[]> }>(
      "select counts, payload from data_backups where id = $1",
      [done.backup!.id],
    );
    expect(saved!.counts.products).toBe(dry.before.demo.products);
    expect(saved!.payload.orders.length).toBe(dry.before.demo.orders);
    expect(JSON.stringify(saved!.payload.users)).not.toContain("password");
    expect(Object.values(done.after.demo).every((v) => v === 0)).toBe(true);
    const again = await purgeDemo(db);
    expect(Object.values(again.before.demo).every((v) => v === 0)).toBe(true);
    // Catégories utiles conservées, devenues réelles ; tableau de bord et rapports à zéro.
    expect((await db.one<{ n: number }>("select count(*)::int as n from categories"))!.n).toBe(catsBefore);
    expect((await db.one<{ n: number }>("select count(*)::int as n from categories where is_demo"))!.n).toBe(0);
    const zero = await computeMetrics(db, periodFromKey("30j"), all);
    expect([zero.ca, zero.commandes, zero.encaissements, zero.reste]).toEqual([0, 0, 0, 0]);
    expect((await report(db, periodFromKey("30j"), { withMargin: true, scope: all })).best).toEqual([]);
    const n = await db.one<{ n: number }>("select count(*)::int as n from products where is_demo");
    expect(n!.n).toBe(0);
    expect((await db.one<{ n: number }>("select count(*)::int as n from users where is_demo"))!.n).toBe(0);
    const after = await getSettings(db);
    expect(after.company.whatsapp).toBe("22500000000");
    expect(after.company.hours).toBe("Lun–Sam");
    expect(after.storefront.heroProductId).toBeNull();
  });
});

describe("Points de vente (stock commun)", () => {
  it("retrait par boutique, vente rapide par boutique, point habituel, rapports, stock commun", async () => {
    const st = await import("@/server/domain/stores");
    const { storeReport } = await import("@/server/domain/reports");
    // Après la purge de démonstration (test précédent), un propriétaire réel est créé pour ce scénario.
    const { createUser } = await import("@/server/domain/auth");
    const ownerId = await createUser(db, {
      name: "Propriétaire boutique",
      email: "proprio.boutique",
      role: "owner",
      password: "motdepasse-proprio",
      temporary: false,
    });
    const owner = { id: ownerId, name: "Propriétaire boutique", is_demo: false, role: "owner" as const };
    const base = {
      address: "",
      district: "Dabakh Malick",
      city: "Petit Mbao",
      landmark: "",
      hours: st.defaultHours,
      closures: [],
      photo_url: null,
      phone: "",
      services: "",
      pickup_enabled: true,
      counter_enabled: true,
      published: true,
    };
    const s1 = await st.saveStore(db, {
      ...base,
      name: "GPS Petit Mbao 1",
      maps_url: "https://maps.app.goo.gl/qM3MVde8n8LfCe2n6?g_st=ic",
      is_main: true,
    });
    const s2 = await st.saveStore(db, {
      ...base,
      name: "GPS Petit Mbao 2",
      maps_url: "https://maps.app.goo.gl/5c21wooLPBo1aThDA",
      is_main: false,
    });
    const list = await st.listStores(db, { publishedOnly: true });
    expect(list.map((x) => x.maps_url)).toEqual([
      "https://maps.app.goo.gl/qM3MVde8n8LfCe2n6?g_st=ic",
      "https://maps.app.goo.gl/5c21wooLPBo1aThDA",
    ]);
    // Plage 09 h – 22 h sans prétendre « tous les jours » tant que les jours ne sont pas confirmés.
    expect(st.hoursText(list[0].hours)).toBe("9 h – 22 h");
    expect(st.hoursText({ ...list[0].hours, days: { mon: { enabled: true }, sun: { enabled: false } } })).toBe(
      "Lundi : 9 h – 22 h · Dimanche : fermé",
    );
    // Jours identiques regroupés : plus de liste jour par jour.
    const all = Object.fromEntries(st.DAYS.map(([k]) => [k, { enabled: true }]));
    expect(st.hoursText({ ...list[0].hours, days: all })).toBe("Tous les jours : 9 h – 22 h");
    expect(st.hoursText({ ...list[0].hours, days: { ...all, sun: { enabled: false } } })).toBe(
      "Lundi – Samedi : 9 h – 22 h · Dimanche : fermé",
    );
    await expect(
      st.saveStore(db, { ...base, name: "X", maps_url: "javascript:alert(1)", is_main: false }),
    ).rejects.toThrow(/Maps/);

    // Retrait : le point de vente est obligatoire, enregistré et repris dans la commande.
    await saveProduct(
      db,
      {
        name: "Article boutique",
        brand: "GPS",
        categoryId: (await db.one<{ id: string }>("select id from categories order by position limit 1"))!.id,
        description: "Article réel de contrôle pour les points de vente de Petit Mbao.",
        specs: [],
        condition: null,
        axes: [],
        images: [{ url: "/brand/logo-gps-mark.png", alt: "Article", kind: "image" }],
        variants: [{ sku: "BOUT-1", options: {}, price: 10000, initialStock: 5 }],
        status: "published",
        featured: false,
        isDemo: false,
      },
      { userId: owner.id, withCosts: true },
    );
    const v = await variantBySku(db, "BOUT-1");
    const input = {
      items: [{ variantId: v.id, quantity: 1, seenPrice: v.price }],
      name: "Client retrait",
      reception: "pickup" as const,
      deliveryFee: 0,
    };
    await expect(createRequest(db, input)).rejects.toThrow(/point de vente/);
    const req = await createRequest(db, { ...input, storeId: s2 });
    expect((await getRequest(db, req.id))?.store_name).toBe("GPS Petit Mbao 2");
    const order = await convertRequest(db, owner, req.id, { isDemo: false });
    expect((await getOrder(db, order.id))?.store_name).toBe("GPS Petit Mbao 2");

    // Vente rapide dans la boutique 1 : même stock commun, point habituel mémorisé.
    const before = await variantBySku(db, "BOUT-1");
    const sale = await createOrder(db, owner, {
      idempotencyKey: key(),
      channel: "boutique",
      reception: "immediate",
      lines: [{ variantId: v.id, quantity: 1 }],
      payment: { method: "cash", amount: v.price },
      storeId: s1,
    });
    await st.setDefaultStore(db, owner.id, s1);
    const after = await variantBySku(db, "BOUT-1");
    // Stock commun : la vente en boutique 1 et la réservation du retrait en boutique 2 portent sur le même stock.
    expect(after.on_hand).toBe(before.on_hand - 1);
    expect(after.reserved).toBe(1);
    expect((await db.one<{ s: string }>("select default_store_id as s from users where id = $1", [owner.id]))!.s).toBe(
      s1,
    );
    // Rapports : ventes réparties par boutique, filtre de la liste des commandes.
    const rows = await storeReport(db, periodFromKey("jour"), { scope: { includeDemo: true } });
    const r1 = rows.find((r) => r.id === s1)!;
    expect(r1).toMatchObject({ counter: 1, ca: v.price, encaissements: v.price });
    expect(r1.sellers).toContain(owner.name);
    expect(rows.find((r) => r.id === s2)?.orders).toBe(1);
    const { listOrders } = await import("@/server/domain/orders");
    expect((await listOrders(db, { store: s1 })).map((o) => o.id)).toEqual([sale.id]);

    await cancelOrder(db, owner, order.id, "test");
    await db.query("update users set default_store_id = null");
    await db.query("update orders set store_id = null where store_id in ($1, $2)", [s1, s2]);
    await db.query("update order_requests set store_id = null where store_id in ($1, $2)", [s1, s2]);
    await db.query("delete from stores");
  });

  it("centre de lancement : informations manquantes listées sans mention de démonstration", async () => {
    const st = await import("@/server/domain/stores");
    await st.saveStore(db, {
      name: "Boutique lancement",
      address: "",
      district: "Dabakh Malick",
      city: "Petit Mbao",
      landmark: "",
      maps_url: "",
      hours: st.defaultHours,
      closures: [],
      photo_url: null,
      phone: "",
      services: "",
      pickup_enabled: true,
      counter_enabled: true,
      is_main: true,
      published: true,
    });
    const env = { demoMode: false, indexable: false, siteUrl: "", protectedDemo: false };
    const checks = await launchChecks(db, await getSettings(db), env);
    const by = (k: string) => checks.find((c) => c.key === k)!;
    expect(by("store-days")).toMatchObject({ status: "todo", fix: "/comptoir/parametres/points-de-vente" });
    expect(by("store-days").detail).toMatch(/Boutique lancement/);
    expect(by("store-place").status).toBe("todo");
    expect(by("store-photos").status).toBe("todo");
    expect(by("delivery").status).not.toBe("ok");
    expect(["policy-warranty", "policy-returns", "policy-payment", "texts"].every((k) => by(k))).toBe(true);
    // Plus aucune donnée d'exemple : aucun contrôle ni texte ne parle de démonstration.
    expect(checks.some((c) => c.key === "demo")).toBe(false);
    expect(JSON.stringify(checks)).not.toMatch(/démonstration|d'exemple|fictif/i);
    await db.query("delete from stores");
  });

  it("import du catalogue de la boutique : brouillons sans prix ni stock, sans doublon, sauvegarde et journal", async () => {
    const imp = await import("@/server/domain/catalog-import-gps");
    const { createUser } = await import("@/server/domain/auth");
    const ownerId = await createUser(db, {
      name: "Propriétaire import",
      email: "proprio.import",
      role: "owner",
      password: "motdepasse-import",
      temporary: false,
    });
    expect(can("owner", "catalog.import")).toBe(true);
    expect(can("manager", "catalog.import")).toBe(false);
    expect(can("seller", "catalog.import")).toBe(false);
    // Un produit saisi à la main sous le même nom n'est jamais doublé.
    const manual = await saveProduct(
      db,
      {
        name: "Oraimo Watch 6R (OSW-823)",
        brand: "Oraimo",
        categoryId: null,
        description: "",
        specs: [],
        condition: null,
        axes: [],
        images: [],
        variants: [{ sku: "", options: {}, price: 0 }],
        status: "draft",
        featured: false,
      },
      { userId: ownerId, withCosts: true },
    );
    const plan = await imp.planGpsImport(db);
    const total = imp.gpsManifest.products.length;
    expect(plan.totals.conflict).toBe(1);
    expect(plan.totals.create).toBe(total - 1);
    expect(plan.missingPhotos).toBe(81);
    const before = (await publishedProducts(db)).length;

    const report = await imp.applyGpsImport(db, { id: ownerId });
    expect(report.errors).toEqual([]);
    expect(report.created).toHaveLength(total - 1);
    const rows = await db.query<{
      status: string;
      price: number;
      cost_price: number | null;
      on_hand: number;
      barcode: string | null;
    }>(
      `select p.status, v.price, v.cost_price, v.on_hand, v.barcode from products p join variants v on v.product_id = p.id
        where p.internal->>'externalKey' is not null`,
    );
    expect(rows.length).toBe(report.created.reduce((n, c) => n + c.variants, 0));
    // Rien de publié, aucun prix, coût, stock ni code-barres inventé, aucun mouvement de stock.
    expect(
      rows.every(
        (r) => r.status === "draft" && r.price === 0 && r.cost_price === null && r.on_hand === 0 && !r.barcode,
      ),
    ).toBe(true);
    expect((await publishedProducts(db)).length).toBe(before);
    const moves = await db.one<{ n: number }>(
      `select count(*)::int as n from stock_movements m join variants v on v.id = m.variant_id
         join products p on p.id = v.product_id where p.internal->>'externalKey' is not null`,
    );
    expect(moves!.n).toBe(0);
    // Sources et vérifications humaines conservées en interne, pas dans les caractéristiques publiques.
    const watch5 = report.created.find((c) => c.externalKey === "gps-oraimo-osw-804")!;
    const info = (await imp.importedInfo(db, watch5.id))!;
    expect(info.humanChecks.some((c) => /Résolution/.test(c))).toBe(true);
    const pub = (await productForEdit(db, watch5.id, { withCosts: false }))!;
    expect(pub.specs.map((x) => x.label)).not.toContain("Résolution");
    expect(JSON.stringify(pub.specs)).not.toMatch(/source/);
    // Variantes uniquement pour les compatibilités relevées.
    const coques = report.created.find((c) => c.externalKey === "gps-coques-telephone")!;
    expect(coques.variants).toBe(24);
    // Sauvegarde datée et journal.
    expect(await db.one("select 1 from data_backups where label = $1", [report.backup])).toBeTruthy();
    const logs = await db.one<{ n: number }>(
      "select count(*)::int as n from audit_log where action = 'product.import'",
    );
    expect(logs!.n).toBe(total - 1);
    expect(report.categoriesCreated).toEqual(expect.arrayContaining(["Câbles", "Batteries externes"]));

    // Relancer : aucun doublon.
    const again = await imp.applyGpsImport(db, { id: ownerId });
    expect(again.created).toHaveLength(0);
    expect(again.categoriesCreated).toHaveLength(0);
    expect(
      (await db.one<{ n: number }>(
        "select count(*)::int as n from products where internal->>'externalKey' is not null",
      ))!.n,
    ).toBe(total - 1);

    await db.query("delete from products where internal->>'externalKey' is not null or id = $1", [manual.id]);
  });
});

describe("Saisie simplifiée des produits", () => {
  it("nom simple suggéré sans donnée incertaine, gabarits par catégorie, description composée, avancement", async () => {
    const kit = await import("@/lib/product-kit");
    const specs = (o: Record<string, string>) => Object.entries(o).map(([label, value]) => ({ label, value }));
    expect(
      kit.suggestName({
        categoryName: "Batteries externes",
        brand: "Oraimo",
        model: "OPB-P600Q",
        specs: specs({ Capacité: "60 000 mAh" }),
      }),
    ).toBe("Batterie externe Oraimo 60 000 mAh");
    expect(kit.suggestName({ categoryName: "Téléphones", brand: "Nokia", model: "105 4G", specs: [] })).toBe(
      "Nokia 105 4G",
    );
    expect(
      kit.suggestName({
        categoryName: "Montres",
        brand: "Oraimo",
        model: "Watch 5 Lite",
        specs: specs({ Type: "connectée" }),
      }),
    ).toBe("Montre connectée Oraimo Watch 5 Lite");
    expect(
      kit.suggestName({
        categoryName: "Chargeurs",
        brand: "",
        model: "",
        specs: specs({ "Compatible avec": "MacBook", "Puissance maximale": "45 W" }),
      }),
    ).toBe("Chargeur MacBook 45 W");
    // Une donnée incertaine n'entre jamais dans le nom ; le modèle n'est jamais modifié.
    expect(
      kit.suggestName({ categoryName: "Téléphones", brand: "Nokia", model: "105 (génération à confirmer)", specs: [] }),
    ).toBe("Nokia");
    expect(kit.templateFor("Téléphones").fields.map((f) => f.label)).toEqual(
      expect.arrayContaining(["RAM", "Stockage", "SIM", "Réseau", "Garantie"]),
    );
    expect(kit.templateFor("Parfumerie").fields.map((f) => f.label)).toContain("Contenance");
    expect(
      kit
        .templateFor("Protections & coques")
        .fields.map((f) => f.label)
        .slice(0, 2),
    ).toEqual(["Téléphone compatible", "Type de coque"]);
    // Options et variantes réelles : pas de couleur pour un chargeur ou une batterie externe.
    expect(kit.templateFor("Chargeurs").variantAxes).toEqual([]);
    expect(kit.templateFor("Batteries externes").variantAxes).toEqual([]);
    expect(kit.templateFor("Chargeurs").fields.map((f) => f.label)).not.toContain("Couleur");
    expect(kit.templateFor("Batteries externes").fields.map((f) => f.label)).not.toContain("Couleur");
    expect(kit.templateFor("Protections & coques").variantAxes).toEqual(["Couleur"]);
    expect(kit.templateFor("Câbles").variantAxes).toEqual(["Longueur"]);
    expect(
      kit.suggestName({
        categoryName: "Chargeurs",
        brand: "TDKC313",
        model: "",
        specs: specs({ "Types de ports": "USB-C+USB-A", "Puissance maximale": "35 W" }),
      }),
    ).toBe("Chargeur USB-C + USB-A 35 W");
    expect(
      kit.suggestName({
        categoryName: "Chargeurs",
        brand: "",
        model: "",
        specs: specs({ "Type de chargeur": "Sans fil", "Compatible avec": "Apple Watch" }),
      }),
    ).toBe("Chargeur sans fil pour Apple Watch");
    expect(
      kit.suggestName({
        categoryName: "Câbles",
        brand: "TDKC313",
        model: "",
        specs: specs({
          "Connecteur d'entrée": "USB-C",
          "Connecteur de sortie": "Lightning",
          "Puissance maximale": "35 W",
        }),
      }),
    ).toBe("Câble USB-C vers Lightning — 35 W");
    // Puissance non vérifiée : jamais dans le nom.
    expect(
      kit.suggestName({
        categoryName: "Câbles",
        brand: "",
        model: "",
        specs: specs({
          "Connecteur d'entrée": "USB-A",
          "Connecteur de sortie": "USB-C",
          "Puissance maximale": "60 W ?",
        }),
      }),
    ).toBe("Câble USB-A vers USB-C");
    expect(
      kit.suggestName({
        categoryName: "Protections & coques",
        brand: "",
        model: "",
        specs: specs({ "Téléphone compatible": "iPhone 15", "Type de coque": "Cuir" }),
      }),
    ).toBe("Coque en cuir iPhone 15");
    expect(
      kit.suggestName({
        categoryName: "Protections & coques",
        brand: "",
        model: "",
        specs: specs({ "Téléphone compatible": "iPhone 15 Pro", "Type de coque": "Avec support" }),
      }),
    ).toBe("Coque iPhone 15 Pro avec support");
    expect(kit.nameWarnings("Coque en cuire iPhone 15")[0]).toMatch(/cuir/);
    // Profil réglé par le propriétaire : champs et options de variantes remplacés.
    const custom = kit.templateFor("Chargeurs", {
      fields: [{ label: "Puissance maximale" }, { label: "Prise", options: ["Européenne", "Anglaise"] }],
      variantAxes: ["Prise"],
    });
    expect(custom.variantAxes).toEqual(["Prise"]);
    expect(custom.fields.map((f) => f.label)).toEqual(["Marque", "Modèle", "Puissance maximale", "Prise", "Garantie"]);
    expect(custom.fields.find((f) => f.label === "Puissance maximale")?.quick).toBe("power");
    expect(kit.defaultProfile("Câbles").variantAxes).toEqual(["Longueur"]);
    expect(
      kit.composeDescription({ short: "Grande capacité.", highlights: ["Écran LED", ""], box: "Câble USB-C" }),
    ).toBe("Grande capacité.\n\nPoints forts :\n• Écran LED\n\nContenu de la boîte : Câble USB-C");
    const empty = {
      name: "",
      categoryId: null,
      brand: "",
      model: "",
      description: "",
      warranty: "",
      axes: [],
      images: [],
      specs: [],
      variants: [{ price: 0, options: {} }],
    };
    const c0 = kit.completeness(empty, { canCosts: true, blocking: 3 });
    expect(c0.percent).toBe(0);
    expect(c0.sections.photos).toBe("todo");
    const c1 = kit.completeness(
      {
        ...empty,
        name: "Nokia 105 4G",
        categoryId: "c",
        brand: "Nokia",
        images: [{ kind: "image" }],
        variants: [{ price: 15000, costPrice: 12000, initialStock: 3, options: {} }],
      },
      { canCosts: true, blocking: 0 },
    );
    expect(c1.sections.photos).toBe("done");
    expect(c1.sections.pricing).toBe("done");
    expect(c1.percent).toBe(70);
    expect(
      kit.entryHints({ ...empty, variants: [{ price: 5000, costPrice: 5000, options: {} }] }, { canCosts: true }),
    ).toEqual(expect.arrayContaining(["Prix de vente égal au coût : aucune marge.", "Aucune garantie indiquée."]));
    expect(kit.entryHints(empty, { canCosts: false }).some((h) => /Coût/.test(h))).toBe(false);
  });

  it("modèle, description structurée, caractéristiques privées, photo Internet avec source, doublons, à compléter, comptage", async () => {
    const entry = await import("@/server/domain/catalog-entry");
    const { createUser } = await import("@/server/domain/auth");
    const ownerId = await createUser(db, {
      name: "Propriétaire saisie",
      email: "proprio.saisie",
      role: "owner",
      password: "motdepasse-saisie",
      temporary: false,
    });
    const owner = { id: ownerId, name: "Propriétaire saisie" };
    const cat = (await db.one<{ id: string }>("select id from categories where archived_at is null limit 1"))!.id;

    // Photo importée depuis une adresse : contenu vérifié, rangée dans le stockage GPS, provenance conservée.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(1)]);
    const fake = (body: Uint8Array, url = "https://www.fabricant.example/p/batterie.png") =>
      (async () => ({
        ok: true,
        status: 200,
        url,
        headers: new Headers(),
        arrayBuffer: async () => body.buffer,
      })) as unknown as typeof fetch;
    const img = await entry.importMediaFromUrl(
      db,
      {
        url: "https://www.fabricant.example/p/batterie.png",
        userId: ownerId,
        isDemo: false,
        matches: "Oraimo OPB-P600Q",
      },
      fake(png),
    );
    expect(img.url).toMatch(/^\/media\/[0-9a-f-]{36}$/);
    expect(img.source).toMatchObject({
      domain: "fabricant.example",
      status: "Photo trouvée sur Internet",
      matches: "Oraimo OPB-P600Q",
    });
    await expect(
      entry.importMediaFromUrl(
        db,
        { url: "http://fabricant.example/a.png", userId: ownerId, isDemo: false },
        fake(png),
      ),
    ).rejects.toThrow(/https/);
    await expect(
      entry.importMediaFromUrl(db, { url: "https://127.0.0.1/a.png", userId: ownerId, isDemo: false }, fake(png)),
    ).rejects.toThrow(/refusée/);
    await expect(
      entry.importMediaFromUrl(
        db,
        { url: "https://fabricant.example/page.html", userId: ownerId, isDemo: false },
        fake(new TextEncoder().encode("<html>")),
      ),
    ).rejects.toThrow(/Format non pris en charge/);

    const saisie = (source: typeof img.source) => ({
      name: "Batterie externe Saisie 60 000 mAh",
      brand: "Saisie",
      model: "SAI-P600Q",
      details: { short: "Grande capacité.", highlights: ["Écran LED"] },
      categoryId: cat,
      description: "Grande capacité.\n\nPoints forts :\n• Écran LED",
      specs: [
        { label: "Capacité", value: "60 000", unit: "mAh" },
        { label: "Fournisseur", value: "Grossiste Dakar", private: true },
      ],
      condition: null,
      axes: [],
      images: [{ url: img.url, alt: "", kind: "image" as const, source }],
      variants: [{ sku: "", options: {}, price: 25000, costPrice: 18000, initialStock: 2 }],
      status: "published" as const,
      featured: false,
    });
    // Photo Internet : privée tant que GPS n'a pas confirmé le droit de la publier.
    await expect(saveProduct(db, saisie(img.source), { userId: ownerId, withCosts: true })).rejects.toThrow(
      /droit de publication à confirmer/,
    );
    const saved = await saveProduct(db, saisie({ ...img.source, rightsConfirmed: true }), {
      userId: ownerId,
      withCosts: true,
    });
    const back = (await productForEdit(db, saved.id, { withCosts: true }))!;
    expect(back.model).toBe("SAI-P600Q");
    expect(back.details).toEqual({ short: "Grande capacité.", highlights: ["Écran LED"] });
    expect(back.images[0].source).toMatchObject({ domain: "fabricant.example" });
    // Site public : caractéristique privée masquée, unité accolée.
    const pub = (await publishedProducts(db)).find((p) => p.id === saved.id)!;
    expect(pub.specs).toEqual([{ label: "Capacité", value: "60 000 mAh" }]);

    // Produit peut-être en double : signalé, jamais fusionné.
    const sim = await entry.similarProducts(db, "Batterie Saisie 60 000 mAh", null);
    expect(sim.map((x) => x.id)).toContain(saved.id);
    expect(await entry.similarProducts(db, "Batterie Saisie 60 000 mAh", saved.id)).toEqual([]);

    // Brouillon incomplet : listé avec ce qui manque ; le coût n'est compté que pour le propriétaire.
    const draft = await saveProduct(
      db,
      {
        name: "Écouteurs Saisie",
        brand: "",
        categoryId: cat,
        description: "",
        specs: [],
        condition: null,
        axes: [],
        images: [],
        variants: [{ sku: "", options: {}, price: 0 }],
        status: "draft",
        featured: false,
        internal: { externalKey: "test-saisie-1", needsHumanReview: true, humanChecks: ["Prix"], notes: "Note test" },
      },
      { userId: ownerId, withCosts: true },
    );
    const forOwner = await entry.listToComplete(db, { canCosts: true });
    const row = forOwner.rows.find((r) => r.id === draft.id)!;
    expect(row.flags).toEqual(
      expect.arrayContaining(["sans-photo", "sans-prix", "sans-cout", "sans-stock", "sans-garantie", "a-verifier"]),
    );
    expect(row.flags).not.toContain("pret");
    expect(forOwner.complete).toBeLessThan(forOwner.total);
    const forManager = await entry.listToComplete(db, { canCosts: false });
    expect(forManager.rows.find((r) => r.id === draft.id)!.flags).not.toContain("sans-cout");
    await entry.markChecksDone(db, draft.id, owner);
    expect(
      (await entry.listToComplete(db, { canCosts: true })).rows.find((r) => r.id === draft.id)!.flags,
    ).not.toContain("a-verifier");
    // Rien n'est publié automatiquement.
    expect((await productForEdit(db, draft.id, { withCosts: false }))!.status).toBe("draft");

    // Modification rapide (journalisée) et comptage rapide (mouvement tracé, stock unique).
    const v = back.variants[0];
    await entry.quickUpdateVariant(db, { variantId: v.id, price: 26000, lowStockThreshold: 1 }, ownerId);
    const log = await db.one<{ detail: { price: { from: number; to: number } } }>(
      "select detail from audit_log where action = 'variant.quick_update' order by created_at desc limit 1",
    );
    expect(log!.detail.price).toEqual({ from: 25000, to: 26000 });
    await expect(entry.quickUpdateVariant(db, { variantId: v.id, price: 0 }, ownerId)).rejects.toThrow(
      /garder un prix/,
    );
    await expect(entry.quickCount(db, { variantId: v.id, counted: 5, reason: " ", userId: ownerId })).rejects.toThrow(
      /motif/,
    );
    const count = await entry.quickCount(db, {
      variantId: v.id,
      counted: 5,
      reason: "Comptage rapide",
      userId: ownerId,
    });
    expect(count).toMatchObject({ before: 2, after: 5, delta: 3 });
    const mv = await db.one<{
      kind: string;
      on_hand_delta: number;
      on_hand_after: number;
      reason: string;
      user_id: string;
    }>(
      "select kind, on_hand_delta, on_hand_after, reason, user_id from stock_movements where variant_id = $1 order by created_at desc limit 1",
      [v.id],
    );
    expect(mv).toMatchObject({ kind: "inventory", on_hand_delta: 3, on_hand_after: 5, user_id: ownerId });
    expect(mv!.reason).toMatch(/2 → 5 · Comptage rapide/);

    // Saisie en grille : prix, coût et stock des brouillons en un seul enregistrement.
    const grid = await entry.listEntryGrid(db, { canCosts: true });
    const gv = grid.find((r) => r.productId === draft.id)!;
    expect(gv).toBeTruthy();
    expect(grid.every((r) => r.status === "draft")).toBe(true);
    expect(
      (await entry.listEntryGrid(db, { canCosts: false })).find((r) => r.productId === draft.id),
    ).not.toHaveProperty("cost");
    const saved2 = await entry.saveEntryGrid(db, {
      changes: [{ variantId: gv.variantId, price: 12000, cost: 8000, counted: 4 }],
      canCosts: true,
      canCount: true,
      userId: ownerId,
    });
    expect(saved2).toEqual({ prices: 1, costs: 1, stock: 1 });
    const after = await db.one<{ price: number; cost_price: number; on_hand: number }>(
      "select price, cost_price, on_hand from variants where id = $1",
      [gv.variantId],
    );
    expect(after).toEqual({ price: 12000, cost_price: 8000, on_hand: 4 });
    const gridLog = await db.one<{ detail: Record<string, unknown> }>(
      "select detail from audit_log where action = 'variant.grid_update' order by created_at desc limit 1",
    );
    expect(gridLog!.detail.price).toEqual({ from: gv.price, to: 12000 });
    expect(JSON.stringify(gridLog!.detail)).not.toContain("8000");
    // Sans le droit « coûts », le coût envoyé est ignoré ; sans droit d'inventaire, le comptage est refusé.
    await entry.saveEntryGrid(db, {
      changes: [
        { variantId: gv.variantId, cost: 1 },
        { variantId: gv.variantId, price: 12500 },
      ],
      canCosts: false,
      canCount: false,
      userId: ownerId,
    });
    expect(
      (await db.one<{ cost_price: number }>("select cost_price from variants where id = $1", [gv.variantId]))!
        .cost_price,
    ).toBe(8000);
    await expect(
      entry.saveEntryGrid(db, {
        changes: [{ variantId: gv.variantId, counted: 1 }],
        canCosts: false,
        canCount: false,
        userId: ownerId,
      }),
    ).rejects.toThrow(/comptage/);
    expect((await productForEdit(db, draft.id, { withCosts: false }))!.status).toBe("draft");

    await db.query("delete from products where id = any($1)", [[saved.id, draft.id]]);
  });
});

describe("Démonstration déjà en ligne", () => {
  it("remplace les anciennes illustrations par les photos, sans toucher aux photos modifiées", async () => {
    const db = await demoDb();
    const nova = (await db.one<{ id: string }>("select id from products where name = 'Orbis Nova 12'"))!;
    const fit = (await db.one<{ id: string }>("select id from products where name = 'Orbis Fit'"))!;
    await db.query("update product_images set url = '/demo/ancienne.svg' where product_id = $1", [nova.id]);
    await db.query("update product_images set url = '/media/photo-gps' where product_id = $1", [fit.id]);
    await refreshDemoImages(db);
    const urls = async (id: string) =>
      (
        await db.query<{ url: string }>("select url from product_images where product_id = $1 order by position", [id])
      ).map((r) => r.url);
    const novaUrls = await urls(nova.id);
    expect(novaUrls.length).toBeGreaterThan(0);
    expect(novaUrls.every((u) => u.startsWith("https://images.unsplash.com/"))).toBe(true);
    expect((await urls(fit.id)).every((u) => u === "/media/photo-gps")).toBe(true);
  });

  it("ajoute une seule fois les produits d'exemple arrivés après l'amorçage", async () => {
    const db = await demoDb();
    // Base amorcée avant l'arrivée du parfum : on le retire de la base de test.
    const old = (await db.one<{ id: string }>("select id from products where name = 'Nuance Ambre'"))!;
    await db.query("update products set name = 'Ancien parfum' where id = $1", [old.id]);
    await db.query("update variants set sku = sku || '-ANCIEN' where product_id = $1", [old.id]);
    await addLateDemoProducts(db);
    await addLateDemoProducts(db);
    const n = await db.one<{ n: number }>("select count(*)::int as n from products where name = 'Nuance Ambre'");
    expect(n!.n).toBe(1);
    const cats = await db.one<{ n: number }>("select count(*)::int as n from categories where slug = 'parfumerie'");
    expect(cats!.n).toBe(1);
    // Renommé depuis le Comptoir : reconnu par sa référence, pas recréé.
    await db.query("update products set name = 'Mon parfum' where name = 'Nuance Ambre'");
    await addLateDemoProducts(db);
    const again = await db.one<{ n: number }>("select count(*)::int as n from products where name = 'Nuance Ambre'");
    expect(again!.n).toBe(0);
  });
});
