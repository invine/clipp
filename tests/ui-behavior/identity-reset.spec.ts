import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/identity-reset.html");
  await page.getByRole("button", { name: "Advanced" }).click();
});

test("an unavailable reset capability stays disabled even when the scenario supplies actions", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Reset device identity" })
  ).toBeDisabled();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Manual identity reset is unavailable" })
  ).toBeVisible();
});

test("canceling reset review does not start a durable operation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Use scripted reset capability" })
    .click();
  await page.getByRole("button", { name: "Reset device identity" }).click();
  await expect(
    page.getByRole("region", { name: "Review device identity reset" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Reset device identity" })
  ).toBeVisible();
  await expect(page.getByTestId("reset-effects")).toContainText(
    '"beginCount":0'
  );
});

test("an unconfirmed reset reconciles runtime status before offering continuation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Use scripted reset capability" })
    .click();
  await page
    .getByRole("button", { name: "Set current reset phase: quiescing" })
    .click();
  await page.getByRole("button", { name: "Reset device identity" }).click();
  await page.getByRole("button", { name: "Start reset" }).click();
  await expect(page.getByText("Submitting the reset request…")).toBeVisible();
  await page
    .getByRole("button", { name: "Resolve reset: unconfirmed" })
    .click();
  await expect(page.getByText("Reset status: quiescing.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue reset" })
  ).toBeEnabled();
  await expect(page.getByTestId("reset-effects")).toContainText(
    '"beginCount":1,"reconcileCount":1'
  );
  await page.getByRole("button", { name: "Continue reset" }).click();
  await expect(page.getByText("Reset status: cleaning.")).toBeVisible();
  await page.getByRole("button", { name: "Publish completed reset" }).click();
  await expect(page.getByTestId("reset-effects")).toContainText(
    '"resumeCount":1'
  );
});

test("a late former-identity reset result cannot reconcile or replace the new identity context", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Use scripted reset capability" })
    .click();
  await page.getByRole("button", { name: "Reset device identity" }).click();
  await page.getByRole("button", { name: "Start reset" }).click();
  await expect(page.getByText("Submitting the reset request…")).toBeVisible();
  await page.getByRole("button", { name: "Publish Identity Rotation" }).click();
  await page.getByRole("button", { name: "Set new identity context" }).click();
  await expect(page.getByText("Checking reset status…")).toBeVisible();
  await page
    .getByRole("button", { name: "Resolve reset: unconfirmed" })
    .click();
  await expect(page.getByText("Checking reset status…")).toBeVisible();
  await expect(page.getByText("Reset status: accepted.")).toHaveCount(0);
  await expect(page.getByTestId("reset-effects")).toContainText(
    '"reconcileCount":0'
  );
  await expect(page.getByTestId("session-context")).toContainText(
    '"search":"new identity search"'
  );
});

test("runtime-published completion and previous identity reminder remain observable without OS clipboard access", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Publish completed reset" }).click();
  await expect(
    page.getByText(
      "Identity reset completed. Restart this app before pairing with the new identity."
    )
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish previous identity reminder" })
    .click();
  await expect(
    page.getByRole("region", { name: "Previous device identity reminder" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy previous Peer ID" }).click();
  await page.getByRole("button", { name: "Refresh scenario outputs" }).click();
  await expect(page.getByTestId("reset-effects")).toContainText(
    '"copyEvents":["former-peer"]'
  );
});

test("a late result from a replaced runtime owner cannot reconcile or restore the former reset phase", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Use scripted reset capability" })
    .click();
  await page.getByRole("button", { name: "Reset device identity" }).click();
  await page.getByRole("button", { name: "Start reset" }).click();
  await expect(page.getByText("Submitting the reset request…")).toBeVisible();
  await page.getByRole("button", { name: "Replace runtime owner" }).click();
  await page.getByRole("button", { name: "Set new identity context" }).click();
  await expect(page.getByText("Checking reset status…")).toBeVisible();
  await page
    .getByRole("button", { name: "Resolve reset: unconfirmed" })
    .click();
  await expect(page.getByText("Checking reset status…")).toBeVisible();
  await expect(page.getByText("Reset status: accepted.")).toHaveCount(0);
  await expect(page.getByTestId("reset-effects")).toContainText(
    '"reconcileCount":0'
  );
  await expect(page.getByTestId("session-context")).toContainText(
    '"search":"new identity search"'
  );
});
