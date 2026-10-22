// Pure CLI selection shared by the existing controlled-renderer owner.
export function exactBoundariesSelected(argv) {
  if (!argv.includes("--exact-boundaries")) return false;
  if (
    argv.filter((argument) => argument === "--exact-boundaries").length !== 1 ||
    !argv[0] ||
    argv[0].startsWith("--") ||
    argv.filter((argument) => argument.startsWith("--host=")).length > 1 ||
    argv.filter((argument) => argument.startsWith("--source-root=")).length >
      1 ||
    argv
      .slice(1)
      .some(
        (argument) =>
          argument !== "--exact-boundaries" &&
          !/^--host=(electron|android|chrome)$/.test(argument) &&
          !/^--source-root=.+$/.test(argument)
      )
  )
    throw new Error(
      "exact-boundaries must be selected alone with output, host and optional source-root"
    );
  return true;
}

// The caller retains its existing renderer/profile/network/report lifecycle.
export async function checkExactWorkspaceBoundaries({
  page,
  nav,
  report,
  out,
}) {
  const { default: assert } = await import("node:assert/strict");
  const { join } = await import("node:path");
  const query = "boundary-missing";
  const raw = "  retained boundary raw name  ";
  const selection = (report.exactBoundaries = {
    nativeHost: false,
    textScale: "controlled root-font percentage; not OS text scaling",
    pendingSaveQualified: false,
    genuinePeerOrPendingQualified: false,
    crampedSearch: { width: 800, textPercent: 150, probes: [] },
  });
  const search = page.getByLabel("Search history", { exact: true });
  const rename = page.getByRole("button", {
    name: "Rename this device",
    exact: true,
  });
  const task = page.getByRole("dialog", { name: "Device Name", exact: true });
  const field = task.getByLabel("Device Name", { exact: true });
  const chooseScope = async (name) => {
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if ((await filters.getAttribute("aria-expanded")) !== "true")
      await filters.click();
    await page
      .getByRole("group", { name: "History filters" })
      .getByRole("button", { name, exact: true })
      .click();
  };
  const focusIsField = async () => {
    await page.waitForFunction(
      () => {
        const element = document.activeElement;
        return (
          element?.closest('[role="dialog"]') &&
          [...(element.labels ?? [])].some(
            (label) => label.textContent.trim() === "Device Name"
          )
        );
      },
      null,
      { timeout: 3000 }
    );
  };
  const resize = async (width, height, textPercent) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((percent) => {
      document.documentElement.style.fontSize = percent + "%";
    }, textPercent);
    // Observe two actual animation frames; no fixed sleep or synthetic geometry.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const observed = await page.evaluate(() => {
      const root = document.querySelector(".app-shell");
      const rect = (selector) =>
        document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        width: innerWidth,
        height: innerHeight,
        content: root.getBoundingClientRect().toJSON(),
        rootFontPx: parseFloat(
          getComputedStyle(document.documentElement).fontSize
        ),
        narrow: root.classList.contains("workspace-narrow"),
        cramped: root.classList.contains("workspace-cramped"),
        rootOverflow: root.scrollWidth - root.clientWidth,
        branding: rect(".app-bar"),
        controls: rect(".workspace-controls"),
        navigation: rect(".workspace-navigation"),
        main: rect(".app-main"),
      };
    });
    assert.equal(
      observed.width,
      width,
      "actual CSS width must equal the requested boundary"
    );
    assert.equal(
      observed.height,
      height,
      "actual CSS height must equal the requested boundary"
    );
    assert.equal(
      observed.content.width,
      width,
      "actual rendered workspace width must match the requested boundary"
    );
    assert.equal(
      observed.content.height,
      height,
      "actual rendered workspace height must match the requested boundary"
    );
    return observed;
  };
  const reachable = async (element, width, height) => {
    await element.scrollIntoViewIfNeeded();
    const rect = await element.boundingBox();
    assert.ok(
      rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= -1 &&
        rect.y >= -1 &&
        rect.x + rect.width <= width + 1 &&
        rect.y + rect.height <= height + 1,
      "the actual final control fits the viewport after its own scroller moves"
    );
    assert.equal(await element.isEnabled(), true);
  };
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await page.evaluate(() =>
    window.publishFixture({
      clips: Array.from({ length: 24 }, (_, index) => ({
        id: "clip-" + index,
        type: "text",
        content:
          "clip " +
          index +
          " " +
          (index % 2 ? "long synthetic text ".repeat(50) : "short"),
        originPeerId: "remote",
        capturedAt: Date.now() - index,
        shareExpiresAt: Date.now() + 60000,
      })),
    })
  );
  await chooseScope("Pinned");
  await search.fill(query);
  await page
    .getByText(`No Clips match “${query}” in Pinned.`, { exact: true })
    .waitFor();
  await nav.getByRole("button", { name: "Devices", exact: true }).click();
  await rename.click();
  await field.fill(raw);
  await task
    .getByRole("button", { name: "Save Device Name", exact: true })
    .click();
  await task.getByRole("alert").waitFor();
  const error = await task.getByRole("alert").innerText();
  assert.ok(
    error.trim(),
    "the existing controlled runtime Save actually rejects beside the raw field"
  );
  await focusIsField();

  const points = [
    { label: "width-minus-one", width: 1099, height: 800, textPercent: 100 },
    { label: "width-boundary", width: 1100, height: 800, textPercent: 100 },
    { label: "width-plus-one", width: 1101, height: 800, textPercent: 100 },
    { label: "narrow-large-text", width: 320, height: 700, textPercent: 200 },
    { label: "short-large-text", width: 340, height: 350, textPercent: 200 },
    { label: "cramped-minus-one", offset: -1 },
    { label: "cramped-boundary", offset: 0 },
    { label: "cramped-plus-one", offset: 1 },
    { label: "restored-wide", width: 1400, height: 900, textPercent: 100 },
  ];
  for (const [index, point] of points.entries()) {
    if (point.label === "cramped-minus-one") {
      const probe = async (height) => {
        const observed = await resize(800, height, 150);
        selection.crampedSearch.probes.push(observed);
        return observed.cramped;
      };
      let low = 350,
        high = 2000;
      assert.equal(
        await probe(low),
        true,
        "lower search endpoint must actually be cramped"
      );
      assert.equal(
        await probe(high),
        false,
        "upper search endpoint must actually be ordinary"
      );
      for (let count = 0; high - low > 1 && count < 12; count++) {
        const middle = Math.floor((low + high) / 2);
        if (await probe(middle)) low = middle;
        else high = middle;
      }
      assert.equal(
        high,
        low + 1,
        "the bounded search must find adjacent actual integer states"
      );
      selection.crampedSearch.lastCrampedHeight = low;
      selection.crampedSearch.firstOrdinaryHeight = high;
    }
    const width = point.width ?? 800;
    const height =
      point.height ?? selection.crampedSearch.lastCrampedHeight + point.offset;
    const textPercent = point.textPercent ?? 150;
    const row = {
      label: point.label,
      width,
      height,
      textPercent,
      passed: false,
    };
    report.cases.push(row);
    row.layout = await resize(width, height, textPercent);
    assert.equal(row.layout.narrow, width <= 1100);
    if (point.offset !== undefined)
      assert.equal(row.layout.cramped, point.offset <= 0);
    assert.ok(
      row.layout.branding.bottom <= row.layout.controls.top + 1,
      "branding remains above Search"
    );
    if (row.layout.cramped)
      assert.ok(
        row.layout.navigation.bottom <= row.layout.main.top + 1,
        "cramped navigation precedes the content"
      );
    assert.ok(row.layout.rootOverflow <= 1, "no horizontal workspace hunting");
    assert.equal(await field.inputValue(), raw);
    assert.equal(await task.getByRole("alert").innerText(), error);
    assert.equal(await search.inputValue(), query);
    await focusIsField();
    const dialog = await task.evaluate((element) => ({
      rect: element.getBoundingClientRect().toJSON(),
      overflow: element.scrollWidth - element.clientWidth,
    }));
    row.task = dialog;
    assert.ok(
      dialog.overflow <= 1 &&
        dialog.rect.left >= -1 &&
        dialog.rect.right <= width + 1,
      "the actual task has no horizontal field/action hunting"
    );
    await reachable(
      task.getByRole("button", { name: "Save Device Name", exact: true }),
      width,
      height
    );
    await reachable(
      task.getByRole("button", { name: "Cancel name edit", exact: true }),
      width,
      height
    );
    await page.screenshot({
      path: join(out, "boundary-" + index + "-" + point.label + ".png"),
    });
    await task
      .getByRole("button", { name: "Close name editor", exact: true })
      .click();
    await task.waitFor({ state: "hidden" });
    const renameHandle = await rename.elementHandle();
    assert.ok(renameHandle, "the accessible Rename trigger must still exist");
    try {
      await page.waitForFunction(
        (element) => document.activeElement === element,
        renameHandle,
        { timeout: 3000 }
      );
    } finally {
      await renameHandle.dispose();
    }
    await nav.getByRole("button", { name: "History", exact: true }).click();
    assert.equal(await search.inputValue(), query);
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if ((await filters.getAttribute("aria-expanded")) !== "true")
      await filters.click();
    assert.equal(
      await page
        .getByRole("group", { name: "History filters" })
        .getByRole("button", { name: "Pinned", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    await page
      .getByText(`No Clips match “${query}” in Pinned.`, { exact: true })
      .waitFor();
    // Only after proving retained query/scope, deliberately clear them for the final real Copy.
    await chooseScope("All");
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    const last = page
      .locator(".history-card")
      .nth(23)
      .getByRole("button", { name: "Copy Clip", exact: true });
    await last.waitFor();
    await reachable(last, width, height);
    const beforeCopy = await page.evaluate(
      () =>
        window.fixtureActions.filter(
          (action) => action.action === "copy" && action.id === "clip-23"
        ).length
    );
    await last.click();
    await page.waitForFunction(
      (count) =>
        window.fixtureActions.filter(
          (action) => action.action === "copy" && action.id === "clip-23"
        ).length ===
        count + 1,
      beforeCopy,
      { timeout: 3000 }
    );
    await chooseScope("Pinned");
    await search.fill(query);
    await nav.getByRole("button", { name: "Devices", exact: true }).click();
    await rename.click();
    await field.waitFor();
    assert.equal(await field.inputValue(), raw);
    assert.equal(await task.getByRole("alert").innerText(), error);
    await focusIsField();
    row.passed = true;
  }
  await task
    .getByRole("button", { name: "Cancel name edit", exact: true })
    .click();
  await task.waitFor({ state: "hidden" });
  await rename.click();
  assert.equal(
    await field.inputValue(),
    "This installation",
    "final Cancel discards the controlled failed draft"
  );
  await task
    .getByRole("button", { name: "Close name editor", exact: true })
    .click();
  selection.finalCancelDiscarded = true;
}
