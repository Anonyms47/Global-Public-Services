import { describe, expect, it } from "vitest";
import { isAmbiguousOption } from "@/lib/ambiguous-options";

describe("options ambiguës", () => {
  it("repère les libellés qui ne disent pas ce que l'on achète", () => {
    for (const v of ["Version de base", "version de base", "Standard", "Autre", "« Base »", "Par défaut"])
      expect(isAmbiguousOption(v), v).toBe(true);
  });
  it("laisse passer les vraies valeurs", () => {
    for (const v of ["128 Go", "Noir", "41", "Taille unique", "Pro", "Basic 5G"])
      expect(isAmbiguousOption(v), v).toBe(false);
  });
});
