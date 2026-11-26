"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** Texte secondaire à droite (nombre d'articles, référence…). */
  hint?: string;
}

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Filtre sans accent ni casse : tous les mots saisis doivent se retrouver dans le libellé. */
export function filterOptions(options: SelectOption[], query: string) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => {
    const text = plain(`${o.label} ${o.hint ?? ""}`);
    return words.every((w) => text.includes(w));
  });
}

/**
 * Liste déroulante : un `<select>` natif quand il y a peu de choix (clavier et mobile au mieux),
 * une liste avec recherche (combobox ARIA) quand il y en a beaucoup.
 * `emptyLabel` ajoute un premier choix vide (« Tous », « Choisir… »).
 */
export function SmartSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  className = "field",
  searchFrom = 8,
  "aria-invalid": ariaInvalid,
  disabled,
  name,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  emptyLabel?: string;
  className?: string;
  /** Nombre de choix à partir duquel la recherche est proposée. */
  searchFrom?: number;
  "aria-invalid"?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  if (options.length < searchFrom) {
    return (
      <select
        id={id}
        name={name}
        className={className}
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(e) => onChange(e.target.value)}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.hint ? ` (${o.hint})` : ""}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Combobox
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      options={options}
      emptyLabel={emptyLabel}
      className={className}
      disabled={disabled}
      invalid={ariaInvalid}
    />
  );
}

function Combobox({
  id,
  name,
  value,
  onChange,
  options,
  emptyLabel,
  className,
  disabled,
  invalid,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  emptyLabel?: string;
  className: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const all = useMemo<SelectOption[]>(
    () => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options),
    [options, emptyLabel],
  );
  const shown = useMemo(() => (query ? filterOptions(options, query) : all), [all, options, query]);
  const current = all.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (o: SelectOption) => {
    onChange(o.value);
    close();
  };

  // Ferme au clic ou au toucher ailleurs.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Garde le choix actif visible.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    const i = all.findIndex((o) => o.value === value);
    setActive(Math.max(0, i));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      const n = shown.length;
      if (n) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActive(Math.max(0, shown.length - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={root} className="select-combo">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${uid}-o-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        disabled={disabled}
        className={`${className} select-combo-input ${!value && !open ? "is-empty" : ""}`}
        placeholder={open ? "Rechercher…" : undefined}
        value={open ? query : (current?.label ?? "")}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Fermer la liste" : "Ouvrir la liste"}
        className="select-combo-toggle"
        disabled={disabled}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => (open ? close() : (document.getElementById(id)?.focus(), openList()))}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? "rotate-180" : ""}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul ref={listRef} id={listId} role="listbox" className="select-combo-list">
          {shown.length ? (
            shown.map((o, i) => (
              <li
                key={o.value || "__vide"}
                id={`${uid}-o-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active || undefined}
                className="select-combo-option"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                onMouseMove={() => setActive(i)}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint ? <span className="select-combo-hint tabular">{o.hint}</span> : null}
                {o.value === value ? (
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-gps-blue"
                  >
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                ) : null}
              </li>
            ))
          ) : (
            <li role="presentation" className="select-combo-none">
              Aucun résultat pour « {query} »
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
