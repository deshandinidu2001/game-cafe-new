/**
 * logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight, coloured console logger with log-level filtering.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
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
} as const;

const LEVEL_COLOURS: Record<LogLevel, string> = {
  debug: COLOURS.cyan,
  info: COLOURS.green,
  warn: COLOURS.yellow,
  error: COLOURS.red,
};

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, context: string, message: string): string {
  const ts = `${COLOURS.dim}${timestamp()}${COLOURS.reset}`;
  const lvlColour = LEVEL_COLOURS[level];
  const lvl = `${lvlColour}[${level.toUpperCase().padEnd(5)}]${COLOURS.reset}`;
  const ctx = `${COLOURS.magenta}[${context}]${COLOURS.reset}`;
  return `${ts} ${lvl} ${ctx} ${message}`;
}

export class Logger {
  private readonly context: string;
  private readonly minLevel: number;

  constructor(context: string, minLevel: LogLevel = "info") {
    this.context = context;
    this.minLevel = LEVEL_RANK[minLevel];
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_RANK[level] < this.minLevel) return;

    const formatted = formatMessage(level, this.context, message);
    const output = meta !== undefined
      ? `${formatted} ${COLOURS.dim}${JSON.stringify(meta)}${COLOURS.reset}`
      : formatted;

    if (level === "error" || level === "warn") {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, meta?: unknown): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log("error", message, meta);
  }
}

/** Factory: create a logger scoped to a specific module. */
export function createLogger(context: string, level: LogLevel = "info"): Logger {
  return new Logger(context, level);
}
