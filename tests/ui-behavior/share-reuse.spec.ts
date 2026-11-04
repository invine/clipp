import { expect, test } from "@playwright/test";

test("a replaced runtime retires pending Clip reuse before its result arrives", async ({
  page,
}) => {
  await page.goto("/clip-actions.html");
  const copy = page.getByRole("button", { name: "Copy Clip" });
  await copy.click();
  await expect(copy).toBeDisabled();
  await expect(page.getByText("Copying Clip…")).toBeVisible();
  await expect(page.getByTestId("requested-effects")).toContainText(
    "first:reuse:clip-1"
  );

  await page.getByRole("button", { name: "Replace runtime adapter" }).click();
  await expect(copy).toBeEnabled();
  await page.getByRole("button", { name: "Resolve reuse: complete" }).click();

  await expect(page.getByText("Copied to clipboard.")).toHaveCount(0);
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(page.getByTestId("requested-effects")).toContainText(
    "replacement:reuse:clip-1"
  );
});

test("a copied-without-Clip result stays distinct and an unconfirmed reuse needs acknowledgement", async ({
  page,
}) => {
  await page.goto("/clip-actions.html");
  const copy = page.getByRole("button", { name: "Copy Clip" });
  await copy.click();
  await expect(copy).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve reuse: copied without Clip" })
    .click();
  await expect(page.locator(".history-action-error")).toContainText(
    "Copied to clipboard, but Clipp could not save or share a new Clip."
  );
  await expect(page.getByRole("article", { name: "saved phrase" })).toHaveCount(
    1
  );
  await expect(copy).toBeEnabled();

  await copy.click();
  await page
    .getByRole("button", { name: "Resolve reuse: unconfirmed" })
    .click();
  await expect(page.locator(".history-action-error")).toContainText(
    "The Copy result is unconfirmed."
  );
  await expect(copy).toBeDisabled();
  await expect(page.getByTestId("requested-effects")).toContainText(
    '"first:reuse:clip-1","first:reuse:clip-1"'
  );
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(copy).toBeEnabled();
});

test("Share Now exposes a retryable read failure and sends no history Clip", async ({
  page,
}) => {
  await page.goto("/clip-actions.html");
  const clips = page.getByRole("article", { name: "saved phrase" });
  await page
    .getByRole("button", { name: "Share current clipboard now" })
    .click();
  await expect(page.getByText("Sharing current clipboard…")).toBeVisible();
  await page
    .getByRole("button", { name: "Resolve Share Now: read failure" })
    .click();
  await expect(page.locator(".history-action-error")).toContainText(
    "Could not read the current clipboard. Keep Clipp open and try again."
  );
  await page.getByRole("button", { name: "Retry" }).click();
  await page
    .getByRole("button", { name: "Resolve Share Now: success" })
    .click();
  await expect(page.locator(".history-action-error")).toContainText(
    "Shared current clipboard."
  );
  await expect(page.getByTestId("requested-effects")).toContainText(
    '"first:share-current","first:share-current"'
  );
  await expect(clips).toHaveCount(1);
});
