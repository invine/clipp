import { expect, test } from "@playwright/test";

test("relay management starts empty and never invents configuration or connection state", async ({
  page,
}) => {
  await page.goto("/relay-management.html");
  await expect(page.getByText("No relays configured.")).toBeVisible();
  await expect(page.getByTestId("relay-effects")).toHaveText("[]");

  await page.getByRole("button", { name: "Publish managed relay" }).click();
  await expect(page.getByText("Login needed", { exact: true })).toBeVisible();
  await expect(page.getByTestId("relay-effects")).toHaveText("[]");

  await page.getByRole("button", { name: "Publish explicit relay" }).click();
  await expect(page.getByText("Explicit Relay", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toHaveCount(0);
  await expect(page.getByTestId("relay-effects")).toHaveText("[]");
});

test("relay edits retain newer drafts after rejection and do not claim the observed relay is ready", async ({
  page,
}) => {
  await page.goto("/relay-management.html");
  await page.getByRole("button", { name: "Publish managed relay" }).click();
  await page.getByText("Relay A", { exact: true }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  const name = page.getByRole("textbox", { name: "Name" });
  await name.fill("  changed name  ");
  const save = page.getByRole("button", { name: "Save" });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(page.getByTestId("relay-effects")).toContainText("edit");

  await name.fill("newer draft");
  await page
    .getByRole("button", { name: "Resolve pending effect: rejected" })
    .click();
  await expect(page.getByRole("alert")).toContainText("edit was rejected");
  await expect(name).toHaveValue("newer draft");
  await expect(page.getByText("Login needed", { exact: true })).toBeVisible();
});

test("login, account, retry, and uncertain removal remain scripted and observation-driven", async ({
  page,
}) => {
  await page.goto("/relay-management.html");
  await page.getByRole("button", { name: "Publish managed relay" }).click();
  await page.getByText("Relay A", { exact: true }).click();

  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Relay action pending…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve pending effect: authenticated" })
    .click();
  await expect(page.getByText(/Relay authentication completed/)).toBeVisible();
  await expect(page.getByText("Login needed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Manage account" }).click();
  await page
    .getByRole("button", { name: "Resolve pending effect: portal opened" })
    .click();
  await expect(page.getByText(/Relay portal opened/)).toBeVisible();

  await page
    .getByRole("button", { name: "Publish degraded relay status" })
    .click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByRole("button", { name: "Resolve pending effect: retry rejected" })
    .click();
  await expect(
    page.getByText(/Degraded: Rendezvous unavailable/)
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Relay action pending…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve pending effect: unconfirmed" })
    .click();
  await expect(page.getByText("Relay A", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Degraded: Rendezvous unavailable/)
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "The relay change was not confirmed." })
  ).toContainText("Check the current relay list");
});

test("a notification suspends and restores the correct relay editor draft", async ({
  page,
}) => {
  await page.goto("/relay-management.html");
  await page.getByRole("button", { name: "Publish managed relay" }).click();
  await page.getByText("Relay A", { exact: true }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const name = page.getByRole("textbox", { name: "Name" });
  await name.fill("  first relay draft  ");
  await page.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("button", { name: "Open Requests notification" })
    .click();
  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  await page
    .getByRole("button", { name: "Resolve pending effect: rejected" })
    .click();
  await page.getByRole("button", { name: "Return to relay editor" }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "  first relay draft  "
  );
  await expect(page.getByRole("alert")).toContainText("edit was rejected");
});
