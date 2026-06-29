/**
 * logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight, coloured console logger with log-level filtering.
 */
type LogLevel = "debug" | "info" | "warn" | "error";
export declare class Logger {
    private readonly context;
    private readonly minLevel;
    constructor(context: string, minLevel?: LogLevel);
    private log;
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
}
/** Factory: create a logger scoped to a specific module. */
export declare function createLogger(context: string, level?: LogLevel): Logger;
export {};
//# sourceMappingURL=logger.d.ts.map