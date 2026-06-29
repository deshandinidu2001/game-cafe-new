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
import { ClientSession, ServerConfig } from "./types";
export declare class ClientManager {
    private readonly config;
    /** Canonical registry: clientIp → session */
    private readonly sessions;
    /** Keep-alive ping interval handle */
    private pingIntervalHandle;
    constructor(config: Readonly<ServerConfig>);
    /**
     * Called when a new TCP connection is accepted.
     * Returns false if the connection was rejected (e.g. IP whitelist).
     */
    registerSocket(socket: net.Socket): boolean;
    private attachSocketHandlers;
    /**
     * Parse a single newline-terminated JSON line from a client.
     */
    private handleIncomingLine;
    private removeSession;
    get(ip: string): ClientSession | undefined;
    has(ip: string): boolean;
    all(): ReadonlyMap<string, ClientSession>;
    count(): number;
    updateLockState(ip: string, locked: boolean): void;
    /**
     * Start sending PING to all connected clients on an interval.
     * Call once at server startup.
     */
    startPingInterval(): void;
    stopPingInterval(): void;
    destroyAll(): void;
    private resolveIp;
    private isIpAllowed;
}
//# sourceMappingURL=ClientManager.d.ts.map