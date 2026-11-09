import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const error = (code) => Object.assign(new Error(code), { code });

// The root is independent of a delivery run store, so two runs cannot claim
// the same destination merely by choosing different stores.
export function acquireOwnership(
  identity,
  {
    root = path.join(
      os.tmpdir(),
      `clipp-delivery-locks-${process.getuid?.() ?? "user"}`
    ),
    canRecover = () => false,
  } = {}
) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, `${sha(identity)}.json`);
  const token = randomUUID();
  const owner = {
    schema: 1,
    identitySha256: sha(identity),
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, "wx", 0o600);
      try {
        writeFileSync(fd, JSON.stringify(owner));
      } finally {
        closeSync(fd);
      }
      return () => {
        let current;
        try {
          current = JSON.parse(readFileSync(file, "utf8"));
        } catch {
          throw error("ownership_record_invalid");
        }
        if (current.token !== token) throw error("ownership_changed");
        rmSync(file);
      };
    } catch (caught) {
      if (caught.code !== "EEXIST") throw caught;
      let previous;
      try {
        previous = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        throw error("ownership_record_invalid");
      }
      if (
        previous.schema !== 1 ||
        previous.identitySha256 !== sha(identity) ||
        !Number.isInteger(previous.pid)
      )
        throw error("ownership_record_invalid");
      try {
        process.kill(previous.pid, 0);
        throw error("resource_owned");
      } catch (probe) {
        if (probe.code === "resource_owned") throw probe;
        if (probe.code !== "ESRCH") throw error("ownership_uncertain");
      }
      // Destination adapters must inspect the destination before granting this
      // callback. A dead PID or elapsed time alone never authorizes a retry.
      if (!canRecover()) throw error("ownership_uncertain");
      rmSync(file);
    }
  }
  throw error("resource_owned");
}
