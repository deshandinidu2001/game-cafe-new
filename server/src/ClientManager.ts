/**
 * ClientManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central registry for all connected client sockets.
 *
 * Responsibilities:
 *  - Register / deregister client sessions.
 *  - Parse and validate inbound newline-delimited JSON messages.
 *  - Route HELLO messages into session metadata.
 *  - Expose typed accessors for use by the CLI and REST API.
 *  - Enforce an optional IP whitelist.
 */

import * as net from "net";
import { ClientSession, IncomingClientMessage, ServerConfig } from "./types";
import { sendPing } from "./CommandHandler";
import { createLogger } from "./logger";

const log = createLogger("ClientManager");

export class ClientManager {
  /** Canonical registry: clientIp → session */
  private readonly sessions = new Map<string, ClientSession>();

  /** Keep-alive ping interval handle */
  private pingIntervalHandle: NodeJS.Timeout | null = null;

  constructor(private readonly config: Readonly<ServerConfig>) {}

  // ─── Registration ──────────────────────────────────────────────────────────

  /**
   * Called when a new TCP connection is accepted.
   * Returns false if the connection was rejected (e.g. IP whitelist).
   */
  public registerSocket(socket: net.Socket): boolean {
    const ip = this.resolveIp(socket);

    if (!this.isIpAllowed(ip)) {
      log.warn(`Rejected connection from disallowed IP`, { ip });
      socket.destroy();
      return false;
    }

    if (this.sessions.has(ip)) {
      log.warn(`Duplicate connection from ${ip} — closing old socket`);
      this.removeSession(ip);
    }

    const session: ClientSession = {
      ip,
      socket,
      connectedAt:  new Date(),
      timerHandle:  null,
      expiresAt:    null,
      locked:       false,
      messageCount: 0,
      runningApps:  [],
    };

    this.sessions.set(ip, session);
    this.attachSocketHandlers(session);

    log.info(`Client connected`, {
      ip,
      totalConnected: this.sessions.size,
    });

    return true;
  }

  // ─── Socket Event Handlers ─────────────────────────────────────────────────

  private attachSocketHandlers(session: ClientSession): void {
    const { socket, ip } = session;

    // Set read/write timeouts to detect silent disconnects
    socket.setTimeout(this.config.socketTimeoutMs);

    // Accumulate data across multiple TCP packets (newline-framed protocol)
    let buffer = "";

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // Process all complete lines
      const lines = buffer.split("\n");
      // Last element may be an incomplete line — keep it in the buffer
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          this.handleIncomingLine(session, trimmed);
        }
      }
    });

    socket.on("timeout", () => {
      log.warn(`Socket timed out (no data for ${this.config.socketTimeoutMs}ms)`, { ip });
      socket.destroy(new Error("Socket timeout"));
    });

    socket.on("error", (err: Error) => {
      // ECONNRESET / EPIPE are expected when a client crashes — log at warn
      const code = (err as NodeJS.ErrnoException).code ?? "";
      const level = ["ECONNRESET", "EPIPE", "ENOTCONN"].includes(code) ? "warn" : "error";
      log[level](`Socket error`, { ip, code, message: err.message });
    });

    socket.on("close", (hadError: boolean) => {
      log.info(`Client disconnected`, { ip, hadError });
      this.removeSession(ip);
    });
  }

  /**
   * Parse a single newline-terminated JSON line from a client.
   */
  private handleIncomingLine(session: ClientSession, line: string): void {
    session.messageCount++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      log.warn(`Malformed JSON from client`, { ip: session.ip, line });
      return;
    }

    // Basic structural validation
    if (typeof parsed !== "object" || parsed === null) {
      log.warn(`Non-object JSON from client`, { ip: session.ip });
      return;
    }

    const msg = parsed as Partial<IncomingClientMessage>;

    if (msg.type === "HELLO") {
      if (msg.hostname) session.label = msg.hostname;
      if (msg.targetApp) session.targetApp = msg.targetApp;
      log.info(`HELLO received`, {
        ip: session.ip,
        hostname: msg.hostname,
        version: msg.version,
        targetApp: msg.targetApp,
      });
    } else if (msg.type === "APPS_LIST") {
      session.runningApps = msg.apps || [];
      // log.debug(`APPS_LIST received`, { ip: session.ip, count: session.runningApps.length });
    } else {
      log.debug(`Unknown message type`, { ip: session.ip, type: (msg as any).type });
    }
  }

  // ─── Session Management ────────────────────────────────────────────────────

  private removeSession(ip: string): void {
    const session = this.sessions.get(ip);
    if (!session) return;

    // Ensure socket is closed
    if (!session.socket.destroyed) {
      session.socket.destroy();
    }

    // Cancel any pending timer
    if (session.timerHandle) {
      clearTimeout(session.timerHandle);
      session.timerHandle = null;
    }

    this.sessions.delete(ip);
    log.debug(`Session removed`, { ip, remaining: this.sessions.size });
  }

  // ─── Public Accessors ──────────────────────────────────────────────────────

  public get(ip: string): ClientSession | undefined {
    return this.sessions.get(ip);
  }

  public has(ip: string): boolean {
    return this.sessions.has(ip);
  }

  public all(): ReadonlyMap<string, ClientSession> {
    return this.sessions;
  }

  public count(): number {
    return this.sessions.size;
  }

  public updateLockState(ip: string, locked: boolean): void {
    const session = this.sessions.get(ip);
    if (session) session.locked = locked;
  }

  // ─── Keep-alive Pings ─────────────────────────────────────────────────────

  /**
   * Start sending PING to all connected clients on an interval.
   * Call once at server startup.
   */
  public startPingInterval(): void {
    if (this.pingIntervalHandle) return; // already running

    this.pingIntervalHandle = setInterval(async () => {
      const promises: Promise<boolean>[] = [];
      for (const session of this.sessions.values()) {
        promises.push(sendPing(session.socket));
      }
      await Promise.allSettled(promises);
    }, this.config.pingIntervalMs);

    // Don't prevent process exit
    if (this.pingIntervalHandle.unref) this.pingIntervalHandle.unref();

    log.info(`Ping interval started`, { intervalMs: this.config.pingIntervalMs });
  }

  public stopPingInterval(): void {
    if (this.pingIntervalHandle) {
      clearInterval(this.pingIntervalHandle);
      this.pingIntervalHandle = null;
    }
  }

  // ─── Graceful Shutdown ─────────────────────────────────────────────────────

  public destroyAll(): void {
    log.info(`Destroying all ${this.sessions.size} active connections`);
    this.stopPingInterval();
    for (const ip of [...this.sessions.keys()]) {
      this.removeSession(ip);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private resolveIp(socket: net.Socket): string {
    return socket.remoteAddress?.replace("::ffff:", "") ?? "unknown";
  }

  private isIpAllowed(ip: string): boolean {
    if (this.config.allowedIps.length === 0) return true; // no whitelist
    return this.config.allowedIps.includes(ip);
  }
}
