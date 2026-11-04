import { useEffect, useRef, useState } from "react";
import { saveNonEmptyAlias } from "./nameEditSession";
import type { UiHostEffects } from "./runtimeAdapter";
import { createUiSession } from "./uiSession";
import type { Device, Identity } from "./types";

type Session = ReturnType<typeof createUiSession>;

export type DeviceBehaviorOptions = {
  session: Session;
  identity: Identity | null;
  identityReady: boolean;
  devices: Device[];
  runtimeOwner: object;
  host: UiHostEffects;
  onRenameIdentity?(
    name: string,
    expectedDeviceId: string
  ): Promise<Identity | null>;
  onRenameDevice?(id: string, name: string): Promise<Device | null>;
  onUnpair(id: string): void | Promise<void>;
};

export function useDeviceBehavior({
  session,
  identity,
  identityReady,
  devices,
  runtimeOwner,
  host,
  onRenameIdentity,
  onRenameDevice,
  onUnpair,
}: DeviceBehaviorOptions) {
  const [confirmingIds, setConfirmingIds] = useState<string[]>([]);
  const [revokingIds, setRevokingIds] = useState<string[]>([]);
  const [revocationError, setRevocationError] = useState<{
    deviceId: string;
    identityId: string | undefined;
  } | null>(null);
  const [deviceCopyFeedback, setDeviceCopyFeedback] = useState<string | null>(
    null
  );
  const operations = useRef(
    new Map<
      string,
      {
        token: symbol;
        identityId: string | undefined;
        owner: object;
        confirming: boolean;
      }
    >()
  );
  const alive = useRef(true);
  const ownerRef = useRef(runtimeOwner);
  const identityRef = useRef(identity?.deviceId);
  ownerRef.current = runtimeOwner;
  identityRef.current = identity?.deviceId;
  const copyGeneration = useRef(0);

  useEffect(() => {
    alive.current = true;
    setConfirmingIds([]);
    setRevokingIds([]);
    setRevocationError(null);
    setDeviceCopyFeedback(null);
    return () => {
      alive.current = false;
      copyGeneration.current += 1;
      for (const [id, operation] of operations.current) {
        if (!operation.confirming) session.setActivity(`revoke:${id}`, false);
      }
      operations.current.clear();
    };
  }, [runtimeOwner, session]);

  useEffect(() => {
    const targetId = session.name.getSnapshot().targetId;
    if (!targetId) return;
    if (identity?.deviceId !== targetId) {
      session.name.removeTarget(targetId);
      return;
    }
    session.name.authoritativeValue(targetId, identity.deviceName || "");
  }, [identity, session]);

  useEffect(() => {
    const targetId = session.alias.getSnapshot().targetId;
    if (!targetId) return;
    const device = devices.find((candidate) => candidate.deviceId === targetId);
    if (!device) {
      session.alias.removeTarget(targetId);
      session.update({
        taskNotice:
          "This device was removed. Its alias edit cannot be saved. Return to the device list.",
      });
      session.complete("alias", targetId);
    } else {
      session.alias.authoritativeValue(
        targetId,
        device.localAlias || device.deviceName || ""
      );
    }
    session.alias.retainTargets(devices.map((device) => device.deviceId));
  }, [devices, session]);

  function beginEditLocalName() {
    if (!identityReady || !identity) return;
    session.open({
      kind: "device-name",
      entity: identity.deviceId,
      origin: "rename-local",
    });
    session.name.begin(identity.deviceId, identity.deviceName || "");
  }

  function saveLocalName() {
    const submittedTarget = session.name.getSnapshot().targetId;
    void session.name
      .save(async (targetId, raw) => {
        if (!identity || identity.deviceId !== targetId || !onRenameIdentity) {
          throw new Error("device_unavailable");
        }
        return onRenameIdentity(raw, targetId);
      })
      .then(() => {
        if (!session.name.getSnapshot().targetId)
          session.complete("device-name", submittedTarget ?? undefined);
      });
  }

  function beginEditDeviceName(device: Device) {
    setDeviceCopyFeedback(null);
    session.open({
      kind: "alias",
      entity: device.deviceId,
      origin: `rename:${device.deviceId}`,
    });
    session.alias.begin(
      device.deviceId,
      device.localAlias || device.deviceName || ""
    );
  }

  function saveDeviceName() {
    if (!identityReady) return;
    const submittedTarget = session.alias.getSnapshot().targetId;
    void saveNonEmptyAlias(session.alias, async (targetId, raw) => {
      if (
        !onRenameDevice ||
        !devices.some((candidate) => candidate.deviceId === targetId)
      ) {
        throw new Error("device_unavailable");
      }
      return onRenameDevice(targetId, raw);
    }).then(() => {
      if (!session.alias.getSnapshot().targetId)
        session.complete("alias", submittedTarget ?? undefined);
    });
  }

  function restoreReportedDeviceName() {
    if (!identityReady) return;
    const submittedTarget = session.alias.getSnapshot().targetId;
    void session.alias
      .save(async (targetId) => {
        if (
          !onRenameDevice ||
          !devices.some((candidate) => candidate.deviceId === targetId)
        ) {
          throw new Error("device_unavailable");
        }
        return onRenameDevice(targetId, "");
      })
      .then(() => {
        if (!session.alias.getSnapshot().targetId)
          session.complete("alias", submittedTarget ?? undefined);
      });
  }

  async function copyDeviceValue(label: string, value: string) {
    const expectedOwner = runtimeOwner;
    const expectedIdentity = identity?.deviceId;
    const generation = ++copyGeneration.current;
    try {
      await host.copyText(value);
      if (
        alive.current &&
        ownerRef.current === expectedOwner &&
        identityRef.current === expectedIdentity &&
        generation === copyGeneration.current
      ) {
        setDeviceCopyFeedback(`${label} copied.`);
      }
    } catch {
      if (
        alive.current &&
        ownerRef.current === expectedOwner &&
        identityRef.current === expectedIdentity &&
        generation === copyGeneration.current
      ) {
        setDeviceCopyFeedback(
          `Could not copy ${label.toLowerCase()}. Select and copy it manually.`
        );
      }
    }
  }

  async function revokeDevice(device: Device): Promise<void> {
    const id = device.deviceId;
    if (!identityReady || operations.current.has(id)) return;
    const operation = {
      token: Symbol(id),
      identityId: identity?.deviceId,
      owner: runtimeOwner,
      confirming: true,
    };
    operations.current.set(id, operation);
    setConfirmingIds([...operations.current.keys()]);
    const ownsFeedback = () =>
      alive.current &&
      ownerRef.current === operation.owner &&
      identityRef.current === operation.identityId &&
      operations.current.get(id) === operation;

    try {
      const confirmed = await host.confirm(
        `Permanently revoke ${device.displayName || device.deviceName || id}? This cannot be undone.`
      );
      if (!ownsFeedback() || !confirmed) return;
      operation.confirming = false;
      setConfirmingIds(
        [...operations.current.keys()].filter(
          (key) => operations.current.get(key)?.confirming
        )
      );
      setRevokingIds(
        [...operations.current.keys()].filter(
          (key) => !operations.current.get(key)?.confirming
        )
      );
      setRevocationError(null);
      session.setActivity(`revoke:${id}`, true);
      await onUnpair(id);
      if (ownsFeedback()) setRevocationError(null);
    } catch {
      if (ownsFeedback())
        setRevocationError({ deviceId: id, identityId: operation.identityId });
    } finally {
      if (operations.current.get(id) === operation) {
        operations.current.delete(id);
        if (!operation.confirming) session.setActivity(`revoke:${id}`, false);
        if (alive.current && ownerRef.current === operation.owner) {
          setConfirmingIds(
            [...operations.current.keys()].filter(
              (key) => operations.current.get(key)?.confirming
            )
          );
          setRevokingIds(
            [...operations.current.keys()].filter(
              (key) => !operations.current.get(key)?.confirming
            )
          );
        }
      }
    }
  }

  return {
    confirmingIds,
    revokingIds,
    revocationError,
    deviceCopyFeedback,
    beginEditLocalName,
    saveLocalName,
    beginEditDeviceName,
    saveDeviceName,
    restoreReportedDeviceName,
    copyDeviceValue,
    revokeDevice,
  };
}
