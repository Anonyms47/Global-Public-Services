"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** Texte secondaire à droite (nombre d'articles, référence…). */
  hint?: string;
  disabled?: boolean;
  /** Titre de groupe (optgroup) sous lequel l'option est rangée. */
  group?: string;
}

/** Vrai sur ordinateur (souris) : après l'hydratation seulement, le serveur rend la liste native. */
function useFinePointer() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(hover: hover) and (pointer: fine)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    () => false,
  );
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
  const fine = useFinePointer();
  if (fine)
    return (
      <DesktopSelect
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        options={options}
        emptyLabel={emptyLabel}
        className={className}
        searchFrom={searchFrom}
        disabled={disabled}
        invalid={ariaInvalid}
      />
    );
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

// ——— Ordinateur : liste personnalisée ———

const CHEVRON = (
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
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function DesktopSelect({
  id,
  name,
  value,
  onChange,
  options,
  emptyLabel,
  className,
  searchFrom,
  disabled,
  invalid,
  ariaLabel,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  emptyLabel?: string;
  className: string;
  ariaLabel?: string;
  searchFrom: number;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; max: number } | null>(
    null,
  );

  const searchable = options.length >= searchFrom;
  const all = useMemo<SelectOption[]>(
    () => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options),
    [options, emptyLabel],
  );
  const shown = useMemo(() => (query ? filterOptions(options, query) : all), [all, options, query]);
  const current = all.find((o) => o.value === value);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    const max = Math.max(160, Math.min(352, up ? above : below));
    const width = Math.max(r.width, 200);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width, max } : { left, top: r.bottom + 6, width, max });
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setQuery("");
    if (refocus) trigger.current?.focus();
  }, []);
  const choose = (o: SelectOption) => {
    if (o.disabled) return;
    onChange(o.value);
    close(true);
  };

  const openList = () => {
    if (disabled) return;
    place();
    setOpen(true);
    setActive(
      Math.max(
        0,
        all.findIndex((o) => o.value === value),
      ),
    );
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    if (searchable) searchRef.current?.focus();
    else popup.current?.focus();
  }, [open, place, searchable]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !popup.current?.contains(t)) close();
    };
    const move = () => place();
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const step = (dir: 1 | -1) => {
    const n = shown.length;
    if (!n) return;
    let i = active;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      step(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : Math.max(0, shown.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") close();
    else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Frappe rapide : saute au premier choix qui commence par les lettres tapées.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + e.key.toLowerCase(), at: now };
      const i = shown.findIndex((o) => !o.disabled && plain(o.label).startsWith(plain(typed.current.text)));
      if (i >= 0) setActive(i);
    }
  };

  // Groupes : un titre à chaque changement de groupe.
  const rows: ReactNode[] = [];
  let lastGroup: string | undefined;
  shown.forEach((o, i) => {
    if (!query && o.group && o.group !== lastGroup)
      rows.push(
        <li key={`g-${o.group}`} role="presentation" className="select-pop-group">
          {o.group}
        </li>,
      );
    lastGroup = o.group;
    rows.push(
      <li
        key={o.value || "__vide"}
        id={`${uid}-o-${i}`}
        role="option"
        aria-selected={o.value === value}
        aria-disabled={o.disabled || undefined}
        data-active={i === active || undefined}
        style={{ "--i": i } as React.CSSProperties}
        className="select-pop-option"
        onClick={() => choose(o)}
        onMouseMove={() => !o.disabled && active !== i && setActive(i)}
      >
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {o.hint ? <span className="select-combo-hint tabular">{o.hint}</span> : null}
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
          className="select-pop-check"
        >
          <path d="m5 12 5 5 9-10" />
        </svg>
      </li>,
    );
  });

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`${className} select-trigger ${!value ? "is-empty" : ""}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? emptyLabel ?? ""}</span>
        <span className={`select-trigger-chevron ${open ? "is-open" : ""}`}>{CHEVRON}</span>
      </button>
      {open && pos ? (
        <div
          ref={popup}
          tabIndex={-1}
          className="select-pop"
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width: pos.width,
            maxHeight: pos.max,
          }}
          onKeyDown={onListKey}
        >
          {searchable ? (
            <div className="select-pop-search">
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                role="searchbox"
                aria-label="Rechercher dans la liste"
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${uid}-o-${active}` : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder="Rechercher…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
              />
              <span className="select-combo-hint tabular" aria-live="polite">
                {shown.length}/{all.length}
              </span>
            </div>
          ) : null}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={current?.label}
            aria-activedescendant={!searchable && shown[active] ? `${uid}-o-${active}` : undefined}
            className="select-pop-list"
          >
            {shown.length ? (
              rows
            ) : (
              <li role="presentation" className="select-combo-none">
                Aucun résultat pour « {query} »
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </>
  );
}

// ——— Remplaçant direct de <select> : mêmes enfants <option>, même onChange ———

function nodeText(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  if (isValidElement(n)) return nodeText((n.props as { children?: ReactNode }).children);
  return "";
}

/** Lit les <option> et <optgroup> d'un <select> pour en faire des choix de liste. */
export function optionsFromChildren(children: ReactNode, group?: string): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{
      children?: ReactNode;
      value?: string | number;
      disabled?: boolean;
      label?: string;
    }>;
    if (el.type === Fragment) out.push(...optionsFromChildren(el.props.children, group));
    else if (el.type === "optgroup") out.push(...optionsFromChildren(el.props.children, el.props.label));
    else if (el.type === "option") {
      const label = nodeText(el.props.children);
      out.push({
        value: el.props.value != null ? String(el.props.value) : label,
        label,
        disabled: el.props.disabled,
        group,
      });
    }
  });
  return out;
}

type ChangeLike = { target: { value: string }; currentTarget: { value: string } };

/**
 * Remplace `<select>` : sur ordinateur une liste personnalisée (recherche à partir de 8 choix, clavier, groupes),
 * sur écran tactile la liste native (ou la liste avec recherche inline quand il y a beaucoup de choix).
 */
export function Select({
  id,
  value,
  defaultValue,
  onChange,
  children,
  className = "field",
  disabled,
  name,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  searchFrom = 8,
}: {
  id?: string;
  value?: string | number;
  /** Sans `value` : liste non contrôlée (formulaires à envoi direct). */
  defaultValue?: string | number;
  onChange?: (e: ChangeLike) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  searchFrom?: number;
}) {
  const auto = useId();
  const fieldId = id ?? `${auto}-sel`;
  const [inner, setInner] = useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const fine = useFinePointer();
  const all = optionsFromChildren(children);
  // Un premier choix de valeur vide (« Choisir… », « Tous ») devient le choix vide de la liste.
  const empty = all.find((o) => o.value === "");
  const options = all.filter((o) => o.value !== "");
  const emit = (v: string) => {
    setInner(v);
    onChange?.({ target: { value: v }, currentTarget: { value: v } });
  };
  if (!fine)
    return (
      <select
        id={fieldId}
        name={name}
        className={className}
        value={current}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        onChange={(e) => emit(e.target.value)}
      >
        {children}
      </select>
    );
  return (
    <DesktopSelect
      id={fieldId}
      name={name}
      value={current}
      onChange={emit}
      options={options}
      emptyLabel={empty?.label}
      className={className}
      searchFrom={searchFrom}
      disabled={disabled}
      invalid={ariaInvalid}
      ariaLabel={ariaLabel}
    />
  );
}
