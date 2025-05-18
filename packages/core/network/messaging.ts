/**
 * MessagingLayer implementation for clipboard sync over libp2p.
 */
import { createClipboardNode } from "./node";
import { EventBus } from "./events";
import type { ClipboardMessage } from "./types";
import type { Clip } from "../models/Clip";
import { InMemoryDeviceTrustStore } from "../auth/trustStore";

const PROTOCOL = "/clipboard/1.0.0";

export interface MessagingLayer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendClip(toPeerId: string, clip: Clip): Promise<void>;
  onMessage(handler: (msg: ClipboardMessage) => void): void;
  onPeerConnected(handler: (peerId: string) => void): void;
  onPeerDisconnected(handler: (peerId: string) => void): void;
  getConnectedPeers(): string[];
  getNode(): any;
}

export class ClipboardMessagingLayer implements MessagingLayer {
  private node: any;
  private trust = new InMemoryDeviceTrustStore();
  private messageBus = new EventBus<ClipboardMessage>();
  private connectBus = new EventBus<string>();
  private disconnectBus = new EventBus<string>();
  private started = false;

  async start() {
    if (this.started) return;
    this.node = await createClipboardNode();
    this.node.addEventListener("peer:connect", (evt: any) => {
      const peerId = evt.detail.remotePeer.toString();
      this.connectBus.emit(peerId);
    });
    this.node.addEventListener("peer:disconnect", (evt: any) => {
      const peerId = evt.detail.remotePeer.toString();
      this.disconnectBus.emit(peerId);
    });
    this.node.handle(PROTOCOL, async ({ stream, connection }: any) => {
      for await (const chunk of stream.source) {
        try {
          const msg: ClipboardMessage = JSON.parse(
            new TextDecoder().decode(chunk)
          );
          // Trust check
          if (await this.trust.isTrusted(msg.from)) {
            this.messageBus.emit(msg);
          }
        } catch (e) {
          // Ignore malformed or untrusted
        }
      }
    });
    await this.node.start();
    this.started = true;
  }

  async stop() {
    if (!this.started) return;
    await this.node.stop();
    this.started = false;
  }

  async sendClip(toPeerId: string, clip: Clip) {
    const msg: ClipboardMessage = {
      type: "CLIP",
      from: this.node.peerId.toString(),
      clip,
      sentAt: Date.now(),
    };
    const conn = await this.node.dialProtocol(toPeerId, PROTOCOL);
    await conn.sink([new TextEncoder().encode(JSON.stringify(msg))]);
  }

  onMessage(handler: (msg: ClipboardMessage) => void) {
    this.messageBus.on(handler);
  }
  onPeerConnected(handler: (peerId: string) => void) {
    this.connectBus.on(handler);
  }
  onPeerDisconnected(handler: (peerId: string) => void) {
    this.disconnectBus.on(handler);
  }
  getConnectedPeers(): string[] {
    return this.node.getConnections().map((c: any) => c.remotePeer.toString());
  }
  getNode() {
    return this.node;
  }
}
