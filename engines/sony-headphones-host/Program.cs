using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const int AfBluetooth = 32;
const int BluetoothProtocolRfcomm = 3;
var sonyMdrService = new Guid("956C7B26-D49A-4BA8-B03F-B17D393CB6E2");
var json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
var devices = new Dictionary<string, BluetoothDevice>();
var sessions = new Dictionary<string, Socket>();
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
        if (sessions.Remove(token, out var active)) active.Dispose();
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
                if (sessions.Remove(command.Token, out var prior)) prior.Dispose();
                var socket = new Socket((AddressFamily)AfBluetooth, SocketType.Stream, (ProtocolType)BluetoothProtocolRfcomm);
                using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8)))
                    await socket.ConnectAsync(new BluetoothEndPoint(target.Address, sonyMdrService), timeout.Token);
                sessions[command.Token] = socket;
                _ = Receive(command.Token, socket);
                await Emit(new { type = "response", command.RequestId, ok = true });
                await Emit(new { type = "connected", token = command.Token });
                break;
            case "send":
                if (command.Token is null || !sessions.TryGetValue(command.Token, out var activeSocket))
                    throw new InvalidOperationException("not-connected");
                var payload = Convert.FromBase64String(command.Bytes ?? string.Empty);
                await activeSocket.SendAsync(payload, SocketFlags.None, lifetime.Token);
                await Emit(new { type = "response", command.RequestId, ok = true });
                break;
            case "disconnect":
                if (command.Token is not null && sessions.Remove(command.Token, out var connected)) connected.Dispose();
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

sealed class BluetoothEndPoint(ulong address, Guid service) : EndPoint
{
    const int BluetoothAddressFamily = 32;
    public override AddressFamily AddressFamily => (AddressFamily)BluetoothAddressFamily;
    public override SocketAddress Serialize()
    {
        var result = new SocketAddress(AddressFamily, 32);
        Write(result, 2, BitConverter.GetBytes(address));
        Write(result, 10, service.ToByteArray());
        Write(result, 26, BitConverter.GetBytes(0u));
        return result;
    }
    public override EndPoint Create(SocketAddress socketAddress) => this;
    static void Write(SocketAddress target, int offset, byte[] source)
    {
        for (var i = 0; i < source.Length; i++) target[offset + i] = source[i];
    }
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
