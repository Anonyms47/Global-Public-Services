import { describe, expect, it } from "vitest";
import { filterOptions } from "@/components/ui/SmartSelect";

const o = (label: string, hint?: string) => ({ value: label, label, hint });

describe("filtre des listes déroulantes", () => {
  const list = [o("iPhone 13", "4"), o("iPhone 13 Pro", "2"), o("Galaxy S24 Ultra"), o("Écouteurs Éclair")];
  it("ignore accents et casse, exige tous les mots", () => {
    expect(filterOptions(list, "ECLAIR").map((x) => x.label)).toEqual(["Écouteurs Éclair"]);
    expect(filterOptions(list, "13 pro").map((x) => x.label)).toEqual(["iPhone 13 Pro"]);
    expect(filterOptions(list, "iphone").length).toBe(2);
  });
  it("sans saisie : tout ; sans correspondance : rien", () => {
    expect(filterOptions(list, "  ").length).toBe(4);
    expect(filterOptions(list, "xyz")).toEqual([]);
  });
});

import { createElement as h, Fragment } from "react";
import { optionsFromChildren } from "@/components/ui/SmartSelect";

describe("lecture des <option> d'un <select>", () => {
  it("gère fragments, tableaux, groupes, libellés composés et choix désactivés", () => {
    const children = [
      h("option", { key: "v", value: "" }, "Choisir…"),
      h(Fragment, { key: "f" }, h("option", { value: "a" }, "Alpha"), null, false),
      [h("option", { key: "n", value: 3 }, "Modèle ", 3, " (", 2, ")")],
      h("optgroup", { key: "g", label: "Groupe" }, h("option", { value: "z", disabled: true }, "Zeta")),
      h("option", { key: "s" }, "Sans valeur"),
    ];
    expect(optionsFromChildren(children)).toEqual([
      { value: "", label: "Choisir…", disabled: undefined, group: undefined },
      { value: "a", label: "Alpha", disabled: undefined, group: undefined },
      { value: "3", label: "Modèle 3 (2)", disabled: undefined, group: undefined },
      { value: "z", label: "Zeta", disabled: true, group: "Groupe" },
      { value: "Sans valeur", label: "Sans valeur", disabled: undefined, group: undefined },
    ]);
  });
});
