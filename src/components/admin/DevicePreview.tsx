"use client";

import { useEffect, useRef, useState } from "react";

const DEVICES = {
  mobile: { label: "Téléphone", width: 390, height: 780 },
  desktop: { label: "Ordinateur", width: 1280, height: 800 },
} as const;

/** Aperçu de la page publique dans un cadre à la largeur réelle d'un téléphone ou d'un ordinateur. */
export function DevicePreview({ src }: { src: string }) {
  const [device, setDevice] = useState<keyof typeof DEVICES>("mobile");
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(1000);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = DEVICES[device];
  // Réduction pour tenir dans la place disponible, sans changer la largeur simulée.
  const scale = Math.min(1, avail / d.width);
  return (
    <div>
      <div role="group" aria-label="Appareil" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={device === k}
            className={`btn btn-sm ${device === k ? "btn-ink" : "btn-outline"}`}
            onClick={() => setDevice(k)}
          >
            {DEVICES[k].label} · {DEVICES[k].width} px
          </button>
        ))}
        <a href={src} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
          Ouvrir en plein écran
        </a>
      </div>
      <div ref={box} className="w-full">
        <div
          className="mx-auto overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-white shadow-lg"
          style={{ width: d.width * scale, height: d.height * scale }}
        >
          <iframe
            key={device}
            title={`Aperçu ${d.label.toLowerCase()}`}
            src={src}
            style={{
              width: d.width,
              height: d.height,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              border: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}
