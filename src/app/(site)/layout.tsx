import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { siteContext } from "@/server/context";
import { listCategories } from "@/server/domain/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { indexable } = await siteContext();
  return indexable ? {} : { robots: { index: false, follow: false } };
}

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const { db, settings, stores } = await siteContext();
  const categories = (await listCategories(db)).filter((c) => c.product_count > 0);
  return (
    <>
      <Header company={settings.company} categories={categories} />
      <main id="contenu">{children}</main>
      <Footer settings={settings} categories={categories} stores={stores} />
    </>
  );
}
