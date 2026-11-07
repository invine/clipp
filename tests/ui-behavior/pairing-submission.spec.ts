import { expect, test } from "@playwright/test";

test("the mounted Pairing journey trims requests, keeps failures editable, and waits for approval", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  const effects = page.getByTestId("pairing-effects");
  const input = page.getByRole("textbox", { name: "Pairing text" });
  await input.fill("  target-one  ");
  await page.getByRole("button", { name: "Submit pairing text" }).click();

  await expect(effects).toContainText('"target-one"');
  await expect(page.getByText("Submitting pairing text…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit pairing text" })
  ).toBeDisabled();

  await input.fill("newer target");
  await page.getByRole("button", { name: "Resolve Pairing: failure" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Unable to submit pairing request" })
  ).toBeVisible();
  await expect(input).toHaveValue("newer target");
  await expect(input).toBeEnabled();

  await page.getByRole("button", { name: "Submit pairing text" }).click();
  await page.getByRole("button", { name: "Resolve Pairing: success" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Request submitted. Waiting for approval." })
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(effects).toContainText('"newer target"');
  await expect(effects).not.toContainText("admitted");
});

test("scenario reset retires an outstanding Pairing result", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.getByRole("textbox", { name: "Pairing text" }).fill("old target");
  await page.getByRole("button", { name: "Submit pairing text" }).click();
  await expect(page.getByText("Submitting pairing text…")).toBeVisible();

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByText("Submitting pairing text…")).toHaveCount(0);
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page.getByRole("button", { name: "Paste pairing text" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await expect(page.getByTestId("pairing-effects")).toContainText("[]");
});

test("the scenario catalog publishes connection observations and opens each workflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Clipp destinations" }).getByRole("button", { name: "History" }).click();
  await page.getByText("Pairing diagnostics", { exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-clipp-theme", "dark");
  });
  const status = page.getByRole("button", {
    name: "Connection status unknown",
  });
  await expect(status).toBeVisible();
  const glyphColor = async () =>
    page.locator(".connection-status svg").evaluate((svg) =>
      getComputedStyle(svg).color
    );
  await expect.poll(glyphColor).toBe("rgb(146, 145, 152)");
  await expect(page.locator('.connection-status svg path[d^="M9 6"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "No device connection available",
    })
  ).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(146, 145, 152)");
  await expect(page.locator('.connection-status svg path[d="m3 3 18 18"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Direct", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Direct Connection",
    })
  ).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(34, 197, 94)");
  await expect(page.locator('.connection-status svg path[d="m5.5 14.5 5-7m3 0 5 7M7 17h10"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Relayed", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Relayed Connection",
    })
  ).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(34, 197, 94)");
  await expect(page.locator('.connection-status svg path[d="m6 14 4-6m4 0 4 6M12 2l3 3-3 3-3-3Z"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Attention", exact: true }).click();
  await expect(page.getByRole("button", { name: "Direct Connection · relay needs attention" })).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(234, 179, 78)");
  await expect(page.locator('.connection-status svg path[d^="m5.5 14.5 3-5"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Starting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connections starting" })).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(146, 145, 152)");
  await expect(page.locator('.connection-status svg path[stroke-dasharray="1 3"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Waiting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Relay ready · no Trusted Devices" })).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(181, 167, 242)");
  await expect(page.locator('.connection-status svg path[stroke-dasharray="1 3"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await expect(page.getByRole("button", { name: "No Trusted Devices yet" })).toBeVisible();
  await expect.poll(glyphColor).toBe("rgb(146, 145, 152)");
  await expect(page.locator('.connection-status svg path[stroke-dasharray="1 3"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Unknown", exact: true }).click();
  await expect(status).toBeVisible();

  const catalog = page.getByRole("navigation", { name: "Scenario catalog" });
  await expect(catalog.getByRole("link")).toHaveCount(10);
  await catalog.getByRole("link", { name: "Trust Requests" }).click();
  await expect(page).toHaveURL(/trust-requests\.html$/);
  await expect(
    page.getByRole("complementary", {
      name: "Trust Request scenario controls",
    })
  ).toBeVisible();
});
