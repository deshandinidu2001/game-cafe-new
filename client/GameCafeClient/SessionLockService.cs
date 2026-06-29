// SessionLockService.cs
// ─────────────────────────────────────────────────────────────────────────────
// Handles the actual OS-level lock action.
// Strategy:
//   1. Try ExitWindowsEx via P/Invoke (preferred — no subprocess).
//   2. If that fails (insufficient privilege), fall back to
//      launching "shutdown /l /f" as a subprocess.

using System.Diagnostics;
using System.Runtime.InteropServices;

namespace GameCafeClient;

internal static class SessionLockService
{
    private static readonly AppLogger Log = AppLogger.For(nameof(SessionLockService));

    /// <summary>
    /// Attempt to terminate the configured target application, or a specific app if provided.
    /// </summary>
    public static void LockWorkstation(string? appName = null)
    {
        string targetApp = appName ?? ClientConfig.GetTargetApp();
        if (string.IsNullOrWhiteSpace(targetApp) || targetApp.Equals("None", StringComparison.OrdinalIgnoreCase))
        {
            Log.Info("No target app configured. Doing nothing on session lock.");
            return;
        }

        // Process.GetProcessesByName expects the name without .exe
        string processName = targetApp.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) 
            ? targetApp.Substring(0, targetApp.Length - 4) 
            : targetApp;

        Log.Info($"Attempting to terminate application: {processName}");

        try
        {
            var processes = Process.GetProcessesByName(processName);
            if (processes.Length == 0)
            {
                Log.Info($"No running processes found for: {processName}");
                return;
            }

            foreach (var process in processes)
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                    Log.Info($"Successfully killed process {process.Id} ({processName})");
                }
                catch (Exception ex)
                {
                    Log.Error($"Failed to kill process {process.Id} ({processName})", ex);
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error($"Error querying processes for {processName}", ex);
        }
    }
}
