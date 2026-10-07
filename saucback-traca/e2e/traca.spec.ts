import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Scénario du cahier des charges : commande box 4 produits → 4 photos →
// validation automatique → note écrite dans Shopify, note client conservée.
test("box 4 produits : 4 photos, validation auto, note Shopify", async ({ page, request }) => {
  await page.goto("/");
  await page.fill("#pin", "000000");
  await page.click("text=Entrer");
  await expect(page.locator(".banner.bad")).toContainText("Code incorrect");
  await page.fill("#pin", "123456");
  await page.click("text=Entrer");

  await expect(page.locator(".order")).toHaveCount(1);
  await expect(page.locator("h2")).toContainText("Commande #2570");
  await expect(page.locator(".expect li")).toContainText("Box Ibérique");

  const png = readFileSync("public/icon-192.png");
  const files = [0, 1, 2, 3].map((i) => ({ name: `etiquette-${i}.png`, mimeType: "image/png", buffer: png }));
  await page.setInputFiles("#gal-file", files);

  await expect(page.locator("tbody tr")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator(".expect li.ok")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator(".banner.ok").first()).toContainText("Tous les produits");
  // Validation automatique après 2 s
  await expect(page.getByText("enregistrée dans Shopify")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".undo")).toContainText("#2570 validée");

  const st = await (await request.get("http://127.0.0.1:4010/__state")).json();
  expect(st.tags).toEqual(["Traça OK"]);
  expect(st.note).toMatch(/^Merci de livrer après 18h\n\n--- Traça SaucBack ---\nPréparé le /);
  expect(st.note).toContain("- Chorizo IGP 200 g x1 : lot L24151, DDM 12/03/2027");
  expect(st.note.trim().endsWith("--- fin traça ---")).toBe(true);

  // Registre : recherche par lot
  await page.click("role=tab[name='Registre']");
  await page.fill("#q", "l2415");
  await page.click("text=Rechercher");
  await expect(page.locator(".reg li").first()).toContainText("#2570");
  await expect(page.locator("mark").first()).toBeVisible();

  // Export CSV
  const csv = await page.evaluate(async () => { const r = await fetch("/api/export"); return { type: r.headers.get("content-type") ?? "", text: await r.text() }; });
  expect(csv.type).toContain("text/csv");
  expect(csv.text).toContain("2570;Site;Chorizo IGP 200 g;1;L24151;12/03/2027;DDM;complet");

  // Suppression depuis le registre : bloc et tag retirés, la commande redevient à préparer
  page.once("dialog", (d) => d.accept());
  await page.click("text=Supprimer");
  await expect(page.locator(".reg li")).toHaveCount(0, { timeout: 15_000 });
  await page.click("role=tab[name='Préparer']");
  await expect(page.locator(".order")).toHaveCount(1, { timeout: 15_000 });
  const st2 = await (await request.get("http://127.0.0.1:4010/__state")).json();
  expect(st2.tags).toEqual([]);
  expect(st2.note).toBe("Merci de livrer après 18h");
});
