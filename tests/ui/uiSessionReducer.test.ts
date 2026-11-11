import {
  createInitialUiSessionNavigationState,
  reduceUiSessionNavigation,
} from "../../packages/ui/src/uiSessionReducer";

it("owns task nesting, return focus intent, and notification suspension as pure navigation transitions", () => {
  const start = createInitialUiSessionNavigationState();
  const pairing = reduceUiSessionNavigation(start, {
    type: "open-task",
    task: { kind: "pairing", origin: "pairing-start" },
  });
  const paste = reduceUiSessionNavigation(pairing, {
    type: "open-task",
    task: { kind: "paste", origin: "pairing-paste" },
  });

  expect(paste.tasks).toEqual([
    { kind: "pairing", origin: "pairing-start" },
    { kind: "paste", origin: "pairing-paste" },
  ]);
  expect(paste.focusKey).toBe("pairing-paste");

  const requests = reduceUiSessionNavigation(paste, {
    type: "suspend-for-notification",
    destination: { kind: "requests", entity: "pending-request" },
    context: {
      destination: "devices",
      tasks: paste.tasks,
      focusKey: paste.focusKey,
      showNav: false,
      settingsCategory: undefined,
      taskNotice: null,
    },
    requestAvailable: true,
  });
  expect(requests).toMatchObject({
    destination: "devices",
    tasks: [],
    focusKey: "request:pending-request",
    notificationReturn: {
      destination: "devices",
      tasks: paste.tasks,
      focusKey: "pairing-paste",
    },
  });

  const restored = reduceUiSessionNavigation(requests, {
    type: "return-from-notification",
    context: requests.notificationReturn!,
  });
  expect(restored).toMatchObject({
    destination: "devices",
    tasks: paste.tasks,
    focusKey: "pairing-paste",
    notificationReturn: null,
  });

  const back = reduceUiSessionNavigation(restored, { type: "back-task" });
  expect(back.tasks).toEqual([
    {
      kind: "pairing",
      origin: "pairing-start",
      initialFocusKey: "pairing-paste",
    },
  ]);
  expect(back.focusKey).toBe("pairing-paste");
});

it("declines normal navigation while work owns the current task but permits notification suspension", () => {
  const state = reduceUiSessionNavigation(
    createInitialUiSessionNavigationState(),
    {
      type: "open-task",
      task: { kind: "paste", origin: "pairing-paste" },
    }
  );
  expect(
    reduceUiSessionNavigation(state, {
      type: "select-destination",
      fields: {
        destination: "settings",
        focusKey: "destination:settings",
      },
      canReplace: false,
    })
  ).toBe(state);
});
