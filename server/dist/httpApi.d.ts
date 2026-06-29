/**
 * httpApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * REST API + Admin Dashboard static file serving.
 *
 * Endpoints:
 *   GET    /                        Admin dashboard (index.html)
 *   GET    /api/health              Health-check endpoint
 *   GET    /api/clients             List all connected clients
 *   GET    /api/clients/:ip         Get a specific client's status
 *   POST   /api/clients/:ip/start   Start a session timer
 *   POST   /api/clients/:ip/lock    Immediately lock a client
 *   POST   /api/clients/:ip/unlock  Unlock a client
 *   DELETE /api/clients/:ip/timer   Cancel a running timer
 *   POST   /api/lockall             Lock all clients
 *   POST   /api/admin/launch-client Launch GameCafeClient.exe on this machine
 */
import { Application } from "express";
import { ClientManager } from "./ClientManager";
import { SessionTimerManager } from "./SessionTimer";
import { ServerConfig } from "./types";
export declare function createHttpApi(config: Readonly<ServerConfig>, clients: ClientManager, timers: SessionTimerManager): Application;
export declare function startHttpServer(app: Application, port: number): Promise<void>;
//# sourceMappingURL=httpApi.d.ts.map