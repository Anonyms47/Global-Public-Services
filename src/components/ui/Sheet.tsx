"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/**
 * Panneau modal accessible basé sur <dialog> : piège le focus, se ferme avec
 * Échap, au clic sur le fond, et rend le focus à l'élément d'origine.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = "right",
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "right" | "left" | "bottom" | "center";
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const openedAt = useRef(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      openedAt.current = Date.now();
      // Navigateurs anciens (ou intégrés à une application) sans <dialog> modal :
      // ouverture simple, positionnée en plein écran par la classe sheet-fallback.
      try {
        d.showModal();
      } catch {
        d.setAttribute("open", "");
        d.classList.add("sheet-fallback");
      }
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
      d.classList.remove("sheet-fallback");
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const placement =
    side === "right"
      ? "ml-auto mr-0 h-dvh max-h-dvh w-[min(100vw,440px)]"
      : side === "left"
        ? "mr-auto ml-0 h-dvh max-h-dvh w-[min(100vw,380px)]"
        : side === "bottom"
          ? "mt-auto mb-0 w-full max-w-full max-h-[90dvh] rounded-t-xl"
          : "m-auto max-h-[90dvh] rounded-lg";

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
        (opener.current as HTMLElement | null)?.focus?.();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Un appui fantôme juste après l'ouverture (fréquent sur mobile) ne doit pas refermer le panneau.
        if (e.target === ref.current && Date.now() - openedAt.current > 400) onClose();
      }}
      className={`${placement} open:animate-rise flex-col overflow-hidden bg-paper p-0 text-ink open:flex`}
      style={side === "center" ? { width: `min(100vw - 32px, ${wide ? 960 : 560}px)` } : undefined}
    >
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-line px-4 md:px-6">
        <h2 className="font-display text-2xl font-bold uppercase">{title}</h2>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm -mr-2 px-2" aria-label="Fermer">
          <IconClose size={22} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">{children}</div>
      {footer ? <div className="border-t border-line bg-card px-4 py-3 md:px-6">{footer}</div> : null}
    </dialog>
  );
}
