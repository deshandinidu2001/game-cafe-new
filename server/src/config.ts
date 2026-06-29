/**
 * config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads and validates server configuration from environment variables.
 * Call loadConfig() once at startup; the returned object is immutable.
 */

import * as dotenv from "dotenv";
import { ServerConfig } from "./types";

dotenv.config();

function getEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    console.warn(`[Config] ${key} is not a valid integer ("${raw}"), using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key]?.trim() ?? defaultValue;
}

function getEnvLogLevel(key: string): ServerConfig["logLevel"] {
  const val = getEnvString(key, "info");
  const valid: ServerConfig["logLevel"][] = ["debug", "info", "warn", "error"];
  if (valid.includes(val as ServerConfig["logLevel"])) {
    return val as ServerConfig["logLevel"];
  }
  console.warn(`[Config] ${key} has invalid value "${val}", falling back to "info"`);
  return "info";
}

function getEnvAllowedIps(key: string): string[] {
  const raw = getEnvString(key, "");
  if (raw === "") return [];
  return raw
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
}

export function loadConfig(): Readonly<ServerConfig> {
  const config: ServerConfig = {
    tcpPort:         getEnvInt("TCP_PORT", 9000),
    httpPort:        getEnvInt("HTTP_PORT", 3000),
    logLevel:        getEnvLogLevel("LOG_LEVEL"),
    pingIntervalMs:  getEnvInt("PING_INTERVAL_MS", 15_000),
    socketTimeoutMs: getEnvInt("SOCKET_TIMEOUT_MS", 60_000),
    allowedIps:      getEnvAllowedIps("ALLOWED_IPS"),
    clientExePath:   getEnvString("CLIENT_EXE_PATH", ""),
  };

  // Basic validation
  if (config.tcpPort < 1 || config.tcpPort > 65535) {
    throw new Error(`TCP_PORT out of range: ${config.tcpPort}`);
  }
  if (config.httpPort < 1 || config.httpPort > 65535) {
    throw new Error(`HTTP_PORT out of range: ${config.httpPort}`);
  }
  if (config.tcpPort === config.httpPort) {
    throw new Error("TCP_PORT and HTTP_PORT must be different");
  }

  return Object.freeze(config);
}
