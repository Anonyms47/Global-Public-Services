import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { siteContext } from "@/server/context";
import { listCategories } from "@/server/domain/catalog";
import { siteUrl } from "@/server/context";
import { jsonLdString, localBusinessJsonLd, webSiteJsonLd } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { indexable } = await siteContext();
  return indexable ? {} : { robots: { index: false, follow: false } };
}

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const { db, settings, stores, storeRows, indexable } = await siteContext();
  const categories = (await listCategories(db)).filter((c) => c.product_count > 0);
  return (
    <>
      {indexable ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString([
              webSiteJsonLd(settings.company.name, siteUrl()),
              localBusinessJsonLd({
                company: settings.company,
                stores: storeRows,
                url: siteUrl(),
                logo: siteUrl("/brand/logo-gps.png"),
              }),
            ]),
          }}
        />
      ) : null}
      <Header company={settings.company} categories={categories} />
      <main id="contenu">{children}</main>
      <Footer settings={settings} categories={categories} stores={stores} />
    </>
  );
}
