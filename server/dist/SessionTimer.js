"use strict";
/**
 * SessionTimer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages per-client countdown timers. When a timer expires the provided
 * callback is invoked (typically: send LOCK to that client).
 *
 * Design:
 *  - Each client has at most ONE active timer at a time.
 *  - Starting a new timer for a client that already has one replaces it.
 *  - All handles are stored in a Map keyed by client IP.
 *  - The module emits structured log output for auditing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionTimerManager = void 0;
const logger_1 = require("./logger");
const log = (0, logger_1.createLogger)("SessionTimer");
class SessionTimerManager {
    /** Map of clientIp → active timer entry */
    timers = new Map();
    /**
     * Start (or replace) a countdown timer for the given client.
     *
     * @param clientIp      - Unique client identifier (their IP address).
     * @param durationMs    - How long in milliseconds until the session expires.
     * @param onExpired     - Async callback invoked when the timer fires.
     * @returns             The expiry Date for informational purposes.
     */
    start(clientIp, durationMs, onExpired) {
        // Cancel any existing timer for this client first
        this.cancel(clientIp);
        if (durationMs <= 0) {
            throw new RangeError(`durationMs must be positive, got ${durationMs}`);
        }
        const expiresAt = new Date(Date.now() + durationMs);
        const handle = setTimeout(async () => {
            this.timers.delete(clientIp);
            log.info(`Session expired`, { clientIp, expiredAt: new Date().toISOString() });
            try {
                await onExpired(clientIp);
            }
            catch (err) {
                log.error(`Error in timer callback for ${clientIp}`, err);
            }
        }, durationMs);
        // Allow the process to exit even if timers are pending
        if (handle.unref)
            handle.unref();
        this.timers.set(clientIp, { handle, expiresAt, durationMs });
        const minutes = (durationMs / 60_000).toFixed(1);
        log.info(`Timer started`, {
            clientIp,
            durationMinutes: minutes,
            expiresAt: expiresAt.toISOString(),
        });
        return expiresAt;
    }
    /**
     * Cancel any active timer for the given client. Safe to call when no timer
     * exists.
     *
     * @returns true if a timer was cancelled, false if none was found.
     */
    cancel(clientIp) {
        const entry = this.timers.get(clientIp);
        if (!entry)
            return false;
        clearTimeout(entry.handle);
        this.timers.delete(clientIp);
        log.info(`Timer cancelled`, { clientIp });
        return true;
    }
    /**
     * Return remaining milliseconds for a client's timer, or null if no timer
     * is active.
     */
    remainingMs(clientIp) {
        const entry = this.timers.get(clientIp);
        if (!entry)
            return null;
        return Math.max(0, entry.expiresAt.getTime() - Date.now());
    }
    /**
     * Return a snapshot of all active timers (read-only).
     */
    list() {
        const result = new Map();
        for (const [ip, entry] of this.timers) {
            result.set(ip, {
                expiresAt: entry.expiresAt,
                remainingMs: Math.max(0, entry.expiresAt.getTime() - Date.now()),
                durationMs: entry.durationMs,
            });
        }
        return result;
    }
    /**
     * Cancel all active timers (e.g. during graceful shutdown).
     */
    cancelAll() {
        for (const [ip, entry] of this.timers) {
            clearTimeout(entry.handle);
            log.debug(`Cancelled timer on shutdown`, { clientIp: ip });
        }
        this.timers.clear();
        log.info("All session timers cancelled");
    }
}
exports.SessionTimerManager = SessionTimerManager;
//# sourceMappingURL=SessionTimer.js.map