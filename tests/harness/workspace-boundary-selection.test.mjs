import assert from "node:assert/strict";
import { test } from "node:test";
import { exactBoundariesSelected } from "./workspace-boundary-selection.mjs";

test("the focused public CLI selects exact boundaries without requesting the full matrix", () => {
  assert.equal(
    exactBoundariesSelected([
      "/owned/output",
      "--host=electron",
      "--exact-boundaries",
    ]),
    true
  );
  assert.equal(exactBoundariesSelected(["/owned/output", "--matrix"]), false);
});

test("a focused invocation refuses the full matrix, another journey or a duplicate selector", () => {
  for (const argument of [
    "--matrix",
    "--name-task",
    "--geometry",
    "--exact-boundaries",
  ])
    assert.throws(
      () =>
        exactBoundariesSelected([
          "/owned/output",
          "--exact-boundaries",
          argument,
        ]),
      /exact-boundaries must be selected alone/
    );
});

test("focused source/host selection stays unambiguous and does not alter ordinary flags", () => {
  assert.equal(
    exactBoundariesSelected([
      "/owned/output",
      "--exact-boundaries",
      "--host=android",
      "--source-root=/owned/candidate",
    ]),
    true
  );
  for (const arguments_ of [
    ["--host=electron", "--host=chrome"],
    ["--source-root=/owned/one", "--source-root=/owned/two"],
  ])
    assert.throws(
      () =>
        exactBoundariesSelected([
          "/owned/output",
          "--exact-boundaries",
          ...arguments_,
        ]),
      /exact-boundaries must be selected alone/
    );
  assert.equal(
    exactBoundariesSelected(["/owned/output", "--name-task", "--task-bounds"]),
    false
  );
});
