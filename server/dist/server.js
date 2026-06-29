"use strict";
/**
 * server.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point for the Gaming Cafe Management Server.
 *
 * Startup sequence:
 *   1. Load and validate configuration
 *   2. Create ClientManager and SessionTimerManager
 *   3. Start the TCP server (native net module)
 *   4. Start the optional HTTP REST API
 *   5. Launch the interactive CLI
 *   6. Wire up graceful shutdown on SIGINT / SIGTERM
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
const net = __importStar(require("net"));
const child_process_1 = require("child_process");
const config_1 = require("./config");
const ClientManager_1 = require("./ClientManager");
const SessionTimer_1 = require("./SessionTimer");
const cli_1 = require("./cli");
const httpApi_1 = require("./httpApi");
const logger_1 = require("./logger");
const log = (0, logger_1.createLogger)("Server");
// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
    // 1. Load configuration
    const config = (0, config_1.loadConfig)();
    log.info("Configuration loaded", {
        tcpPort: config.tcpPort,
        httpPort: config.httpPort,
        logLevel: config.logLevel,
        allowedIps: config.allowedIps.length > 0 ? config.allowedIps : "all",
    });
    // 2. Initialise core services
    const clientManager = new ClientManager_1.ClientManager(config);
    const timerManager = new SessionTimer_1.SessionTimerManager();
    // 3. Create the TCP server
    const tcpServer = net.createServer((socket) => {
        // Disable Nagle's algorithm for low-latency command delivery
        socket.setNoDelay(true);
        const accepted = clientManager.registerSocket(socket);
        if (!accepted)
            return; // rejected by whitelist
        // Nothing more to do here — ClientManager drives the socket lifecycle
    });
    tcpServer.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            log.error(`TCP port ${config.tcpPort} is already in use. Exiting.`);
            process.exit(1);
        }
        log.error("TCP server error", err);
    });
    // Start listening
    await new Promise((resolve) => {
        tcpServer.listen(config.tcpPort, "0.0.0.0", () => {
            log.info(`TCP server listening`, { port: config.tcpPort, bind: "0.0.0.0" });
            resolve();
        });
    });
    // 4. Start keep-alive pings
    clientManager.startPingInterval();
    // 5. Start HTTP REST API + Dashboard
    const httpApp = (0, httpApi_1.createHttpApi)(config, clientManager, timerManager);
    await (0, httpApi_1.startHttpServer)(httpApp, config.httpPort);
    // Auto-open the dashboard in the default browser (Windows only)
    if (process.platform === "win32") {
        const url = `http://localhost:${config.httpPort}`;
        (0, child_process_1.exec)(`start ${url}`, (err) => {
            if (err)
                log.warn("Could not auto-open browser", err);
            else
                log.info(`Dashboard opened: ${url}`);
        });
    }
    // 6. Launch interactive CLI
    const cli = new cli_1.CafeCliInterface(clientManager, timerManager);
    cli.start();
    // ─── Graceful Shutdown ─────────────────────────────────────────────────────
    async function shutdown(signal) {
        log.info(`Received ${signal} — shutting down gracefully`);
        // Cancel all timers first (prevents LOCK being sent during shutdown)
        timerManager.cancelAll();
        // Close all client connections
        clientManager.destroyAll();
        // Close the TCP server (stop accepting new connections)
        await new Promise((resolve) => {
            tcpServer.close((err) => {
                if (err)
                    log.warn("Error closing TCP server", err);
                resolve();
            });
        });
        log.info("Server shut down cleanly. Goodbye.");
        process.exit(0);
    }
    process.on("SIGINT", () => { void shutdown("SIGINT"); });
    process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
    // Catch unhandled rejections to prevent silent failures
    process.on("unhandledRejection", (reason) => {
        log.error("Unhandled promise rejection", reason);
    });
    process.on("uncaughtException", (err) => {
        log.error("Uncaught exception", err);
        void shutdown("uncaughtException");
    });
}
main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map