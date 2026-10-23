/**
 * Conseil affiché avant de commander, selon le type de produit : ce que le
 * client doit vérifier pour éviter un échange. Rien n'est affirmé sur le produit.
 */
export function orderHint(categorySlug: string | null, axes: string[], name: string): string | null {
  switch (categorySlug) {
    case "protections-coques":
      return /apple watch/i.test(name)
        ? "Vérifiez la taille de votre montre : elle est gravée au dos du boîtier (ex. 44 mm)."
        : "Vérifiez le modèle exact de votre appareil (ex. « Pro » ou « Pro Max ») : une coque ne convient qu'à son modèle.";
    case "montres":
      return axes.includes("Taille")
        ? "Choisissez la taille de votre montre : elle est gravée au dos du boîtier (ex. 44 mm)."
        : null;
    case "chargeurs":
    case "cables":
      return "Vérifiez le port de votre appareil (USB-C ou Lightning) avant de commander.";
    case "telephones":
      return "GPS vous confirme sur WhatsApp l'état, la garantie et les accessoires inclus avant toute préparation.";
    default:
      return null;
  }
}
