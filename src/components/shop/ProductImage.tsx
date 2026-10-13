import Image from "next/image";

/** Visuel produit à dimensions fixes (pas de décalage de mise en page). */
export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={`bg-paper-deep text-ink-mute flex aspect-[4/5] items-center justify-center text-sm ${className}`}
      >
        Photo à venir
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={1500}
      sizes={sizes}
      priority={priority}
      unoptimized={src.endsWith(".svg")}
      className={`h-auto w-full object-cover ${/aspect-/.test(className) ? "" : "aspect-[4/5]"} ${className}`}
    />
  );
}
