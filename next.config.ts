import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Photos produits jusqu'à 3 Mo (marge pour l'enveloppe multipart).
  experimental: { serverActions: { bodySizeLimit: "3.2mb" } },
  images: {
    localPatterns: [{ pathname: "/demo/**" }, { pathname: "/media/**" }, { pathname: "/brand/**" }],
    // Photos d'exemple de la démonstration (banque d'images Unsplash).
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" }],
  },
  async headers() {
    return [
      {
        source: "/comptoir/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
