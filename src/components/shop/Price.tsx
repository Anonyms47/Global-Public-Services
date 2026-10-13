import { fcfa } from "@/lib/format";

export function Price({
  price,
  basePrice,
  from,
  size = "md",
  className = "",
}: {
  price: number;
  basePrice?: number;
  from?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const discounted = basePrice != null && basePrice > price;
  const cls = {
    sm: "text-[15px]",
    md: "text-[17px]",
    lg: "text-2xl",
    xl: "text-[32px] md:text-[40px]",
  }[size];
  return (
    <p
      className={`tabular flex flex-wrap items-baseline gap-x-2 font-extrabold ${cls} ${className}`}
    >
      {from ? (
        <span className="text-ink-mute text-[0.62em] font-semibold">
          à partir de
        </span>
      ) : null}
      <span className={discounted ? "text-gps-red-ink" : undefined}>
        {fcfa(price)}
      </span>
      {discounted ? (
        <span
          className="text-ink-mute text-[0.62em] font-semibold line-through"
          aria-label={`au lieu de ${fcfa(basePrice!)}`}
        >
          {fcfa(basePrice!)}
        </span>
      ) : null}
    </p>
  );
}
