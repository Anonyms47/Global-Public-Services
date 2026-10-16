import type { Settings } from "@/server/domain/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { IconPhone, IconPin, IconWhatsApp } from "../ui/icons";

/** Accès WhatsApp, appel et itinéraire : actifs seulement quand l'information est connue. */
export function ContactActions({
  company,
  text,
  dark,
}: {
  company: Settings["company"];
  text: string;
  dark?: boolean;
}) {
  const wa = whatsappLink(company.whatsapp, text);
  const tel = company.phone.replace(/[^\d+]/g, "");
  // Itinéraire général seulement s'il est renseigné ; sinon chaque point de vente a le sien.
  const maps = company.mapsUrl;
  // Coordonnée absente : le bouton est simplement masqué.
  const off = (..._args: unknown[]) => null;
  return (
    <div className="flex flex-wrap gap-3">
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-wa">
          <IconWhatsApp /> WhatsApp
        </a>
      ) : (
        off("WhatsApp", IconWhatsApp, "numéro à confirmer")
      )}
      {tel ? (
        <a href={`tel:${tel}`} className={`btn ${dark ? "btn-light" : "btn-outline"}`}>
          <IconPhone size={18} /> Appeler
        </a>
      ) : (
        off("Appeler", IconPhone, "numéro à confirmer")
      )}
      {maps ? (
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn ${dark ? "btn-light" : "btn-outline"}`}
        >
          <IconPin size={18} /> Itinéraire
        </a>
      ) : (
        off("Itinéraire", IconPin, "adresse à confirmer")
      )}
    </div>
  );
}
