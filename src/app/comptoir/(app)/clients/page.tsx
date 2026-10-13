import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { searchCustomers } from "@/server/domain/customers";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Empty, Forbidden, PageTitle } from "@/components/admin/ui";
import { NewCustomerButton } from "@/components/admin/CustomerForms";
import { IconDownload, IconSearch } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Clients" };

export default async function CustomersPage({ searchParams }: PageProps<"/comptoir/clients">) {
  const { db, user, allowed } = await requirePage("customers.view");
  if (!allowed) return <Forbidden />;
  const q = typeof (await searchParams).q === "string" ? ((await searchParams).q as string) : "";
  const rows = await searchCustomers(db, q, 200);
  return (
    <>
      <PageTitle
        eyebrow="Relation"
        title="Clients"
        actions={
          <>
            {can(user.role, "customers.export") ? (
              // Téléchargement de fichier : un lien simple, pas une navigation applicative.
              <a href="/comptoir/clients/export" download className="btn btn-outline">
                <IconDownload size={18} /> Exporter (CSV)
              </a>
            ) : null}
            {can(user.role, "customers.edit") ? <NewCustomerButton /> : null}
          </>
        }
      >
        Coordonnées utiles, historique et notes professionnelles. Seules les informations nécessaires au service sont
        conservées.
      </PageTitle>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="cl-q" className="sr-only">
          Rechercher
        </label>
        <input
          id="cl-q"
          name="q"
          defaultValue={q}
          className="field max-w-sm flex-1"
          placeholder="Nom, téléphone, e-mail…"
        />
        <button className="btn btn-ink">
          <IconSearch size={18} /> Rechercher
        </button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Aucun client">
          {q ? `Aucun résultat pour « ${q} ».` : "Les clients apparaissent ici dès leur première commande."}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                <th className="px-3 py-3 font-bold">Client</th>
                <th className="py-3 font-bold">Téléphone</th>
                <th className="py-3 text-right font-bold">Commandes</th>
                <th className="px-3 py-3 text-right font-bold">Dernière</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((c) => (
                <tr key={c.id} className="relative hover:bg-paper">
                  <td className="px-3 py-2">
                    <Link
                      href={`/comptoir/clients/${c.id}`}
                      className="font-bold text-gps-blue after:absolute after:inset-0 hover:underline"
                    >
                      {c.name}
                    </Link>{" "}
                    {c.is_demo ? <Badge>Exemple</Badge> : null}
                  </td>
                  <td className="py-2">{c.phone || "—"}</td>
                  <td className="py-2 text-right tabular">{c.order_count}</td>
                  <td className="px-3 py-2 text-right text-ink-mute">
                    {c.last_order_at ? formatDate(c.last_order_at) : "—"}
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
