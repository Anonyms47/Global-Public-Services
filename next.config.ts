import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Photos produits jusqu'à 3 Mo (marge pour l'enveloppe multipart).
  experimental: { serverActions: { bodySizeLimit: "3.2mb" } },
  images: {
    // Versions optimisées des médias : renouvelées en 5 min (fichier dépublié ou mis à la corbeille).
    minimumCacheTTL: 300,
    localPatterns: [{ pathname: "/demo/**" }, { pathname: "/media/**" }, { pathname: "/brand/**" }],
    // Photos d'exemple de la démonstration (banque d'images Unsplash).
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" }],
  },
  async headers() {
    return [
      {
        // En-têtes de sécurité pour tout le site : pas d'intégration dans un cadre étranger
        // (le Comptoir peut s'afficher lui-même en aperçu), types de fichiers stricts.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
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
