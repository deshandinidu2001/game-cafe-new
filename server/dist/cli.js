"use strict";
/**
 * cli.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive command-line interface for the Game Cafe Server.
 *
 * Commands:
 *   list                          List all connected clients
 *   start <ip> <minutes>          Start a session timer for a client
 *   lock <ip>                     Immediately send LOCK to a client
 *   unlock <ip>                   Send UNLOCK to a client
 *   cancel <ip>                   Cancel a running timer (no lock)
 *   status <ip>                   Show remaining time for a client
 *   lockall                       Lock all connected clients immediately
 *   help                          Show this help text
 *   exit / quit                   Shut down the server
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
exports.CafeCliInterface = void 0;
const readline = __importStar(require("readline"));
const CommandHandler_1 = require("./CommandHandler");
const logger_1 = require("./logger");
const log = (0, logger_1.createLogger)("CLI");
// ANSI helpers for CLI output
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
};
function header(text) {
    return `\n${C.bold}${C.cyan}${"─".repeat(60)}${C.reset}\n${C.bold} ${text}${C.reset}\n${C.bold}${C.cyan}${"─".repeat(60)}${C.reset}`;
}
class CafeCliInterface {
    clients;
    timers;
    rl;
    constructor(clients, timers) {
        this.clients = clients;
        this.timers = timers;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `${C.green}cafe>${C.reset} `,
        });
    }
    start() {
        console.log(header("Gaming Cafe Management Server — Interactive CLI"));
        console.log(`  Type ${C.yellow}help${C.reset} for a list of commands.\n`);
        this.rl.prompt();
        this.rl.on("line", async (rawLine) => {
            const line = rawLine.trim();
            if (line.length > 0) {
                await this.dispatch(line);
            }
            this.rl.prompt();
        });
        this.rl.on("close", () => {
            log.info("CLI interface closed");
        });
    }
    // ─── Command Dispatcher ───────────────────────────────────────────────────
    async dispatch(line) {
        const parts = line.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() ?? "";
        try {
            switch (cmd) {
                case "list":
                    this.cmdList();
                    break;
                case "start":
                    await this.cmdStart(parts);
                    break;
                case "lock":
                    await this.cmdLock(parts);
                    break;
                case "unlock":
                    await this.cmdUnlock(parts);
                    break;
                case "cancel":
                    this.cmdCancel(parts);
                    break;
                case "status":
                    this.cmdStatus(parts);
                    break;
                case "lockall":
                    await this.cmdLockAll();
                    break;
                case "help":
                    this.cmdHelp();
                    break;
                case "exit":
                case "quit":
                    this.cmdExit();
                    break;
                default:
                    console.log(`${C.red}Unknown command: "${cmd}". Type "help" for usage.${C.reset}`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`${C.red}Error: ${message}${C.reset}`);
        }
    }
    // ─── Commands ─────────────────────────────────────────────────────────────
    cmdList() {
        const sessions = this.clients.all();
        if (sessions.size === 0) {
            console.log(`  ${C.yellow}No clients connected.${C.reset}`);
            return;
        }
        console.log(header(`Connected Clients (${sessions.size})`));
        const rows = [
            ["IP", "Label", "Connected", "Locked", "Remaining"],
        ];
        for (const [ip, session] of sessions) {
            const remaining = this.timers.remainingMs(ip);
            const remainingStr = remaining !== null
                ? `${Math.ceil(remaining / 60_000)} min`
                : "—";
            rows.push([
                ip,
                session.label ?? "—",
                session.connectedAt.toLocaleTimeString(),
                session.locked ? `${C.red}YES${C.reset}` : "no",
                remainingStr,
            ]);
        }
        // Simple table formatting
        const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => row[col].replace(/\x1b\[[0-9;]*m/g, "").length)));
        for (const row of rows) {
            const line = row
                .map((cell, i) => cell.padEnd(widths[i] + 2))
                .join("");
            console.log(`  ${line}`);
        }
    }
    async cmdStart(parts) {
        const ip = parts[1];
        const minutes = parseFloat(parts[2] ?? "");
        if (!ip || isNaN(minutes) || minutes <= 0) {
            console.log(`  Usage: start <ip> <minutes>`);
            return;
        }
        const session = this.clients.get(ip);
        if (!session) {
            console.log(`  ${C.red}No client with IP ${ip} is connected.${C.reset}`);
            return;
        }
        const durationMs = Math.round(minutes * 60_000);
        const expiresAt = this.timers.start(ip, durationMs, async (expiredIp) => {
            const s = this.clients.get(expiredIp);
            if (!s) {
                log.warn(`Timer expired but client ${expiredIp} is no longer connected`);
                return;
            }
            const success = await (0, CommandHandler_1.sendLock)(s.socket, "Session time expired");
            if (success)
                this.clients.updateLockState(expiredIp, true);
        });
        console.log(`  ${C.green}Timer started for ${ip}: ${minutes} min (expires ${expiresAt.toLocaleTimeString()})${C.reset}`);
    }
    async cmdLock(parts) {
        const ip = parts[1];
        if (!ip) {
            console.log(`  Usage: lock <ip>`);
            return;
        }
        const session = this.clients.get(ip);
        if (!session) {
            console.log(`  ${C.red}No client with IP ${ip} is connected.${C.reset}`);
            return;
        }
        const success = await (0, CommandHandler_1.sendLock)(session.socket, "Manually locked by operator");
        if (success) {
            this.clients.updateLockState(ip, true);
            this.timers.cancel(ip); // cancel any running timer since we locked manually
            console.log(`  ${C.green}LOCK sent to ${ip}.${C.reset}`);
        }
        else {
            console.log(`  ${C.red}Failed to send LOCK to ${ip}.${C.reset}`);
        }
    }
    async cmdUnlock(parts) {
        const ip = parts[1];
        if (!ip) {
            console.log(`  Usage: unlock <ip>`);
            return;
        }
        const session = this.clients.get(ip);
        if (!session) {
            console.log(`  ${C.red}No client with IP ${ip} is connected.${C.reset}`);
            return;
        }
        const success = await (0, CommandHandler_1.sendUnlock)(session.socket);
        if (success) {
            this.clients.updateLockState(ip, false);
            console.log(`  ${C.green}UNLOCK sent to ${ip}.${C.reset}`);
        }
        else {
            console.log(`  ${C.red}Failed to send UNLOCK to ${ip}.${C.reset}`);
        }
    }
    cmdCancel(parts) {
        const ip = parts[1];
        if (!ip) {
            console.log(`  Usage: cancel <ip>`);
            return;
        }
        const cancelled = this.timers.cancel(ip);
        if (cancelled) {
            console.log(`  ${C.green}Timer cancelled for ${ip}. Client will NOT be locked.${C.reset}`);
        }
        else {
            console.log(`  ${C.yellow}No active timer found for ${ip}.${C.reset}`);
        }
    }
    cmdStatus(parts) {
        const ip = parts[1];
        if (!ip) {
            console.log(`  Usage: status <ip>`);
            return;
        }
        const session = this.clients.get(ip);
        if (!session) {
            console.log(`  ${C.red}No client with IP ${ip} is connected.${C.reset}`);
            return;
        }
        const remaining = this.timers.remainingMs(ip);
        console.log(`\n  ${C.bold}Status for ${ip}${C.reset}`);
        console.log(`  Label    : ${session.label ?? "—"}`);
        console.log(`  Connected: ${session.connectedAt.toLocaleString()}`);
        console.log(`  Locked   : ${session.locked ? `${C.red}YES${C.reset}` : "no"}`);
        console.log(`  Remaining: ${remaining !== null ? `${Math.ceil(remaining / 60_000)} min` : "— (no active timer)"}\n`);
    }
    async cmdLockAll() {
        const sessions = this.clients.all();
        if (sessions.size === 0) {
            console.log(`  ${C.yellow}No clients connected.${C.reset}`);
            return;
        }
        const promises = [];
        for (const [ip, session] of sessions) {
            promises.push((0, CommandHandler_1.sendLock)(session.socket, "All clients locked by operator").then((ok) => {
                if (ok)
                    this.clients.updateLockState(ip, true);
            }));
        }
        await Promise.allSettled(promises);
        console.log(`  ${C.green}LOCK sent to all ${sessions.size} clients.${C.reset}`);
    }
    cmdHelp() {
        const cmds = [
            ["list", "List all connected clients with status"],
            ["start <ip> <min>", "Start a session timer (sends LOCK when it expires)"],
            ["lock <ip>", "Immediately lock a specific client"],
            ["unlock <ip>", "Unlock a specific client"],
            ["cancel <ip>", "Cancel a running timer (client stays unlocked)"],
            ["status <ip>", "Show timer and connection status for a client"],
            ["lockall", "Immediately lock ALL connected clients"],
            ["exit / quit", "Shut down the server"],
        ];
        console.log(header("Available Commands"));
        for (const [cmd, desc] of cmds) {
            console.log(`  ${C.yellow}${cmd.padEnd(22)}${C.reset} ${desc}`);
        }
        console.log();
    }
    cmdExit() {
        console.log(`\n  ${C.cyan}Shutting down server…${C.reset}\n`);
        // Emit SIGINT to trigger graceful shutdown in server.ts
        process.emit("SIGINT");
    }
}
exports.CafeCliInterface = CafeCliInterface;
//# sourceMappingURL=cli.js.map