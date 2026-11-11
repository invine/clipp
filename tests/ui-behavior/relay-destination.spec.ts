import { expect, test } from "@playwright/test";

test("each compact header keeps its visible buttons at one height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/relay-address.html");

  for (const target of [40, 52]) {
    await page.evaluate((size) => {
      document.documentElement.style.setProperty(
        "--clipp-target-min",
        `${size}px`
      );
    }, target);
    for (const destination of ["History", "Devices", "Settings", "Relays"]) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("navigation", { name: "Clipp destinations" })
        .getByRole("button", { name: destination })
        .click();
      const heights = await page
        .locator("header.workspace-topbar button:visible")
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getBoundingClientRect().height)
        );
      expect(heights.length).toBeGreaterThan(1);
      for (const height of heights)
        expect(height, `${destination} at ${target}px`).toBeCloseTo(
          heights[0],
          1
        );
      if (destination === "Relays") {
        const faceHeight = await page
          .locator("header .relay-header-add .header-action-face")
          .evaluate((face) => face.getBoundingClientRect().height);
        expect(faceHeight).toBe(38);
      }
    }
  }
});

test("History, Devices, Settings, and Relays share one header height at each viewport", async ({
  page,
}) => {
  for (const width of [390, 768, 1440]) {
    for (const target of [40, 52]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/relay-address.html");
      await page.evaluate((size) => {
        document.documentElement.style.setProperty(
          "--clipp-target-min",
          `${size}px`
        );
      }, target);
      const heights: number[] = [];
      for (const destination of ["History", "Devices", "Settings", "Relays"]) {
        const nav = page.getByRole("navigation", {
          name: "Clipp destinations",
        });
        if (!(await nav.isVisible()))
          await page.getByRole("button", { name: "Open navigation" }).click();
        await nav.getByRole("button", { name: destination }).click();
        const height = await page
          .locator("header.workspace-topbar")
          .evaluate((header) => header.getBoundingClientRect().height);
        heights.push(height);
      }
      for (const height of heights)
        expect(height, `${width}px viewport, ${target}px target`).toBeCloseTo(
          heights[0],
          1
        );
    }
  }
});

test("the Clipp mark and leading header content align across destinations", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1100, 1101, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/relay-address.html");
    for (const target of [40, 52]) {
      await page.evaluate((size) => {
        document.documentElement.style.setProperty(
          "--clipp-target-min",
          `${size}px`
        );
      }, target);
      const positions: {
        destination: string;
        icon: number;
        content: number;
      }[] = [];
      for (const destination of ["History", "Devices", "Settings", "Relays"]) {
        const nav = page.getByRole("navigation", {
          name: "Clipp destinations",
        });
        if (!(await nav.isVisible()))
          await page.getByRole("button", { name: "Open navigation" }).click();
        await nav.getByRole("button", { name: destination }).click();
        const position = await page.evaluate((desktop) => {
          const icon = document.querySelector(
            desktop
              ? ".workspace-brand .app-logo img"
              : "header .navigation-toggle img"
          )!;
          const content = document.querySelector(
            "header .workspace-current-title, header .search-field"
          )!;
          return {
            icon: icon.getBoundingClientRect().left,
            content: content.getBoundingClientRect().left,
          };
        }, width > 1100);
        positions.push({ destination, ...position });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          `${width}px ${destination} overflow`
        ).toBe(true);
      }
      for (const position of positions) {
        expect(
          position.icon,
          `${width}px ${target}px target ${position.destination} icon`
        ).toBeCloseTo(positions[0].icon, 1);
        expect(
          position.content,
          `${width}px ${target}px target ${position.destination} header content`
        ).toBeCloseTo(positions[0].content, 1);
      }
    }
  }
});

