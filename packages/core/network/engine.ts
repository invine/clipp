import { createClipboardNode } from "./node";
import { EventBus } from "./events";
import type { ClipboardMessage } from "./types";
import { createTrustManager, MemoryStorageBackend, TrustManager } from "../trust";
import * as log from "../logger";

export interface MessagingLayer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(peerId: string, msg: ClipboardMessage): Promise<void>;
  broadcast(msg: ClipboardMessage): Promise<void>;
  onMessage(cb: (msg: ClipboardMessage) => void): void;
  onPeerConnected(cb: (peerId: string) => void): void;
  onPeerDisconnected(cb: (peerId: string) => void): void;
  getConnectedPeers(): string[];
}

const PROTOCOL = "/clipboard/1.0.0";

class Libp2pMessagingLayer implements MessagingLayer {
  private node: any;
  private readonly trust: TrustManager;
  private readonly messageBus = new EventBus<ClipboardMessage>();
  private readonly connectBus = new EventBus<string>();
  private readonly disconnectBus = new EventBus<string>();
  private started = false;

  constructor(private opts: { peerId?: any; bootstrapList?: string[]; trustStore?: TrustManager } = {}) {
    this.trust = opts.trustStore || createTrustManager(new MemoryStorageBackend());
  }

  async start() {
    if (this.started) return;
    this.node = await createClipboardNode({ peerId: this.opts.peerId, bootstrapList: this.opts.bootstrapList });
    this.node.addEventListener("peer:connect", (evt: any) => {
      const peerId = evt.detail.remotePeer.toString();
      this.connectBus.emit(peerId);
      log.info("Peer connected", peerId);
    });
    this.node.addEventListener("peer:disconnect", (evt: any) => {
      const peerId = evt.detail.remotePeer.toString();
      this.disconnectBus.emit(peerId);
      log.info("Peer disconnected", peerId);
    });
    this.node.handle(PROTOCOL, async ({ stream, connection }: any) => {
      for await (const chunk of stream.source) {
        try {
          const msg: ClipboardMessage = JSON.parse(new TextDecoder().decode(chunk));
          if (await this.trust.isTrusted(msg.from)) {
            this.messageBus.emit(msg);
          }
        } catch {
          // ignore
        }
      }
    });
    await this.node.start();
    this.started = true;
    log.info("Messaging layer started");
  }

  async stop() {
    if (!this.started) return;
    await this.node.stop();
    this.started = false;
    log.info("Messaging layer stopped");
  }

  async sendMessage(peerId: string, msg: ClipboardMessage) {
    log.debug("Sending message to", peerId);
    const conn = await this.node.dialProtocol(peerId, PROTOCOL);
    await conn.sink([new TextEncoder().encode(JSON.stringify(msg))]);
  }

  async broadcast(msg: ClipboardMessage) {
    const peers = this.getConnectedPeers();
    log.debug("Broadcasting message to", peers.length, "peers");
    await Promise.all(peers.map((p) => this.sendMessage(p, msg)));
  }

  onMessage(cb: (msg: ClipboardMessage) => void) {
    this.messageBus.on(cb);
  }
  onPeerConnected(cb: (peerId: string) => void) {
    this.connectBus.on(cb);
  }
  onPeerDisconnected(cb: (peerId: string) => void) {
    this.disconnectBus.on(cb);
  }
  getConnectedPeers(): string[] {
    return this.node.getConnections().map((c: any) => c.remotePeer.toString());
  }
}

export function createMessagingLayer(options?: { peerId?: any; bootstrapList?: string[]; trustStore?: TrustManager }): MessagingLayer {
  return new Libp2pMessagingLayer(options);
}

export { PROTOCOL };
