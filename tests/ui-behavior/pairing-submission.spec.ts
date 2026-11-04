import { expect, test } from "@playwright/test";

test("the mounted Pairing journey trims requests, keeps failures editable, and waits for approval", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  const effects = page.getByTestId("pairing-effects");
  const input = page.getByRole("textbox", { name: "Pairing text" });
  await input.fill("  target-one  ");
  await page.getByRole("button", { name: "Submit pairing text" }).click();

  await expect(effects).toContainText('"target-one"');
  await expect(page.getByText("Submitting pairing text…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit pairing text" })
  ).toBeDisabled();

  await input.fill("newer target");
  await page.getByRole("button", { name: "Resolve Pairing: failure" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Unable to submit pairing request" })
  ).toBeVisible();
  await expect(input).toHaveValue("newer target");
  await expect(input).toBeEnabled();

  await page.getByRole("button", { name: "Submit pairing text" }).click();
  await page.getByRole("button", { name: "Resolve Pairing: success" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Request submitted. Waiting for approval." })
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(effects).toContainText('"newer target"');
  await expect(effects).not.toContainText("admitted");
});

test("scenario reset retires an outstanding Pairing result", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("textbox", { name: "Pairing text" }).fill("old target");
  await page.getByRole("button", { name: "Submit pairing text" }).click();
  await expect(page.getByText("Submitting pairing text…")).toBeVisible();

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByText("Submitting pairing text…")).toHaveCount(0);
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await expect(page.getByTestId("pairing-effects")).toContainText("[]");
});
