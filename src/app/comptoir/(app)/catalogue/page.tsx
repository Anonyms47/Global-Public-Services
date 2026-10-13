import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { adminProducts, listCategories } from "@/server/domain/catalog";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle, Tabs } from "@/components/admin/ui";
import { CatalogBrowser } from "@/components/admin/CatalogBrowser";
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
      status: statut === "actifs" ? undefined : statut === "tous" ? "all" : statut,
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
          can(user.role, "catalog.edit") ? (
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
        canBulk={can(user.role, "catalog.bulk")}
        canEdit={can(user.role, "catalog.edit")}
        emptyHint={q ? `Aucun produit pour « ${q} ».` : "Aucun produit dans cette vue."}
      />
    </>
  );
}
