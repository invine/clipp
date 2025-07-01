/**
 * Main P2PEngine implementation using libp2p for clipboard sync.
 */
import { createPeer } from "./peer";
import { encodeMessage, decodeMessage, PROTOCOL } from "./protocol";
import type { SyncMessage } from "../models/SyncMessage";
import * as log from "../logger";

export interface P2PEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(peerId: string, message: SyncMessage): Promise<void>;
  broadcast(message: SyncMessage): Promise<void>;
  onMessage(handler: (msg: SyncMessage, peerId: string) => void): void;
  getConnectedPeers(): string[];
}

export class Libp2pEngine implements P2PEngine {
  private node: any;
  private handlers: Array<(msg: SyncMessage, peerId: string) => void> = [];
  private started = false;

  async start() {
    if (this.started) return;
    this.node = await createPeer();
    this.node.addEventListener("peer:discovery", (evt: any) => {
      log.debug("Discovered peer", evt.detail.id.toString());
    });
    this.node.addEventListener("peer:connect", (evt: any) => {
      log.info("Connected to peer", evt.detail.remotePeer.toString());
    });
    this.node.handle(PROTOCOL, async ({ stream, connection }: any) => {
      for await (const chunk of stream.source) {
        try {
          const msg = decodeMessage(chunk);
          this.handlers.forEach((fn) =>
            fn(msg, connection.remotePeer.toString())
          );
        } catch (e) {
          log.warn("Failed to decode message", e);
        }
      }
    });
    await this.node.start();
    this.started = true;
    log.info("P2PEngine started");
  }

  async stop() {
    if (!this.started) return;
    await this.node.stop();
    this.started = false;
    log.info("P2PEngine stopped");
  }

  async sendMessage(peerId: string, message: SyncMessage) {
    log.debug("Sending message to", peerId);
    const conn = await this.node.dialProtocol(peerId, PROTOCOL);
    await conn.sink([encodeMessage(message)]);
  }

  async broadcast(message: SyncMessage) {
    const peers = this.getConnectedPeers();
    log.debug("Broadcasting message to", peers.length, "peers");
    await Promise.all(peers.map((pid) => this.sendMessage(pid, message)));
  }

  onMessage(handler: (msg: SyncMessage, peerId: string) => void) {
    this.handlers.push(handler);
  }

  getConnectedPeers(): string[] {
    return this.node.getConnections().map((c: any) => c.remotePeer.toString());
  }
}
