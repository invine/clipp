(async () => {
  const cssFile = await fs.readFile("/private/tmp/clipp-ux-fonts.css", "utf8");
  let css = cssFile,
    ix = 0;
  const names = [
    "material-symbols",
    "roboto300",
    "roboto400",
    "roboto500",
    "roboto700",
  ];
  const fonts = [];
  for (const match of [...css.matchAll(/url\((https[^)]+)\)/g)]) {
    const data = await fs.readFile(
      "/private/tmp/clipp-ux-" + names[ix++] + ".ttf"
    );
    fonts.push({
      url: match[1],
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    });
    css = css.replace(
      match[0],
      "url(data:font/ttf;base64," + data.toString("base64") + ")"
    );
  }
  await fs.writeFile(
    path.join(dir, "font-manifest.json"),
    JSON.stringify(fonts, null, 2)
  );
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: css })
  );
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".history-card"));
  await page.evaluate(() => document.fonts.ready);
  out(
    await page.evaluate(() =>
      [...document.fonts].map((f) => ({ family: f.family, status: f.status }))
    )
  );
  await snap("loaded-fonts-default", {
    evidenceClass: "rendered-fixture",
    scenario: "Fonts available comparison",
    limitations: [
      "Public upstream fonts supplied by request interception; app CSS unchanged",
    ],
  });
  await page.getByTitle("Pin", { exact: true }).first().click();
  out({
    pinned: (await page.evaluate(() => window.clipp.getState())).pinnedIds
      .length,
  });
})();
