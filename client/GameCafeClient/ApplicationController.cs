// ApplicationController.cs
// ─────────────────────────────────────────────────────────────────────────────
// Orchestrates the entire client-side lifecycle:
//   • Creates and wires CommandProcessor, TcpClientService, and OverlayForm.
//   • Implements the LOCK action: show overlay, then call SessionLockService.
//   • Implements the UNLOCK action: hide the overlay.
//   • Runs the WinForms application loop.
//   • Disposes all services on exit.

namespace GameCafeClient;

/// <summary>
/// Top-level controller that owns and coordinates all client components.
/// </summary>
internal sealed class ApplicationController : IDisposable
{
    private static readonly AppLogger Log = AppLogger.For(nameof(ApplicationController));

    private readonly SynchronizationContext _uiContext;
    private readonly CommandProcessor       _processor;
    private readonly TcpClientService       _tcpService;

    private bool _disposed;

    public ApplicationController()
    {
        // The SynchronizationContext must be captured AFTER WinForms is
        // initialised (ApplicationConfiguration.Initialize() above), but
        // BEFORE starting background threads.
        // We create a hidden control to force the WinForms sync context to
        // install itself on the current thread.
        using var bootstrapForm = new Form();
        bootstrapForm.CreateControl(); // force handle creation
        _uiContext = SynchronizationContext.Current
            ?? throw new InvalidOperationException("WinForms SynchronizationContext not available.");

        // Wire up the command processor with UI callbacks
        _processor = new CommandProcessor(
            onLock:   OnLockCommand,
            onUnlock: OnUnlockCommand,
            uiContext: _uiContext);

        // Wire up the TCP client
        _tcpService = new TcpClientService(_processor);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Start the TCP background service and enter the WinForms message loop.
    /// This method blocks until the application exits.
    /// </summary>
    public void Run()
    {
        _tcpService.Start();
        Log.Info("TCP service started. Running WinForms message loop.");

        // Run without a main window — the overlay is shown only on demand.
        // Application.Run() without a Form still processes Windows messages.
        Application.Run();
    }

    // ── Command Handlers (called on UI thread via SynchronizationContext) ─────

    /// <summary>
    /// Called when the server sends LOCK.
    /// Shows the overlay immediately, then triggers the OS log-off.
    /// </summary>
    private void OnLockCommand()
    {
        Log.Info("LOCK command received.");

        // Terminate the active game
        SessionLockService.LockWorkstation();
    }

    /// <summary>
    /// Called when the server sends UNLOCK.
    /// Hides the overlay window so the user can interact with the desktop.
    /// </summary>
    private void OnUnlockCommand()
    {
        Log.Info("UNLOCK command received. Overlay logic has been removed.");
    }

    // ── Disposal ──────────────────────────────────────────────────────────────

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        Log.Info("ApplicationController disposing…");

        _tcpService.Dispose();

        Log.Info("ApplicationController disposed.");
    }
}
