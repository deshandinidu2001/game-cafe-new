# 🎮 Gaming Cafe Management System

A production-grade client-server system for managing gaming cafe sessions. The server controls session timers and sends lock/unlock commands; the client enforces restrictions on each PC.

## Quick Start

### Server
```bash
cd server
npm install
cp .env.example .env
npm run dev        # development
npm run build && npm start  # production
```

### Client
```bash
cd client
dotnet build
dotnet run --project GameCafeClient
```

---

## Architecture

```
┌─────────────────────┐         TCP / JSON        ┌─────────────────────┐
│   Server (Node.js)  │ ◄─────────────────────── │  Client (.NET 8)    │
│                     │                           │                     │
│  ┌───────────────┐  │  {"status":"LOCK"}  ────► │  OverlayForm        │
│  │ ClientManager │  │  {"status":"UNLOCK"}────► │  Win32 LogOff       │
│  │ SessionTimer  │  │                           │  TcpClientService   │
│  │ CLI / REST    │  │                           │  (auto-reconnect)   │
│  └───────────────┘  │                           └─────────────────────┘
└─────────────────────┘
```

---

## Protocol

All messages are newline-delimited JSON (`\n` terminated):

| Direction       | Payload                              | Action                          |
|-----------------|--------------------------------------|---------------------------------|
| Server → Client | `{"status":"LOCK"}`                  | Log off Windows user            |
| Server → Client | `{"status":"UNLOCK"}`                | Close lock overlay              |
| Server → Client | `{"status":"PING"}`                  | Keep-alive heartbeat            |
| Client → Server | `{"type":"HELLO","ip":"x.x.x.x"}`   | Client registration on connect  |

---

## Security Notes

- The server only accepts connections from a configurable IP whitelist (optional).
- The client verifies the server's IP before processing commands.
- Session timers are maintained in-memory; restart the server to clear all sessions.
