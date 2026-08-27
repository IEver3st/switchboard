using System.Collections.Concurrent;

namespace Switchboard.CaptureHost;

internal sealed class OperationTracker
{
    private readonly ConcurrentDictionary<Guid, Task> operations = new();

    public int Count => operations.Count;
    public Task[] Pending => [.. operations.Values];

    public void Track(Task operation)
    {
        var operationId = Guid.NewGuid();
        operations[operationId] = operation;
        _ = operation.ContinueWith(
            _ => operations.TryRemove(operationId, out var _),
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }
}
