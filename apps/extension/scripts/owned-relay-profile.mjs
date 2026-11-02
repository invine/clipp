/** Ownership metadata only. Never reads, hashes or copies browser account/profile data. */
import assert from "node:assert/strict";
import { constants } from "node:fs";
import {
  mkdir,
  lstat,
  realpath,
  open,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join, resolve, relative, sep, isAbsolute } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { nativeAcceptanceStateRoot } from "../../../scripts/native-acceptance-attempts.mjs";
import { raceAcceptanceOperation } from "./clipboard-acceptance.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
async function privateMetadata(file) {
  const before = await lstat(file);
  assert(
    before.isFile() && !before.isSymbolicLink(),
    "owned_profile_private_metadata_required"
  );
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const stat = await handle.stat();
    assert(
      stat.isFile() &&
        stat.ino === before.ino &&
        stat.dev === before.dev &&
        stat.size <= 16384 &&
        (stat.mode & 0o077) === 0 &&
        (!process.getuid || stat.uid === process.getuid()),
      "owned_profile_private_metadata_required"
    );
    const buffer = Buffer.alloc(16385),
      { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    assert(bytesRead <= 16384, "owned_profile_private_metadata_required");
    try {
      return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
    } catch {
      throw new Error("owned_profile_metadata_invalid");
    }
  } finally {
    await handle.close();
  }
}
async function save(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
function inside(parent, child) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
}

