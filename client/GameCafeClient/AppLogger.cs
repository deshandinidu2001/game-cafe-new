// AppLogger.cs
// ─────────────────────────────────────────────────────────────────────────────
// Minimal file + debug output logger for the client application.
// Writes timestamped entries to a rolling log file in %LOCALAPPDATA%.

namespace GameCafeClient;

/// <summary>
/// Thread-safe logger that writes to both a log file and the Visual Studio
/// debug output window.
/// </summary>
internal sealed class AppLogger
{
    private static readonly string LogDirectory =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "GameCafeClient",
            "Logs");

    private static readonly string LogFilePath =
        Path.Combine(LogDirectory, $"client_{DateTime.Now:yyyyMMdd}.log");

    private static readonly object FileLock = new();

    private readonly string _context;

    private AppLogger(string context)
    {
        _context = context;
    }

    /// <summary>Create a logger scoped to a class or component name.</summary>
    public static AppLogger For(string context)
    {
        // Ensure log directory exists (idempotent)
        try { Directory.CreateDirectory(LogDirectory); } catch { /* ignore */ }
        return new AppLogger(context);
    }

    // ─────────────────────────────────────────────────────────────────────────

    public void Debug(string message)   => Write("DEBUG", message);
    public void Info(string message)    => Write("INFO ", message);
    public void Warn(string message)    => Write("WARN ", message);
    public void Error(string message)   => Write("ERROR", message);

    public void Error(string message, Exception ex) =>
        Write("ERROR", $"{message} | {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");

    private void Write(string level, string message)
    {
        string line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] [{_context}] {message}";

        // VS debug output (no-op in release)
        System.Diagnostics.Debug.WriteLine(line);

        // File output — fire-and-forget with lock to prevent interleaving
        lock (FileLock)
        {
            try
            {
                File.AppendAllText(LogFilePath, line + Environment.NewLine);
            }
            catch
            {
                // If we can't write to the log file, there's nothing sensible to do
            }
        }
    }
}
