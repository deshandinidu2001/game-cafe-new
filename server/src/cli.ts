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

import * as readline from "readline";
import { ClientManager } from "./ClientManager";
import { SessionTimerManager } from "./SessionTimer";
import { sendLock, sendUnlock } from "./CommandHandler";
import { createLogger } from "./logger";

const log = createLogger("CLI");

// ANSI helpers for CLI output
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
};

function header(text: string): string {
  return `\n${C.bold}${C.cyan}${"─".repeat(60)}${C.reset}\n${C.bold} ${text}${C.reset}\n${C.bold}${C.cyan}${"─".repeat(60)}${C.reset}`;
}

export class CafeCliInterface {
  private readonly rl: readline.Interface;

  constructor(
    private readonly clients: ClientManager,
    private readonly timers: SessionTimerManager,
  ) {
    this.rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
      prompt: `${C.green}cafe>${C.reset} `,
    });
  }

  public start(): void {
    console.log(header("Gaming Cafe Management Server — Interactive CLI"));
    console.log(`  Type ${C.yellow}help${C.reset} for a list of commands.\n`);
    this.rl.prompt();

    this.rl.on("line", async (rawLine: string) => {
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

  private async dispatch(line: string): Promise<void> {
    const parts = line.split(/\s+/);
    const cmd   = parts[0]?.toLowerCase() ?? "";

    try {
      switch (cmd) {
        case "list":     this.cmdList();                               break;
        case "start":    await this.cmdStart(parts);                  break;
        case "lock":     await this.cmdLock(parts);                   break;
        case "unlock":   await this.cmdUnlock(parts);                 break;
        case "cancel":   this.cmdCancel(parts);                       break;
        case "status":   this.cmdStatus(parts);                       break;
        case "lockall":  await this.cmdLockAll();                     break;
        case "help":     this.cmdHelp();                              break;
        case "exit":
        case "quit":     this.cmdExit();                              break;
        default:
          console.log(`${C.red}Unknown command: "${cmd}". Type "help" for usage.${C.reset}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  private cmdList(): void {
    const sessions = this.clients.all();
    if (sessions.size === 0) {
      console.log(`  ${C.yellow}No clients connected.${C.reset}`);
      return;
    }

    console.log(header(`Connected Clients (${sessions.size})`));

    const rows: string[][] = [
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
    const widths = rows[0].map((_, col) =>
      Math.max(...rows.map((row) => row[col].replace(/\x1b\[[0-9;]*m/g, "").length))
    );

    for (const row of rows) {
      const line = row
        .map((cell, i) => cell.padEnd(widths[i] + 2))
        .join("");
      console.log(`  ${line}`);
    }
  }

  private async cmdStart(parts: string[]): Promise<void> {
    const ip      = parts[1];
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
      const success = await sendLock(s.socket, "Session time expired");
      if (success) this.clients.updateLockState(expiredIp, true);
    });

    console.log(
      `  ${C.green}Timer started for ${ip}: ${minutes} min (expires ${expiresAt.toLocaleTimeString()})${C.reset}`
    );
  }

  private async cmdLock(parts: string[]): Promise<void> {
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

    const success = await sendLock(session.socket, "Manually locked by operator");
    if (success) {
      this.clients.updateLockState(ip, true);
      this.timers.cancel(ip); // cancel any running timer since we locked manually
      console.log(`  ${C.green}LOCK sent to ${ip}.${C.reset}`);
    } else {
      console.log(`  ${C.red}Failed to send LOCK to ${ip}.${C.reset}`);
    }
  }

  private async cmdUnlock(parts: string[]): Promise<void> {
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

    const success = await sendUnlock(session.socket);
    if (success) {
      this.clients.updateLockState(ip, false);
      console.log(`  ${C.green}UNLOCK sent to ${ip}.${C.reset}`);
    } else {
      console.log(`  ${C.red}Failed to send UNLOCK to ${ip}.${C.reset}`);
    }
  }

  private cmdCancel(parts: string[]): void {
    const ip = parts[1];
    if (!ip) {
      console.log(`  Usage: cancel <ip>`);
      return;
    }
    const cancelled = this.timers.cancel(ip);
    if (cancelled) {
      console.log(`  ${C.green}Timer cancelled for ${ip}. Client will NOT be locked.${C.reset}`);
    } else {
      console.log(`  ${C.yellow}No active timer found for ${ip}.${C.reset}`);
    }
  }

  private cmdStatus(parts: string[]): void {
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
    console.log(
      `  Remaining: ${remaining !== null ? `${Math.ceil(remaining / 60_000)} min` : "— (no active timer)"}\n`
    );
  }

  private async cmdLockAll(): Promise<void> {
    const sessions = this.clients.all();
    if (sessions.size === 0) {
      console.log(`  ${C.yellow}No clients connected.${C.reset}`);
      return;
    }

    const promises: Promise<void>[] = [];
    for (const [ip, session] of sessions) {
      promises.push(
        sendLock(session.socket, "All clients locked by operator").then((ok) => {
          if (ok) this.clients.updateLockState(ip, true);
        })
      );
    }
    await Promise.allSettled(promises);
    console.log(`  ${C.green}LOCK sent to all ${sessions.size} clients.${C.reset}`);
  }

  private cmdHelp(): void {
    const cmds = [
      ["list",               "List all connected clients with status"],
      ["start <ip> <min>",   "Start a session timer (sends LOCK when it expires)"],
      ["lock <ip>",          "Immediately lock a specific client"],
      ["unlock <ip>",        "Unlock a specific client"],
      ["cancel <ip>",        "Cancel a running timer (client stays unlocked)"],
      ["status <ip>",        "Show timer and connection status for a client"],
      ["lockall",            "Immediately lock ALL connected clients"],
      ["exit / quit",        "Shut down the server"],
    ];

    console.log(header("Available Commands"));
    for (const [cmd, desc] of cmds) {
      console.log(`  ${C.yellow}${cmd.padEnd(22)}${C.reset} ${desc}`);
    }
    console.log();
  }

  private cmdExit(): void {
    console.log(`\n  ${C.cyan}Shutting down server…${C.reset}\n`);
    // Emit SIGINT to trigger graceful shutdown in server.ts
    process.emit("SIGINT");
  }
}
