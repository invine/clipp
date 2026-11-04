import { expect, test } from "@playwright/test";

test("appearance saves keep the applied value and require refresh after an unconfirmed write", async ({
  page,
}) => {
  await page.goto("/settings-recovery.html");
  const appearance = page.getByRole("combobox", { name: "Appearance" });

  await appearance.selectOption("dark");
  await expect(page.getByText("Saving appearance…")).toBeVisible();
  await expect(appearance).toHaveValue("system");
  await expect(page.getByTestId("settings-runtime-actions")).toContainText(
    "save:theme"
  );

  await page
    .getByRole("button", { name: "Fail next settings refresh" })
    .click();
  await page
    .getByRole("button", { name: "Resolve settings save as unconfirmed" })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Appearance could not be refreshed" })
  ).toBeVisible();
  await expect(appearance).toBeDisabled();
  await expect(appearance).toHaveValue("system");

  await page.getByRole("button", { name: "Refresh appearance" }).click();
  await expect(appearance).toBeEnabled();
  await expect(appearance).toHaveValue("system");
  await expect(page.getByTestId("settings-runtime-actions")).toContainText(
    "refresh"
  );
});

test("Clip history recovery suppresses duplicate cleanup and reconciles after success", async ({
  page,
}) => {
  await page.goto("/settings-recovery.html");
  const retry = page.getByRole("button", { name: "Retry history policy" });

  await retry.click();
  await expect(
    page.getByRole("button", { name: "Retrying history policy…" })
  ).toBeDisabled();
  await expect(page.getByTestId("settings-effects")).toContainText(
    "retry-history-cleanup"
  );

  await page
    .getByRole("button", { name: "Resolve history cleanup as failed" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "History policy recovery failed: history_cleanup_offline",
    })
  ).toBeVisible();
  await expect(retry).toBeEnabled();

  await retry.click();
  await page
    .getByRole("button", { name: "Resolve history cleanup as recovered" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry history policy" })
  ).toHaveCount(0);
});

test("Auto Sync uncertainty keeps its last confirmed value until refresh", async ({
  page,
}) => {
  await page.goto("/settings-recovery.html");
  const autoSync = page.getByRole("switch", { name: "Auto Sync" });

  await autoSync.click();
  await expect(page.getByText("Saving Auto Sync…")).toBeVisible();
  await expect(autoSync).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Resolve Auto Sync save as unconfirmed" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Auto Sync Save could not be confirmed",
    })
  ).toBeVisible();
  await expect(autoSync).toBeDisabled();
  await expect(autoSync).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Refresh Auto Sync" }).click();
  await expect(autoSync).toBeEnabled();
  await expect(autoSync).toHaveAttribute("aria-checked", "true");
});

test("a rejected Clip preference keeps the authoritative applied value", async ({
  page,
}) => {
  await page.goto("/settings-recovery.html");
  const retention = page.getByRole("combobox", {
    name: "Keep unpinned history",
  });

  await retention.selectOption("0");
  await expect(page.getByTestId("settings-runtime-actions")).toContainText(
    "save:localRetentionMs"
  );
  await expect(page.getByText("Saving Clip settings…")).toBeVisible();
  await expect(retention).toHaveValue(String(30 * 86400000));
  await page
    .getByRole("button", { name: "Resolve settings save as rejected" })
    .click();

  await expect(
    page.getByRole("alert").filter({ hasText: "retention_rejected" })
  ).toBeVisible();
  await expect(retention).toHaveValue(String(30 * 86400000));
});

test("a late save response cannot replace a newer accepted settings observation", async ({
  page,
}) => {
  await page.goto("/settings-recovery.html");
  const appearance = page.getByRole("combobox", { name: "Appearance" });

  await appearance.selectOption("dark");
  await page
    .getByRole("button", {
      name: "Refresh to authoritative light appearance",
    })
    .click();
  await expect(appearance).toHaveValue("light");
  await page
    .getByRole("button", {
      name: "Resolve settings save as stale dark applied",
    })
    .click();
  await expect(appearance).toHaveValue("light");
});
