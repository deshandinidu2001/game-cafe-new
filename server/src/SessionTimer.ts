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

import { createLogger } from "./logger";

const log = createLogger("SessionTimer");

/** Callback invoked when a session expires. */
export type TimerExpiredCallback = (clientIp: string) => void | Promise<void>;

interface TimerEntry {
  handle: NodeJS.Timeout;
  expiresAt: Date;
  durationMs: number;
}

export class SessionTimerManager {
  /** Map of clientIp → active timer entry */
  private readonly timers = new Map<string, TimerEntry>();

  /**
   * Start (or replace) a countdown timer for the given client.
   *
   * @param clientIp      - Unique client identifier (their IP address).
   * @param durationMs    - How long in milliseconds until the session expires.
   * @param onExpired     - Async callback invoked when the timer fires.
   * @returns             The expiry Date for informational purposes.
   */
  public start(
    clientIp: string,
    durationMs: number,
    onExpired: TimerExpiredCallback,
  ): Date {
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
      } catch (err) {
        log.error(`Error in timer callback for ${clientIp}`, err);
      }
    }, durationMs);

    // Allow the process to exit even if timers are pending
    if (handle.unref) handle.unref();

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
  public cancel(clientIp: string): boolean {
    const entry = this.timers.get(clientIp);
    if (!entry) return false;

    clearTimeout(entry.handle);
    this.timers.delete(clientIp);
    log.info(`Timer cancelled`, { clientIp });
    return true;
  }

  /**
   * Return remaining milliseconds for a client's timer, or null if no timer
   * is active.
   */
  public remainingMs(clientIp: string): number | null {
    const entry = this.timers.get(clientIp);
    if (!entry) return null;
    return Math.max(0, entry.expiresAt.getTime() - Date.now());
  }

  /**
   * Return a snapshot of all active timers (read-only).
   */
  public list(): ReadonlyMap<string, Readonly<{ expiresAt: Date; remainingMs: number; durationMs: number }>> {
    const result = new Map<string, { expiresAt: Date; remainingMs: number; durationMs: number }>();
    for (const [ip, entry] of this.timers) {
      result.set(ip, {
        expiresAt:   entry.expiresAt,
        remainingMs: Math.max(0, entry.expiresAt.getTime() - Date.now()),
        durationMs:  entry.durationMs,
      });
    }
    return result;
  }

  /**
   * Cancel all active timers (e.g. during graceful shutdown).
   */
  public cancelAll(): void {
    for (const [ip, entry] of this.timers) {
      clearTimeout(entry.handle);
      log.debug(`Cancelled timer on shutdown`, { clientIp: ip });
    }
    this.timers.clear();
    log.info("All session timers cancelled");
  }
}
