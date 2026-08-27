using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using System.Collections.Concurrent;

var sonyMdrService = new Guid("956C7B26-D49A-4BA8-B03F-B17D393CB6E2");
var json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
var devices = new Dictionary<string, BluetoothDevice>();
var sessions = new ConcurrentDictionary<string, Socket>();
var outputLock = new SemaphoreSlim(1, 1);
var lifetime = new CancellationTokenSource();

async Task Emit(object value)
{
    await outputLock.WaitAsync();
    try { await Console.Out.WriteLineAsync(JsonSerializer.Serialize(value, json)); }
    finally { outputLock.Release(); }
}

async Task Receive(string token, Socket socket)
{
    var buffer = new byte[4096];
    try
    {
        while (!lifetime.IsCancellationRequested)
        {
            var read = await socket.ReceiveAsync(buffer, SocketFlags.None, lifetime.Token);
            if (read == 0) break;
            await Emit(new { type = "data", token, bytes = Convert.ToBase64String(buffer, 0, read) });
        }
        await Emit(new { type = "disconnected", token, reason = "remote-closed" });
    }
    catch (OperationCanceledException) { }
    catch (Exception error)
    {
        await Emit(new { type = "disconnected", token, reason = ErrorCode(error) });
    }
    finally
    {
        if (sessions.TryGetValue(token, out var active) && ReferenceEquals(active, socket)) {
            sessions.TryRemove(token, out _);
            active.Dispose();
        }
    }
}

async Task SendAll(Socket socket, byte[] payload)
{
    var offset = 0;
    while (offset < payload.Length)
    {
        var written = await socket.SendAsync(payload.AsMemory(offset), SocketFlags.None, lifetime.Token);
        if (written == 0) throw new IOException("Bluetooth socket closed during send.");
        offset += written;
    }
}

string Token(ulong address)
{
    var digest = SHA256.HashData(BitConverter.GetBytes(address));
    return Convert.ToHexString(digest[..10]).ToLowerInvariant();
}

string ErrorCode(Exception error) => error switch
{
    SocketException socketError => $"socket-{socketError.SocketErrorCode.ToString().ToLowerInvariant()}",
    _ => error.GetType().Name.ToLowerInvariant(),
};

await Emit(new { type = "ready", protocolVersion = 1 });
while (!lifetime.IsCancellationRequested)
{
    var line = await Console.In.ReadLineAsync(lifetime.Token);
    if (line is null) break;
    HostCommand? command;
    try { command = JsonSerializer.Deserialize<HostCommand>(line, json); }
    catch
    {
        await Emit(new { type = "error", requestId = (string?)null, code = "invalid-json" });
        continue;
    }
    if (command?.Type is null) continue;
    try
    {
        switch (command.Type)
        {
            case "scan":
                devices.Clear();
                foreach (var device in BluetoothDiscovery.FindKnown()) devices[Token(device.Address)] = device;
                await Emit(new {
                    type = "response", command.RequestId, ok = true,
                    devices = devices.Select(pair => new {
                        token = pair.Key, name = pair.Value.Name, connected = pair.Value.Connected,
                        authenticated = pair.Value.Authenticated, remembered = pair.Value.Remembered,
                    }),
                });
                break;
            case "connect":
                if (command.Token is null || !devices.TryGetValue(command.Token, out var target))
                    throw new InvalidOperationException("unknown-device");
                if (sessions.TryRemove(command.Token, out var prior)) prior.Dispose();
                var socket = BluetoothSocket.Connect(target.Address, sonyMdrService, 8_000);
                sessions[command.Token] = socket;
                _ = Receive(command.Token, socket);
                await Emit(new { type = "response", command.RequestId, ok = true });
                await Emit(new { type = "connected", token = command.Token });
                break;
            case "send":
                if (command.Token is null || !sessions.TryGetValue(command.Token, out var activeSocket))
                    throw new InvalidOperationException("not-connected");
                var payload = Convert.FromBase64String(command.Bytes ?? string.Empty);
                await SendAll(activeSocket, payload);
                await Emit(new { type = "response", command.RequestId, ok = true });
                break;
            case "disconnect":
                if (command.Token is not null && sessions.TryRemove(command.Token, out var connected)) connected.Dispose();
                await Emit(new { type = "response", command.RequestId, ok = true });
                break;
            case "shutdown":
                await Emit(new { type = "response", command.RequestId, ok = true });
                lifetime.Cancel();
                break;
            default:
                await Emit(new { type = "error", command.RequestId, code = "unknown-command" });
                break;
        }
    }
    catch (Exception error)
    {
        await Emit(new { type = "error", command.RequestId, code = ErrorCode(error) });
    }
}

lifetime.Cancel();
foreach (var socket in sessions.Values) socket.Dispose();

sealed record HostCommand(string? Type, string? RequestId, string? Token, string? Bytes);
sealed record BluetoothDevice(ulong Address, string Name, bool Connected, bool Remembered, bool Authenticated);

static class BluetoothSocket
{
    const int AfBluetooth = 32;
    const int SocketStream = 1;
    const int ProtocolRfcomm = 3;
    static readonly object StartupLock = new();
    static bool winsockStarted;

