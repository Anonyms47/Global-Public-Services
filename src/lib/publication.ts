export interface PublishableInput {
  name: string;
  categoryId: string | null;
  description: string;
  axes: string[];
  images: { kind?: "image" | "video" }[];
  variants: { sku: string; price: number; costPrice?: number | null; options: Record<string, string> }[];
}

/**
 * Contrôles bloquants avant publication : nom, catégorie, prix valide, photo principale.
 * Une référence vide est générée à l'enregistrement : elle ne bloque pas.
 * Retourne la liste des manques, vide si publiable.
 */
export function publicationIssues(input: PublishableInput) {
  const issues: string[] = [];
  if (!input.name.trim()) issues.push("Le nom du produit est obligatoire.");
  if (!input.categoryId) issues.push("Choisissez une catégorie.");
  const photos = input.images.filter((i) => (i.kind ?? "image") !== "video");
  if (!photos.length) issues.push("Ajoutez au moins une photo.");
  else if (input.images[0].kind === "video") issues.push("La première image (photo principale) doit être une photo.");
  if (!input.variants.length) issues.push("Ajoutez au moins une variante avec un prix.");
  const many = input.variants.length > 1;
  input.variants.forEach((v, i) => {
    const n = many ? `Variante ${i + 1} : l` : "L";
    if (!(v.price > 0)) issues.push(`${n}e prix doit être supérieur à 0.`);
    for (const axis of input.axes) {
      if (!v.options[axis]?.trim()) issues.push(`${many ? `Variante ${i + 1} : p` : "P"}récisez « ${axis} ».`);
    }
  });
  const skus = input.variants.map((v) => v.sku.trim().toUpperCase()).filter(Boolean);
  if (new Set(skus).size !== skus.length) issues.push("Chaque variante doit avoir une référence unique.");
  const combos = input.variants.map((v) => input.axes.map((a) => v.options[a]).join("|"));
  if (input.axes.length && new Set(combos).size !== combos.length) {
    issues.push("Deux variantes ont exactement les mêmes options.");
  }
  return issues;
}

/** Conseils non bloquants : guident la saisie sans empêcher d'enregistrer ni de publier. */
export function publicationHints(input: PublishableInput) {
  const hints: string[] = [];
  if (input.description.trim().length < 20) hints.push("Une description de quelques lignes aide les clients.");
  const priced = input.variants.filter((v) => v.price > 0);
  const many = input.variants.length > 1;
  input.variants.forEach((v, i) => {
    if (v.costPrice != null && v.price > 0 && v.price < v.costPrice) {
      hints.push(`${many ? `Variante ${i + 1} : p` : "P"}rix de vente inférieur au coût d'achat.`);
    }
  });
  if (priced.length > 1) {
    const prices = priced.map((v) => v.price);
    if (Math.max(...prices) > 10 * Math.min(...prices)) {
      hints.push("Écart de prix très important entre variantes : vérifiez qu'il ne manque pas un zéro.");
    }
  }
  return hints;
}
