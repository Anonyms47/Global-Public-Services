import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { adminProducts, listCategories } from "@/server/domain/catalog";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle, Tabs } from "@/components/admin/ui";
import { CatalogBrowser } from "@/components/admin/CatalogBrowser";
import { TrashActions } from "@/components/admin/CatalogHistory";
import { IconPlus, IconSearch } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Catalogue" };

export default async function CatalogPage({ searchParams }: PageProps<"/comptoir/catalogue">) {
  const { db, user, allowed } = await requirePage("catalog.view");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const statut = str("statut") || "actifs";
  const q = str("q");
  const categorie = str("categorie");
  const vue = str("vue") === "liste" ? "liste" : "grille";
  const [rows, categories] = await Promise.all([
    adminProducts(db, {
      q,
      category: categorie || undefined,
      status: statut === "actifs" ? undefined : statut === "tous" ? "all" : statut === "corbeille" ? "trash" : statut,
    }),
    listCategories(db),
  ]);
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({
      statut,
      ...(q ? { q } : {}),
      ...(categorie ? { categorie } : {}),
      vue,
      ...patch,
    });
    return `/comptoir/catalogue?${p}`;
  };
  return (
    <>
      <PageTitle
        eyebrow="Produits"
        title="Catalogue"
        actions={
          can(user, "catalog.edit") ? (
            <>
              <Link href="/comptoir/catalogue/categories" className="btn btn-outline">
                Catégories
              </Link>
              <Link href="/comptoir/catalogue/promotions" className="btn btn-outline">
                Promotions
              </Link>
              <Link href="/comptoir/catalogue/nouveau" className="btn btn-blue">
                <IconPlus size={18} /> Ajouter un produit
              </Link>
            </>
          ) : null
        }
      />
      <Tabs
        current={statut}
        items={[
          {
            key: "actifs",
            label: "En cours",
            href: href({ statut: "actifs" }),
          },
          {
            key: "published",
            label: "Publiés",
            href: href({ statut: "published" }),
          },
          {
            key: "draft",
            label: "Brouillons",
            href: href({ statut: "draft" }),
          },
          {
            key: "archived",
            label: "Archivés",
            href: href({ statut: "archived" }),
          },
          { key: "tous", label: "Tous", href: href({ statut: "tous" }) },
          { key: "corbeille", label: "Corbeille", href: href({ statut: "corbeille" }) },
        ]}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="statut" value={statut} />
        <input type="hidden" name="vue" value={vue} />
        <label className="sr-only" htmlFor="cat-q">
          Rechercher
        </label>
        <input
          id="cat-q"
          name="q"
          defaultValue={q}
          placeholder="Nom, marque, référence…"
          className="field max-w-sm flex-1"
        />
        <label className="sr-only" htmlFor="cat-c">
          Catégorie
        </label>
        <select id="cat-c" name="categorie" defaultValue={categorie} className="field w-auto">
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn btn-ink">
          <IconSearch size={18} /> Filtrer
        </button>
      </form>
      {statut === "corbeille" ? (
        rows.length === 0 ? (
          <p className="text-ink-mute">La corbeille est vide.</p>
        ) : (
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[6px] border border-line bg-card p-4"
              >
                <div>
                  <Link href={`/comptoir/catalogue/${r.id}`} className="font-bold hover:underline">
                    {r.name}
                  </Link>
                  <p className="text-[13px] text-ink-mute">
                    {[r.brand, r.category_name].filter(Boolean).join(" · ")}
                    {r.deleted_at
                      ? ` · mis à la corbeille le ${new Date(r.deleted_at).toLocaleDateString("fr-FR")}`
                      : ""}
                  </p>
                </div>
                {can(user, "catalog.edit") ? (
                  <TrashActions id={r.id} canPurge={can(user, "catalog.bulk")} hasSales={r.has_sales} />
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <CatalogBrowser
          rows={rows.map((r) => ({
            ...r,
            updated_at: new Date(r.updated_at).toISOString(),
          }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          view={vue}
          viewHref={{
            grille: href({ vue: "grille" }),
            liste: href({ vue: "liste" }),
          }}
          canBulk={can(user, "catalog.bulk")}
          canEdit={can(user, "catalog.edit")}
          emptyHint={q ? `Aucun produit pour « ${q} ».` : "Aucun produit dans cette vue."}
        />
      )}
    </>
  );
}
