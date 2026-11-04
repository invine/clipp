import { expect, test } from "@playwright/test";

test("Pairing code generation and copy keep pending, retry, and uncertainty visible", async ({
  page,
}) => {
  await page.goto("/pairing-code.html");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Show my QR" })
    .click();
  const controls = page.getByTestId("pairing-code-controls");
  await controls.locator("summary").click();

  await expect(page.getByText("Creating QR code...")).toBeVisible();
  await controls.getByRole("button", { name: "Resolve code: failure" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Unable to create a pairing QR code",
    })
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry QR generation" }).click();
  await controls.getByRole("button", { name: "Resolve code: success" }).click();
  await expect(page.getByRole("img", { name: "Pairing QR" })).toBeVisible();

  await page.getByRole("button", { name: "Copy pairing text" }).click();
  await expect(page.getByRole("button", { name: "Copying..." })).toBeDisabled();
  await controls
    .getByRole("button", { name: "Resolve copy: rejected" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not copy pairing text"
  );
  await page.getByRole("button", { name: "Retry Copy" }).click();
  await controls
    .getByRole("button", { name: "Resolve copy: unconfirmed" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Check your clipboard before choosing Copy again"
  );
  await expect(page.getByRole("button", { name: "Copy again" })).toBeVisible();
});

test("permission recovery waits for a new user scan and scanned text uses Pairing submission", async ({
  page,
}) => {
  await page.goto("/pairing-code.html");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Scan QR" })
    .click();
  const controls = page.getByTestId("pairing-code-controls");
  await controls.locator("summary").click();
  await expect(
    controls.getByRole("button", { name: "Resolve scan: permission denied" })
  ).toBeVisible();
  await controls
    .getByRole("button", { name: "Resolve scan: permission denied" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera permission could not be confirmed"
  );

  await controls
    .getByRole("button", { name: "Return from permission settings: granted" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera permission is now allowed"
  );
  await expect(controls.getByTestId("scan-effects")).toContainText("1");

  await page.getByRole("button", { name: "Scan QR" }).click();
  await controls.getByRole("button", { name: "Resolve scan: target" }).click();
  await expect(page.getByText("Submitting pairing text…")).toBeVisible();
  await expect(page.getByTestId("pairing-effects")).toContainText(
    '"scanned-target"'
  );
  await controls
    .getByRole("button", { name: "Resolve Pairing: success" })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Request submitted. Waiting for approval.",
    })
  ).toBeVisible();
});

test("scan cancellation and camera failure stay distinct from a scanned Pairing result", async ({
  page,
}) => {
  await page.goto("/pairing-code.html");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Scan QR" })
    .click();
  const controls = page.getByTestId("pairing-code-controls");
  await controls.locator("summary").click();
  await controls
    .getByRole("button", { name: "Resolve scan: cancelled" })
    .click();
  await expect(
    page.getByLabel("Pairing", { exact: true }).getByRole("button", {
      name: "Scan QR",
    })
  ).toBeEnabled();
  await expect(controls.getByTestId("pairing-effects")).toContainText("[]");

  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Scan QR" })
    .click();
  await controls
    .getByRole("button", { name: "Resolve scan: camera failure" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "The camera could not be opened"
  );
  await expect(controls.getByTestId("pairing-effects")).toContainText("[]");
});

test("leaving the scan task retires capture so a late scan cannot submit", async ({
  page,
}) => {
  await page.goto("/pairing-code.html");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Scan QR" })
    .click();
  const controls = page.getByTestId("pairing-code-controls");
  await controls.locator("summary").click();
  await expect(controls.getByTestId("scan-effects")).toContainText("1");

  await page.getByRole("button", { name: "Close Pairing" }).click();
  await page.locator(".ui-scenario-controls > summary").click();
  const lateControls = page.getByTestId("late-scan-controls");
  await lateControls.locator("summary").click();
  await lateControls
    .getByRole("button", { name: "Resolve late scan after task close" })
    .click();
  await expect(lateControls.getByTestId("late-scan-aborted")).toContainText(
    "true"
  );
  await expect(lateControls.getByTestId("late-pairing-effects")).toContainText(
    "[]"
  );
  await expect(
    page.getByRole("button", { name: "Pair this device" })
  ).toBeVisible();
});

test("changing Device Identity retires late QR generation and scan results", async ({
  page,
}) => {
  await page.goto("/pairing-code.html");
  await page.getByRole("button", { name: "Pair this device" }).click();
  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Show my QR" })
    .click();
  await expect(page.getByText("Creating QR code...")).toBeVisible();
  const external = page.locator(".ui-scenario-controls");
  await external.locator(":scope > summary").click();
  await external.getByTestId("late-scan-controls").locator("summary").click();
  await external
    .getByRole("button", { name: "Replace Device Identity" })
    .click();
  await external
    .getByRole("button", { name: "Resolve late QR generation" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Pair this device" })
  ).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Pairing QR" })).toHaveCount(0);

  await page.getByRole("button", { name: "Pair this device" }).click();
  await page
    .getByLabel("Pairing", { exact: true })
    .getByRole("button", { name: "Scan QR" })
    .click();
  await external
    .getByRole("button", { name: "Replace Device Identity" })
    .click();
  await external
    .getByRole("button", { name: "Resolve late scan after task close" })
    .click();
  await expect(external.getByTestId("late-scan-aborted")).toContainText("true");
  await expect(external.getByTestId("late-pairing-effects")).toContainText(
    "[]"
  );
});

test("replacing the runtime owner retires an active scan and permits a new scan", async ({
  page,
}) => {
  await page.goto("/pairing-code.html");
  await page.getByRole("button", { name: "Pair this device" }).click();
  const pairing = page.getByLabel("Pairing", { exact: true });
  await pairing.getByRole("button", { name: "Scan QR" }).click();
  const external = page.locator(".ui-scenario-controls");
  await external.locator(":scope > summary").click();
  await external.getByTestId("late-scan-controls").locator("summary").click();
  await external
    .getByRole("button", { name: "Replace runtime adapter" })
    .click();
  await expect(pairing.getByRole("button", { name: "Scan QR" })).toBeEnabled();
  await external
    .getByRole("button", { name: "Resolve late scan after task close" })
    .click();
  await expect(external.getByTestId("late-scan-aborted")).toContainText("true");
  await expect(external.getByTestId("late-pairing-effects")).toContainText(
    "[]"
  );
});
