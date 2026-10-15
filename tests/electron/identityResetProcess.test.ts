import { buildSync } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

it.each([
  "intent",
  "cleanup",
  "candidate",
  "receipt",
  "guard",
  "sanitization",
  "cleanup-transaction",
  "candidate-transaction",
])(
  "SQLite recovers one accepted reset after SIGKILL at %s, including lost replies",
  async (phase) => {
    const directory = mkdtempSync(join(tmpdir(), "clipp-reset-process-"));
    const fixture = join(directory, "reset.cjs");
    buildSync({
      entryPoints: [resolve("tests/fixtures/identityResetProcess.ts")],
      outfile: fixture,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      external: ["better-sqlite3"],
    });
    const environment = { ...process.env, NODE_PATH: resolve("node_modules") };
    const database = join(directory, "reset.sqlite");
    const child = spawn(process.execPath, [fixture, "begin", database, phase], {
      stdio: ["ignore", "pipe", "pipe"],
      env: environment,
    });
    const children = [child];
    const timeout = setTimeout(() => {
      for (const owned of children) owned.kill("SIGKILL");
    }, 15_000);
    let error = "";
    child.stderr.on("data", (data) => {
      error += data;
    });
    try {
      const checkpoint = await new Promise<any>((accept, reject) => {
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
          if (output.includes("\n")) accept(JSON.parse(output.split("\n")[0]));
        });
        child.on("error", reject);
        child.on("exit", (code) =>
          reject(new Error(`fixture exited ${code}: ${error}`))
        );
      });
      expect(checkpoint.phase).toBe(phase);
      const exited = new Promise((accept) =>
        child.once("exit", (code, signal) => accept({ code, signal }))
      );
      child.kill("SIGKILL");
      expect(await exited).toEqual({ code: null, signal: "SIGKILL" });
      const recovered = spawn(
        process.execPath,
        [fixture, "recover", database, checkpoint.candidatePeerId, phase],
        { stdio: ["ignore", "pipe", "pipe"], env: environment }
      );
      children.push(recovered);
      const output = await new Promise<string>((accept, reject) => {
        let text = "";
        let failure = "";
        recovered.stdout.on("data", (data) => {
          text += data;
        });
        recovered.stderr.on("data", (data) => {
          failure += data;
        });
        recovered.on("error", reject);
        recovered.on("exit", (code) =>
          code === 0 ? accept(text) : reject(new Error(failure))
        );
      });
      expect(JSON.parse(output)).toMatchObject({
        outcome: "completed",
        candidatePeerId: checkpoint.candidatePeerId,
        replay: "completed",
        dismissedReplay: "completed",
      });
    } finally {
      clearTimeout(timeout);
      for (const owned of children) {
        if (owned.exitCode === null && owned.signalCode === null) {
          const stopped = new Promise((accept) => owned.once("exit", accept));
          owned.kill("SIGKILL");
          await stopped;
        }
      }
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30_000
);
