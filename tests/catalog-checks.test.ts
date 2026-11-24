import { describe, expect, it } from "vitest";
import { catalogAlerts } from "@/server/domain/catalog-checks";
import { demoDb } from "./helpers";

async function add(
  db: Awaited<ReturnType<typeof demoDb>>,
  id: string,
  name: string,
  brand: string,
  price: number,
  desc = "",
) {
  await db.query(
    "insert into products (id, slug, name, brand, description, status) values ($1,$1,$2,$3,$4,'published')",
    [id, name, brand, desc],
  );
  await db.query("insert into variants (id, product_id, sku, price) values ($1,$1,$1,$2)", [id, price]);
}

describe("À vérifier", () => {
  it("signale prix, marque, doublon et fiches vagues sans rien modifier ni viser les marques de luxe", async () => {
    const db = await demoDb();
    await add(db, "p1", "iPhone", "Chaussures", 11111111);
    await add(db, "p2", "Galaxy A06", "Samsung", 70000, "Smartphone Samsung Galaxy A06 avec grand écran.");
    await add(db, "p3", "Samsung Galaxie A06", "Samsung", 72000, "Smartphone Samsung Galaxy A06 avec grand écran.");
    await add(db, "p4", "Montre Hublot Classic", "Hublot", 25000, "Montre à bracelet métal, cadran noir et dorures.");
    const alerts = await catalogAlerts(db);
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain("prix");
    expect(alerts.find((a) => a.kind === "prix")!.products[0].id).toBe("p1");
    expect(alerts.some((a) => a.kind === "marque" && a.title.includes("Chaussures"))).toBe(true);
    expect(alerts.some((a) => a.kind === "doublon" && a.products.length === 2)).toBe(true);
    expect(
      alerts.some((a) => a.title.includes("Hublot") || a.products.some((p) => p.id === "p4" && a.kind === "marque")),
    ).toBe(false);
    // Lecture seule : le prix suspect est toujours là.
    expect((await db.one<{ price: number }>("select price from variants where id='p1'"))!.price).toBe(11111111);
  });
});
