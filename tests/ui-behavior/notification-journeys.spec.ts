import { expect, test } from "@playwright/test";

test("notification selection waits for Requests authority and returns to the suspended Pairing draft", async ({
  page,
}) => {
  await page.goto("/notification-journeys.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notification journey scenario" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  const input = page.getByRole("textbox", { name: "Pairing text" });
  await input.fill("retained pairing draft");

  await page
    .getByRole("button", { name: "Select Request notification" })
    .click();
  await expect(page.getByTestId("acknowledged-notifications")).toHaveText("[]");
  await expect(input).toBeVisible();

  await page.getByRole("button", { name: "Publish Requests ready" }).click();
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("acknowledged-notifications")).toHaveText(
    '["notification-1"]'
  );
  await page.getByRole("button", { name: "Back to previous task" }).click();
  await expect(input).toHaveValue("retained pairing draft");
});

test("notification availability failures stay visible until refreshed and permission results are confirmed", async ({
  page,
}) => {
  await page.goto("/notification-journeys.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notification journey scenario" })
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Clipp destinations" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Connections" }).click();
  await expect(
    page.getByRole("region", { name: "Pairing notifications" })
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Fail next availability read" })
    .click();
  await page
    .getByRole("button", { name: "Refresh notification availability" })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Notification settings could not be confirmed/ })
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Refresh notification availability" })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Notification settings could not be confirmed/ })
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open notification settings" })
    .click();
  const settings = page.getByRole("button", {
    name: "Open notification settings",
  });
  await expect(settings).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve notification settings" })
    .click();
  await expect(settings).toBeEnabled();

  await page
    .getByRole("button", { name: "Allow Pairing notifications" })
    .click();
  const permission = page.getByRole("button", {
    name: "Allow Pairing notifications",
  });
  await expect(permission).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve permission request" })
    .click();
  await expect(page.getByText("App notifications: Allowed.")).toBeVisible();
});

test("a notification for a removed request routes to Requests with a recovery notice", async ({
  page,
}) => {
  await page.goto("/notification-journeys.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notification journey scenario" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish Requests ready" }).click();
  await page
    .getByRole("button", { name: "Select removed Request notification" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("This Request is no longer available. Open Requests.")
  ).toBeVisible();
});
