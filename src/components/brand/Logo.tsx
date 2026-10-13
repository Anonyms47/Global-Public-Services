import Image from "next/image";
import logo from "../../../public/brand/logo-gps.png";
import mark from "../../../public/brand/logo-gps-mark.png";

/**
 * Logo officiel GPS, reproduit à l'identique (fond rendu transparent).
 * `mark` : lettres GPS et courbe seules, pour les petites hauteurs.
 */
export function Logo({
  variant = "full",
  className,
  priority,
}: {
  variant?: "full" | "mark";
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={variant === "full" ? logo : mark}
      alt="GPS — Global Public Services, le service qui rassure"
      className={className}
      priority={priority}
      sizes="(max-width: 768px) 160px, 220px"
    />
  );
}
