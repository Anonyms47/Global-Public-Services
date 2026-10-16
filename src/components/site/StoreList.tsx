import { IconClock, IconPhone, IconPin } from "../ui/icons";

export interface PublicStore {
  id: string;
  label: string;
  place: string;
  address: string;
  landmark: string;
  hours: string;
  closed: string | null;
  mapsUrl: string;
  phone: string;
  services: string;
}

/** Points de vente GPS, chacun avec son propre itinéraire (liens Maps jamais fusionnés). */
export function StoreList({ stores, dark = false }: { stores: PublicStore[]; dark?: boolean }) {
  if (!stores.length) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Nos points de vente">
      {stores.map((st) => {
        const tel = st.phone.replace(/[^\d+]/g, "");
        return (
          <li
            key={st.id}
            className={`grid content-start gap-2 rounded-[14px] border p-4 ${dark ? "border-white/20 bg-white/5" : "border-line bg-card"}`}
          >
            <p className="font-display text-xl font-bold uppercase">{st.label}</p>
            <p className="flex gap-2 text-[15px]">
              <IconPin size={18} className="mt-0.5 shrink-0" />
              <span>
                {[st.address, st.place].filter(Boolean).join(" · ")}
                {st.landmark ? <span className="block opacity-80">Repère : {st.landmark}</span> : null}
              </span>
            </p>
            <p className="flex gap-2 text-[15px]">
              <IconClock size={18} className="mt-0.5 shrink-0" />
              <span>{st.closed ? `Fermé aujourd'hui${st.closed ? ` (${st.closed})` : ""}` : st.hours}</span>
            </p>
            {st.services ? <p className="text-[14px] opacity-80">{st.services}</p> : null}
            <div className="mt-1 flex flex-wrap gap-2">
              {st.mapsUrl ? (
                <a
                  href={st.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn btn-sm ${dark ? "btn-light" : "btn-outline"}`}
                >
                  <IconPin size={16} /> Itinéraire
                </a>
              ) : null}
              {tel ? (
                <a href={`tel:${tel}`} className={`btn btn-sm ${dark ? "btn-light" : "btn-outline"}`}>
                  <IconPhone size={16} /> Appeler
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
