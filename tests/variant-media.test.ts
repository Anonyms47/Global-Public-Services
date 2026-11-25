import { describe, expect, it } from "vitest";
import { mediaForSelection, mediaScope, variantsWithoutPhoto } from "@/lib/variant-media";

const axes = ["Type de coque", "Couleur"];
const givree = { url: "/m/givree", alt: "givrée", color: "Gris et orange", options: null };
const common = { url: "/m/commune", alt: "commune", color: null, options: null };
const noirCuir = {
  url: "/m/cuir-noir",
  alt: "cuir noir",
  color: null,
  options: { "Type de coque": "Aspect cuir", Couleur: "Noir" },
};
const noirCarbone = {
  url: "/m/carbone-noir",
  alt: "carbone noir",
  color: null,
  options: { "Type de coque": "Motif carbone", Couleur: "Noir" },
};

describe("photos selon la variante", () => {
  it("aucune photo liée : toute la galerie, comme avant", () => {
    const r = mediaForSelection([common, { ...common, url: "/m/2" }], { Couleur: "Noir" }, axes);
    expect(r.scope).toBe("all");
    expect(r.items).toHaveLength(2);
  });
  it("zéro média : liste vide, pas d'image inventée", () => {
    expect(mediaForSelection([], {}, axes).items).toEqual([]);
  });
  it("coque 16 Pro Max : la variante transparente n'affiche pas la photo de la givrée", () => {
    const sel = { "Type de coque": "Transparente avec anneau", Couleur: "Transparent" };
    const r = mediaForSelection([givree], sel, axes, "Couleur");
    expect(r.scope).toBe("missing");
    expect(r.items).toEqual([]);
  });
  it("la givrée gris et orange affiche bien sa photo", () => {
    const sel = { "Type de coque": "Givrée, contour couleur", Couleur: "Gris et orange" };
    const r = mediaForSelection([givree], sel, axes, "Couleur");
    expect(r.scope).toBe("exact");
    expect(r.items).toEqual([givree]);
  });
  it("même couleur, types différents : chaque photo reste à sa variante", () => {
    const media = [noirCuir, noirCarbone];
    const cuir = mediaForSelection(media, { "Type de coque": "Aspect cuir", Couleur: "Noir" }, axes);
    expect(cuir.items).toEqual([noirCuir]);
    const carbone = mediaForSelection(media, { "Type de coque": "Motif carbone", Couleur: "Noir" }, axes);
    expect(carbone.items).toEqual([noirCarbone]);
  });
  it("photo commune : utilisée seulement quand il n'y a pas de photo exacte, et signalée comme commune", () => {
    const media = [noirCuir, common];
    const sel = { "Type de coque": "Motif carbone", Couleur: "Noir" };
    const r = mediaForSelection(media, sel, axes);
    expect(r.scope).toBe("common");
    expect(r.items).toEqual([common]);
    const exact = mediaForSelection(media, { "Type de coque": "Aspect cuir", Couleur: "Noir" }, axes);
    expect(exact.items).toEqual([noirCuir, common]);
  });
  it("sélection incomplète : on ne montre pas de photo qui contredit un choix déjà fait", () => {
    const r = mediaForSelection([noirCuir, noirCarbone], { Couleur: "Blanc" }, axes);
    expect(r.scope).toBe("partial");
    const only = mediaForSelection([noirCuir, noirCarbone], { "Type de coque": "Aspect cuir" }, axes);
    expect(only.items).toEqual([noirCuir]);
  });
  it("ancienne liaison par couleur seule toujours comprise", () => {
    expect(mediaScope({ url: "u", alt: "", color: "Rouge" }, "Couleur")).toEqual({ Couleur: "Rouge" });
    expect(mediaScope({ url: "u", alt: "", color: "Rouge" })).toBeNull();
    const rouge = { url: "/r", alt: "", color: "Rouge", options: null };
    const bleu = { url: "/b", alt: "", color: "Bleu", options: null };
    const r = mediaForSelection([rouge, bleu], { Couleur: "Bleu" }, ["Couleur"], "Couleur");
    expect(r.items).toEqual([bleu]);
  });
  it("repère les variantes sans photo représentative (alerte du Comptoir)", () => {
    const variants = [
      { options: { "Type de coque": "Givrée, contour couleur", Couleur: "Gris et orange" } },
      { options: { "Type de coque": "Transparente avec anneau", Couleur: "Transparent" } },
    ];
    const missing = variantsWithoutPhoto(variants, [givree], axes, "Couleur");
    expect(missing).toEqual([variants[1]]);
  });
});
