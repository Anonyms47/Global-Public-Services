import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import imageLoader from "@/lib/image-loader";
import { IMAGE_WIDTHS, resizeToWebp, snapWidth } from "@/server/image-resize";

describe("photos réduites par le site", () => {
  it("adresse des images : la médiathèque passe par ?w=, le reste reste tel quel", () => {
    expect(imageLoader({ src: "/media/0033a416-edec-4975-a690-ad1fdfc7f309", width: 640 })).toBe(
      "/media/0033a416-edec-4975-a690-ad1fdfc7f309?w=640",
    );
    expect(imageLoader({ src: "/media/abc?x=1", width: 128 })).toBe("/media/abc?x=1&w=128");
    expect(imageLoader({ src: "/_next/static/media/logo.png", width: 256 })).toBe("/_next/static/media/logo.png");
    expect(imageLoader({ src: "https://images.unsplash.com/photo-1", width: 640 })).toBe(
      "https://images.unsplash.com/photo-1",
    );
  });

  it("largeur demandée : ramenée à une largeur autorisée, invalide ignorée", () => {
    expect(snapWidth("64")).toBe(128);
    expect(snapWidth("640")).toBe(640);
    expect(snapWidth("700")).toBe(828);
    expect(snapWidth("9999")).toBe(IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);
    for (const bad of [null, undefined, "", "0", "-5", "abc", "12.5", "1e3", "00000"])
      expect(snapWidth(bad)).toBeNull();
  });

  it("réduit en WebP sans agrandir, et rend null (original servi) si le fichier est illisible", async () => {
    const png = await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#e30613" } })
      .png()
      .toBuffer();
    const small = await resizeToWebp(new Uint8Array(png), 256);
    expect(small).not.toBeNull();
    const meta = await sharp(Buffer.from(small!)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(128);
    expect(small!.byteLength).toBeLessThan(png.byteLength);

    // Jamais d'agrandissement : une photo plus petite que la largeur demandée garde sa taille.
    const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#31277f" } })
      .png()
      .toBuffer();
    const same = await resizeToWebp(new Uint8Array(tiny), 640);
    expect((await sharp(Buffer.from(same!)).metadata()).width).toBe(100);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resizeToWebp(new Uint8Array([1, 2, 3, 4]), 256)).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
