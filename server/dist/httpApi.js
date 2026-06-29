"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpApi = createHttpApi;
exports.startHttpServer = startHttpServer;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const CommandHandler_1 = require("./CommandHandler");
const logger_1 = require("./logger");
const log = (0, logger_1.createLogger)("HttpApi");
// ─── Error response helper ────────────────────────────────────────────────────
function apiError(res, status, message) {
    res.status(status).json({ ok: false, error: message });
}
function isStartBody(body) {
    return (typeof body === "object" &&
        body !== null &&
        typeof body.minutes === "number" &&
        body.minutes > 0);
}
// ─── API Factory ──────────────────────────────────────────────────────────────
function createHttpApi(config, clients, timers) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // ── Static Dashboard Files ────────────────────────────────────────────────
    // __dirname at runtime = server/dist/  →  ../public = server/public/
    const publicPath = path_1.default.join(__dirname, "..", "public");
    app.use(express_1.default.static(publicPath));
    log.info(`Dashboard served from: ${publicPath}`);
    // ── Health check ─────────────────────────────────────────────────────────
    app.get("/api/health", (_req, res) => {
        res.json({
            ok: true,
            uptime: process.uptime(),
            clients: clients.count(),
            timestamp: new Date().toISOString(),
        });
    });
    // ── List all clients ──────────────────────────────────────────────────────
    app.get("/api/clients", (_req, res) => {
        const result = [];
        const timerList = timers.list();
        for (const [ip, session] of clients.all()) {
            const timerInfo = timerList.get(ip);
            const remainingMs = timerInfo?.remainingMs ?? null;
            const durationMs = timerInfo?.durationMs ?? null;
            result.push({
                ip,
                label: session.label ?? null,
                targetApp: session.targetApp ?? "None",
                connectedAt: session.connectedAt.toISOString(),
                locked: session.locked,
                remainingMs,
                durationMs,
                remainingMin: remainingMs !== null ? Math.ceil(remainingMs / 60_000) : null,
            });
        }
        res.json({ ok: true, clients: result });
    });
    // ── Get single client ─────────────────────────────────────────────────────
    app.get("/api/clients/:ip", (req, res) => {
        const { ip } = req.params;
        const session = clients.get(ip);
        if (!session) {
            apiError(res, 404, `Client ${ip} not connected`);
            return;
        }
        const timerInfo = timers.list().get(ip);
        const remainingMs = timerInfo?.remainingMs ?? null;
        const durationMs = timerInfo?.durationMs ?? null;
        res.json({
            ok: true,
            ip,
            label: session.label ?? null,
            targetApp: session.targetApp ?? "None",
            connectedAt: session.connectedAt.toISOString(),
            locked: session.locked,
            remainingMs,
            durationMs,
            remainingMin: remainingMs !== null ? Math.ceil(remainingMs / 60_000) : null,
        });
    });
    // ── Start timer ───────────────────────────────────────────────────────────
    app.post("/api/clients/:ip/start", async (req, res) => {
        const { ip } = req.params;
        const session = clients.get(ip);
        if (!session) {
            apiError(res, 404, `Client ${ip} not connected`);
            return;
        }
        if (!isStartBody(req.body)) {
            apiError(res, 400, '"minutes" must be a positive number');
            return;
        }
        const durationMs = Math.round(req.body.minutes * 60_000);
        const expiresAt = timers.start(ip, durationMs, async (expiredIp) => {
            const s = clients.get(expiredIp);
            if (!s)
                return;
            const ok = await (0, CommandHandler_1.sendLock)(s.socket, "Session time expired");
            if (ok)
                clients.updateLockState(expiredIp, true);
        });
        res.json({ ok: true, ip, expiresAt: expiresAt.toISOString(), durationMs });
    });
    // ── Lock immediately ──────────────────────────────────────────────────────
    app.post("/api/clients/:ip/lock", async (req, res) => {
        const { ip } = req.params;
        const session = clients.get(ip);
        if (!session) {
            apiError(res, 404, `Client ${ip} not connected`);
            return;
        }
        const reason = typeof req.body?.reason === "string" ? req.body.reason : "Locked by admin";
        const ok = await (0, CommandHandler_1.sendLock)(session.socket, reason);
        if (ok) {
            clients.updateLockState(ip, true);
            timers.cancel(ip);
        }
        res.json({ ok, ip });
    });
    // ── Unlock ────────────────────────────────────────────────────────────────
    app.post("/api/clients/:ip/unlock", async (req, res) => {
        const { ip } = req.params;
        const session = clients.get(ip);
        if (!session) {
            apiError(res, 404, `Client ${ip} not connected`);
            return;
        }
        const ok = await (0, CommandHandler_1.sendUnlock)(session.socket);
        if (ok)
            clients.updateLockState(ip, false);
        res.json({ ok, ip });
    });
    // ── Cancel timer ──────────────────────────────────────────────────────────
    app.delete("/api/clients/:ip/timer", (req, res) => {
        const { ip } = req.params;
        if (!clients.has(ip)) {
            apiError(res, 404, `Client ${ip} not connected`);
            return;
        }
        const cancelled = timers.cancel(ip);
        res.json({ ok: true, ip, cancelled });
    });
    // ── Lock all ──────────────────────────────────────────────────────────────
    app.post("/api/lockall", async (_req, res) => {
        const results = [];
        for (const [ip, session] of clients.all()) {
            const ok = await (0, CommandHandler_1.sendLock)(session.socket, "Locked by admin — all clients");
            if (ok)
                clients.updateLockState(ip, true);
            results.push({ ip, ok });
        }
        res.json({ ok: true, results });
    });
    // ── Launch client app on this machine ─────────────────────────────────────
    // Resolves the GameCafeClient.exe relative to this server, or uses the
    // CLIENT_EXE_PATH environment variable if set.
    app.post("/api/admin/launch-client", (_req, res) => {
        // Priority: env variable → relative build output path
        const exePath = config.clientExePath || resolveClientExe();
        if (!exePath || !(0, fs_1.existsSync)(exePath)) {
            apiError(res, 404, `GameCafeClient.exe not found at "${exePath ?? "auto-detect"}". ` +
                `Set CLIENT_EXE_PATH in .env or build the client first.`);
            return;
        }
        log.info(`Launching client app`, { exePath });
        try {
            const child = (0, child_process_1.spawn)(exePath, [], {
                detached: true,
                stdio: "ignore",
            });
            child.unref(); // don't keep the server alive waiting for the child
            res.json({ ok: true, pid: child.pid, exePath });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error("Failed to launch client app", err);
            apiError(res, 500, `Failed to launch: ${msg}`);
        }
    });
    // ─── Global error handler ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err, _req, res, _next) => {
        log.error("Unhandled HTTP error", err);
        apiError(res, 500, "Internal server error");
    });
    return app;
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Try to locate the compiled GameCafeClient.exe relative to the server
 * directory. Works for both dev and release builds.
 */
function resolveClientExe() {
    // When compiled: server/dist/httpApi.js  → go up 3 levels to reach repo root
    // Repo root: game-cafe/
    const repoRoot = path_1.default.join(__dirname, "..", "..", "..");
    const candidates = [
        path_1.default.join(repoRoot, "client", "GameCafeClient", "bin", "Release", "net10.0-windows", "GameCafeClient.exe"),
        path_1.default.join(repoRoot, "client", "GameCafeClient", "bin", "Debug", "net10.0-windows", "GameCafeClient.exe"),
        path_1.default.join(repoRoot, "client", "GameCafeClient", "bin", "Release", "net8.0-windows", "GameCafeClient.exe"),
        path_1.default.join(repoRoot, "client", "GameCafeClient", "bin", "Debug", "net8.0-windows", "GameCafeClient.exe"),
    ];
    return candidates.find(fs_1.existsSync) ?? null;
}
// ─── Server Startup ───────────────────────────────────────────────────────────
function startHttpServer(app, port) {
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            log.info(`HTTP server + Dashboard listening`, { port, url: `http://localhost:${port}` });
            resolve();
        });
        server.on("error", (err) => {
            log.error("HTTP server error", err);
        });
    });
}
//# sourceMappingURL=httpApi.js.map