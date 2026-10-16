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
} from "@/server/domain/catalog";
import { checkCart } from "@/server/domain/cart";
import { assertCan, claimOwner, hasRealOwner, login, userFromToken } from "@/server/domain/auth";
import { can } from "@/lib/permissions";
import { createCustomer, phoneMatches } from "@/server/domain/customers";
import { report, periodFromKey } from "@/server/domain/reports";
import { createRequest, convertRequest, dismissRequest, getRequest } from "@/server/domain/requests";
import { storeMedia, listMedia, trashMedia, restoreMedia, purgeMedia, sniffMime } from "@/server/domain/media";
import { previewImport, applyImport, importTemplate } from "@/server/domain/import";
import { parseCsv } from "@/lib/csv";
import { listQueue, updateQueueItem, addManualTask } from "@/server/domain/queue";
import { launchChecks, setTargetMode, currentMode, summarize } from "@/server/domain/launch";
import { healthChecks } from "@/server/domain/health";
import { computeMetrics, metricDetail, previousPeriod, change } from "@/server/domain/metrics";
import { addLateDemoProducts, purgeDemo, refreshDemoImages, DEMO_PASSWORD } from "@/server/demo/seed";
import { getSettings, saveSettingsSection } from "@/server/domain/settings";
import { buildOrderMessage } from "@/lib/whatsapp";
import { renderTemplate, defaultTemplates } from "@/lib/templates";

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
    expect(msg).toContain("Frais de livraison : À confirmer avec GPS");
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
    await expect(
      storeMedia(db, { bytes: new Uint8Array(3 * 1024 * 1024 + 1), name: "big", userId: null, isDemo: true }),
    ).rejects.toThrow(/trop lourd/);
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
    expect(r).toEqual({ products: 1, variants: 2 });
    const v = await variantBySku(db, "IMP-OK-1");
    expect(v.on_hand).toBe(4);
    const prod = await db.one<{ status: string; axes: string[] }>(
      "select p.status, p.axes from products p join variants v on v.product_id = p.id where v.sku = $1",
      ["IMP-OK-1"],
    );
    expect(prod).toEqual({ status: "draft", axes: ["Couleur"] });
    await expect(applyImport(db, ok, { userId: owner.id, withCosts: true, isDemo: true })).rejects.toThrow(/erreur/);
  });

  it("recherche par référence et par catégorie", async () => {
    const all = await publishedProducts(db);
    expect(filterProducts(all, { q: "pas-urb-no" }).map((p) => p.name)).toEqual(["Pas Urbain"]);
    expect(filterProducts(all, { q: "ecouteurs" }).map((p) => p.name)).toContain("Sonna Buds Air");
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

    // Limitation : 5 échecs pour un identifiant bloquent même le bon mot de passe.
    for (let i = 0; i < 5; i++) {
      await expect(auth.login(db, "fatou.test", "faux", { allowDemo: false, ip: "10.0.0.3" })).rejects.toThrow(
        /incorrect/,
      );
    }
    await expect(auth.login(db, "fatou.test", "nouveau-mdp-1", { allowDemo: false, ip: "10.0.0.4" })).rejects.toThrow(
      /Trop de tentatives/,
    );
    // … et 20 échecs depuis une même adresse IP bloquent tous les identifiants.
    for (let i = 0; i < 20; i++) {
      await expect(auth.login(db, `inconnu${i}`, "faux", { allowDemo: false, ip: "10.9.9.9" })).rejects.toThrow(
        /incorrect/,
      );
    }
    await expect(auth.login(db, "personne", "faux", { allowDemo: false, ip: "10.9.9.9" })).rejects.toThrow(
      /Trop de tentatives/,
    );
    // La fenêtre passée, la connexion redevient possible et remet le compteur à zéro.
    await db.query("update login_attempts set created_at = now() - interval '16 minutes'");
    const third = await auth.login(db, "fatou.test", "nouveau-mdp-1", { allowDemo: false, ip: "10.0.0.4" });
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

  it("signale un numéro déjà connu avant de créer un doublon", async () => {
    expect((await phoneMatches(db, "+000 00 00 00 01")).length).toBeGreaterThan(0);
    await expect(createCustomer(db, { name: "Doublon", phone: "00 00 00 01" })).rejects.toThrow(/correspond/);
    await expect(
      createCustomer(db, { name: "Doublon", phone: "00 00 00 01" }, { allowDuplicate: true }),
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

  it("tableau de bord : formules centralisées et détail de chaque chiffre", async () => {
    const period = periodFromKey("jour");
    const before = await computeMetrics(db, period);
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
    const after = await computeMetrics(db, period);
    expect(after.commandes - before.commandes).toBe(1);
    expect(after.ca - before.ca).toBe(v.price);
    expect(after.encaissements - before.encaissements).toBe(10000);
    expect(after.reste - before.reste).toBe(v.price - 10000);
    expect(after.panier).toBe(Math.round(after.ca / after.commandes));
    const rows = await metricDetail(db, "reste", period);
    expect(rows.find((r) => r.reference === o.reference)?.amount).toBe(v.price - 10000);
    // Le détail retombe exactement sur le chiffre affiché.
    expect((await metricDetail(db, "ca", period)).reduce((s, r) => s + (r.amount ?? 0), 0)).toBe(after.ca);
    expect((await metricDetail(db, "encaissements", period)).reduce((s, r) => s + (r.amount ?? 0), 0)).toBe(
      after.encaissements,
    );
    const prev = previousPeriod(period);
    expect(prev.to.getTime()).toBe(period.from.getTime());
    expect(change(150, 100)).toBe(50);
    expect(change(5, 0)).toBeNull();
    await cancelOrder(db, manager, o.id, "test");
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
      horaires: "",
      reste: "",
    });
    expect(txt).toBe("Bonjour Awa, votre commande GPS-1 est prête. Vous pouvez venir la retirer en boutique.");
    const conf = renderTemplate(defaultTemplates.confirmation, {
      prenom: "Awa",
      reference: "GPS-1",
      articles: "• A × 1",
      total: "10 FCFA",
      livraison: "",
      reception: "retrait en boutique",
      reste: "Reste à régler : 5 FCFA.",
    });
    expect(conf.split("\n")).toContain("Reste à régler : 5 FCFA.");
    expect(conf).not.toMatch(/\{|\n\n/);
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
    await purgeDemo(db);
    const n = await db.one<{ n: number }>("select count(*)::int as n from products where is_demo");
    expect(n!.n).toBe(0);
    expect((await db.one<{ n: number }>("select count(*)::int as n from users where is_demo"))!.n).toBe(0);
    const after = await getSettings(db);
    expect(after.company.whatsapp).toBe("22500000000");
    expect(after.company.hours).toBe("Lun–Sam");
    expect(after.storefront.heroProductId).toBeNull();
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