test("desktop navigation stays visible across all destinations and folds on resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/relay-address.html");
  const nav = page.getByRole("navigation", { name: "Clipp destinations" });
  const toggle = page.getByRole("button", { name: "Open navigation" });

  for (const destination of ["History", "Devices", "Settings", "Relays"]) {
    await expect(nav).toBeVisible();
    await expect(toggle).toBeHidden();
    await nav.getByRole("button", { name: destination }).click();
    await expect(
      nav.getByRole("button", { name: destination })
    ).toHaveAttribute("aria-current", "page");
    const columns = await page.evaluate(() => ({
      sidebarRight: document
        .querySelector(".workspace-sidebar")!
        .getBoundingClientRect().right,
      contentLeft: document
        .querySelector(".workspace-content")!
        .getBoundingClientRect().left,
      overflows: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(columns.contentLeft).toBeGreaterThanOrEqual(
      columns.sidebarRight - 1
    );
    expect(columns.overflows).toBe(false);
  }

  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(nav).toBeHidden();
  await expect(toggle).toBeVisible();
  await page.setViewportSize({ width: 1101, height: 900 });
  await expect(nav).toBeVisible();
  await expect(toggle).toBeHidden();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(nav).toBeHidden();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: "History" }).click();
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(nav).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(nav).toBeVisible();
  await expect(toggle).toBeHidden();
  await expect(page.locator(".navigation-toggle")).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(nav.getByRole("button", { name: "History" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(nav).toBeHidden();
  await expect(toggle).toBeVisible();
});

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

test("returning to a suspended relay editor restores focus to its actions menu", async ({
  page,
}) => {
  await page.goto("/relay-address.html?managed");
  await page.getByRole("button", { name: "Relay A actions" }).click();
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
    page.getByRole("button", { name: "Relay A actions" })
  ).toBeFocused();
});

test("relay action remains available after notification interruption", async ({
  page,
}) => {
  await page.goto("/relay-address.html?managed");
  await page.getByRole("button", { name: "Relay A actions" }).click();
  await page
    .locator(".device-action-popover")
    .getByRole("button", { name: "Log in" })
    .click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Open Requests notification" })
    .click();
  await page.getByRole("button", { name: "Back to previous task" }).click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeDisabled();
  await page.getByRole("button", { name: "Reject relay login" }).click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
  await expect(page.locator(".managed-relay-item")).not.toContainText(
    "Login could not be confirmed"
  );
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
  await expect(overview).not.toContainText("ready");
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
    await expect(overview).not.toContainText("connecting or retrying");
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
  await expect(overview).not.toContainText("needs attention");
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
  const row = page
    .locator(".managed-relay-item")
    .filter({ hasText: "Relay A" });
  const disclosure = row.locator("summary");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toHaveAccessibleName(/actions/);
  await expect(row.getByRole("button", { name: "Log in" })).toBeVisible();
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(row.locator("details")).toHaveAttribute("open", "");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(
    row
      .locator(".device-action-popover")
      .getByRole("button", { name: "Log in" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row.locator("details")).not.toHaveAttribute("open", "");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(disclosure).toBeFocused();
});

test("login-needed relay offers a direct login action", async ({ page }) => {
  await page.goto("/relay-address.html?managed");
  const item = page
    .locator(".managed-relay-item")
    .filter({ hasText: "Relay A" });
  await item.getByRole("button", { name: "Log in" }).click();
  await expect(item.getByRole("button", { name: "Log in" })).toBeDisabled();
  await page.getByRole("button", { name: "Reject relay login" }).click();
  await expect(item.getByRole("button", { name: "Log in" })).toBeEnabled();
  await expect(item).not.toContainText("Login could not be confirmed");
});

for (const width of [1440, 768, 390]) {
  test(`long relay identity and secondary actions remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/relay-address.html?managed&long");
    const row = page
      .locator(".managed-relay-item")
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
    const address = row.locator(".relay-address");
    await expect(address).toHaveAttribute(
      "title",
      "https://long-relay-identity.example.com/very/long/path/that/must/remain/visible/to/the/user/for/identification"
    );
    expect(
      await address.evaluate(
        (element) =>
          element.scrollWidth > element.clientWidth &&
          getComputedStyle(element).textOverflow === "ellipsis"
      )
    ).toBe(true);
    await row.locator("summary").click();
    await expect(
      row
        .locator(".device-action-popover")
        .getByRole("button", { name: "Log in" })
    ).toBeVisible();
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

test("empty relay state is centered and offers setup for both relay surfaces", async ({
  page,
}) => {
  for (const query of ["", "?managed&empty"]) {
    await page.goto(`/relay-address.html${query}`);
    const prompt = page.locator(".relay-empty-prompt");
    await expect(
      prompt.getByRole("heading", { name: "No relays configured" })
    ).toBeVisible();
    await expect(prompt).toContainText(
      "Add a relay to help your devices connect"
    );
    expect(
      await prompt.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.textAlign === "center" && style.borderStyle === "none";
      })
    ).toBe(true);
    await prompt.getByRole("button", { name: "+ Add relay" }).click();
    if (query)
      await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible();
    else
      await expect(
        page.getByRole("textbox", { name: "New relay address" })
      ).toBeVisible();
  }
});
