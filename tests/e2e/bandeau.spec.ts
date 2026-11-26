import { expect, test } from "@playwright/test";

const x = (page: import("@playwright/test").Page) =>
  page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".univers-band-track")!).transform).m41);

test("bandeau des univers : défile sur ordinateur, immobile si le mouvement réduit est demandé", async ({
  browser,
}) => {
  const anim = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await anim.newPage();
  await page.goto("/");
  const a = await x(page);
  await expect.poll(() => x(page)).not.toBe(a);
  // Une seule liste exposée aux lecteurs d'écran (la copie est masquée).
  await expect(page.locator(".univers-band ul[aria-hidden='true']")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Univers principaux" })).toHaveCount(1);
  await anim.close();

  const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p2 = await still.newPage();
  await p2.goto("/");
  const b = await x(p2);
  await p2.waitForTimeout(800);
  expect(await x(p2)).toBe(b);
  await still.close();
});
