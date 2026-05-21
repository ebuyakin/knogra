import { Redis } from '@upstash/redis';

// Events we accept — anything else is rejected to prevent arbitrary key creation in KV.
const ALLOWED_EVENTS = new Set([
  'session_start',
  'workspace_exported',
  'workspace_imported',
]);

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  try {
    const body = await req.json() as { event?: unknown };
    const event = body.event;

    if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
      return new Response(null, { status: 400 });
    }

    const redis = Redis.fromEnv();
    const today = new Date().toISOString().slice(0, 10); // "2026-05-21"
    await redis.incr(`ping:${event}:${today}`);
  } catch {
    // Ignore errors — a broken KV connection must not surface to the client.
  }

  // Always return 204 so the client never sees a failure.
  return new Response(null, { status: 204 });
}
