import { expect, test } from "@playwright/test";

test("the Clipp mark opens navigation on History and remains available on every destination", async ({
  page,
}) => {
  for (const width of [390, 1200]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/history-mutations.html?history");

    const openNavigation = page.getByRole("button", {
      name: "Open navigation",
    });
    await expect(openNavigation.locator("img")).toBeVisible();
    await openNavigation.click();
    const navigation = page.getByRole("navigation", {
      name: "Clipp destinations",
    });
    await expect(navigation).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Close navigation" })
    ).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" })
    ).toBeFocused();

    for (const destination of ["Settings", "Devices", "Requests"] as const) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await navigation.getByRole("button", { name: destination }).click();
      await expect(
        page.getByRole("button", { name: "Open navigation" }).locator("img")
      ).toBeVisible();
    }
  }
});

test("a History row has only Copy and Delete actions, while Clip details stay on the content control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  const row = page.locator('[data-clip-id="clip-one"]');

  await expect(row.getByRole("button", { name: "Copy Clip" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Delete Clip" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Pin Clip" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Time filter/i })).toHaveCount(
    0
  );

  await row.getByRole("button", { name: "Copy Clip" }).click();
  await expect(page.getByRole("dialog", { name: "Clip details" })).toHaveCount(
    0
  );
  await row.getByRole("button", { name: "View Clip details" }).click();
  await expect(
    page.getByRole("dialog", { name: "Clip details" })
  ).toBeVisible();
});

test("History row actions are compact and capture time stays beside the source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  const row = page.locator('[data-clip-id="clip-one"]');
  const source = row.locator(".history-source-label");
  const time = row.locator(".meta-time");
  const metadata = row.locator(".history-meta");
  const copy = await row
    .getByRole("button", { name: "Copy Clip" })
    .boundingBox();
  const remove = await row
    .getByRole("button", { name: "Delete Clip" })
    .boundingBox();
  const sourceBounds = await source.boundingBox();
  const timeBounds = await time.boundingBox();
  const metadataBounds = await metadata.boundingBox();

  expect(copy).not.toBeNull();
  expect(remove).not.toBeNull();
  expect(sourceBounds).not.toBeNull();
  expect(timeBounds).not.toBeNull();
  expect(metadataBounds).not.toBeNull();
  expect(copy!.width).toBe(40);
  expect(copy!.height).toBe(44);
  expect(remove!.x).toBeCloseTo(copy!.x + copy!.width, 0);
  expect(sourceBounds!.width).toBeLessThan(120);
  expect(timeBounds!.x).toBeGreaterThan(sourceBounds!.x);
  expect(timeBounds!.x).toBeLessThan(
    sourceBounds!.x + sourceBounds!.width + 48
  );
  expect(timeBounds!.x).toBeLessThan(metadataBounds!.x + metadataBounds!.width);
});

test("History has no header filter toggle and places Share Now after connectivity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  const panel = page.getByRole("group", { name: "History filters" });
  await expect(panel).toBeVisible();
  await expect(
    page.getByRole("button", { name: /History filters/ })
  ).toHaveCount(0);

  const topbar = await page.locator(".workspace-topbar").boundingBox();
  const connection = await page.locator(".connection-status").boundingBox();
  const share = await page
    .getByRole("button", { name: "Share current clipboard now" })
    .boundingBox();
  expect(connection).not.toBeNull();
  expect(share).not.toBeNull();
  expect(topbar).not.toBeNull();
  expect(share!.x).toBeGreaterThanOrEqual(connection!.x + connection!.width);
  expect(topbar!.x + topbar!.width - share!.x - share!.width).toBeCloseTo(
    12,
    0
  );
});

