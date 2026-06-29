/**
 * CommandHandler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsible for serialising commands into newline-delimited JSON and writing
 * them safely to a client socket.  All socket errors are caught here so that
 * callers never need to handle raw write failures.
 */
import * as net from "net";
import { ServerCommand } from "./types";
/**
 * Write a payload to a socket, returning a Promise that resolves to true on
 * success or false when the socket is closed / write fails.
 */
export declare function sendCommand(socket: net.Socket, command: ServerCommand, reason?: string): Promise<boolean>;
/**
 * Send LOCK to a specific socket.
 */
export declare function sendLock(socket: net.Socket, reason?: string): Promise<boolean>;
/**
 * Send UNLOCK to a specific socket.
 */
export declare function sendUnlock(socket: net.Socket): Promise<boolean>;
/**
 * Send a PING keep-alive to a socket.
 */
export declare function sendPing(socket: net.Socket): Promise<boolean>;
//# sourceMappingURL=CommandHandler.d.ts.map