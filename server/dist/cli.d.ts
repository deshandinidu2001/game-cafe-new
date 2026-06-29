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
import { ClientManager } from "./ClientManager";
import { SessionTimerManager } from "./SessionTimer";
export declare class CafeCliInterface {
    private readonly clients;
    private readonly timers;
    private readonly rl;
    constructor(clients: ClientManager, timers: SessionTimerManager);
    start(): void;
    private dispatch;
    private cmdList;
    private cmdStart;
    private cmdLock;
    private cmdUnlock;
    private cmdCancel;
    private cmdStatus;
    private cmdLockAll;
    private cmdHelp;
    private cmdExit;
}
//# sourceMappingURL=cli.d.ts.map