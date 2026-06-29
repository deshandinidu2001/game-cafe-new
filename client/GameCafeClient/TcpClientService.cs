// TcpClientService.cs
// ─────────────────────────────────────────────────────────────────────────────
// Manages a persistent, auto-reconnecting TCP connection to the server.
//
// Behaviour:
//   • Connects to SERVER_IP:SERVER_PORT (from ClientConfig).
//   • On connect: sends a HELLO JSON message identifying this client.
//   • Reads newline-delimited JSON messages and forwards each line to the
//     CommandProcessor.
//   • On any error (connection refused, reset, timeout): waits
//     RECONNECT_DELAY_SECONDS then retries.
//   • Runs entirely on a background thread (not the UI thread).
//   • Supports a clean cancellation token for shutdown.

using System.Net.Sockets;
using System.Net;
using System.Text;
using System.Text.Json;

namespace GameCafeClient;

/// <summary>
/// Background service that maintains a TCP connection to the management server
/// and delivers received commands to a <see cref="CommandProcessor"/>.
/// </summary>
internal sealed class TcpClientService : IDisposable
{
    private static readonly AppLogger Log = AppLogger.For(nameof(TcpClientService));

    private readonly CommandProcessor         _processor;
    private readonly CancellationTokenSource  _cts = new();
    private          Task?                    _runTask;
    private          TcpClient?               _tcpClient;
    private          bool                     _disposed;

    // ── Registration payload sent on each fresh connection ───────────────────

    private static byte[] BuildHelloPayload()
    {
        var hello = new
        {
            type      = "HELLO",
            ip        = GetLocalIp(),
            hostname  = Environment.MachineName,
            version   = ClientConfig.AppVersion,
            targetApp = ClientConfig.GetTargetApp(),
        };
        return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(hello) + "\n");
    }

    private static string GetLocalIp()
    {
        try
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var addr in host.AddressList)
            {
                if (addr.AddressFamily == AddressFamily.InterNetwork)
                    return addr.ToString();
            }
        }
        catch { /* ignore */ }
        return "0.0.0.0";
    }

    // ─────────────────────────────────────────────────────────────────────────

    public TcpClientService(CommandProcessor processor)
    {
        _processor = processor;
    }

    /// <summary>
    /// Start the background reconnect-loop task.
    /// </summary>
    public void Start()
    {
        _runTask = Task.Run(() => RunLoop(_cts.Token), _cts.Token);
        Log.Info("TCP client service started.");
    }

    // ── Main Reconnect Loop ───────────────────────────────────────────────────

    private async Task RunLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ConnectAndRead(ct);
            }
            catch (OperationCanceledException)
            {
                Log.Info("TCP service cancellation requested — exiting loop.");
                break;
            }
            catch (Exception ex)
            {
                Log.Warn($"Connection lost: {ex.Message}. Reconnecting in {ClientConfig.ReconnectDelaySeconds}s…");
            }

            if (!ct.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(
                        TimeSpan.FromSeconds(ClientConfig.ReconnectDelaySeconds),
                        ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        Log.Info("TCP client service loop exited.");
    }

    // ── Single Connection Lifecycle ───────────────────────────────────────────

    private async Task ConnectAndRead(CancellationToken ct)
    {
        Log.Info($"Connecting to {ClientConfig.ServerIp}:{ClientConfig.ServerPort}…");

        // Dispose any previous client
        _tcpClient?.Dispose();
        _tcpClient = new TcpClient
        {
            NoDelay          = true,
            ReceiveTimeout   = ClientConfig.ReadTimeoutMs,
            SendTimeout      = 5_000,
            ReceiveBufferSize = 8_192,
        };

        // Connect with a timeout
        using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        connectCts.CancelAfter(ClientConfig.ConnectTimeoutMs);

        try
        {
            await _tcpClient.ConnectAsync(
                ClientConfig.ServerIp,
                ClientConfig.ServerPort,
                connectCts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // Outer CancellationToken is fine; inner timeout fired
            throw new TimeoutException(
                $"Connection to {ClientConfig.ServerIp}:{ClientConfig.ServerPort} timed out after {ClientConfig.ConnectTimeoutMs}ms.");
        }

        Log.Info("Connected to server.");

        NetworkStream stream = _tcpClient.GetStream();

        // Send HELLO registration message
        await stream.WriteAsync(BuildHelloPayload(), ct);
        Log.Info("HELLO sent to server.");

        // Start background sender for apps list
        using var appListCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var appListTask = SendAppListLoopAsync(stream, appListCts.Token);

        try
        {
            // Read lines indefinitely until the connection drops or ct fires
            await ReadLinesAsync(stream, ct);
        }
        finally
        {
            appListCts.Cancel();
            try { await appListTask; } catch { }
        }
    }

    private async Task SendAppListLoopAsync(NetworkStream stream, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var apps = System.Diagnostics.Process.GetProcesses()
                    .Where(p => p.MainWindowHandle != IntPtr.Zero && !string.IsNullOrWhiteSpace(p.MainWindowTitle))
                    .Select(p => new { name = p.ProcessName, title = p.MainWindowTitle })
                    .ToList();

                var payload = new
                {
                    type = "APPS_LIST",
                    apps = apps
                };

                var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload) + "\n");
                await stream.WriteAsync(bytes, ct);
            }
            catch { /* ignore */ }

            if (!ct.IsCancellationRequested)
            {
                try { await Task.Delay(5000, ct); }
                catch { }
            }
        }
    }

    // ── Line-framed Reader ────────────────────────────────────────────────────

    private async Task ReadLinesAsync(NetworkStream stream, CancellationToken ct)
    {
        // Use a StreamReader for convenient line-based reading
        using var reader = new System.IO.StreamReader(stream, Encoding.UTF8, leaveOpen: true);

        string? line;
        while (!ct.IsCancellationRequested)
        {
            // ReadLineAsync with CancellationToken (.NET 7+)
            line = await reader.ReadLineAsync(ct).ConfigureAwait(false);

            if (line is null)
            {
                // Null means the server closed the connection cleanly
                Log.Warn("Server closed the connection (EOF).");
                break;
            }

            line = line.Trim();
            if (line.Length > 0)
            {
                _processor.Process(line);
            }
        }
    }

    // ── Shutdown ──────────────────────────────────────────────────────────────

    public void Stop()
    {
        if (!_cts.IsCancellationRequested)
        {
            Log.Info("Stopping TCP client service…");
            _cts.Cancel();
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        Stop();

        _tcpClient?.Dispose();
        _tcpClient = null;

        _cts.Dispose();
        Log.Info("TcpClientService disposed.");
    }
}
