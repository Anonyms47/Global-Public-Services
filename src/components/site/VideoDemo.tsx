"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { IconArrowRight } from "../ui/icons";

/**
 * Démonstration produit : seule la miniature est chargée ; la vidéo ne se charge ni ne se lance
 * qu'à la demande du visiteur.
 */
export function VideoDemo({
  url,
  poster,
  name,
  slug,
}: {
  url: string;
  poster: string | null;
  name: string;
  slug: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-ink sm:aspect-video">
        {playing ? (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={`Démonstration vidéo : ${name}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 block h-full w-full text-left"
            aria-label={`Lire la démonstration vidéo : ${name}`}
          >
            {poster ? (
              <Image
                src={poster}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gps-red text-white shadow-lg transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
        <span className="font-semibold">{name}</span>
        <Link href={`/produits/${slug}`} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-gps-blue">
          Voir la fiche <IconArrowRight size={16} />
        </Link>
      </p>
    </div>
  );
}
