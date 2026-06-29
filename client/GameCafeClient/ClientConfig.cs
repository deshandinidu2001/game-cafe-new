// ClientConfig.cs
// ─────────────────────────────────────────────────────────────────────────────
// Central configuration constants for the Gaming Cafe Client.
// Edit SERVER_IP and SERVER_PORT before deployment.

namespace GameCafeClient;

/// <summary>
/// Compile-time configuration for the client application.
/// Change SERVER_IP to the actual server's IP address before building.
/// </summary>
internal static class ClientConfig
{
    // ── Network ──────────────────────────────────────────────────────────────

    /// <summary>The IP address of the management server.</summary>
    public const string ServerIp   = "192.168.1.13";

    /// <summary>The TCP port on which the server is listening.</summary>
    public const int    ServerPort = 9000;

    /// <summary>
    /// Seconds to wait between reconnection attempts when the server
    /// is unavailable.
    /// </summary>
    public const int    ReconnectDelaySeconds = 3;

    /// <summary>
    /// Timeout in milliseconds for the initial TCP connect call.
    /// </summary>
    public const int    ConnectTimeoutMs = 5_000;

    /// <summary>
    /// If no data is received from the server within this many milliseconds,
    /// the socket is considered dead and a reconnect is triggered.
    /// </summary>
    public const int    ReadTimeoutMs = 90_000;

    // ── UI ────────────────────────────────────────────────────────────────────

    /// <summary>Title text shown in the locked overlay.</summary>
    public const string LockTitle   = "SESSION ENDED";

    /// <summary>Body text shown in the locked overlay.</summary>
    public const string LockMessage = "Your gaming session has expired.\nPlease see the staff to start a new session.";

    // ── Application ───────────────────────────────────────────────────────────

    /// <summary>
    /// Mutex name — prevents more than one instance of the client running.
    /// </summary>
    public const string MutexName   = "Global\\GameCafeClient_SingleInstance";

    /// <summary>Application version string displayed in the overlay footer.</summary>
    public const string AppVersion  = "1.0.0";

    /// <summary>
    /// Reads the target app name from game.txt.
    /// </summary>
    public static string GetTargetApp()
    {
        try
        {
            var path = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "game.txt");
            if (System.IO.File.Exists(path))
            {
                var content = System.IO.File.ReadAllText(path).Trim();
                if (!string.IsNullOrWhiteSpace(content))
                    return content;
            }
        }
        catch { /* ignore */ }
        return "None";
    }
}
