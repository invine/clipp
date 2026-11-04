import { expect, test } from "@playwright/test";

test("uncertain Clear blocks another attempt until History refresh is confirmed", async ({
  page,
}) => {
  await page.goto("/history-mutations.html");
  await page.getByRole("button", { name: "Clear all local history" }).click();
  const review = page.getByRole("alertdialog");
  await review.getByText("History scenario controls", { exact: true }).click();
  const clear = review.getByRole("button", { name: "Clear all local history" });
  await clear.click();
  await expect(page.getByText("Clearing local history…")).toBeVisible();
  await expect(clear).toBeDisabled();
  await expect(page.getByTestId("history-effects")).toHaveText('["clear"]');
  await review
    .getByRole("button", { name: "Resolve Clear: uncertain" })
    .click();

  await expect(
    review
      .getByRole("alert")
      .filter({ hasText: "Clear could not be confirmed" })
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Retry Clear" })
  ).toBeDisabled();
  await review.getByRole("button", { name: "Refresh History" }).click();
  await expect(page.getByText("Refreshing History…")).toBeVisible();
  await review
    .getByRole("button", { name: "Resolve Refresh: failure" })
    .click();
  await expect(
    review.getByRole("alert").filter({ hasText: "History refresh failed" })
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Retry Clear" })
  ).toBeDisabled();

  await review.getByRole("button", { name: "Refresh History" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Resolve Refresh: confirmed" })
    .click();
  await expect(
    page.getByText("History is unavailable or may have changed")
  ).toHaveCount(0);
  const retryClear = review.getByRole("button", {
    name: "Clear all local history",
  });
  await expect(retryClear).toBeEnabled();
  await retryClear.click();
  await page.getByRole("button", { name: "Resolve Clear: success" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("pin and delete failures keep observations authoritative and expose retry", async ({
  page,
}) => {
  await page.goto("/history-mutations.html?history");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Pin Clip" }).click();
  await page.getByRole("button", { name: "Resolve Pin: failure" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Could not confirm this Clip's pin state" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pin Clip" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Resolve Pin: success" }).click();

  await page.getByRole("button", { name: "View Clip details" }).click();
  const details = page.getByRole("dialog", { name: "Clip details" });
  await details.getByText("History scenario controls", { exact: true }).click();
  await page.getByRole("button", { name: "Delete Clip" }).click();
  await details
    .getByRole("button", { name: "Resolve Delete: failure" })
    .click();
  await expect(
    details
      .getByRole("status")
      .filter({ hasText: "Could not delete this Clip" })
  ).toBeVisible();
  await expect(details.getByText("History mutation target")).toBeVisible();
});
