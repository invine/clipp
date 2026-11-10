import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`Relays is a dedicated destination at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/relay-address.html");
    const nav = page.getByRole("navigation", { name: "Clipp destinations" });
    if (!(await nav.isVisible()))
      await page.getByRole("button", { name: "Open navigation" }).click();
    await nav.getByRole("button", { name: "Settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Managed relays" })
    ).toHaveCount(0);
    if (!(await nav.isVisible()))
      await page.getByRole("button", { name: "Open navigation" }).click();
    await nav.getByRole("button", { name: "Relays" }).click();
    await expect(
      page.getByRole("heading", { name: "Relays", exact: true })
    ).toBeVisible();
    if (width === 1440) {
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("button", { name: "Relays" })).toHaveAttribute(
        "aria-current",
        "page"
      );
    }
    await expect(
      page.getByRole("heading", { name: "Configured relays" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add relay" }).first()
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

test("a legacy relay settings handoff opens Relays", async ({ page }) => {
  await page.goto("/relay-address.html");
  if (
    !(await page
      .getByRole("navigation", { name: "Clipp destinations" })
      .isVisible())
  )
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Clipp destinations" })
    .getByRole("button", { name: "Settings" })
    .click();
  await page.getByRole("button", { name: "Open legacy relay handoff" }).click();
  await expect(
    page.getByRole("heading", { name: "Configured relays" })
  ).toBeVisible();
});
