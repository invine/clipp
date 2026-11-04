import { expect, test } from "@playwright/test";

test("alias drafts survive observation changes and supported task suspension", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Edit Local Device Alias" }).click();
  const alias = page.getByRole("textbox", { name: "Local Device Alias" });
  await alias.fill("  Current draft  ");
  await page.getByRole("button", { name: "Save Local Device Alias" }).click();
  await expect(page.getByText("Saving Local Device Alias…")).toBeVisible();
  await alias.fill("newer draft");
  await page
    .getByRole("button", { name: "Resolve alias save: failure" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Alias Save was not confirmed"
  );
  await expect(alias).toHaveValue("newer draft");
  await page.getByRole("button", { name: "Save Local Device Alias" }).click();
  await expect(page.getByText("Saving Local Device Alias…")).toBeVisible();
  await alias.fill("newest draft");
  await page
    .getByRole("button", { name: "Resolve alias save: success" })
    .click();
  await expect(alias).toHaveValue("newest draft");

  await page
    .getByRole("button", { name: "Publish updated device observation" })
    .click();
  await expect(alias).toHaveValue("newest draft");
  await page
    .getByRole("button", { name: "Open Requests notification" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to device editor" }).click();
  await expect(alias).toHaveValue("newest draft");

  const effects = page.getByTestId("device-effects");
  const observedBeforeRemoval = await effects.textContent();
  await page.getByRole("button", { name: "Remove device observation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("device was removed");
  await expect(effects).toHaveText(observedBeforeRemoval || "[]");
});

test("Device Name uses the local identity target and copying succeeds through the host effect", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByRole("button", { name: "Rename this device" }).click();
  const name = page.getByRole("textbox", { name: "Device Name" });
  await name.fill("My Local Device");
  await page.getByRole("button", { name: "Save Device Name" }).click();
  await expect(page.getByTestId("device-effects")).toContainText("local-one");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page
    .getByRole("button", { name: "Resolve local name save: success" })
    .click();

  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Allow clipboard writes" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Edit Local Device Alias" }).click();
  await page.getByRole("button", { name: "Copy Device Name" }).click();
  await expect(page.getByRole("status")).toContainText("Device Name copied.");
  await expect(page.getByTestId("device-effects")).toContainText("copy");
});

test("copy failure is visible and revocation cancellation requests no effect", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Edit Local Device Alias" }).click();
  await page.getByRole("button", { name: "Copy Peer ID" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Could not copy peer id" })
    .waitFor();
  await page.getByRole("button", { name: "Cancel alias edit" }).click();

  const revoke = page.getByRole("button", { name: "Revoke device" });
  await revoke.click();
  await expect(
    page.getByRole("button", { name: "Confirm scripted revocation" })
  ).toBeVisible();
  await expect(revoke).toBeDisabled();
  await expect(page.getByTestId("device-effects")).not.toContainText("unpair");
  await expect(page.getByTestId("confirmation-count")).toHaveText("1");
  await page
    .getByRole("button", { name: "Cancel scripted confirmation" })
    .click();
  await expect(page.getByTestId("device-effects")).not.toContainText("unpair");
  await expect(revoke).toBeEnabled();
});

test("revocation failure retains the observed device and old owner feedback is retired", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Revoke device" }).click();
  await page
    .getByRole("button", { name: "Confirm scripted revocation" })
    .click();
  await expect(page.getByText("Revoking this device…")).toBeVisible();
  await expect(page.getByTestId("device-effects")).toContainText("unpair");
  await page
    .getByRole("button", { name: "Resolve revocation: failure" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Device revocation could not be confirmed"
  );
  await expect(
    page.getByRole("button", { name: "Revoke device" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await page
    .getByRole("button", { name: "Confirm scripted revocation" })
    .click();
  await expect(page.getByText("Revoking this device…")).toBeVisible();
  await page.getByRole("button", { name: "Replace runtime owner" }).click();
  await page
    .getByRole("button", { name: "Resolve revocation: failure" })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revoke device" })
  ).toBeVisible();
});
