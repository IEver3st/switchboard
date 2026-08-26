export function formatRelativeTime(value: string | number, now = Date.now()): string {
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  const delta = now - timestamp;
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function formatVideoQuality(width: number, height: number, fps: number): string {
  const resolution = width > 0 && height > 0 ? `${height}p` : null;
  const frameRate = fps > 0 ? `${Math.round(fps)} FPS` : null;
  return [resolution, frameRate].filter(Boolean).join(', ') || 'Unavailable';
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor(total % 3_600 / 60);
  const remaining = total % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function formatReplayLength(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

export function formatClipTimestamp(value: number, now = Date.now()): string {
  const date = new Date(value);
  const elapsedMinutes = Math.max(0, Math.floor((now - value) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  if (sameDay(date, new Date(now))) return formatClock(date);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${formatClock(date)}`;
}

export function formatClipDateGroup(value: number, now = Date.now()): string {
  const date = new Date(value);
  const today = new Date(now);
  if (sameDay(date, today)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatMb(value: number): string {
  return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
}

export function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.max(0, Math.round(value))} B`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
