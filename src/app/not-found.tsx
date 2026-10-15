import Link from "next/link";
import { Header } from "@/components/site/Header";
import { defaultSettings } from "@/server/domain/settings";
import { IconArrowRight } from "@/components/ui/icons";

export const metadata = { title: "Page introuvable", robots: { index: false } };

const ways = [
  { href: "/boutique", label: "La boutique" },
  { href: "/categories", label: "Les univers" },
  { href: "/services", label: "Transfert d'argent" },
  { href: "/contact", label: "Contact" },
];

export default function NotFound() {
  return (
    <>
      <Header company={defaultSettings.company} categories={[]} />
      <main id="contenu">
        <div className="container-site grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow hero-fade text-gps-red-ink" style={{ animationDelay: "0ms" }}>
              Erreur 404
            </p>
            <h1 className="mt-3 font-display text-[60px] leading-[0.88] font-extrabold uppercase md:text-[110px]">
              <span className="hero-line block">Pas la bonne</span>
              <span className="hero-line block" style={{ animationDelay: "100ms" }}>
                adresse<span className="text-gps-red">.</span>
              </span>
            </h1>
            <p
              className="hero-fade mt-6 max-w-lg text-[17px] leading-relaxed text-ink-soft"
              style={{ animationDelay: "250ms" }}
            >
              Cette page n&apos;existe pas ou plus. L&apos;article a peut-être été retiré du catalogue : le reste du
              comptoir, lui, est toujours là.
            </p>
            <div className="hero-fade mt-8 flex flex-wrap gap-3" style={{ animationDelay: "350ms" }}>
              <Link href="/boutique" className="btn btn-primary">
                Retour à la boutique <IconArrowRight size={18} />
              </Link>
              <Link href="/" className="btn btn-outline">
                Accueil
              </Link>
            </div>
          </div>

          {/* Ticket « introuvable » */}
          <div className="hero-fade lg:col-span-5" style={{ animationDelay: "300ms" }}>
            <div className="ticket-404">
              <p className="receipt-mono text-center text-[13px] tracking-[0.2em] uppercase">
                GPS — Global Public Services
              </p>
              <p className="receipt-mono mt-1 text-center text-[12px] text-ink-mute">Ticket n° 404</p>
              <dl className="mt-5 grid gap-2.5 border-y-2 border-dashed border-line py-4">
                <div className="receipt-line">
                  <dt>Page demandée</dt>
                  <span aria-hidden="true" className="receipt-dots" />
                  <dd>introuvable</dd>
                </div>
                <div className="receipt-line">
                  <dt>Quantité</dt>
                  <span aria-hidden="true" className="receipt-dots" />
                  <dd>0</dd>
                </div>
                <div className="receipt-line">
                  <dt>À payer</dt>
                  <span aria-hidden="true" className="receipt-dots" />
                  <dd>0 FCFA</dd>
                </div>
              </dl>
              <p className="receipt-mono mt-4 text-[12px] tracking-[0.12em] text-ink-mute uppercase">
                Essayez plutôt :
              </p>
              <ul className="mt-2 grid gap-1">
                {ways.map((w) => (
                  <li key={w.href}>
                    <Link href={w.href} className="ticket-link group">
                      {w.label}
                      <IconArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="receipt-mono mt-5 text-center text-[12px] tracking-[0.2em] uppercase">
                Merci de votre visite
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
