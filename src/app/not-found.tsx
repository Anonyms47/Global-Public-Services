import Link from "next/link";
import { Header } from "@/components/site/Header";
import { Ribbon } from "@/components/brand/Ribbon";

export const metadata = { title: "Page introuvable", robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <Header categories={[]} />
      <main id="contenu" className="relative overflow-hidden">
        <Ribbon className="pointer-events-none absolute bottom-0 left-0 h-64 w-full opacity-60" width={6} />
        <div className="relative container-site py-20 md:py-32">
          <p className="eyebrow text-gps-red-ink">Erreur 404</p>
          <h1 className="mt-3 max-w-3xl font-display text-[60px] leading-[0.88] font-extrabold uppercase md:text-[110px]">
            Pas la bonne adresse.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] text-ink-soft">
            Cette page n&apos;existe pas ou plus. L&apos;article a peut-être été retiré du catalogue.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/boutique" className="btn btn-primary">
              Retour à la boutique
            </Link>
            <Link href="/" className="btn btn-outline">
              Accueil
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
