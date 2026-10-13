export interface PublishableInput {
  name: string;
  categoryId: string | null;
  description: string;
  axes: string[];
  images: unknown[];
  variants: { sku: string; price: number; options: Record<string, string> }[];
}

/** Contrôles avant publication. Retourne la liste des manques, vide si publiable. */
export function publicationIssues(input: PublishableInput) {
  const issues: string[] = [];
  if (!input.name.trim()) issues.push("Le nom du produit est obligatoire.");
  if (!input.categoryId) issues.push("Choisissez une catégorie.");
  if (input.description.trim().length < 20)
    issues.push("Rédigez une description d'au moins 20 caractères.");
  if (!input.images.length) issues.push("Ajoutez au moins une photo.");
  if (!input.variants.length)
    issues.push("Ajoutez au moins une variante avec un prix.");
  input.variants.forEach((v, i) => {
    const n = `Variante ${i + 1}`;
    if (!v.sku.trim()) issues.push(`${n} : la référence est obligatoire.`);
    if (!(v.price > 0)) issues.push(`${n} : le prix doit être supérieur à 0.`);
    for (const axis of input.axes) {
      if (!v.options[axis]?.trim()) issues.push(`${n} : précisez « ${axis} ».`);
    }
  });
  const skus = input.variants.map((v) => v.sku.trim().toUpperCase());
  if (new Set(skus).size !== skus.length)
    issues.push("Chaque variante doit avoir une référence unique.");
  const combos = input.variants.map((v) =>
    input.axes.map((a) => v.options[a]).join("|"),
  );
  if (input.axes.length && new Set(combos).size !== combos.length) {
    issues.push("Deux variantes ont exactement les mêmes options.");
  }
  return issues;
}
