import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { stockList } from "@/server/domain/stock";
import { getSettings } from "@/server/domain/settings";
import { can } from "@/lib/permissions";
import { optionsLabel } from "@/lib/format";
import { Badge, Empty, Forbidden, PageTitle, Tabs } from "@/components/admin/ui";
import { AdjustButton, UnsellableButton } from "@/components/admin/StockForms";
import { IconSearch } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/comptoir/stock">) {
  const { db, user, allowed } = await requirePage("stock.view");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const low = sp.faible === "1";
  const settings = await getSettings(db);
  const rows = await stockList(db, {
    q,
    low,
    defaultThreshold: settings.stock.defaultLowThreshold,
  });
  const totals = rows.reduce(
    (t, r) => ({
      onHand: t.onHand + r.on_hand,
      reserved: t.reserved + r.reserved,
      available: t.available + r.available,
      unsellable: t.unsellable + r.unsellable,
    }),
    { onHand: 0, reserved: 0, available: 0, unsellable: 0 },
  );
  return (
    <>
      <PageTitle
        eyebrow="Inventaire"
        title="Stock"
        actions={
          <>
            <Link href="/comptoir/stock/mouvements" className="btn btn-outline">
              Mouvements
            </Link>
            {can(user, "stock.inventory") ? (
              <Link href="/comptoir/stock/inventaire" className="btn btn-outline">
                Inventaire
              </Link>
            ) : null}
            {can(user, "stock.restock") ? (
              <Link href="/comptoir/stock/reapprovisionner" className="btn btn-blue">
                Réapprovisionner
              </Link>
            ) : null}
          </>
        }
      >
        <strong>Physique</strong> : présent en boutique. <strong>Réservé</strong> : promis à des commandes confirmées.{" "}
        <strong>Disponible</strong> : ce qui peut encore être vendu. Le panier et WhatsApp ne réservent rien.
      </PageTitle>
      <Tabs
        current={low ? "faible" : "tout"}
        items={[
          {
            key: "tout",
            label: "Toutes les variantes",
            href: `/comptoir/stock${q ? `?q=${encodeURIComponent(q)}` : ""}`,
          },
          {
            key: "faible",
            label: "Stocks faibles",
            href: `/comptoir/stock?faible=1${q ? `&q=${encodeURIComponent(q)}` : ""}`,
          },
        ]}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {low ? <input type="hidden" name="faible" value="1" /> : null}
        <label htmlFor="stock-q" className="sr-only">
          Rechercher
        </label>
        <input
          id="stock-q"
          name="q"
          defaultValue={q}
          className="field max-w-sm flex-1"
          placeholder="Produit, marque, référence…"
        />
        <button className="btn btn-ink">
          <IconSearch size={18} /> Rechercher
        </button>
      </form>
      {rows.length === 0 ? (
        <Empty title={low ? "Aucun stock faible" : "Aucune variante"}>
          {low ? "Toutes les variantes sont au-dessus de leur seuil d'alerte." : "Aucun résultat."}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
          <table className="w-full min-w-[920px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                <th className="px-3 py-3 font-bold">Article</th>
                <th className="py-3 text-right font-bold">Physique</th>
                <th className="py-3 text-right font-bold">Réservé</th>
                <th className="py-3 text-right font-bold">Disponible</th>
                <th className="py-3 text-right font-bold">Non vendable</th>
                <th className="py-3 text-right font-bold">Seuil</th>
                <th className="px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.variant_id} className={r.low ? "bg-warn-soft/40" : ""}>
                  <td className="px-3 py-2">
                    <Link href={`/comptoir/catalogue/${r.product_id}`} className="font-semibold hover:underline">
                      {r.product_name}
                    </Link>
                    <div className="text-[13px] text-ink-mute">
                      {optionsLabel(r.options) || "Article unique"} · {r.sku}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular">{r.on_hand}</td>
                  <td className="py-2 text-right text-gps-blue tabular">{r.reserved}</td>
                  <td className="py-2 text-right">
                    <span className="font-extrabold tabular">{r.available}</span>{" "}
                    {r.available <= 0 ? (
                      <Badge tone="red">Épuisé</Badge>
                    ) : r.low ? (
                      <Badge tone="warn">Faible</Badge>
                    ) : null}
                  </td>
                  <td className="py-2 text-right tabular">
                    {r.unsellable ? <span className="font-bold text-warn">{r.unsellable}</span> : "—"}
                  </td>
                  <td className="py-2 text-right text-ink-mute tabular">{r.threshold}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/comptoir/stock/mouvements?variante=${r.variant_id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Historique
                      </Link>
                      {can(user, "stock.inventory") ? (
                        <AdjustButton
                          variantId={r.variant_id}
                          label={`${r.product_name} ${optionsLabel(r.options)}`}
                          onHand={r.on_hand}
                          reserved={r.reserved}
                        />
                      ) : null}
                      {can(user, "stock.inventory") ? (
                        <UnsellableButton
                          variantId={r.variant_id}
                          label={`${r.product_name} ${optionsLabel(r.options)}`}
                          available={r.available}
                          unsellable={r.unsellable}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-bold">
                <td className="px-3 py-2">Total ({rows.length} variantes)</td>
                <td className="py-2 text-right tabular">{totals.onHand}</td>
                <td className="py-2 text-right tabular">{totals.reserved}</td>
                <td className="py-2 text-right tabular">{totals.available}</td>
                <td className="py-2 text-right tabular">{totals.unsellable}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
