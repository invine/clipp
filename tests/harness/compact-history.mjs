import assert from "node:assert/strict";

/** Public rendered ClipboardApp actions; no native clipboard or network traffic. */
export async function checkCompactHistory({ page, nav, report, out }) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await nav.getByRole("button", { name: "History", exact: true }).click();
  if (process.argv.includes("--details-dialog-only")) {
    await page.setViewportSize({ width: 375, height: 700 });
    const closeNavigation = page.getByRole("button", {
      name: "Close navigation",
      exact: true,
    });
    if (await closeNavigation.count()) await closeNavigation.click();
    const clip = {
      id: "dialog-fixture",
      content: "A long unbroken value: " + "x".repeat(500),
      type: "text",
      originPeerId: "remote",
      capturedAt: 1,
      shareExpiresAt: Date.now() + 60000,
    };
    await page.evaluate(
      (clip) => window.publishFixture({ clips: [clip] }),
      clip
    );
    const row = page.locator('[data-clip-id="dialog-fixture"]');
    const opener = row.getByRole("button", {
      name: "View Clip details",
      exact: true,
    });
    assert.equal(
      await row.getByRole("button", { name: "Copy Clip", exact: true }).count(),
      1,
      "row Copy remains independently available"
    );
    assert.equal(await page.getByRole("dialog").count(), 0);
    await opener.focus();
    await page.keyboard.press("Enter");
    const details = page.getByRole("dialog", {
      name: "Clip details",
      exact: true,
    });
    await details.waitFor();
    assert.ok(await details.getAttribute("aria-modal"));
    assert.equal(
      await details
        .getByRole("button", {
          name: "Share current clipboard now",
          exact: true,
        })
        .count(),
      1,
      "supported Share Now is presented in details"
    );
    assert.match(
      await details.locator(".clip-details-share .control-hint").textContent(),
      /This Clip is not sent by this action\./,
      "the current clipboard scope is explicit"
    );
    assert.equal(
      await details
        .locator(".clip-details-content")
        .evaluate((element) => element.scrollWidth > element.clientWidth),
      false,
      "long content wraps within the dialog"
    );
    assert.equal(
      await details.locator(".clip-details-actions button").count(),
      4,
      "details actions are independent from the row actions"
    );
    const actionBounds = await details
      .locator(".clip-details-actions")
      .boundingBox();
    assert.ok(
      actionBounds && actionBounds.y + actionBounds.height <= 700,
      "long content leaves the action row reachable in the narrow dialog"
    );
    await page.screenshot({ path: `${out}/clip-details-dialog-narrow.png` });
    await page.keyboard.press("Escape");
    await details.waitFor({ state: "detached" });
    assert.equal(
      await opener.evaluate((element) => document.activeElement === element),
      true,
      "Escape returns focus to the Clip opener"
    );
    assert.equal(
      await page.locator('[data-clip-id="dialog-fixture"]').count(),
      1
    );
    assert.deepEqual(
      await page.evaluate(() =>
        window.fixtureActions.filter((action) =>
          ["copy", "send"].includes(action.action)
        )
      ),
      [],
      "presentation checks do not invoke copy, Share Now, or send callbacks"
    );
    report.cases.push({
      label:
        "details dialog wraps long content, presents scoped Share Now, restores opener focus on Escape, and invokes no Clip actions",
      passed: true,
    });
    return;
  }
  await page.evaluate(() => {
    window.fixtureSession.update({
      search: "",
      filterMode: "all",
      timeFilter: "all",
      sourceFilter: "all",
    });
    window.publishFixture({ clips: [], pinnedIds: [] });
  });
  await page.getByText("No history yet.", { exact: true }).waitFor();
  const shared = "a".repeat(219) + "👩🏽‍💻";
  const full = shared + "\nfirst full ending 🇦🇪 e\u0301 👍🏽";
  await page.evaluate(
    ({ full, shared }) => {
      const clip = (id, content) => ({
        id,
        content,
        type: "text",
        originPeerId: "remote",
        capturedAt: 1,
        shareExpiresAt: Date.now() + 60000,
      });
      window.publishFixture({ clips: [clip("selected", full)] });
    },
    { full, shared }
  );
  const first = page.locator('[data-clip-id="selected"]');
  await first.waitFor();
  const one = await first.boundingBox();
  assert.ok(one.height < 450, "one Clip does not stretch to the viewport");
  assert.equal(
    await first.locator(".history-text").textContent(),
    shared + "…"
  );
  await page.evaluate(
    ({ shared }) => {
      window.publishFixture({
        clips: [
          {
            id: "selected",
            content: shared + "\nfirst full ending 🇦🇪 e\u0301 👍🏽",
            type: "text",
            originPeerId: "remote",
            capturedAt: 1,
            shareExpiresAt: Date.now() + 60000,
          },
          {
            id: "other",
            content: shared + "\nsecond full ending",
            type: "text",
            originPeerId: "remote",
            capturedAt: 2,
            shareExpiresAt: Date.now() + 60000,
          },
        ],
      });
    },
    { shared }
  );
  await page.locator('[data-clip-id="other"]').waitFor();
  const second = page.locator('[data-clip-id="other"]');
  assert.equal(
    await second.locator(".history-text").textContent(),
    shared + "…"
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Delete Clip", exact: true })
      .count(),
    0
  );
  await first.getByRole("button", { name: "Pin Clip", exact: true }).click();
  await first
    .getByRole("button", { name: "Pin Clip", exact: true, pressed: true })
    .waitFor();
  assert.equal(
    await page.getByRole("dialog").count(),
    0,
    "Pin never opens details"
  );
  await first.getByRole("button", { name: "Copy Clip", exact: true }).click();
  assert.equal(
    await page.getByRole("dialog").count(),
    0,
    "Copy never opens details"
  );
  await first
    .getByRole("button", { name: "View Clip details", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("dialog", {
    name: "Clip details",
    exact: true,
  });
  await details.waitFor();
  assert.equal(
    await details.locator(".clip-details-content").textContent(),
    full
  );
  await page.evaluate(() => {
    window.copyOutcome = "unconfirmed";
  });
  await details.getByRole("button", { name: "Copy Clip", exact: true }).click();
  await details.getByText(/The Copy result is unconfirmed/).waitFor();
  assert.ok(
    await details
      .getByRole("button", { name: "Copy Clip", exact: true })
      .isDisabled()
  );
  await details.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.evaluate(() => {
    window.copyOutcome = "copied-without-clip";
  });
  await details.getByRole("button", { name: "Copy Clip", exact: true }).click();
  await details
    .getByText(
      "Copied to clipboard, but Clipp could not save or share a new Clip.",
      { exact: true }
    )
    .waitFor();
  await page.evaluate(() => {
    window.failDelete = true;
  });
  await details
    .getByRole("button", { name: "Delete Clip", exact: true })
    .click();
  await details
    .getByText("Could not delete this Clip. It is still in your history.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await details.locator(".clip-details-content").textContent(),
    full
  );
  await page.evaluate(() => {
    window.failDelete = false;
  });
  await details
    .getByRole("button", { name: "Delete Clip", exact: true })
    .click();
  await details
    .getByText("This Clip is no longer available.", { exact: true })
    .waitFor();
  assert.equal(
    await details.locator(".clip-details-content").count(),
    0,
    "removed target cannot switch to its identical-preview neighbor"
  );
  await details
    .getByRole("button", { name: "Open History", exact: true })
    .click();
  await second.waitFor();
  await second
    .getByRole("button", { name: "View Clip details", exact: true })
    .click();
  await details.waitFor();
  assert.equal(
    await details.locator(".clip-details-content").textContent(),
    shared + "\nsecond full ending"
  );
  await details.getByRole("button", { name: "Pin Clip", exact: true }).click();
  await details
    .getByRole("button", { name: "Pin Clip", exact: true, pressed: true })
    .waitFor();
  await page.evaluate(() => {
    window.removeOnUnpin = true;
  });
  await details.getByRole("button", { name: "Pin Clip", exact: true }).click();
  await details
    .getByText("This Clip is no longer available.", { exact: true })
    .waitFor();
  await details
    .getByRole("button", { name: "Open History", exact: true })
    .click();
  await page.getByText("No history yet.", { exact: true }).waitFor();
  for (const [code, message] of [
    [
      "clipboard_read_failed",
      "Could not read the current clipboard. Keep Clipp open and try again.",
    ],
    ["share_now_failed", "Could not save or share the current clipboard."],
  ]) {
    await page.evaluate((code) => {
      window.sendFailure = code;
    }, code);
    await page
      .getByRole("button", { name: "Share current clipboard now", exact: true })
      .click();
    await page.getByText(message, { exact: true }).first().waitFor();
  }
  await page.evaluate(() => {
    window.copyOutcome = "complete";
    window.sendFailure = undefined;
    window.removeOnUnpin = false;
    for (const key of Object.keys(
      window.fixtureSession.getSnapshot().historyActions
    ))
      window.fixtureSession.dismissHistoryAction(key);
  });
  report.cases.push({
    label:
      "compact History empty/one/identical grapheme previews, keyboard details/full values, direct Copy/Pin association, failed/partial Copy, failed Delete, selected deletion, retention removal and truthful Send failures",
    passed: true,
    oneCard: one,
  });
}
