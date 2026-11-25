import { describe, expect, it } from "vitest";
import { adaptations, optionChoices, selectOption, type SelectableVariant } from "@/lib/variant-select";

const v = (type: string, color: string, price: number, available = 5): SelectableVariant => ({
  options: { "Type de coque": type, Couleur: color },
  price,
  available,
});
const axes = ["Type de coque", "Couleur"];
const variants = [
  v("Givrée", "Gris et orange", 5000),
  v("Transparente avec anneau", "Transparent", 1500),
  v("Aspect cuir", "Marron", 2500),
  v("Aspect cuir", "Noir", 2500, 0),
  v("Porte-cartes", "Violet", 5000),
];

describe("options : disponible, adaptée ou en rupture", () => {
  it("les types restent tous proposés, sans fausse indisponibilité", () => {
    const types = optionChoices(variants, axes, { Couleur: "Gris et orange" }, "Type de coque");
    expect(types.map((t) => t.value)).toEqual(["Givrée", "Transparente avec anneau", "Aspect cuir", "Porte-cartes"]);
    expect(types.every((t) => t.state === "ok")).toBe(true);
  });
  it("les couleurs proposées sont celles du type choisi", () => {
    const colors = optionChoices(variants, axes, { "Type de coque": "Aspect cuir" }, "Couleur");
    expect(colors).toEqual([
      { value: "Marron", state: "ok" },
      { value: "Noir", state: "out" },
    ]);
  });
  it("une vraie rupture est distinguée d'une combinaison inexistante", () => {
    const only = optionChoices(variants, axes, { "Type de coque": "Givrée" }, "Couleur");
    expect(only).toEqual([{ value: "Gris et orange", state: "ok" }]);
    const out = [v("Aspect cuir", "Noir", 2500, 0), v("Givrée", "Gris", 5000, 3)];
    expect(optionChoices(out, axes, {}, "Type de coque")).toEqual([
      { value: "Aspect cuir", state: "out" },
      { value: "Givrée", state: "ok" },
    ]);
  });
  it("changer de type adapte la couleur et le dit", () => {
    const before = { "Type de coque": "Givrée", Couleur: "Gris et orange" };
    const after = selectOption(variants, axes, before, "Type de coque", "Transparente avec anneau", ["Couleur"]);
    expect(after).toEqual({ "Type de coque": "Transparente avec anneau", Couleur: "Transparent" });
    expect(adaptations(before, after, "Type de coque")).toEqual([
      { axis: "Couleur", from: "Gris et orange", to: "Transparent" },
    ]);
  });
  it("aucune adaptation annoncée quand rien ne change", () => {
    const before = { "Type de coque": "Aspect cuir", Couleur: "Noir" };
    const after = selectOption(variants, axes, before, "Couleur", "Marron", ["Couleur"]);
    expect(adaptations(before, after, "Couleur")).toEqual([]);
  });
});
