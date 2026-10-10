import { createPairingSubmission } from "../../packages/ui/src/pairingSubmission";

it("retains failed input and blocks duplicate submission until the actual result", async () => {
  const task = createPairingSubmission();
  task.change("  target text  ");
  let finish!: (result: { ok: false; error: string }) => void;
  let submissions = 0;
  const action = async () => {
    submissions++;
    return new Promise<{ ok: false; error: string }>((resolve) => {
      finish = resolve;
    });
  };
  const sending = task.submit(action);
  await task.submit(action);
  expect(task.getSnapshot().pending).toBe(true);
  finish({ ok: false, error: "transport_policy_rejected" });
  await sending;
  expect(submissions).toBe(1);
  expect(task.getSnapshot()).toMatchObject({
    raw: "  target text  ",
    pending: false,
    result: { ok: false, error: "transport_policy_rejected" },
  });
});

it.each([undefined, { ok: false, error: "outcome_unconfirmed" }])(
  "missing or lost submission response retains editable input",
  async (result) => {
    const task = createPairingSubmission();
    task.change("target");
    await task.submit(async () => result as any);
    expect(task.getSnapshot()).toMatchObject({
      raw: "target",
      pending: false,
      result: { ok: false, error: "outcome_unconfirmed" },
    });
  }
);

it("late successful submission preserves newer typing and reports waiting, not completed Pairing", async () => {
  const task = createPairingSubmission();
  let finish!: (result: { ok: true }) => void;
  task.change("first target");
  const submitting = task.submit(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  task.change("next target");
  finish({ ok: true });
  await submitting;
  expect(task.getSnapshot()).toMatchObject({
    raw: "next target",
    pending: false,
    result: { ok: true },
  });
});