export async function acquireOwnedRelayProfile(
  options,
  { preparation, verificationOnly = false, verifyClosed }
) {
  return raceAcceptanceOperation(
    async () => {
      assert(
        !verificationOnly || preparation,
        "verification_only_preparation_required"
      );
      assert(
        options["profile-root"] && options["profile-record"],
        "owned_relay_profile_preparation_required"
      );
      await mkdir(nativeAcceptanceStateRoot(), {
        recursive: true,
        mode: 0o700,
      });
      const stateRoot = await realpath(nativeAcceptanceStateRoot());
      const allowed = join(stateRoot, "owned-chrome-profiles");
      assert(
        !inside(
          resolve(fileURLToPath(new URL("../../..", import.meta.url))),
          allowed
        ),
        "owned_profile_outside_checkout_required"
      );
      const ordinary =
        platform() === "darwin"
          ? [
              join(homedir(), "Library/Application Support/Google"),
              join(homedir(), "Library/Application Support/Chromium"),
            ]
          : platform() === "win32"
            ? [
                join(homedir(), "AppData/Local/Google"),
                join(homedir(), "AppData/Local/Chromium"),
              ]
            : [
                join(homedir(), ".config/google-chrome"),
                join(homedir(), ".config/chromium"),
              ];
      for (const path of ordinary) {
        const canonical = await realpath(path).catch((error) => {
          if (error.code === "ENOENT") return resolve(path);
          throw error;
        });
        assert(
          !inside(canonical, allowed),
          "ordinary_browser_profile_forbidden"
        );
      }
      assert(
        options["profile-root"] === allowed &&
          dirname(options["profile-record"]) === allowed &&
          /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}\.json$/.test(
            options["profile-record"].split(sep).at(-1)
          ),
        "owned_profile_allowed_root_required"
      );
      await mkdir(allowed, { recursive: true, mode: 0o700 });
      const rootStat = await lstat(allowed);
      assert(
        rootStat.isDirectory() &&
          !rootStat.isSymbolicLink() &&
          (await realpath(allowed)) === allowed &&
          (rootStat.mode & 0o077) === 0,
        "owned_profile_allowed_root_required"
      );
      const recordPath = options["profile-record"],
        lockPath = recordPath + ".lock";
      let record;
      try {
        record = await privateMetadata(recordPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        assert(
          preparation && !verificationOnly,
          "owned_relay_profile_preparation_required"
        );
      }
      if (record) {
        if (verificationOnly)
          assert(
            ["closed-unprepared", "prepared"].includes(record.status) &&
              record.binding &&
              record.lastTarget &&
              record.historyRoot === (await realpath(options["history-root"])),
            "owned_profile_verification_continuation_required"
          );
        assert(
          record.version === 1 &&
            record.kind === "clipp-owned-relay-profile" &&
            /^[a-f0-9-]{36}$/.test(record.nonce) &&
            record.root === allowed &&
            record.profile === join(allowed, `profile-${record.nonce}`) &&
            record.registeredExtensionId ===
              options["registered-extension-id"] &&
            record.discovery === options.discovery,
          "owned_profile_record_mismatch"
        );
        const stat = await lstat(record.profile);
        assert(
          stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            (await realpath(record.profile)) === record.profile &&
            (stat.mode & 0o077) === 0,
          "owned_profile_alias_forbidden"
        );
        const marker = await privateMetadata(
          join(record.profile, ".clipp-owned-relay-profile.json")
        );
        assert(
          marker.nonce === record.nonce && marker.record === recordPath,
          "owned_profile_marker_mismatch"
        );
        if (record.lastTarget)
          assert(
            (await verifyClosed(record.lastTarget, Date.now() + 2000)) === true,
            "owned_profile_previous_process_unconfirmed"
          );
        else
          assert(
            record.status === "closed-unprepared",
            "owned_profile_previous_process_unconfirmed"
          );
        try {
          await lstat(join(record.profile, "SingletonLock"));
          throw new Error("owned_profile_chrome_lock_present");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (!preparation) {
          const historyRoot = await realpath(options["history-root"]);
          assert(
            record.historyRoot === historyRoot &&
              /^[a-f0-9]{64}[/\\]budget-[0-9]+[/\\]attempt-[0-9]+[/\\]receipt\.json$/.test(
                relative(historyRoot, record.preparationReceipt ?? "")
              ) &&
              record.preparationProof ===
                join(
                  dirname(record.preparationReceipt),
                  "profile-preparation.json"
                ),
            "owned_profile_preparation_proof_invalid"
          );
          assert(
            record.status === "prepared" &&
              record.preparationProof &&
              record.preparationReceipt,
            "owned_relay_profile_preparation_required"
          );
          const proof = await privateMetadata(record.preparationProof);
          const receipt = await privateMetadata(record.preparationReceipt);
          assert(
            digest(JSON.stringify(proof)) === record.preparationProofSha256 &&
              proof.profile === record.profile &&
              proof.publicDeviceId === record.publicDeviceId &&
              JSON.stringify(proof.binding) ===
                JSON.stringify(record.binding) &&
              proof.ready === true &&
              receipt.result === "passed" &&
              receipt.shutdown === "verified-owned-browser-closed" &&
              receipt.accountPreparation?.prepared === true &&
              receipt.accountPreparation.profileRecord === recordPath &&
              receipt.profileRetained === true &&
              receipt.candidate?.revision === proof.binding.sourceRevision &&
              receipt.candidate?.extensionSha256 ===
                proof.binding.bundleSha256 &&
              receipt.extension?.id === record.registeredExtensionId,
            "owned_profile_preparation_proof_invalid"
          );
        }
      }
      let lock;
      try {
        lock = await open(lockPath, "wx", 0o600);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        throw new Error("owned_profile_lock_active_or_uncertain");
      }
      let active = false,
        released = false;
      try {
        if (!record) {
          const nonce = randomUUID(),
            profile = join(allowed, `profile-${nonce}`);
          await mkdir(profile, { mode: 0o700 });
          record = {
            version: 1,
            kind: "clipp-owned-relay-profile",
            nonce,
            root: allowed,
            profile,
            status: "closed-unprepared",
            registeredExtensionId: options["registered-extension-id"],
            discovery: options.discovery,
            historyRoot: await realpath(options["history-root"]),
          };
          await writeFile(
            join(profile, ".clipp-owned-relay-profile.json"),
            JSON.stringify({ nonce, record: recordPath }),
            { flag: "wx", mode: 0o600 }
          );
          await save(recordPath, record);
        }
        await lock.writeFile(
          JSON.stringify({ pid: process.pid, nonce: record.nonce })
        );
      } catch (error) {
        await lock.close();
        await unlink(lockPath);
        throw error;
      }
      return {
        profile: record.profile,
        get publicDeviceId() {
          return record.publicDeviceId;
        },
        async bind(binding) {
          if (record.binding)
            assert(
              JSON.stringify(record.binding) === JSON.stringify(binding) &&
                (!record.lastTarget ||
                  record.startupIsolationVerified === true ||
                  verificationOnly),
              "owned_profile_candidate_binding_changed"
            );
          else record.binding = binding;
        },
        async prepareLaunch() {
          assert(
            (await realpath(record.profile)) === record.profile &&
              !(await lstat(record.profile)).isSymbolicLink(),
            "owned_profile_alias_forbidden"
          );
          try {
            await lstat(join(record.profile, "SingletonLock"));
            throw new Error("owned_profile_chrome_lock_present");
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          // This is owned debugger-endpoint metadata, not account/profile data.
          // A closed browser can leave it behind; never attach to its stale port.
          const endpoint = join(record.profile, "DevToolsActivePort");
          try {
            const stat = await lstat(endpoint);
            assert(
              stat.isFile() && !stat.isSymbolicLink(),
              "owned_profile_debugger_metadata_invalid"
            );
            await unlink(endpoint);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        },
        async confirmStartupIsolation() {
          record.startupIsolationVerified = true;
          await save(recordPath, record);
        },
        async recordTarget(target) {
          active = true;
          record.status = "active";
          record.lastTarget = target;
          await save(recordPath, record);
        },
        async closed({ observation, receiptPath, proofPath }) {
          if (observation) {
            assert(
              !record.publicDeviceId ||
                record.publicDeviceId === observation.publicDeviceId,
              "owned_profile_identity_changed"
            );
            const proof = {
              version: 1,
              profile: record.profile,
              publicDeviceId: observation.publicDeviceId,
              ready: true,
              binding: record.binding,
              preparedAt: new Date().toISOString(),
              qualification: "account-preparation-only",
            };
            await writeFile(proofPath, JSON.stringify(proof), {
              flag: "wx",
              mode: 0o600,
            });
            Object.assign(record, {
              publicDeviceId: observation.publicDeviceId,
              preparationProof: proofPath,
              preparationProofSha256: digest(JSON.stringify(proof)),
              preparationReceipt: receiptPath,
            });
          }
          record.status = record.preparationProof
            ? "prepared"
            : "closed-unprepared";
          await save(recordPath, record);
          await lock.close();
          await unlink(lockPath);
          released = true;
        },
        async uncertain() {
          record.status = "uncertain";
          await save(recordPath, record);
          await lock.close();
        },
        async releaseUnlaunched() {
          if (!active && !released) {
            await lock.close();
            await unlink(lockPath);
            released = true;
          }
        },
      };
    },
    15000,
    "owned_relay_profile_admission"
  );
}
