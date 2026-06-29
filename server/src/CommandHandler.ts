/**
 * CommandHandler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsible for serialising commands into newline-delimited JSON and writing
 * them safely to a client socket.  All socket errors are caught here so that
 * callers never need to handle raw write failures.
 */

import * as net from "net";
import { ServerCommand, ServerMessage } from "./types";
import { createLogger } from "./logger";

const log = createLogger("CommandHandler");

/**
 * Build a ServerMessage payload.
 */
function buildPayload(command: ServerCommand, reason?: string): Buffer {
  const message: ServerMessage = {
    status: command,
    timestamp: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
  // Newline-delimited JSON — the client splits on '\n'
  return Buffer.from(JSON.stringify(message) + "\n", "utf8");
}

/**
 * Write a payload to a socket, returning a Promise that resolves to true on
 * success or false when the socket is closed / write fails.
 */
export async function sendCommand(
  socket: net.Socket,
  command: ServerCommand,
  reason?: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (socket.destroyed || !socket.writable) {
      log.warn(`Cannot send ${command}: socket is not writable`, {
        remoteAddress: socket.remoteAddress,
      });
      resolve(false);
      return;
    }

    const payload = buildPayload(command, reason);

    socket.write(payload, (err) => {
      if (err) {
        log.error(`Failed to send ${command}`, {
          remoteAddress: socket.remoteAddress,
          error: err.message,
        });
        resolve(false);
      } else {
        log.debug(`Sent ${command}`, {
          remoteAddress: socket.remoteAddress,
          reason,
        });
        resolve(true);
      }
    });
  });
}

/**
 * Send LOCK to a specific socket.
 */
export async function sendLock(
  socket: net.Socket,
  reason = "Session expired",
): Promise<boolean> {
  log.info("Sending LOCK", { remoteAddress: socket.remoteAddress, reason });
  return sendCommand(socket, "LOCK", reason);
}

/**
 * Send UNLOCK to a specific socket.
 */
export async function sendUnlock(socket: net.Socket): Promise<boolean> {
  log.info("Sending UNLOCK", { remoteAddress: socket.remoteAddress });
  return sendCommand(socket, "UNLOCK");
}

/**
 * Send a PING keep-alive to a socket.
 */
export async function sendPing(socket: net.Socket): Promise<boolean> {
  log.debug("Sending PING", { remoteAddress: socket.remoteAddress });
  return sendCommand(socket, "PING");
}