    public static Socket Connect(ulong address, Guid service, int timeoutMilliseconds)
    {
        EnsureWinsock();
        var handle = socket(AfBluetooth, SocketStream, ProtocolRfcomm);
        if (handle == new IntPtr(-1)) throw new SocketException(WSAGetLastError());
        var endpoint = new SockAddrBth { AddressFamily = AfBluetooth, Address = address, ServiceClassId = service, Port = uint.MaxValue };
        uint nonblocking = 1;
        if (ioctlsocket(handle, unchecked((int)0x8004667e), ref nonblocking) != 0) return Fail(handle, WSAGetLastError());
        var result = connect(handle, ref endpoint, Marshal.SizeOf<SockAddrBth>());
        if (result != 0)
        {
            var error = WSAGetLastError();
            if (error is not (10035 or 10036 or 10022)) return Fail(handle, error);
            var descriptor = new WsaPollFd { Socket = handle, Events = 0x0010 };
            if (WSAPoll(ref descriptor, 1, timeoutMilliseconds) <= 0 || (descriptor.ReturnedEvents & 0x0007) != 0)
                return Fail(handle, 10060);
            var socketError = 0;
            var socketErrorLength = sizeof(int);
            if (getsockopt(handle, 0xffff, 0x1007, ref socketError, ref socketErrorLength) != 0 || socketError != 0)
                return Fail(handle, socketError == 0 ? WSAGetLastError() : socketError);
        }
        uint blocking = 0;
        if (ioctlsocket(handle, unchecked((int)0x8004667e), ref blocking) != 0) return Fail(handle, WSAGetLastError());
        return new Socket(new SafeSocketHandle(handle, ownsHandle: true));
    }

    static Socket Fail(IntPtr handle, int error) { closesocket(handle); throw new SocketException(error); }

    static void EnsureWinsock()
    {
        lock (StartupLock)
        {
            if (winsockStarted) return;
            var data = Marshal.AllocHGlobal(512);
            try
            {
                var result = WSAStartup(0x0202, data);
                if (result != 0) throw new SocketException(result);
                winsockStarted = true;
            }
            finally { Marshal.FreeHGlobal(data); }
        }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct SockAddrBth
    {
        public ushort AddressFamily;
        public ulong Address;
        public Guid ServiceClassId;
        public uint Port;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct WsaPollFd { public IntPtr Socket; public short Events; public short ReturnedEvents; }

    [DllImport("Ws2_32.dll", SetLastError = true)] static extern IntPtr socket(int addressFamily, int socketType, int protocol);
    [DllImport("Ws2_32.dll", SetLastError = true)] static extern int connect(IntPtr socket, ref SockAddrBth name, int nameLength);
    [DllImport("Ws2_32.dll")] static extern int ioctlsocket(IntPtr socket, int command, ref uint argument);
    [DllImport("Ws2_32.dll")] static extern int WSAPoll(ref WsaPollFd descriptors, uint count, int timeoutMilliseconds);
    [DllImport("Ws2_32.dll")] static extern int getsockopt(IntPtr socket, int level, int option, ref int value, ref int valueLength);
    [DllImport("Ws2_32.dll")] static extern int closesocket(IntPtr socket);
    [DllImport("Ws2_32.dll")] static extern int WSAGetLastError();
    [DllImport("Ws2_32.dll")] static extern int WSAStartup(ushort requestedVersion, IntPtr data);
}

static class BluetoothDiscovery
{
    public static IEnumerable<BluetoothDevice> FindKnown()
    {
        var search = new BluetoothDeviceSearchParams {
            Size = Marshal.SizeOf<BluetoothDeviceSearchParams>(),
            ReturnAuthenticated = 1, ReturnRemembered = 1, ReturnConnected = 1,
            ReturnUnknown = 0, IssueInquiry = 0, TimeoutMultiplier = 1,
        };
        var info = new BluetoothDeviceInfo { Size = Marshal.SizeOf<BluetoothDeviceInfo>() };
        var handle = BluetoothFindFirstDevice(ref search, ref info);
        if (handle == IntPtr.Zero) yield break;
        try
        {
            do
            {
                yield return new BluetoothDevice(info.Address, info.Name ?? string.Empty,
                    info.Connected != 0, info.Remembered != 0, info.Authenticated != 0);
                info = new BluetoothDeviceInfo { Size = Marshal.SizeOf<BluetoothDeviceInfo>() };
            } while (BluetoothFindNextDevice(handle, ref info));
        }
        finally { BluetoothFindDeviceClose(handle); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct BluetoothDeviceSearchParams
    {
        public int Size;
        public int ReturnAuthenticated;
        public int ReturnRemembered;
        public int ReturnUnknown;
        public int ReturnConnected;
        public int IssueInquiry;
        public byte TimeoutMultiplier;
        public IntPtr Radio;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct BluetoothDeviceInfo
    {
        public int Size;
        public ulong Address;
        public uint ClassOfDevice;
        public int Connected;
        public int Remembered;
        public int Authenticated;
        public SystemTime LastSeen;
        public SystemTime LastUsed;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string? Name;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SystemTime { public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds; }

    [DllImport("BluetoothApis.dll", SetLastError = true)]
    static extern IntPtr BluetoothFindFirstDevice(ref BluetoothDeviceSearchParams search, ref BluetoothDeviceInfo info);
    [DllImport("BluetoothApis.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool BluetoothFindNextDevice(IntPtr findHandle, ref BluetoothDeviceInfo info);
    [DllImport("BluetoothApis.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool BluetoothFindDeviceClose(IntPtr findHandle);
}
