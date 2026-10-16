import Link from "next/link";
import { legalIds, type Settings } from "@/server/domain/settings";
import { Logo } from "../brand/Logo";

/** Ligne de ticket : libellé, points de conduite, valeur. */
function Line({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="receipt-line">
      <dt>{label}</dt>
      <span aria-hidden="true" className="receipt-dots" />
      <dd>
        {value ? (
          href ? (
            <a href={href} className="underline-offset-2 hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : null}
      </dd>
    </div>
  );
}

const pages: [string, string][] = [
  ["/boutique", "Boutique"],
  ["/services", "Transfert d'argent"],
  ["/a-propos", "À propos"],
  ["/contact", "Contact"],
  ["/faq", "Questions fréquentes"],
];

const legal: [string, string][] = [
  ["/conditions-de-vente", "Conditions de vente"],
  ["/confidentialite", "Confidentialité"],
];

export function Footer({
  settings,
  categories,
  stores = [],
}: {
  settings: Settings;
  categories: { slug: string; name: string }[];
  stores?: { id: string; label: string; place: string; hours: string; mapsUrl: string }[];
}) {
  const c = settings.company;
  const wa = c.whatsapp.replace(/\D/g, "");
  const tel = c.phone.replace(/[^\d+]/g, "");
  return (
    <footer className="mt-24 text-ink">
      <div aria-hidden="true" className="receipt-edge" />
      <div className="bg-paper-deep">
        <div className="container-site pt-12 pb-8 md:pt-16">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <Logo className="h-16 w-auto" />
              <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-ink-soft">
                Téléphones, accessoires, chaussures, lunettes… et le transfert d&apos;argent, au même comptoir.
              </p>
              {categories.length ? (
                <p className="mt-5 max-w-md text-[14.5px] leading-7 text-ink-soft">
                  <span className="font-semibold text-ink">Les rayons : </span>
                  {categories.slice(0, 10).map((cat, i) => (
                    <span key={cat.slug}>
                      {i ? ", " : ""}
                      <Link
                        href={`/categories/${cat.slug}`}
                        className="underline decoration-ink/25 underline-offset-4 hover:decoration-gps-red"
                      >
                        {cat.name}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
            </div>

            <div className="md:col-span-4">
              <p className="receipt-title">Au comptoir</p>
              <dl className="mt-3 grid gap-2.5">
                {stores.length ? (
                  stores.map((st) => (
                    <Line key={st.id} label={st.label} value={st.place} href={st.mapsUrl || undefined} />
                  ))
                ) : (
                  <Line
                    label="Adresse"
                    value={[c.address, c.city].filter(Boolean).join(", ")}
                    href={c.mapsUrl || undefined}
                  />
                )}
                <Line label="Horaires" value={stores[0]?.hours ?? c.hours} />
                <Line label="Téléphone" value={c.phone} href={tel ? `tel:${tel}` : undefined} />
                <Line label="WhatsApp" value={wa ? `+${wa}` : ""} href={wa ? `https://wa.me/${wa}` : undefined} />
                <Line label="E-mail" value={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
              </dl>
            </div>

            <nav aria-label="Pied de page" className="md:col-span-3">
              <p className="receipt-title">Plan du site</p>
              <ul className="mt-3 grid gap-1.5 text-[15px]">
                {pages.map(([href, label]) => (
                  <li key={href}>
                    <Link className="footer-link" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <ul className="mt-5 grid gap-1.5 text-[14px] text-ink-soft">
                {legal.map(([href, label]) => (
                  <li key={href}>
                    <Link className="footer-link" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="receipt-tear mt-12 pt-6 text-center">
            <p className="receipt-mono text-[13px] tracking-[0.2em] uppercase">Merci de votre visite</p>
            <p className="mt-1 text-[13px] text-ink-mute">
              Commandes confirmées sur WhatsApp — aucun paiement en ligne.
            </p>
          </div>

          <p className="mt-8 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[12.5px] text-ink-mute">
            <span>
              © {new Date().getFullYear()} GPS — Global Public Services
              {c.legalName ? ` · ${c.legalName}` : ""}
              {legalIds(c) ? ` · ${legalIds(c)}` : ""}
            </span>
            <span>Le service qui rassure</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