test("Clip details stay centered at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  await page
    .locator('[data-clip-id="clip-one"]')
    .getByRole("button", { name: "View Clip details" })
    .click();

  const dialog = page.getByRole("dialog", { name: "Clip details" });
  await expect(
    dialog.getByRole("button", { name: "Close details" })
  ).toBeVisible();
  await expect(dialog.getByText(/^Scenario Device · Today/)).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeLessThan(390);
  expect(bounds!.x).toBeGreaterThan(0);
  expect(bounds!.y).toBeGreaterThan(0);
  const metadata = dialog.locator("details.clip-details-more");
  await expect(metadata).not.toHaveAttribute("open", "");
  await metadata
    .getByText("More Clip actions and information", { exact: true })
    .click();
  await expect(metadata.getByText("clip-one", { exact: true })).toBeVisible();
});

test("History filters remain visible without a header toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  const panel = page.getByRole("group", { name: "History filters" });
  await expect(panel).toBeVisible();

  await page.getByRole("button", { name: "Pinned", exact: true }).click();
  await page.getByRole("button", { name: "Source: All" }).click();
  await expect(
    page.getByRole("button", { name: "Remote", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Remote", exact: true }).click();
  await page.getByRole("textbox", { name: "Search history" }).fill("target");
  await expect(
    page.locator('[data-session-focus="history-query"]')
  ).toHaveValue("target");
  await expect(panel).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pinned", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Source: Remote" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /History filters/ })
  ).toHaveCount(0);
});

test("the extension-sized History view keeps filters visible without a header toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 600 });
  await page.goto("/history-mutations.html?history");

  await expect(
    page.getByRole("group", { name: "History filters" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /History filters/ })
  ).toHaveCount(0);
});

test("the connection glyph opens a truthful summary before its Devices route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  await page.getByRole("button", { name: "Connection status unknown" }).click();
  const summary = page.getByRole("dialog", { name: "Connection summary" });
  await expect(summary).toBeVisible();
  await expect(
    summary.getByText("Connection status unknown", { exact: true })
  ).toBeVisible();
  await expect(
    summary.getByText(/Clipp cannot confirm the current connection state/)
  ).toBeVisible();
  await summary.getByRole("button", { name: "Open Devices" }).click();
  await expect(
    page.getByRole("heading", { name: "Devices", exact: true })
  ).toBeVisible();
});

test("Copy and Delete act on the selected row and retain retry after a Delete failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history-mutations.html?history");
  const row = page.locator('[data-clip-id="clip-two"]');
  const targets = page.getByTestId("history-targets");

  await row.getByRole("button", { name: "Copy Clip" }).click();
  await expect(page.getByText("Copying Clip…")).toBeVisible();
  await expect(targets).toHaveText('["copy:clip-two"]');
  await page.getByLabel("Open navigation scenario controls").click();
  await page.getByRole("button", { name: "Resolve Copy: success" }).click();

  await row.getByRole("button", { name: "Delete Clip" }).click();
  await expect(row.getByRole("button", { name: "Delete Clip" })).toBeDisabled();
  await page.getByRole("button", { name: "Resolve Delete: failure" }).click();
  await expect(
    page.getByText("Could not delete this Clip. It is still in your history.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(targets).toHaveText(
    '["copy:clip-two","delete:clip-two","delete:clip-two"]'
  );
  await page.getByRole("button", { name: "Resolve Delete: success" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Clip details" })).toHaveCount(
    0
  );
});

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
  await page
    .locator('[data-clip-id="clip-one"]')
    .getByRole("button", { name: "View Clip details" })
    .click();
  const details = page.getByRole("dialog", { name: "Clip details" });
  await details.getByText("History scenario controls", { exact: true }).click();
  const pin = details.getByRole("button", { name: "Pin Clip" });
  await pin.click();
  await page.getByRole("button", { name: "Resolve Pin: failure" }).click();
  await expect(
    details
      .getByRole("status")
      .filter({ hasText: "Could not confirm this Clip's pin state" })
  ).toBeVisible();
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await details.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Resolve Pin: success" }).click();
  await expect(
    details.getByRole("button", { name: "Unpin Clip" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('[data-clip-id="clip-one"] .history-pin-marker')
  ).toBeVisible();
  await details
    .getByText("More Clip actions and information", { exact: true })
    .click();
  await details.getByRole("button", { name: "Delete Clip" }).click();
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
