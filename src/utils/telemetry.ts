export type TelemetryEvent =
  | 'session_start'
  | 'workspace_exported'
  | 'workspace_imported';

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

/**
 * Fire-and-forget ping to the server-side counter.
 * Never throws — telemetry must never impact the app.
 */
export function ping(event: TelemetryEvent): void {
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return;
  }

  fetch('/api/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true, // lets the request complete even if the page is unloading
  }).catch(() => {
    // Silently ignored.
  });
}
