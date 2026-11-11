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

test("Devices shows a request between identity and trusted devices and hides it when resolved", async ({
  page,
}) => {
  await page.goto("/trust-requests.html?devices");
  const card = page.getByRole("region", { name: "Trust requests" });
  await expect(card).toBeVisible();
  await expect(card.getByText("1 request", { exact: true })).toBeVisible();
  await expect(card.getByText("Peer One", { exact: true })).toBeVisible();
  await expect(card.getByText("peer-one", { exact: true })).toBeVisible();
  await expect(card.getByText("Unavailable", { exact: true })).toBeVisible();
  const regions = page.locator(".devices-pane > section");
  await expect(regions.nth(0)).toHaveAttribute("aria-label", "This device");
  await expect(regions.nth(1)).toHaveAttribute(
    "aria-labelledby",
    "device-trust-requests-heading"
  );
  await expect(regions.nth(2)).toHaveAttribute(
    "aria-labelledby",
    "trusted-devices-heading"
  );
  await card
    .getByRole("button", { name: "Approve request from Peer One" })
    .click();
  await expect(page.getByTestId("trust-effects")).toHaveText(
    "accept:peer-one:request-v1"
  );
  await page
    .getByRole("button", { name: "Resolve Accept: admitted locally" })
    .click();
  await page
    .getByRole("button", { name: "Publish no pending requests" })
    .click();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByText(
      "Device admitted locally. Response delivery is not confirmed."
    )
  ).toBeVisible();
});

test("Devices handles concurrent requests independently and blocks stale decisions", async ({
  page,
}) => {
  await page.goto("/trust-requests.html?devices");
  await page
    .getByRole("button", { name: "Publish two pending requests" })
    .click();
  const card = page.getByRole("region", { name: "Trust requests" });
  await expect(card.getByText("2 requests", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Reject request from Peer Two" })
    .click();
  await expect(page.getByTestId("trust-effects")).toHaveText(
    "reject:peer-two:request-two"
  );
  await expect(
    card.getByRole("button", { name: "Reject request from Peer Two" })
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Resolve Reject: rejected locally" })
    .click();
  await page
    .getByRole("button", { name: "Publish first pending request" })
    .click();
  await expect(card.getByText("1 request", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Approve request from Peer One" })
    .click();
  await page
    .getByRole("button", { name: "Publish replacement request" })
    .click();
  await page
    .getByRole("button", { name: "Resolve Accept: admitted locally" })
    .click();
  await expect(
    page.getByText(
      "Device admitted locally. Response delivery is not confirmed."
    )
  ).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Reject request from Peer One" })
  ).toBeEnabled();
});

test("Devices distinguishes unavailable and loading requests from an empty list", async ({
  page,
}) => {
  await page.goto("/trust-requests.html?devices");
  const card = page.getByRole("region", { name: "Trust requests" });
  await page.getByRole("button", { name: "Publish Requests loading" }).click();
  await expect(page.getByText("Loading Requests…")).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Approve request from Peer One" })
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Publish Requests unavailable" })
    .click();
  await expect(
    page.getByText(
      "Requests are unavailable. Retry to refresh the current list."
    )
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Reject request from Peer One" })
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Publish no pending requests" })
    .click();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByText(
      "Requests are unavailable. Retry to refresh the current list."
    )
  ).toBeVisible();
});

test("desktop returns to its two-column Devices layout when the last request clears", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trust-requests.html?devices");
  const local = page.getByRole("region", { name: "This device" });
  const trusted = page.getByRole("region", { name: "Trusted devices" });
  await page
    .getByRole("button", { name: "Publish no pending requests" })
    .click();
  const originalLocal = await local.boundingBox();
  const originalTrusted = await trusted.boundingBox();
  expect(originalLocal).not.toBeNull();
  expect(originalTrusted).not.toBeNull();
  expect(originalTrusted!.x).toBeGreaterThan(
    originalLocal!.x + originalLocal!.width
  );
  await page
    .getByRole("button", { name: "Publish first pending request" })
    .click();
  const card = page.getByRole("region", { name: "Trust requests" });
  await expect(card).toBeVisible();
  const localWithRequest = await local.boundingBox();
  const cardBox = await card.boundingBox();
  const trustedWithRequest = await trusted.boundingBox();
  expect(cardBox!.y).toBeGreaterThan(localWithRequest!.y);
  expect(trustedWithRequest!.y).toBeGreaterThan(cardBox!.y);
  await page
    .getByRole("button", { name: "Publish no pending requests" })
    .click();
  await expect(card).toHaveCount(0);
  const restoredLocal = await local.boundingBox();
  const restoredTrusted = await trusted.boundingBox();
  expect(restoredLocal).toEqual(originalLocal);
  expect(restoredTrusted).toEqual(originalTrusted);
});
