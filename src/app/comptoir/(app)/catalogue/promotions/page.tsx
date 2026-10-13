import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import {
  adminProducts,
  isPromoRunning,
  listPromotions,
  promoLabel,
} from "@/server/domain/catalog";
import { formatDateTime } from "@/lib/format";
import { Badge, Forbidden, PageTitle } from "@/components/admin/ui";
import {
  PromotionForm,
  StopPromotionButton,
} from "@/components/admin/PromotionForm";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const { db, allowed } = await requirePage("catalog.edit");
  if (!allowed) return <Forbidden />;
  const [promos, products] = await Promise.all([
    listPromotions(db),
    adminProducts(db, {}),
  ]);
  const now = new Date();
  return (
    <>
      <Link
        href="/comptoir/catalogue"
        className="text-gps-blue mb-3 inline-flex min-h-11 items-center gap-1 font-bold hover:underline"
      >
        <IconArrowLeft size={18} /> Catalogue
      </Link>
      <PageTitle eyebrow="Catalogue" title="Promotions">
        Programmées avec une date de début et de fin : le prix revient
        automatiquement à la normale à la fin.
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="border-line bg-card overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[600px] text-[14px]">
            <thead>
              <tr className="border-line text-ink-mute border-b text-left text-[12px] tracking-wide uppercase">
                <th className="px-3 py-3 font-bold">Promotion</th>
                <th className="py-3 font-bold">Remise</th>
                <th className="py-3 font-bold">Période</th>
                <th className="py-3 font-bold">État</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-line-soft divide-y">
              {promos.map((p) => {
                const running = isPromoRunning(p, now);
                const state = !p.active
                  ? "Arrêtée"
                  : running
                    ? "En cours"
                    : new Date(p.starts_at) > now
                      ? "Programmée"
                      : "Terminée";
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-ink-mute text-[13px]">
                        {p.product_name}
                      </p>
                    </td>
                    <td className="py-2 font-bold">{promoLabel(p)}</td>
                    <td className="py-2 text-[13px]">
                      {formatDateTime(p.starts_at)}
                      <br />→ {formatDateTime(p.ends_at)}
                    </td>
                    <td className="py-2">
                      <Badge
                        tone={
                          state === "En cours"
                            ? "green"
                            : state === "Programmée"
                              ? "blue"
                              : "neutral"
                        }
                      >
                        {state}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.active && new Date(p.ends_at) > now ? (
                        <StopPromotionButton id={p.id} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {promos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-ink-mute p-4">
                    Aucune promotion.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PromotionForm
          products={products
            .filter((p) => p.status !== "archived")
            .map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </>
  );
}
