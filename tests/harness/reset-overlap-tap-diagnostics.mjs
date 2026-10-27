import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const javaHome = process.env.JAVA_HOME;
if (!javaHome)
  throw Error(
    "JAVA_HOME is required for the isolated native diagnostic fixture"
  );
const out = mkdtempSync(join(tmpdir(), "clipp-overlap-diagnostics-"));
try {
  execFileSync(
    join(javaHome, "bin", "javac"),
    [
      "-d",
      out,
      "apps/android/android/app/src/androidTest/java/com/clipp/app/ResetOverlapTapDiagnostics.java",
      "apps/android/android/app/src/androidTest/java/com/clipp/app/ResetOverlapBoundedObservation.java",
      "tests/fixtures/ResetOverlapTapDiagnosticsFixture.java",
    ],
    { timeout: 20000, stdio: "inherit" }
  );
  execFileSync(
    join(javaHome, "bin", "java"),
    ["-cp", out, "com.clipp.app.ResetOverlapTapDiagnosticsFixture"],
    { timeout: 20000, stdio: "inherit" }
  );
  console.log("finite redacted tap classifications passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
