/**
 * Error Buffer
 *
 * Captures uncaught errors and unhandled promise rejections via global
 * window listeners. Diagnostic snapshots include this buffer to surface
 * failures that may have already been dismissed in devtools.
 */

export interface ErrorEntry {
  kind: 'error' | 'unhandledrejection';
  timestamp: string;
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
}

const MAX_ENTRIES = 100;
const buffer: ErrorEntry[] = [];
let installed = false;

function push(entry: ErrorEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function installErrorBuffer(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    push({
      kind: 'error',
      timestamp: new Date().toISOString(),
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    push({
      kind: 'unhandledrejection',
      timestamp: new Date().toISOString(),
      message,
      stack,
    });
  });
}

export function getErrorBuffer(): ErrorEntry[] {
  return buffer.slice();
}
