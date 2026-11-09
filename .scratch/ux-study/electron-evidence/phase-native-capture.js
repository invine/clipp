(async () => {
  snap = async function (id, details = {}) {
    await sleep(200);
    const capture = await electron.evaluate(async ({ BrowserWindow }) => {
      const img =
        await BrowserWindow.getAllWindows()[0].webContents.capturePage();
      return { size: img.getSize(), png: img.toPNG().toString("base64") };
    });
    await fs.writeFile(
      path.join(dir, id + ".png"),
      Buffer.from(capture.png, "base64")
    );
    const record = {
      evidenceId: id,
      timestampUtc: new Date().toISOString(),
      ...details,
      captureMethod: "Electron.webContents.capturePage",
      captureSize: capture.size,
      geometry: await geometry(),
      screenshot: id + ".png",
    };
    await fs.appendFile(
      path.join(dir, "observations.jsonl"),
      JSON.stringify(record) + "\n"
    );
    out(record);
    return record;
  };
  await inject(data.typical);
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  );
  await size(640, 728);
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2)
  );
  await sleep(400);
  await snap("native-capture-reflow-320", {
    evidenceClass: "rendered-fixture",
    scenario: "320 CSS px native capture at zoom 2",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  );
  await size(480, 608);
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2)
  );
  await sleep(400);
  await snap("native-capture-minimum-zoom2", {
    evidenceClass: "rendered-fixture",
    scenario: "Minimum window at zoom 2",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  );
  await size(520, 728);
})();
