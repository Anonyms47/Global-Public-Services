import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Photos produits jusqu'à 3 Mo (marge pour l'enveloppe multipart).
  experimental: { serverActions: { bodySizeLimit: "3.2mb" } },
  images: {
    // Photos réduites par la route /media/[id]?w=… (cache de 5 min : fichier dépublié ou mis à la corbeille),
    // pas par l'optimisation de l'hébergeur, dont le quota gratuit s'épuisait (photos en erreur 402).
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [128, 256, 384],
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
