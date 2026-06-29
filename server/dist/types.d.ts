/**
 * types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared type definitions for the Gaming Cafe Management Server.
 */
import * as net from "net";
/** Commands the server sends down to clients. */
export type ServerCommand = "LOCK" | "UNLOCK" | "PING";
/** Message sent from the server to a client socket. */
export interface ServerMessage {
    status: ServerCommand;
    /** ISO timestamp of when the command was issued */
    timestamp: string;
    /** Optional human-readable reason */
    reason?: string;
}
/** Registration message sent by a client upon connection. */
export interface ClientHelloMessage {
    type: "HELLO";
    /** The client's own reported IP (used as fallback) */
    ip: string;
    /** Optional hostname of the client machine */
    hostname?: string;
    /** Client application version */
    version?: string;
    /** Target application to monitor/terminate */
    targetApp?: string;
}
/** Union of all messages the server can receive from a client. */
export type IncomingClientMessage = ClientHelloMessage;
/** Live session state for a connected client. */
export interface ClientSession {
    /** The canonical client identifier (remote IP address) */
    ip: string;
    /** Optional descriptive label for this seat/machine */
    label?: string;
    /** The underlying TCP socket */
    socket: net.Socket;
    /** When the client first connected */
    connectedAt: Date;
    /** The active countdown timer handle, if a session is running */
    timerHandle: NodeJS.Timeout | null;
    /** When the current session expires (null if no active timer) */
    expiresAt: Date | null;
    /** Whether this client is currently in LOCKED state */
    locked: boolean;
    /** Total number of messages received from this client */
    messageCount: number;
    /** Target application to terminate on expiration */
    targetApp?: string;
}
/** Payload emitted when a session timer fires. */
export interface TimerExpiredEvent {
    clientIp: string;
    expiredAt: Date;
}
export interface ServerConfig {
    tcpPort: number;
    httpPort: number;
    logLevel: "debug" | "info" | "warn" | "error";
    pingIntervalMs: number;
    socketTimeoutMs: number;
    allowedIps: string[];
    /** Absolute path to GameCafeClient.exe. Auto-detected if empty. */
    clientExePath: string;
}
//# sourceMappingURL=types.d.ts.map