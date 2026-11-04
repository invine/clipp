import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/trust-requests.html");
});

test("a pending decision is sent once and reports local admission separately from delivery", async ({
  page,
}) => {
  const accept = page.getByRole("button", { name: "Accept", exact: true });
  await accept.dblclick();
  await expect(accept).toBeDisabled();
  await expect(page.getByTestId("trust-effects")).toHaveText(
    "accept:peer-one:request-v1"
  );
  await expect(page.getByText("Deciding Trust Request…")).toBeVisible();
  await page
    .getByRole("button", { name: "Attempt Settings navigation" })
    .click();
  await expect(page.getByTestId("navigation-result")).toHaveText("declined");

  await page
    .getByRole("button", { name: "Resolve Accept: admitted locally" })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Device admitted locally. Response delivery is not confirmed.",
    })
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Publish no pending requests" })
    .click();
  await expect(page.getByText("No pending requests.")).toBeVisible();
});

test("a replaced request version does not receive an earlier decision result", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish replacement request" })
    .click();
  await page
    .getByRole("button", { name: "Resolve Accept: admitted locally" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Device admitted locally" })
  ).toHaveCount(0);
  await expect(page.getByTestId("trust-effects")).toContainText(
    "accept:peer-one:request-v1"
  );

  await expect(
    page.getByRole("button", { name: "Reject", exact: true })
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByTestId("trust-effects")).toContainText(
    "reject:peer-one:request-v2"
  );
  await page
    .getByRole("button", { name: "Resolve Reject: rejected locally" })
    .click();
  await expect(page.getByText("Request rejected locally.")).toBeVisible();
  await page
    .getByRole("button", { name: "Attempt Settings navigation" })
    .click();
  await expect(page.getByTestId("navigation-result")).toHaveText("applied");
});

test("identity rotation retires pending approval feedback", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByRole("button", { name: "Rotate identity" }).click();
  await expect(
    page.getByRole("button", { name: "Accept", exact: true })
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Resolve Accept: admitted locally" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Device admitted locally" })
  ).toHaveCount(0);
});

test("replacing the runtime owner retires the previous approval result", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByRole("button", { name: "Replace runtime owner" }).click();
  await expect(
    page.getByRole("button", { name: "Accept", exact: true })
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Resolve Accept: admitted locally" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Device admitted locally" })
  ).toHaveCount(0);
});

test("unconfirmed outcomes remain visible and do not claim Membership Reconciliation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page
    .getByRole("button", { name: "Resolve decision: unconfirmed" })
    .click();
  await expect(
    page.getByText(
      "Decision outcome unconfirmed. Refresh Requests and Devices before retrying."
    )
  ).toBeVisible();
  await expect(page.getByText(/Membership Reconciliation/)).toHaveCount(0);
});

test("loading or unavailable Requests suppresses trust decisions", async ({
  page,
}) => {
  const accept = page.getByRole("button", { name: "Accept", exact: true });
  await page.getByRole("button", { name: "Publish Requests loading" }).click();
  await expect(accept).toBeDisabled();
  await page
    .getByRole("button", { name: "Publish Requests unavailable" })
    .click();
  await expect(accept).toBeDisabled();
  await expect(page.getByTestId("trust-effects")).toHaveText("");
  await page.getByRole("button", { name: "Publish Requests ready" }).click();
  await expect(accept).toBeEnabled();
});
