import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { DemoBanner } from "@/components/site/DemoBanner";
import { siteContext } from "@/server/context";
import { listCategories } from "@/server/domain/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { indexable } = await siteContext();
  return indexable ? {} : { robots: { index: false, follow: false } };
}

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const { db, settings, demo } = await siteContext();
  const categories = (await listCategories(db)).filter(
    (c) => c.product_count > 0,
  );
  return (
    <>
      {demo ? <DemoBanner /> : null}
      <Header categories={categories} />
      <main id="contenu">{children}</main>
      <Footer settings={settings} categories={categories} />
    </>
  );
}
