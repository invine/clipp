import { expect, test } from "@playwright/test";

test("cancelling confirmation has no runtime effect; accepted enable stays pending until observed", async ({
  page,
}) => {
  let usedNativeDialog = false;
  page.on("dialog", (dialog) => {
    usedNativeDialog = true;
    void dialog.dismiss();
  });
  await page.goto("/background-continuity.html");
  const effects = page.getByTestId("continuity-effects");

  await page.getByRole("button", { name: "Enable background mode" }).click();
  await expect(effects).toContainText("confirm:");
  await expect(page.getByText("Updating background controls…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable background mode" })
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve confirmation: cancel" })
    .click();
  await expect(effects).not.toContainText("set-background:true");
  await expect(page.getByText("Updating background controls…")).toHaveCount(0);
  await expect(page.getByText("Background mode is disabled.")).toBeVisible();

  await page.getByRole("button", { name: "Enable background mode" }).click();
  await page
    .getByRole("button", { name: "Resolve confirmation: accept" })
    .click();
  await expect(page.getByText("Updating background controls…")).toBeVisible();
  await page
    .getByRole("button", { name: "Enable background mode" })
    .click({ force: true });
  await expect(effects).toContainText("set-background:true");
  const logged = JSON.parse((await effects.textContent()) ?? "[]") as string[];
  expect(
    logged.filter((effect) => effect === "set-background:true")
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Resolve action: success" }).click();
  await expect(page.getByText("Background mode is waiting.")).toBeVisible();
  expect(usedNativeDialog).toBe(false);

  await page.getByRole("button", { name: "Stop background mode" }).click();
  await expect(effects).toContainText("set-background:false");
  await page.getByRole("button", { name: "Resolve action: success" }).click();
  await expect(page.getByText("Background mode is disabled.")).toBeVisible();
});

test("a rejected refresh reports failure and a later confirmed refresh recovers", async ({
  page,
}) => {
  await page.goto("/background-continuity.html");
  const effects = page.getByTestId("continuity-effects");
  await page.getByRole("button", { name: "Refresh background state" }).click();
  await page.getByRole("button", { name: "Resolve action: failure" }).click();
  await expect(
    page.getByText(
      "The action could not be confirmed. Open background help and recovery."
    )
  ).toBeVisible();
  await expect(page.getByText("Background mode is disabled.")).toBeVisible();

  await page.getByRole("button", { name: "Refresh background state" }).click();
  await expect(effects).toContainText("refresh-background");
  await page.getByRole("button", { name: "Resolve action: success" }).click();
  await expect(
    page.getByText(
      "The action could not be confirmed. Open background help and recovery."
    )
  ).toHaveCount(0);
});

test("replacing the runtime retires a pending action and its late result", async ({
  page,
}) => {
  await page.goto("/background-continuity.html");
  await page.getByRole("button", { name: "Refresh background state" }).click();
  await expect(page.getByText("Updating background controls…")).toBeVisible();
  await page.getByRole("button", { name: "Replace scripted runtime" }).click();
  await page.getByRole("button", { name: "Resolve retired action" }).click();
  await expect(page.getByText("Updating background controls…")).toHaveCount(0);
  await expect(page.getByText("Background mode is disabled.")).toBeVisible();
});

test("notification settings and diagnostic export use scripted effects with visible failure", async ({
  page,
}) => {
  await page.goto("/background-continuity.html");
  const effects = page.getByTestId("continuity-effects").first();
  await page.getByRole("button", { name: "Notification settings" }).click();
  await expect(effects).toContainText("notification-settings");
  await page.getByRole("button", { name: "Resolve action: success" }).click();
  await expect(page.getByText("Updating background controls…")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Background help and recovery" })
    .click();
  await page
    .getByRole("button", { name: "Export privacy-safe diagnostics" })
    .click();
  await expect(page.getByTestId("continuity-effects").last()).toContainText(
    "export-diagnostics"
  );
  await page
    .getByRole("dialog", { name: "Background help and recovery" })
    .getByRole("button", { name: "Resolve action: failure" })
    .click();
  await expect(
    page
      .getByText(
        "The action could not be confirmed. Open background help and recovery."
      )
      .last()
  ).toBeVisible();
});
