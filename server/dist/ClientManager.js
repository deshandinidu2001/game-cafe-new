"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientManager = void 0;
const CommandHandler_1 = require("./CommandHandler");
const logger_1 = require("./logger");
const log = (0, logger_1.createLogger)("ClientManager");
class ClientManager {
    config;
    /** Canonical registry: clientIp → session */
    sessions = new Map();
    /** Keep-alive ping interval handle */
    pingIntervalHandle = null;
    constructor(config) {
        this.config = config;
    }
    // ─── Registration ──────────────────────────────────────────────────────────
    /**
     * Called when a new TCP connection is accepted.
     * Returns false if the connection was rejected (e.g. IP whitelist).
     */
    registerSocket(socket) {
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
        const session = {
            ip,
            socket,
            connectedAt: new Date(),
            timerHandle: null,
            expiresAt: null,
            locked: false,
            messageCount: 0,
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
    attachSocketHandlers(session) {
        const { socket, ip } = session;
        // Set read/write timeouts to detect silent disconnects
        socket.setTimeout(this.config.socketTimeoutMs);
        // Accumulate data across multiple TCP packets (newline-framed protocol)
        let buffer = "";
        socket.on("data", (chunk) => {
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
        socket.on("error", (err) => {
            // ECONNRESET / EPIPE are expected when a client crashes — log at warn
            const code = err.code ?? "";
            const level = ["ECONNRESET", "EPIPE", "ENOTCONN"].includes(code) ? "warn" : "error";
            log[level](`Socket error`, { ip, code, message: err.message });
        });
        socket.on("close", (hadError) => {
            log.info(`Client disconnected`, { ip, hadError });
            this.removeSession(ip);
        });
    }
    /**
     * Parse a single newline-terminated JSON line from a client.
     */
    handleIncomingLine(session, line) {
        session.messageCount++;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            log.warn(`Malformed JSON from client`, { ip: session.ip, line });
            return;
        }
        // Basic structural validation
        if (typeof parsed !== "object" || parsed === null) {
            log.warn(`Non-object JSON from client`, { ip: session.ip });
            return;
        }
        const msg = parsed;
        if (msg.type === "HELLO") {
            if (msg.hostname)
                session.label = msg.hostname;
            if (msg.targetApp)
                session.targetApp = msg.targetApp;
            log.info(`HELLO received`, {
                ip: session.ip,
                hostname: msg.hostname,
                version: msg.version,
                targetApp: msg.targetApp,
            });
        }
        else {
            log.debug(`Unknown message type`, { ip: session.ip, type: msg.type });
        }
    }
    // ─── Session Management ────────────────────────────────────────────────────
    removeSession(ip) {
        const session = this.sessions.get(ip);
        if (!session)
            return;
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
    get(ip) {
        return this.sessions.get(ip);
    }
    has(ip) {
        return this.sessions.has(ip);
    }
    all() {
        return this.sessions;
    }
    count() {
        return this.sessions.size;
    }
    updateLockState(ip, locked) {
        const session = this.sessions.get(ip);
        if (session)
            session.locked = locked;
    }
    // ─── Keep-alive Pings ─────────────────────────────────────────────────────
    /**
     * Start sending PING to all connected clients on an interval.
     * Call once at server startup.
     */
    startPingInterval() {
        if (this.pingIntervalHandle)
            return; // already running
        this.pingIntervalHandle = setInterval(async () => {
            const promises = [];
            for (const session of this.sessions.values()) {
                promises.push((0, CommandHandler_1.sendPing)(session.socket));
            }
            await Promise.allSettled(promises);
        }, this.config.pingIntervalMs);
        // Don't prevent process exit
        if (this.pingIntervalHandle.unref)
            this.pingIntervalHandle.unref();
        log.info(`Ping interval started`, { intervalMs: this.config.pingIntervalMs });
    }
    stopPingInterval() {
        if (this.pingIntervalHandle) {
            clearInterval(this.pingIntervalHandle);
            this.pingIntervalHandle = null;
        }
    }
    // ─── Graceful Shutdown ─────────────────────────────────────────────────────
    destroyAll() {
        log.info(`Destroying all ${this.sessions.size} active connections`);
        this.stopPingInterval();
        for (const ip of [...this.sessions.keys()]) {
            this.removeSession(ip);
        }
    }
    // ─── Helpers ───────────────────────────────────────────────────────────────
    resolveIp(socket) {
        return socket.remoteAddress?.replace("::ffff:", "") ?? "unknown";
    }
    isIpAllowed(ip) {
        if (this.config.allowedIps.length === 0)
            return true; // no whitelist
        return this.config.allowedIps.includes(ip);
    }
}
exports.ClientManager = ClientManager;
//# sourceMappingURL=ClientManager.js.map