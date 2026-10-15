import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { listOrders, type OrderView } from "@/server/domain/orders";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { Empty, Forbidden, Money, PageTitle, Tabs } from "@/components/admin/ui";
import { ChannelLabel, FulfillmentBadge, PaymentBadge, StatusBadge } from "@/components/admin/OrderBadges";
import { IconPlus, IconSearch } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Commandes" };

const views: { key: OrderView; label: string }[] = [
  { key: "a-preparer", label: "À préparer" },
  { key: "pretes", label: "Prêtes" },
  { key: "en-livraison", label: "En livraison" },
  { key: "solde", label: "Solde à encaisser" },
  { key: "remises", label: "Terminées" },
  { key: "annulees", label: "Annulées" },
  { key: "toutes", label: "Toutes" },
];
const extraLabels: Partial<Record<OrderView, string>> = {
  retraits: "Retraits prêts",
  livraisons: "Livraisons en cours",
};

export default async function OrdersPage({ searchParams }: PageProps<"/comptoir/commandes">) {
  const { db, user, allowed } = await requirePage("orders.view");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const view = (typeof sp.vue === "string" ? sp.vue : "a-preparer") as OrderView;
  const q = typeof sp.q === "string" ? sp.q : "";
  const channel = typeof sp.canal === "string" ? sp.canal : "";
  const [orders, ...counts] = await Promise.all([
    listOrders(db, { view, q, channel: channel || undefined }),
    ...views.map((v) => listOrders(db, { view: v.key, limit: 1000 }).then((r) => r.length)),
  ]);
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(channel ? { canal: channel } : {}),
      vue: view,
      ...patch,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/comptoir/commandes?${p}`;
  };

  return (
    <>
      <PageTitle
        eyebrow="Suivi"
        title="Commandes"
        actions={
          can(user, "orders.create") ? (
            <Link href="/comptoir/commandes/nouvelle" className="btn btn-blue">
              <IconPlus size={18} /> Enregistrer une commande
            </Link>
          ) : null
        }
      >
        Commandes confirmées après échange WhatsApp ou téléphone, et ventes du comptoir.
      </PageTitle>
      {extraLabels[view] ? (
        <p className="mb-3 inline-flex items-center gap-2 rounded-[6px] bg-gps-blue-soft px-3 py-2 text-[14px] font-semibold text-gps-blue">
          Vue : {extraLabels[view]} ·{" "}
          <Link className="underline" href="/comptoir/commandes">
            toutes les étapes
          </Link>
        </p>
      ) : null}
      <Tabs
        current={view}
        items={views.map((v, i) => ({
          key: v.key,
          label: v.label,
          count: v.key === "toutes" ? undefined : counts[i],
          href: qs({ vue: v.key }),
        }))}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="vue" value={view} />
        <label htmlFor="q-commandes" className="sr-only">
          Rechercher
        </label>
        <input
          id="q-commandes"
          name="q"
          defaultValue={q}
          placeholder="Référence, client, téléphone…"
          className="field max-w-sm flex-1"
        />
        <label htmlFor="canal" className="sr-only">
          Canal
        </label>
        <select id="canal" name="canal" defaultValue={channel} className="field w-auto">
          <option value="">Tous les canaux</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="boutique">Boutique</option>
          <option value="telephone">Téléphone</option>
          <option value="autre">Autre</option>
        </select>
        <button className="btn btn-ink" type="submit">
          <IconSearch size={18} /> Filtrer
        </button>
      </form>

      {orders.length === 0 ? (
        <Empty
          title="Aucune commande ici"
          action={
            q || channel ? (
              <Link className="btn btn-outline btn-sm" href={`/comptoir/commandes?vue=${view}`}>
                Effacer la recherche
              </Link>
            ) : null
          }
        >
          {q ? `Aucun résultat pour « ${q} » dans cette vue.` : "Rien à traiter dans cette étape pour le moment."}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
          <table className="w-full min-w-[820px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                <th className="px-4 py-3 font-bold">Commande</th>
                <th className="py-3 font-bold">Client</th>
                <th className="py-3 font-bold">Étape</th>
                <th className="py-3 font-bold">Paiement</th>
                <th className="py-3 text-right font-bold">Total</th>
                <th className="px-4 py-3 text-right font-bold">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {orders.map((o) => (
                <tr key={o.id} className="relative hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link
                      href={`/comptoir/commandes/${o.id}`}
                      className="font-bold text-gps-blue after:absolute after:inset-0 hover:underline"
                    >
                      {o.reference}
                    </Link>
                    <div className="text-[13px] text-ink-mute">{formatDateTime(o.created_at)}</div>
                  </td>
                  <td className="py-3">
                    <div className="font-semibold">{o.customer_name || "Client de passage"}</div>
                    <ChannelLabel c={o.channel} r={o.reception} />
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={o.status} />
                      <FulfillmentBadge f={o.fulfillment} reception={o.reception} status={o.status} />
                    </div>
                  </td>
                  <td className="py-3">
                    <PaymentBadge p={o.payment} />
                  </td>
                  <td className="py-3 text-right font-semibold">
                    <Money value={o.due} />
                    {o.feeUnknown ? <div className="text-[12px] text-warn">+ frais à confirmer</div> : null}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-bold ${o.balance > 0 ? "text-gps-red-ink" : o.balance < 0 ? "text-warn" : "text-ink-mute"}`}
                  >
                    <Money value={o.balance} />
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
