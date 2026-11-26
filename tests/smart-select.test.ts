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
