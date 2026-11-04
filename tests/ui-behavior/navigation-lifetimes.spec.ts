import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "wide", width: 1280, height: 900 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`${viewport.name} navigation preserves a newer Pairing draft and completes suspended work`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Pair this device" }).click();
    await page.getByRole("button", { name: "Paste pairing text" }).click();
    await page
      .getByRole("textbox", { name: "Pairing text" })
      .fill("submitted target");
    await page.getByRole("button", { name: "Submit pairing text" }).click();
    await expect(page.getByText("Submitting pairing text…")).toBeVisible();

    const input = page.getByRole("textbox", { name: "Pairing text" });
    await input.fill("newer draft survives navigation");
    await page
      .locator('summary[aria-label="Open navigation scenario controls"]')
      .click();
    await page
      .getByRole("button", { name: "Attempt Settings navigation" })
      .click();
    await expect(page.getByTestId("navigation-result")).toHaveText("declined");
    await page
      .getByRole("button", { name: "Open Requests notification" })
      .click();
    await expect(
      page.getByRole("button", { name: "Back to previous task" })
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Resolve Pairing: success" })
      .click();
    await page.getByRole("button", { name: "Back to previous task" }).click();
    await expect(
      page.getByRole("dialog", { name: "Paste pairing text" })
    ).toBeVisible();
    await expect(input).toHaveValue("newer draft survives navigation");
    await expect(input).toBeFocused();
    await expect(
      page.getByText("Request submitted. Waiting for approval.")
    ).toBeVisible();
  });
}
