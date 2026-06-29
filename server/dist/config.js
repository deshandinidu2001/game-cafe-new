"use strict";
/**
 * config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads and validates server configuration from environment variables.
 * Call loadConfig() once at startup; the returned object is immutable.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function getEnvInt(key, defaultValue) {
    const raw = process.env[key];
    if (raw === undefined || raw === "")
        return defaultValue;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
        console.warn(`[Config] ${key} is not a valid integer ("${raw}"), using default: ${defaultValue}`);
        return defaultValue;
    }
    return parsed;
}
function getEnvString(key, defaultValue) {
    return process.env[key]?.trim() ?? defaultValue;
}
function getEnvLogLevel(key) {
    const val = getEnvString(key, "info");
    const valid = ["debug", "info", "warn", "error"];
    if (valid.includes(val)) {
        return val;
    }
    console.warn(`[Config] ${key} has invalid value "${val}", falling back to "info"`);
    return "info";
}
function getEnvAllowedIps(key) {
    const raw = getEnvString(key, "");
    if (raw === "")
        return [];
    return raw
        .split(",")
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);
}
function loadConfig() {
    const config = {
        tcpPort: getEnvInt("TCP_PORT", 9000),
        httpPort: getEnvInt("HTTP_PORT", 3000),
        logLevel: getEnvLogLevel("LOG_LEVEL"),
        pingIntervalMs: getEnvInt("PING_INTERVAL_MS", 15_000),
        socketTimeoutMs: getEnvInt("SOCKET_TIMEOUT_MS", 60_000),
        allowedIps: getEnvAllowedIps("ALLOWED_IPS"),
        clientExePath: getEnvString("CLIENT_EXE_PATH", ""),
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
//# sourceMappingURL=config.js.map