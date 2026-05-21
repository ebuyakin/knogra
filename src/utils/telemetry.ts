export type TelemetryEvent =
  | 'session_start'
  | 'workspace_exported'
  | 'workspace_imported';

/**
 * Fire-and-forget ping to the server-side counter.
 * Never throws — telemetry must never impact the app.
 */
export function ping(event: TelemetryEvent): void {
  fetch('/api/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true, // lets the request complete even if the page is unloading
  }).catch(() => {
    // Silently ignored.
  });
}
