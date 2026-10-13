import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import {
  movementLabels,
  movements,
  type MovementKind,
} from "@/server/domain/stock";
import { formatDateTime } from "@/lib/format";
import { Badge, Empty, Forbidden, PageTitle } from "@/components/admin/ui";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Mouvements de stock" };

const delta = (n: number) =>
  n === 0 ? (
    <span className="text-ink-mute">0</span>
  ) : (
    <span className={n > 0 ? "text-wa-ink" : "text-gps-red-ink"}>
      {n > 0 ? `+${n}` : n}
    </span>
  );

export default async function MovementsPage({
  searchParams,
}: PageProps<"/comptoir/stock/mouvements">) {
  const { db, allowed } = await requirePage("stock.view");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const variantId = typeof sp.variante === "string" ? sp.variante : undefined;
  const kind =
    typeof sp.type === "string" && sp.type in movementLabels
      ? sp.type
      : undefined;
  const rows = await movements(db, { variantId, kind, limit: 300 });
  return (
    <>
      <Link
        href="/comptoir/stock"
        className="text-gps-blue mb-3 inline-flex min-h-11 items-center gap-1 font-bold hover:underline"
      >
        <IconArrowLeft size={18} /> Stock
      </Link>
      <PageTitle eyebrow="Stock" title="Mouvements">
        Chaque variation du stock physique ou réservé, avec motif, auteur et
        commande liée.
      </PageTitle>
      <form className="mb-4 flex flex-wrap gap-2">
        {variantId ? (
          <input type="hidden" name="variante" value={variantId} />
        ) : null}
        <label htmlFor="mv-type" className="sr-only">
          Type
        </label>
        <select
          id="mv-type"
          name="type"
          defaultValue={kind ?? ""}
          className="field w-auto"
        >
          <option value="">Tous les types</option>
          {Object.entries(movementLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-ink">Filtrer</button>
        {variantId || kind ? (
          <Link href="/comptoir/stock/mouvements" className="btn btn-ghost">
            Tout afficher
          </Link>
        ) : null}
      </form>
      {rows.length === 0 ? (
        <Empty title="Aucun mouvement" />
      ) : (
        <div className="border-line bg-card overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[900px] text-[14px]">
            <thead>
              <tr className="border-line text-ink-mute border-b text-left text-[12px] tracking-wide uppercase">
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="py-3 font-bold">Article</th>
                <th className="py-3 font-bold">Type</th>
                <th className="py-3 text-right font-bold">Physique</th>
                <th className="py-3 text-right font-bold">Réservé</th>
                <th className="py-3 text-right font-bold">Après</th>
                <th className="px-3 py-3 font-bold">Motif · auteur</th>
              </tr>
            </thead>
            <tbody className="divide-line-soft divide-y">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="text-ink-mute px-3 py-2 whitespace-nowrap">
                    {formatDateTime(m.created_at)}
                  </td>
                  <td className="py-2">
                    <div className="font-semibold">{m.product_name}</div>
                    <div className="text-ink-mute text-[12px]">{m.sku}</div>
                  </td>
                  <td className="py-2">
                    <Badge
                      tone={
                        m.kind === "sale"
                          ? "ink"
                          : m.kind === "reservation"
                            ? "blue"
                            : m.kind === "restock" ||
                                m.kind === "return_restock"
                              ? "green"
                              : m.kind === "release"
                                ? "neutral"
                                : "warn"
                      }
                    >
                      {movementLabels[m.kind as MovementKind]}
                    </Badge>
                  </td>
                  <td className="tabular py-2 text-right font-bold">
                    {delta(m.on_hand_delta)}
                  </td>
                  <td className="tabular py-2 text-right font-bold">
                    {delta(m.reserved_delta)}
                  </td>
                  <td className="tabular text-ink-soft py-2 text-right">
                    {m.on_hand_after} / {m.reserved_after}
                  </td>
                  <td className="px-3 py-2">
                    <div>{m.reason || "—"}</div>
                    <div className="text-ink-mute text-[12px]">
                      {m.user_name ?? "—"}
                      {m.order_id ? (
                        <>
                          {" · "}
                          <Link
                            className="text-gps-blue hover:underline"
                            href={`/comptoir/commandes/${m.order_id}`}
                          >
                            {m.order_reference}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
