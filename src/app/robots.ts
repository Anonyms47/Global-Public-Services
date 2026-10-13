import type { MetadataRoute } from "next";
import { siteContext, siteUrl } from "@/server/context";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { indexable } = await siteContext();
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/comptoir", "/panier"] },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
