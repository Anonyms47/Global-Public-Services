import Link from "next/link";
import type { Settings } from "@/server/domain/settings";
import { Logo } from "../brand/Logo";
import { Ribbon } from "../brand/Ribbon";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] font-semibold text-white/60">{label}</dt>
      <dd className="mt-0.5">{value || <span className="text-white/70 italic">À confirmer</span>}</dd>
    </div>
  );
}

export function Footer({ settings, categories }: { settings: Settings; categories: { slug: string; name: string }[] }) {
  const c = settings.company;
  return (
    <footer className="relative mt-24 overflow-hidden bg-gps-blue-deep text-white">
      <Ribbon tone="white" className="pointer-events-none absolute -top-20 right-0 h-32 w-[70%] opacity-25" />
      <div className="relative container-site grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-4">
          <div className="inline-block rounded-[6px] bg-white p-3">
            <Logo className="h-20 w-auto" />
          </div>
          <p className="mt-6 font-display text-4xl leading-none font-bold uppercase">
            Le service
            <br />
            qui rassure.
          </p>
        </div>
        <nav aria-label="Pied de page" className="grid grid-cols-2 gap-8 md:col-span-5">
          <div>
            <p className="eyebrow mb-3 text-white/60">Boutique</p>
            <ul className="space-y-2">
              {categories.slice(0, 8).map((cat) => (
                <li key={cat.slug}>
                  <Link className="hover:underline" href={`/categories/${cat.slug}`}>
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-3 text-white/60">GPS</p>
            <ul className="space-y-2">
              {[
                ["/services", "Transfert d'argent"],
                ["/a-propos", "À propos"],
                ["/contact", "Contact"],
                ["/faq", "Questions fréquentes"],
                ["/conditions-de-vente", "Conditions de vente"],
                ["/confidentialite", "Confidentialité"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link className="hover:underline" href={href}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <dl className="grid gap-4 text-[15px] md:col-span-3">
          <Info label="Adresse" value={[c.address, c.city].filter(Boolean).join(", ")} />
          <Info label="Horaires" value={c.hours} />
          <Info label="Téléphone" value={c.phone} />
          <Info label="WhatsApp" value={c.whatsapp ? `+${c.whatsapp.replace(/\D/g, "")}` : ""} />
        </dl>
      </div>
      <div className="border-t border-white/15">
        <p className="container-site flex flex-wrap justify-between gap-2 py-5 text-[13px] text-white/70">
          <span>
            © {new Date().getFullYear()} GPS — Global Public Services
            {c.legalName ? ` · ${c.legalName}` : ""}
            {c.legalId ? ` · ${c.legalId}` : ""}
          </span>
          <span>Commandes préparées sur WhatsApp · aucun paiement en ligne</span>
        </p>
      </div>
    </footer>
  );
}
