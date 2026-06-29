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
/** Callback invoked when a session expires. */
export type TimerExpiredCallback = (clientIp: string) => void | Promise<void>;
export declare class SessionTimerManager {
    /** Map of clientIp → active timer entry */
    private readonly timers;
    /**
     * Start (or replace) a countdown timer for the given client.
     *
     * @param clientIp      - Unique client identifier (their IP address).
     * @param durationMs    - How long in milliseconds until the session expires.
     * @param onExpired     - Async callback invoked when the timer fires.
     * @returns             The expiry Date for informational purposes.
     */
    start(clientIp: string, durationMs: number, onExpired: TimerExpiredCallback): Date;
    /**
     * Cancel any active timer for the given client. Safe to call when no timer
     * exists.
     *
     * @returns true if a timer was cancelled, false if none was found.
     */
    cancel(clientIp: string): boolean;
    /**
     * Return remaining milliseconds for a client's timer, or null if no timer
     * is active.
     */
    remainingMs(clientIp: string): number | null;
    /**
     * Return a snapshot of all active timers (read-only).
     */
    list(): ReadonlyMap<string, Readonly<{
        expiresAt: Date;
        remainingMs: number;
        durationMs: number;
    }>>;
    /**
     * Cancel all active timers (e.g. during graceful shutdown).
     */
    cancelAll(): void;
}
//# sourceMappingURL=SessionTimer.d.ts.map