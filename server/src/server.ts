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

import * as net from "net";
import { exec } from "child_process";
import { loadConfig } from "./config";
import { ClientManager } from "./ClientManager";
import { SessionTimerManager } from "./SessionTimer";
import { CafeCliInterface } from "./cli";
import { createHttpApi, startHttpServer } from "./httpApi";
import { createLogger } from "./logger";

const log = createLogger("Server");

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Load configuration
  const config = loadConfig();
  log.info("Configuration loaded", {
    tcpPort:    config.tcpPort,
    httpPort:   config.httpPort,
    logLevel:   config.logLevel,
    allowedIps: config.allowedIps.length > 0 ? config.allowedIps : "all",
  });

  // 2. Initialise core services
  const clientManager = new ClientManager(config);
  const timerManager  = new SessionTimerManager();

  // 3. Create the TCP server
  const tcpServer = net.createServer((socket: net.Socket) => {
    // Disable Nagle's algorithm for low-latency command delivery
    socket.setNoDelay(true);

    const accepted = clientManager.registerSocket(socket);
    if (!accepted) return; // rejected by whitelist

    // Nothing more to do here — ClientManager drives the socket lifecycle
  });

  tcpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.error(`TCP port ${config.tcpPort} is already in use. Exiting.`);
      process.exit(1);
    }
    log.error("TCP server error", err);
  });

  // Start listening
  await new Promise<void>((resolve) => {
    tcpServer.listen(config.tcpPort, "0.0.0.0", () => {
      log.info(`TCP server listening`, { port: config.tcpPort, bind: "0.0.0.0" });
      resolve();
    });
  });

  // 4. Start keep-alive pings
  clientManager.startPingInterval();

  // 5. Start HTTP REST API + Dashboard
  const httpApp = createHttpApi(config, clientManager, timerManager);
  await startHttpServer(httpApp, config.httpPort);

  // Auto-open the dashboard in the default browser (Windows only)
  if (process.platform === "win32") {
    const url = `http://localhost:${config.httpPort}`;
    exec(`start ${url}`, (err) => {
      if (err) log.warn("Could not auto-open browser", err);
      else log.info(`Dashboard opened: ${url}`);
    });
  }

  // 6. Launch interactive CLI
  const cli = new CafeCliInterface(clientManager, timerManager);
  cli.start();

  // ─── Graceful Shutdown ─────────────────────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    log.info(`Received ${signal} — shutting down gracefully`);

    // Cancel all timers first (prevents LOCK being sent during shutdown)
    timerManager.cancelAll();

    // Close all client connections
    clientManager.destroyAll();

    // Close the TCP server (stop accepting new connections)
    await new Promise<void>((resolve) => {
      tcpServer.close((err) => {
        if (err) log.warn("Error closing TCP server", err);
        resolve();
      });
    });

    log.info("Server shut down cleanly. Goodbye.");
    process.exit(0);
  }

  process.on("SIGINT",  () => { void shutdown("SIGINT");  });
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
