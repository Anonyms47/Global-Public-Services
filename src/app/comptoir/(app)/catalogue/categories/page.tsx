import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { listCategories } from "@/server/domain/catalog";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { CategoryProfiles } from "@/components/admin/CategoryProfiles";
import { can } from "@/lib/permissions";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Catégories" };

export default async function CategoriesAdminPage() {
  const { db, user, allowed } = await requirePage("catalog.edit");
  if (!allowed) return <Forbidden />;
  const cats = await listCategories(db, { scope: "all" });
  return (
    <>
      <Link
        href="/comptoir/catalogue"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Catalogue
      </Link>
      <PageTitle eyebrow="Catalogue" title="Catégories">
        L&apos;ordre ci-dessous est celui de l&apos;accueil, du menu et de la boutique. Une catégorie vide
        n&apos;apparaît pas sur le site.
      </PageTitle>
      <CategoryManager
        categories={cats.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          imageUrl: c.image_url,
          visible: c.visible,
          featured: c.featured,
          archived: !!c.archived_at,
          published: c.product_count,
          total: c.total_count,
        }))}
      />
      {can(user, "settings.edit") ? (
        <CategoryProfiles
          categories={cats
            .filter((c) => !c.archived_at)
            .map((c) => ({ id: c.id, name: c.name, profile: c.profile ?? null }))}
        />
      ) : null}
    </>
  );
}
