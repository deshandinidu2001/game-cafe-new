// Program.cs
// ─────────────────────────────────────────────────────────────────────────────
// Application entry point.
//
// Startup sequence:
//   1. Acquire a named global mutex — abort if already running.
//   2. Configure WinForms for high-DPI awareness and visual styles.
//   3. Create an ApplicationController and run the message loop.
//   4. On exit, release resources and the mutex.

namespace GameCafeClient;

internal static class Program
{
    private static readonly AppLogger Log = AppLogger.For(nameof(Program));

    [STAThread]
    private static void Main()
    {
        // ── Single-instance guard ─────────────────────────────────────────────
        bool createdNew;
        using var mutex = new System.Threading.Mutex(
            initiallyOwned: true,
            name: ClientConfig.MutexName,
            out createdNew);

        if (!createdNew)
        {
            // Another instance is already running — silently exit
            Log.Warn("Another instance of GameCafeClient is already running. Exiting.");
            return;
        }

        // ── WinForms bootstrap ────────────────────────────────────────────────
        ApplicationConfiguration.Initialize(); // sets DPI awareness, visual styles

        // Install a global exception handler for the UI thread
        Application.ThreadException += (_, e) =>
        {
            Log.Error("Unhandled UI thread exception", e.Exception);
            // Do not crash — the app must keep running
        };

        // Install a global exception handler for background threads
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            var ex = e.ExceptionObject as Exception;
            Log.Error($"Unhandled domain exception (isTerminating={e.IsTerminating})",
                      ex ?? new Exception(e.ExceptionObject?.ToString() ?? "unknown"));
        };

        Log.Info($"GameCafeClient v{ClientConfig.AppVersion} starting.");
        Log.Info($"Server target: {ClientConfig.ServerIp}:{ClientConfig.ServerPort}");

        // ── Launch the application controller ─────────────────────────────────
        using var controller = new ApplicationController();
        controller.Run(); // blocks until Application.Exit() is called

        Log.Info("GameCafeClient exiting.");
        mutex.ReleaseMutex();
    }
}
