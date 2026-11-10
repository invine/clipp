import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`Relays is a dedicated destination at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/relay-address.html");
    const nav = page.getByRole("navigation", { name: "Clipp destinations" });
    if (!(await nav.isVisible()))
      await page.getByRole("button", { name: "Open navigation" }).click();
    await nav.getByRole("button", { name: "Settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Managed relays" })
    ).toHaveCount(0);
    if (!(await nav.isVisible()))
      await page.getByRole("button", { name: "Open navigation" }).click();
    await nav.getByRole("button", { name: "Relays" }).click();
    await expect(
      page.getByRole("heading", { name: "Relays", exact: true })
    ).toBeVisible();
    if (width === 1440) {
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("button", { name: "Relays" })).toHaveAttribute(
        "aria-current",
        "page"
      );
    }
    await expect(
      page.getByRole("heading", { name: "Configured relays" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add relay" }).first()
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

test("a legacy relay settings handoff opens Relays", async ({ page }) => {
  await page.goto("/relay-address.html");
  if (
    !(await page
      .getByRole("navigation", { name: "Clipp destinations" })
      .isVisible())
  )
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Clipp destinations" })
    .getByRole("button", { name: "Settings" })
    .click();
  await page.getByRole("button", { name: "Open legacy relay handoff" }).click();
  await expect(
    page.getByRole("heading", { name: "Configured relays" })
  ).toBeVisible();
});

test("returning to a suspended relay editor restores focus to its visible Edit action", async ({
  page,
}) => {
  await page.goto("/relay-address.html?managed");
  await page.getByText("Relay A", { exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("retained draft");
  await page
    .getByRole("button", { name: "Open Requests notification" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.getByRole("button", { name: "Back to previous task" }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "retained draft"
  );
  await page.getByRole("button", { name: "Close relay editor" }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true })
  ).toBeFocused();
});

test("relay action feedback remains visible after notification interruption", async ({
  page,
}) => {
  await page.goto("/relay-address.html?managed");
  await page.getByText("Relay A", { exact: true }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Relay action pending…")).toBeVisible();
  await page
    .getByRole("button", { name: "Open Requests notification" })
    .click();
  await page.getByRole("button", { name: "Back to previous task" }).click();
  await expect(page.getByText("Relay action pending…")).toBeVisible();
  await page.getByRole("button", { name: "Reject relay login" }).click();
  await expect(page.getByText("Login could not be confirmed")).toBeVisible();
});

test("relay overview reports empty and observed attention states", async ({
  page,
}) => {
  await page.goto("/relay-address.html");
  await expect(
    page.getByRole("status", { name: "Relay status" })
  ).toContainText("No relays configured");
  await page.goto("/relay-address.html?managed");
  const overview = page.getByRole("status", { name: "Relay status" });
  await expect(overview).toContainText("1 configured");
  await expect(overview).toContainText("0 ready");
  await expect(overview).toContainText("1 needs attention");
});

for (const theme of ["light", "dark"] as const) {
  test(`mixed relay observations update in ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/relay-address.html?managed&summary");
    const overview = page.getByRole("status", { name: "Relay status" });
    await expect(overview).toContainText("4 configured");
    await expect(overview).toContainText("1 ready");
    await expect(overview).toContainText("1 connecting or retrying");
    await expect(overview).toContainText("1 needs attention");
    await expect(overview).toContainText("1 unknown");
    await page
      .getByRole("button", { name: "Update relay observations" })
      .click();
    await expect(overview).toContainText("2 ready");
    await expect(overview).toContainText("0 connecting or retrying");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

test("legacy address overview distinguishes unreported and disconnected observations", async ({
  page,
}) => {
  await page.goto("/relay-address.html?summary");
  const overview = page.getByRole("status", { name: "Relay status" });
  await expect(overview).toContainText("3 configured");
  await expect(overview).toContainText("1 connected");
  await expect(overview).toContainText("1 needs attention");
  await expect(overview).toContainText("1 unknown");
  await page.getByRole("button", { name: "Update relay observations" }).click();
  await expect(overview).toContainText("2 connected");
  await expect(overview).toContainText("0 needs attention");
});

for (const width of [1440, 768, 390]) {
  test(`relay cards and header use available workspace at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/relay-address.html?managed&summary");
    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      const main = bounds("main");
      const overview = bounds('[aria-label="Relay status"]');
      const list = bounds('[aria-labelledby="configured-relays-heading"]');
      const header = bounds("header.workspace-topbar");
      const add = bounds('[data-session-focus="relay:add"]');
      return {
        mainWidth: main.width,
        overviewWidth: overview.width,
        listWidth: list.width,
        overviewLeft: overview.left,
        listLeft: list.left,
        headerRight: header.right,
        addRight: add.right,
      };
    });
    expect(geometry.overviewWidth).toBeGreaterThan(geometry.mainWidth * 0.8);
    expect(Math.abs(geometry.overviewWidth - geometry.listWidth)).toBeLessThan(
      2
    );
    expect(Math.abs(geometry.overviewLeft - geometry.listLeft)).toBeLessThan(2);
    expect(geometry.headerRight - geometry.addRight).toBeLessThan(40);
  });
}

test("relay row exposes its actions through a keyboard-operable disclosure", async ({
  page,
}) => {
  await page.goto("/relay-address.html?managed");
  const row = page.locator("details").filter({ hasText: "Relay A" });
  await expect(row.getByText(/^Actions/)).toBeVisible();
  const disclosure = row.locator("summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("open", "");
  await expect(row.getByRole("button", { name: "Log in" })).toBeVisible();
});

for (const width of [1440, 768, 390]) {
  test(`long relay identity and secondary actions remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/relay-address.html?managed&long");
    const row = page
      .locator("details")
      .filter({ hasText: "Long relay name identifying" });
    await expect(
      row.getByText(
        "Long relay name identifying the correct office and device across a narrow screen"
      )
    ).toBeVisible();
    await expect(
      row
        .getByText(
          "https://long-relay-identity.example.com/very/long/path/that/must/remain/visible/to/the/user/for/identification"
        )
        .first()
    ).toBeVisible();
    await row.locator("summary").click();
    await expect(row.getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(
      row.getByRole("button", { name: "Edit", exact: true })
    ).toBeVisible();
    await expect(row.getByRole("button", { name: "Remove" })).toBeVisible();
    await row.getByRole("button", { name: "Manage account" }).click();
    await expect(page.getByTestId("relay-workspace-effects")).toHaveText(
      "account:relay-a"
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

test("relay recovery routes back to the Relays destination", async ({
  page,
}) => {
  await page.goto("/relay-address.html?managed");
  const nav = page.getByRole("navigation", { name: "Clipp destinations" });
  if (!(await nav.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Open relay settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Configured relays" })
  ).toBeVisible();
});
