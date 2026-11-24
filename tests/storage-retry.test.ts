import { describe, expect, it } from "vitest";
import { supabaseStore } from "@/server/storage";

const png = () =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { "content-length": "4", "content-type": "image/png" },
  });

function store(handler: (n: number) => Response | Promise<Response>) {
  let calls = 0;
  const s = supabaseStore({
    url: "https://exemple.supabase.co",
    key: "cle-test",
    bucket: "gps-media",
    retryDelayMs: 1,
    fetch: (async () => handler(++calls)) as unknown as typeof fetch,
  });
  return { s, calls: () => calls };
}

describe("lecture des photos : nouveaux essais si le stockage est indisponible", () => {
  it("un 503 passager est rattrapé au deuxième essai", async () => {
    const t = store((n) => (n === 1 ? new Response("Service Unavailable", { status: 503 }) : png()));
    const r = await t.s.read("a.png");
    expect(r?.status).toBe(200);
    expect(t.calls()).toBe(2);
  });

  it("une erreur réseau passagère est rattrapée", async () => {
    const t = store((n) => {
      if (n === 1) throw new Error("reseau coupé");
      return png();
    });
    expect((await t.s.read("a.png"))?.status).toBe(200);
  });

  it("un stockage durablement indisponible échoue après trois essais, sans jamais montrer la clé", async () => {
    const t = store(() => new Response("Service Unavailable", { status: 503 }));
    const err = await t.s.read("a.png").catch((e: Error) => e.message);
    expect(err).toMatch(/lecture impossible \(503\)/);
    expect(String(err)).not.toContain("cle-test");
    expect(t.calls()).toBe(3);
  });

  it("une photo absente (404) n'est pas relancée", async () => {
    const t = store(() => new Response("not found", { status: 404 }));
    expect(await t.s.read("absent.png")).toBeNull();
    expect(t.calls()).toBe(1);
  });
});
