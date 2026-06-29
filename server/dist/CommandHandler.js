"use strict";
/**
 * CommandHandler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsible for serialising commands into newline-delimited JSON and writing
 * them safely to a client socket.  All socket errors are caught here so that
 * callers never need to handle raw write failures.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCommand = sendCommand;
exports.sendLock = sendLock;
exports.sendUnlock = sendUnlock;
exports.sendPing = sendPing;
const logger_1 = require("./logger");
const log = (0, logger_1.createLogger)("CommandHandler");
/**
 * Build a ServerMessage payload.
 */
function buildPayload(command, reason) {
    const message = {
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
async function sendCommand(socket, command, reason) {
    return new Promise((resolve) => {
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
            }
            else {
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
async function sendLock(socket, reason = "Session expired") {
    log.info("Sending LOCK", { remoteAddress: socket.remoteAddress, reason });
    return sendCommand(socket, "LOCK", reason);
}
/**
 * Send UNLOCK to a specific socket.
 */
async function sendUnlock(socket) {
    log.info("Sending UNLOCK", { remoteAddress: socket.remoteAddress });
    return sendCommand(socket, "UNLOCK");
}
/**
 * Send a PING keep-alive to a socket.
 */
async function sendPing(socket) {
    log.debug("Sending PING", { remoteAddress: socket.remoteAddress });
    return sendCommand(socket, "PING");
}
//# sourceMappingURL=CommandHandler.js.map