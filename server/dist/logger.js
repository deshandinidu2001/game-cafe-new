"use strict";
/**
 * logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight, coloured console logger with log-level filtering.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.createLogger = createLogger;
const LEVEL_RANK = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
// ANSI escape codes for terminal colours
const COLOURS = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
};
const LEVEL_COLOURS = {
    debug: COLOURS.cyan,
    info: COLOURS.green,
    warn: COLOURS.yellow,
    error: COLOURS.red,
};
function timestamp() {
    return new Date().toISOString();
}
function formatMessage(level, context, message) {
    const ts = `${COLOURS.dim}${timestamp()}${COLOURS.reset}`;
    const lvlColour = LEVEL_COLOURS[level];
    const lvl = `${lvlColour}[${level.toUpperCase().padEnd(5)}]${COLOURS.reset}`;
    const ctx = `${COLOURS.magenta}[${context}]${COLOURS.reset}`;
    return `${ts} ${lvl} ${ctx} ${message}`;
}
class Logger {
    context;
    minLevel;
    constructor(context, minLevel = "info") {
        this.context = context;
        this.minLevel = LEVEL_RANK[minLevel];
    }
    log(level, message, meta) {
        if (LEVEL_RANK[level] < this.minLevel)
            return;
        const formatted = formatMessage(level, this.context, message);
        const output = meta !== undefined
            ? `${formatted} ${COLOURS.dim}${JSON.stringify(meta)}${COLOURS.reset}`
            : formatted;
        if (level === "error" || level === "warn") {
            console.error(output);
        }
        else {
            console.log(output);
        }
    }
    debug(message, meta) {
        this.log("debug", message, meta);
    }
    info(message, meta) {
        this.log("info", message, meta);
    }
    warn(message, meta) {
        this.log("warn", message, meta);
    }
    error(message, meta) {
        this.log("error", message, meta);
    }
}
exports.Logger = Logger;
/** Factory: create a logger scoped to a specific module. */
function createLogger(context, level = "info") {
    return new Logger(context, level);
}
//# sourceMappingURL=logger.js.map