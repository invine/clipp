import { expect, test, type Page } from "@playwright/test";

async function openDeviceActions(page: Page) {
  await page.getByRole("button", { name: "Remote Device actions" }).click();
}

test("device pairing actions are available in the page header", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("button", { name: "Pair this device" })
  ).toBeVisible();
  await expect(
    header.getByRole("button", { name: "Show my QR" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local Device" })
  ).toBeVisible();
  await expect(page.getByText("This installation")).toHaveCount(0);
});

test("a trusted device menu exposes its full peer ID and copy action", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByRole("button", { name: "Remote Device actions" }).click();
  await page.getByRole("button", { name: "View peer ID" }).click();
  const dialog = page.getByRole("dialog", { name: "Peer ID" });
  await expect(dialog.getByText("peer-one", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Copy peer ID" })
  ).toBeVisible();
});

test("the half-screen desktop layout keeps device navigation visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/device-management.html");
  await expect(
    page.getByRole("navigation", { name: "Clipp destinations" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trusted devices" })
  ).toBeVisible();
});

test("connection status reflects known direct and unknown observations", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page
    .getByRole("button", { name: "Publish connected device observation" })
    .click();
  await expect(
    page.getByText("Connected · direct", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish unknown connection observation" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Trusted devices" })
      .getByText("Connection status unknown", { exact: true })
  ).toBeVisible();
});

test("native back closes an open device menu before leaving Devices", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await openDeviceActions(page);
  await expect(
    page.getByRole("button", { name: "Remote Device actions" })
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "View peer ID" })
  ).toBeVisible();
  await page.getByRole("button", { name: "View peer ID" }).focus();
  await page
    .getByRole("button", { name: "Send native back" })
    .dispatchEvent("click");
  await expect(page.getByRole("button", { name: "View peer ID" })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: "Remote Device actions" })
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Devices", exact: true })
  ).toBeVisible();
});

test("peer ID closes if the trusted device is removed", async ({ page }) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await openDeviceActions(page);
  await page.getByRole("button", { name: "View peer ID" }).click();
  await page
    .getByRole("button", { name: "Remove device observation" })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Peer ID" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("no longer available");
});

test("confirmation keeps device details readable on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/device-management.html");
  await openDeviceActions(page);
  await page.getByRole("button", { name: "Revoke device" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Confirming device revocation" })
  ).toBeVisible();
  const name = await page
    .getByText("Remote Device", { exact: true })
    .boundingBox();
  expect(name).not.toBeNull();
  expect(name!.width).toBeGreaterThan(40);
  expect(name!.x + name!.width).toBeLessThanOrEqual(320);
});

test("local peer ID can be copied without a success notification and failures stay visible", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page
    .getByRole("button", { name: "Show and copy this device's peer ID" })
    .click();
  let dialog = page.getByRole("dialog", { name: "Peer ID" });
  await expect(dialog.getByText("local-one", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Copy peer ID" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not copy peer id"
  );
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Allow clipboard writes" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page
    .getByRole("button", { name: "Show and copy this device's peer ID" })
    .click();
  dialog = page.getByRole("dialog", { name: "Peer ID" });
  await dialog.getByRole("button", { name: "Copy peer ID" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Peer ID copied.")).toHaveCount(0);
  await expect(page.getByTestId("device-effects")).toContainText("local-one");
});

test("a late copy cannot close a reopened peer ID dialog", async ({ page }) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Hold clipboard writes" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  const openPeerId = page.getByRole("button", {
    name: "Show and copy this device's peer ID",
  });
  await openPeerId.click();
  let dialog = page.getByRole("dialog", { name: "Peer ID" });
  await dialog.getByRole("button", { name: "Copy peer ID" }).click();
  await expect(page.getByTestId("device-effects")).toContainText("local-one");
  await dialog.getByRole("button", { name: "Close" }).click();
  await openPeerId.click();
  dialog = page.getByRole("dialog", { name: "Peer ID" });
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page
    .getByRole("button", { name: "Resolve held clipboard write" })
    .dispatchEvent("click");
  await expect(dialog).toBeVisible();
});

test("alias drafts survive observation changes and supported task suspension", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await openDeviceActions(page);
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
  await openDeviceActions(page);
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
  await openDeviceActions(page);
  await page.getByRole("button", { name: "Edit Local Device Alias" }).click();
  await page.getByRole("button", { name: "Copy Peer ID" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Could not copy peer id" })
    .waitFor();
  await page.getByRole("button", { name: "Cancel alias edit" }).click();

  await openDeviceActions(page);
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
  await openDeviceActions(page);
  await expect(revoke).toBeEnabled();
});

test("revocation failure retains the observed device and old owner feedback is retired", async ({
  page,
}) => {
  await page.goto("/device-management.html");
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await openDeviceActions(page);
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
  await openDeviceActions(page);
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
  await openDeviceActions(page);
  await expect(
    page.getByRole("button", { name: "Revoke device" })
  ).toBeVisible();
});
