// WindowsApi.cs
// ─────────────────────────────────────────────────────────────────────────────
// P/Invoke declarations for all Win32 APIs used by the client.
// Kept in one file so that unsafe surface area is easy to audit.

using System.Runtime.InteropServices;

namespace GameCafeClient;

/// <summary>
/// Win32 P/Invoke declarations. All methods are marked internal so only
/// code within this assembly can call them.
/// </summary>
internal static class WindowsApi
{
    // ── ExitWindowsEx ─────────────────────────────────────────────────────────

    /// <summary>Flags for ExitWindowsEx.</summary>
    [Flags]
    internal enum ExitFlags : uint
    {
        /// <summary>Log off the current user.</summary>
        EWX_LOGOFF   = 0x00000000,
        /// <summary>Force running applications to close before logging off.</summary>
        EWX_FORCE    = 0x00000004,
        /// <summary>Force applications to terminate if they don't close within the timeout.</summary>
        EWX_FORCEIFHUNG = 0x00000010,
    }

    /// <summary>
    /// Logs off, shuts down, or restarts the system.
    /// Requires SE_SHUTDOWN_NAME privilege in most contexts.
    /// </summary>
    /// <param name="uFlags">Combination of ExitFlags values.</param>
    /// <param name="dwReason">Reason code (optional, pass 0).</param>
    /// <returns>Non-zero on success.</returns>
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool ExitWindowsEx(uint uFlags, uint dwReason);

    // ── AdjustTokenPrivileges (needed for shutdown privilege) ─────────────────

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool OpenProcessToken(
        IntPtr  ProcessHandle,
        uint    DesiredAccess,
        out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool LookupPrivilegeValue(
        string? lpSystemName,
        string  lpName,
        out     LUID lpLuid);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool AdjustTokenPrivileges(
        IntPtr              TokenHandle,
        [MarshalAs(UnmanagedType.Bool)] bool DisableAllPrivileges,
        ref TOKEN_PRIVILEGES NewState,
        uint                BufferLength,
        IntPtr              PreviousState,
        IntPtr              ReturnLength);

    [DllImport("kernel32.dll")]
    internal static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CloseHandle(IntPtr hObject);

    // ── Structs for privilege escalation ──────────────────────────────────────

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct LUID
    {
        public uint  LowPart;
        public int   HighPart;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct LUID_AND_ATTRIBUTES
    {
        public LUID  Luid;
        public uint  Attributes;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct TOKEN_PRIVILEGES
    {
        public uint               PrivilegeCount;
        public LUID_AND_ATTRIBUTES Privileges;
    }

    // Constants
    internal const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
    internal const uint TOKEN_QUERY             = 0x0008;
    internal const uint SE_PRIVILEGE_ENABLED    = 0x00000002;
    internal const string SE_SHUTDOWN_NAME      = "SeShutdownPrivilege";

    // ── Window API (used by OverlayForm) ──────────────────────────────────────

    [DllImport("user32.dll")]
    internal static extern IntPtr SetWindowsHookEx(
        int    idHook,
        LowLevelKeyboardProc lpfn,
        IntPtr hMod,
        uint   dwThreadId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    internal static extern IntPtr CallNextHookEx(
        IntPtr hhk,
        int    nCode,
        IntPtr wParam,
        IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    internal static extern IntPtr GetModuleHandle(string? lpModuleName);

    /// <summary>Delegate for the low-level keyboard hook callback.</summary>
    internal delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    // Low-level keyboard hook ID
    internal const int WH_KEYBOARD_LL = 13;

    // Key codes
    internal const int VK_F4  = 0x73;
    internal const int VK_TAB = 0x09;
    internal const int VK_ESCAPE = 0x1B;
    internal const int VK_DELETE  = 0x2E;

    // Windows message codes for key events
    internal const int WM_KEYDOWN    = 0x0100;
    internal const int WM_SYSKEYDOWN = 0x0104;

    // GetAsyncKeyState modifier checks
    [DllImport("user32.dll")]
    internal static extern short GetAsyncKeyState(int vKey);

    internal const int VK_MENU    = 0x12; // Alt key
    internal const int VK_CONTROL = 0x11; // Ctrl key
    internal const int VK_LWIN    = 0x5B; // Left Windows key
    internal const int VK_RWIN    = 0x5C; // Right Windows key
}
