// CommandProcessor.cs
// ─────────────────────────────────────────────────────────────────────────────
// Parses incoming JSON messages from the server and dispatches the
// appropriate action on the UI thread.

using System.Text.Json;
using System.Text.Json.Serialization;

namespace GameCafeClient;

/// <summary>
/// The set of status values the server can send to the client.
/// </summary>
internal enum ServerStatus
{
    LOCK,
    UNLOCK,
    PING,
    KILL_APP,
    UNKNOWN,
}

/// <summary>
/// Strongly-typed representation of a server message.
/// </summary>
internal sealed class ServerMessage
{
    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public string? Timestamp { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }

    [JsonPropertyName("appName")]
    public string? AppName { get; init; }

    /// <summary>Parse the Status string into the <see cref="ServerStatus"/> enum.</summary>
    public ServerStatus ParsedStatus =>
        Enum.TryParse<ServerStatus>(Status, ignoreCase: true, out var val) ? val : ServerStatus.UNKNOWN;
}

/// <summary>
/// Deserialises JSON lines received from the server and triggers UI/OS actions.
/// All UI-affecting callbacks are marshalled to the WinForms UI thread.
/// </summary>
internal sealed class CommandProcessor
{
    private static readonly AppLogger Log = AppLogger.For(nameof(CommandProcessor));

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling         = JsonCommentHandling.Skip,
    };

    // ── Delegates passed in from ApplicationController ─────────────────────

    /// <summary>Invoked when a LOCK command is received.</summary>
    private readonly Action _onLock;

    /// <summary>Invoked when an UNLOCK command is received.</summary>
    private readonly Action _onUnlock;

    /// <summary>The WinForms synchronisation context to marshal UI calls onto.</summary>
    private readonly SynchronizationContext _uiContext;

    public CommandProcessor(
        Action onLock,
        Action onUnlock,
        SynchronizationContext uiContext)
    {
        _onLock    = onLock;
        _onUnlock  = onUnlock;
        _uiContext = uiContext;
    }

    /// <summary>
    /// Process a single newline-terminated JSON string received from the server.
    /// This method is called from the network thread; UI actions are dispatched
    /// onto the WinForms message loop.
    /// </summary>
    /// <param name="jsonLine">A single JSON object as a string (no trailing newline).</param>
    public void Process(string jsonLine)
    {
        if (string.IsNullOrWhiteSpace(jsonLine)) return;

        ServerMessage? msg;
        try
        {
            msg = JsonSerializer.Deserialize<ServerMessage>(jsonLine, JsonOptions);
        }
        catch (JsonException ex)
        {
            Log.Warn($"Malformed JSON from server: {ex.Message} | Raw: {jsonLine}");
            return;
        }

        if (msg is null)
        {
            Log.Warn("Deserialisation returned null — ignoring.");
            return;
        }

        Log.Info($"Received command: {msg.Status}" + (msg.Reason is not null ? $" ({msg.Reason})" : ""));

        switch (msg.ParsedStatus)
        {
            case ServerStatus.LOCK:
                // Lock: first show the overlay (UI), then force log-off
                _uiContext.Post(_ =>
                {
                    Log.Info("Dispatching LOCK action on UI thread.");
                    _onLock();
                }, null);
                break;

            case ServerStatus.UNLOCK:
                _uiContext.Post(_ =>
                {
                    Log.Info("Dispatching UNLOCK action on UI thread.");
                    _onUnlock();
                }, null);
                break;

            case ServerStatus.PING:
                // PING is a keep-alive — just log it at debug level
                Log.Debug("PING received — connection alive.");
                break;

            case ServerStatus.KILL_APP:
                if (!string.IsNullOrWhiteSpace(msg.AppName))
                {
                    _uiContext.Post(_ =>
                    {
                        Log.Info($"Dispatching KILL_APP for '{msg.AppName}' on UI thread.");
                        SessionLockService.LockWorkstation(msg.AppName);
                    }, null);
                }
                break;

            case ServerStatus.UNKNOWN:
            default:
                Log.Warn($"Unrecognised status value: \"{msg.Status}\"");
                break;
        }
    }
}
