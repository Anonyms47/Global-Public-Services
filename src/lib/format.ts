const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 215000 → « 215 000 FCFA » */
export function fcfa(amount: number) {
  return `${nf.format(amount)} FCFA`;
}

export function formatNumber(n: number) {
  return nf.format(n);
}

const df = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dOnly = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function formatDateTime(d: Date | string) {
  return df.format(new Date(d));
}

export function formatDate(d: Date | string) {
  return dOnly.format(new Date(d));
}

/** Libellé lisible des options d'une variante : « Capacité : 256 Go · Couleur : Graphite ». */
export function optionsLabel(options: Record<string, string>, axes?: string[]) {
  const keys = axes?.length ? axes.filter((a) => a in options) : Object.keys(options);
  return keys.map((k) => `${k} : ${options[k]}`).join(" · ");
}

/** Normalise un numéro pour comparer les doublons : chiffres seuls, sans préfixe 00. */
export function phoneKey(phone: string) {
  return phone.replace(/\D/g, "").replace(/^00/, "");
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
