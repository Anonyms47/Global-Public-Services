import { Logo } from "./Logo";
import { Ribbon } from "./Ribbon";

/**
 * Panneau graphique aux couleurs de GPS, affiché tant que la photo réelle
 * n'est pas fournie (aucune fausse photo de la boutique).
 */
export function BrandPanel({ caption, className = "" }: { caption: string; className?: string }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-[6px] bg-gps-blue p-6 text-center ${className}`}
    >
      <Ribbon
        tone="white"
        className="pointer-events-none absolute -bottom-4 left-0 h-2/3 w-full opacity-30"
        width={6}
      />
      <div className="relative rounded-[6px] bg-white px-5 py-4">
        <Logo className="h-20 w-auto md:h-24" />
      </div>
      <p className="relative mt-5 font-display text-3xl font-bold text-white uppercase md:text-4xl">
        Le service qui rassure
      </p>
      <p className="relative mt-2 text-[13px] text-white/75">{caption}</p>
    </div>
  );
}
