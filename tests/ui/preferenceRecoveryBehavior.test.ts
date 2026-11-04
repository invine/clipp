import { createPreferenceRecoveryBehavior } from "../../packages/ui/src/preferenceRecoveryBehavior";

it("keeps one preference recovery pending and reports a failed attempt", async () => {
  const behavior = createPreferenceRecoveryBehavior();
  let finish!: () => void;
  const first = behavior.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );

  expect(behavior.getSnapshot()).toEqual({ pending: true, error: null });
  expect(await behavior.run(async () => {})).toBe(false);
  finish();
  expect(await first).toBe(true);
  expect(behavior.getSnapshot()).toEqual({ pending: false, error: null });

  expect(
    await behavior.run(async () => Promise.reject(new Error("offline")))
  ).toBe(false);
  expect(behavior.getSnapshot()).toEqual({ pending: false, error: "offline" });
});

it("retires late preference recovery results when the owner is replaced", async () => {
  const behavior = createPreferenceRecoveryBehavior();
  let finish!: () => void;
  const attempt = behavior.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  behavior.retire();
  finish();

  expect(await attempt).toBe(false);
  expect(behavior.getSnapshot()).toEqual({ pending: true, error: null });
});

it("can start a new recovery lifetime after lifecycle replay", async () => {
  const behavior = createPreferenceRecoveryBehavior();
  behavior.retire();
  behavior.start();

  expect(await behavior.run(async () => {})).toBe(true);
  expect(behavior.getSnapshot()).toEqual({ pending: false, error: null });
});
