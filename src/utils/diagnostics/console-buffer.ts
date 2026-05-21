/**
 * Console Buffer
 *
 * Wraps the global console at boot, retaining a ring buffer of recent messages
 * for diagnostic snapshots. The original console behavior is preserved — entries
 * still print to devtools as usual.
 *
 * Must be installed before anything else logs, otherwise early messages are
 * lost. Idempotent: re-importing does not double-wrap.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleEntry {
  level: ConsoleLevel;
  timestamp: string;
  message: string;
}

const MAX_ENTRIES = 500;
const MAX_MESSAGE_CHARS = 2000;

const buffer: ConsoleEntry[] = [];
let installed = false;

/** Best-effort stringify of console args; falls back to `[Unserializable]`. */
function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
  try {
    return JSON.stringify(arg);
  } catch {
    try {
      return String(arg);
    } catch {
      return '[Unserializable]';
    }
  }
}

function record(level: ConsoleLevel, args: unknown[]): void {
  let message = args.map(stringifyArg).join(' ');
  if (message.length > MAX_MESSAGE_CHARS) {
    message = `${message.slice(0, MAX_MESSAGE_CHARS)}… [truncated ${message.length - MAX_MESSAGE_CHARS} chars]`;
  }
  buffer.push({ level, timestamp: new Date().toISOString(), message });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function installConsoleBuffer(): void {
  if (installed) return;
  installed = true;
  const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      record(level, args);
      original(...args);
    };
  }
}

/** Snapshot copy of the current buffer. */
export function getConsoleBuffer(): ConsoleEntry[] {
  return buffer.slice();
}
