import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { listRequests, requestCounts, requestStatusLabels, type RequestStatus } from "@/server/domain/requests";
import { can } from "@/lib/permissions";
import { fcfa, formatDateTime } from "@/lib/format";
import { templateMeta } from "@/lib/templates";
import { requestMessages } from "@/lib/messages";
import { TRACKING_SQL, UNTRACKED_AVAILABLE } from "@/server/domain/stock";
import { getSettings } from "@/server/domain/settings";
import { Badge, Empty, PageTitle, Tabs } from "@/components/admin/ui";
import { RequestActions } from "@/components/admin/RequestActions";
import { WhatsAppMessages } from "@/components/admin/OrderActions";

export const metadata: Metadata = { title: "Demandes WhatsApp" };

const tabs: [RequestStatus, string][] = [
  ["new", "Nouvelles"],
  ["converted", "Converties"],
  ["dismissed", "Classées"],
];
const tones = { new: "red", converted: "green", dismissed: "neutral" } as const;

export default async function RequestsPage({ searchParams }: PageProps<"/comptoir/demandes">) {
  const { db, user } = await requirePage("orders.view");
  const sp = await searchParams;
  const status = (tabs.find(([k]) => k === sp.etat)?.[0] ?? "new") as RequestStatus;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [rows, counts, settings] = await Promise.all([
    listRequests(db, { status, q }),
    requestCounts(db),
    getSettings(db),
  ]);
  const canAct = can(user, "orders.create");
  // Stock disponible de chaque article, pour décider avant de confirmer.
  const variantIds = status === "new" ? [...new Set(rows.flatMap((r) => r.lines.map((l) => l.variantId)))] : [];
  const available = new Map(
    variantIds.length
      ? (
          await db.query<{ id: string; available: number }>(
            `select v.id, case when v.disabled or p.disabled then 0
                               when ${TRACKING_SQL} then (v.on_hand - v.reserved - v.unsellable)::int
                               else ${UNTRACKED_AVAILABLE} end as available
               from variants v join products p on p.id = v.product_id where v.id = any($1)`,
            [variantIds],
          )
        ).map((v) => [v.id, v.available])
      : [],
  );
  return (
    <>
      <PageTitle eyebrow="Exploiter" title="Demandes WhatsApp">
        Chaque panier envoyé depuis le site arrive ici avec sa référence (GPS-R-…), reprise dans le message du client.
        Une demande ne réserve rien : confirmez-la pour créer la commande et réserver les articles.
      </PageTitle>
      <Tabs
        current={status}
        items={tabs.map(([k, label]) => ({
          key: k,
          label,
          count: counts[k] ?? 0,
          href: `/comptoir/demandes?etat=${k}`,
        }))}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="etat" value={status} />
        <label htmlFor="req-q" className="sr-only">
          Rechercher une demande
        </label>
        <input
          id="req-q"
          name="q"
          defaultValue={q}
          className="field max-w-sm flex-1"
          placeholder="GPS-R-…, nom, téléphone"
        />
        <button className="btn btn-ink">Rechercher</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Aucune demande">
          {status === "new" ? "Les paniers envoyés depuis le site apparaîtront ici." : "Rien dans cette vue."}
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            // Message conseillé selon le stock réel : tout disponible, en partie, ou rien.
            const messages =
              r.status === "new" && r.customer_phone
                ? requestMessages(r, available, settings.messages, templateMeta)
                : [];
            return (
              <li key={r.id} id={r.reference} className="rounded-[6px] border border-line bg-card p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="receipt-mono text-[15px] font-bold">{r.reference}</span>
                      <Badge tone={tones[r.status]}>{requestStatusLabels[r.status]}</Badge>
                      {r.is_demo ? <Badge>Exemple</Badge> : null}
                    </p>
                    <p className="mt-1 text-[17px] font-bold">{r.customer_name}</p>
                    <p className="text-[14px] text-ink-mute">
                      {r.customer_phone || "Sans téléphone"} · {formatDateTime(r.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-extrabold tabular">{fcfa(r.subtotal)}</p>
                    <p className="text-[13px] text-ink-mute">
                      {r.reception === "pickup"
                        ? "Retrait en boutique"
                        : `Livraison${r.delivery_zone ? ` · ${r.delivery_zone}` : ""} · frais ${r.delivery_fee === null ? "à confirmer" : fcfa(r.delivery_fee)}`}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 grid gap-1 border-t border-dashed border-line pt-3 text-[14px]">
                  {r.lines.map((l) => (
                    <li key={l.variantId} className="flex justify-between gap-3">
                      <span>
                        {l.quantity} × {l.name}
                        {l.optionsLabel ? <span className="text-ink-mute"> — {l.optionsLabel}</span> : null}
                        <span className="text-ink-mute"> · {l.sku}</span>
                        {available.has(l.variantId) ? (
                          <span className="ml-2">
                            {available.get(l.variantId)! <= 0 ? (
                              <Badge tone="red">indisponible</Badge>
                            ) : available.get(l.variantId)! < l.quantity ? (
                              <Badge tone="warn">seulement {available.get(l.variantId)} dispo.</Badge>
                            ) : (
                              <Badge tone="green">
                                {available.get(l.variantId)! >= UNTRACKED_AVAILABLE
                                  ? "disponible"
                                  : `${available.get(l.variantId)} dispo.`}
                              </Badge>
                            )}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular">{fcfa(l.unitPrice * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
                {r.delivery_address ? <p className="mt-2 text-[14px]">Adresse : {r.delivery_address}</p> : null}
                {r.note ? <p className="mt-1 text-[14px] text-ink-soft">Précision : {r.note}</p> : null}
                {r.status_note ? <p className="mt-1 text-[14px] text-ink-mute">{r.status_note}</p> : null}
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  {r.order_id ? (
                    <Link href={`/comptoir/commandes/${r.order_id}`} className="btn btn-outline btn-sm">
                      Voir la commande {r.order_reference}
                    </Link>
                  ) : null}
                  {canAct ? <RequestActions id={r.id} status={r.status} /> : null}
                </div>
                {messages.length ? (
                  <div className="mt-3">
                    <WhatsAppMessages
                      phone={r.customer_phone}
                      templates={messages}
                      title={`Répondre sur WhatsApp — conseillé : ${messages[0].label.replace(/^Demande : /, "")}`}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
