# Telemetry Design

> **Status:** Current  
> **Last reviewed:** 2026-06-14  
> **Authority:** Canonical source for telemetry scope, privacy constraints, and event semantics.  
> **Implementation:** `src/utils/telemetry.ts` (client), `api/ping.ts` (server)  
> **Related:** [Documentation map](README.md)

## Purpose

Knogra is a local-first, offline-capable app — there is no server that sees user activity. Without any telemetry, the only way to know whether the app is being used after launch is to check for support requests or social mentions.

Telemetry gives us aggregate usage counts so we can answer the most basic product questions:

- Is anyone opening the app?
- Are people engaged enough to save their work?
- Is the tutorial being picked up?

It is **not** for debugging individual sessions, not for analytics dashboards, and not for tracking behavior across pages. It is a simple existence check for a freshly launched product.

---

## Non-goals

- No user identification — no cookies, no device IDs, no fingerprinting
- No session tracking — events are independent counts; a sequence of pings cannot be tied together
- No behavioral analytics — no click paths, no time-on-page, no scroll depth
- No PII — no IP addresses stored, no usernames, no graph content
- No third-party analytics services (Mixpanel, Segment, GA, etc.)

These are permanent constraints, not deferred features. The privacy section on the landing page makes them a commitment.

---

## Approach

Three events, fired at natural action boundaries — not continuously, not on timers. Each event answers one product question.

| Event | Fires when | Question it answers |
|---|---|---|
| `session_start` | App finishes loading (once per page load) | Are people opening the app? |
| `workspace_exported` | User successfully downloads a `.knogra` file | Are people building something worth saving? |
| `workspace_imported` | User successfully loads a `.knogra` file | Are people importing the tutorial? Sharing graphs? |

**Why not `ai_chat_sent`?** Every message in a conversation would fire a ping — 30 messages in one session would look like 30 users. The count is uninterpretable. If session counts grow, AI usage follows automatically; it does not need its own event.

**Why not node creation, scene changes, etc.?** Too granular. The app does not need behavioral analytics at launch. Low-value events add volume, complexity, and maintenance cost.

---

## Architecture

```
Browser (client)                Vercel Edge (server)         Upstash Redis
────────────────                ─────────────────────        ─────────────
ping('session_start')
  → fetch POST /api/ping   →   api/ping.ts                  INCR ping:session_start:2026-05-21
    { event: "session_start" }   validates event name    →   ping:session_start:2026-05-21 = 42
    keepalive: true              INCRs the daily key
    errors swallowed             returns 204
```

Keys in Redis follow the pattern `ping:{event}:{YYYY-MM-DD}`. Daily granularity is enough — there is no need to query by hour or minute.

---

## Constraints

### Offline behavior
The app must remain fully functional with no network. The `ping()` call in `telemetry.ts` is completely fire-and-forget: it calls `fetch()` and catches all errors silently. A failed network request has zero effect on the app. Offline users simply generate no telemetry, which is expected and acceptable.

### Vercel free tier limits
The Hobby plan provides 100,000 serverless function invocations per month. At 3 events per active user session, the budget supports ~33,000 daily active users before any cost is incurred. This is far above any realistic early-stage load.

### No local dev data
`/api/ping` only exists on Vercel — it does not run during local development (`npm run dev`). The `fetch` to `/api/ping` will fail with a network error locally, which is silently ignored. No local Redis setup is needed.

### Vercel KV is deprecated
`@vercel/kv` is deprecated as of mid-2025. We use `@upstash/redis` directly (the underlying library). When creating the Vercel project, add an Upstash Redis store via the Vercel Marketplace integrations. Vercel automatically injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into the deployment environment. `Redis.fromEnv()` in `api/ping.ts` reads these.

---

## Implementation

### Client: `src/utils/telemetry.ts`

Exports one function and one type:

```typescript
export type TelemetryEvent = 'session_start' | 'workspace_exported' | 'workspace_imported';
export function ping(event: TelemetryEvent): void
```

`ping()` is synchronous from the caller's perspective — it fires and returns immediately. The HTTP request completes asynchronously in the background. Errors are swallowed.

### Server: `api/ping.ts`

Vercel Edge Function. Only accepts `POST`. Validates the event name against a hardcoded allowlist before writing to Redis — this prevents arbitrary key creation if the endpoint is called directly. Always returns `204 No Content`, even when an error occurs (so the client never retries).

### Call sites

| File | Location | Event |
|---|---|---|
| `src/main.ts` | After `openScene()` completes | `session_start` |
| `src/storage/workspace.ts` | After successful zip download in `exportWorkspace()` | `workspace_exported` |
| `src/storage/workspace.ts` | After `importGraphData()` resolves in the import flow | `workspace_imported` |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Someone scripts repeated pings to inflate counters | Low — endpoint is public | Allowlist prevents arbitrary key names; counts are for internal reference only |
| Redis write fails silently | Low | Both `api/ping.ts` and `telemetry.ts` catch and ignore all errors; no data loss risk to the app |
| Ping fires before app is visually ready | Low | `session_start` is placed after `openScene()` completes, not at the top of `main.ts` |
| Telemetry delay slows app startup | None | `ping()` is non-blocking; no `await` at call sites |

---

## Reading the data

Counters can be queried from the Upstash Redis console or CLI:

```
GET ping:session_start:2026-05-21
GET ping:workspace_exported:2026-05-21
GET ping:workspace_imported:2026-05-21
```

Keys are never deleted automatically. If historical data is no longer needed, keys can be manually removed via the Upstash console.
