# AI Provider Architecture

> **Status:** Proposed — agreed design, not yet implemented (v1.7)
> **Last reviewed:** 2026-08-30
> **Authority:** Canonical model for how AI providers are declared, resolved, and called.
> Supersedes the ad-hoc two-provider arrangement shipped through 1.6.
> **Related:** [Documentation map](README.md), [AI assistant](ai-assistant-vision.md),
> [Chat panel](chat-panel-architecture.md)

## 1. Scope

Knogra is bring-your-own-key. Every AI request goes from the user's browser straight to the
provider — no proxy, no relay, no server of ours in the path. This is a product promise stated in
the README and the privacy policy, and it constrains every decision below: **a provider that
cannot be called directly from a browser cannot be supported.**

Four providers: Gemini, OpenRouter, OpenAI, Anthropic.

## 2. The contract

`AIProvider` (`src/ai/providers/provider.ts`) stays as it is — deliberately minimal:

```ts
interface AIProvider {
  readonly name: string;
  sendMessage(messages: ProviderMessage[], systemPrompt: string): Promise<AIResponse>;
}
```

Non-streaming, single-shot, no tool loop. Three call sites use it: chat, equation generation, and
node-image (SVG) generation.

## 3. Registry, split across the layer boundary

Provider identity was previously spelled out in six places, two of them carrying "keep in sync"
comments. It now lives in one table — but the table cannot be a single module, because adapters
import `getSetting` from `src/config`, so `ai → config`. A registry in `ai` that `config` had to
read would close the cycle.

The split follows the honest division:

| Where | What | Why |
|---|---|---|
| `src/config/ai-providers.ts` | `PROVIDER_REGISTRY` — type, label, setting keys, default model | It is settings metadata; `config` imports nothing from `ai` |
| `src/ai/providers/provider.ts` | `createProvider()` — type → adapter class | Behaviour, and the one legitimate `switch` |

```ts
interface ProviderDescriptor {
  readonly type: ProviderType;
  readonly label: string;
  readonly apiKeySettingKey: SettingKey;
  readonly modelSettingKey: SettingKey;
  readonly defaultModel: string;
  readonly modelHint: string;
}
```

Four consumers read the table instead of hard-coding provider names: the provider dropdown and the
per-provider key/model entries in `setting-definitions.ts`, `SENSITIVE_KEYS` in
`storage/workspace/transfer.ts` (export blocklist), and `PRESERVED_KEYS` in `settings-modal.ts`
(factory-reset allowlist). Both sync comments go away.

The eight `AISettings` fields (`<provider>ApiKey`, `<provider>Model`) stay explicitly declared.
Deriving them with mapped types would obscure `SettingKey` inference for no real gain.

## 4. Resolution

One function, `resolveProviderConfig()` in `src/ai/providers/provider-resolution.ts`, replaces
three hand-written copies (chat session, equation generator, SVG generator — the latter two were
byte-identical). The rule is unchanged from 1.6, now expressed against the registry:

1. The selected provider, if it has a key.
2. Otherwise the first provider in registry order that has one.
3. Otherwise `null` — callers surface "add an API key in Settings".

Registry order is therefore the fallback preference, and is a deliberate choice rather than an
accident of `if`-chain ordering.

## 5. Shared response handling

Action parsing, LLM-JSON sanitising, and conversational-content extraction move to
`src/ai/providers/response-parsing.ts`. They existed as near-identical copies in both adapters;
with four adapters that would be four copies of the five-name action vocabulary. Adapters are left
owning only what is genuinely per-vendor: the wire format.

## 6. Per-provider facts

| Provider | Transport | Notes |
|---|---|---|
| Gemini | `@google/genai` SDK | Only provider with a dependency; supports `googleSearch` grounding and `thinkingLevel` |
| OpenRouter | `fetch`, OpenAI-compatible | Adds `HTTP-Referer` / `X-Title` attribution headers |
| OpenAI | `fetch`, chat completions | See §7 on error opacity |
| Anthropic | `fetch`, Messages API | Requires `anthropic-dangerous-direct-browser-access: true`; top-level `system`, `content[]` blocks |

### Anthropic

The browser-access header is **load-bearing, not optional** — verified empirically on
2026-08-30: with the header, `api.anthropic.com` returns a readable cross-origin response; without
it the CORS preflight is rejected outright. "Dangerous" refers only to the API key being visible in
client-side code, which is the BYOK model Knogra already runs on.

Anthropic's OpenAI-compatible endpoint (`api.anthropic.com/v1/chat/completions`) was considered as
a zero-adapter shortcut and **rejected**: Anthropic documents it as "not considered a long-term or
production-ready solution", and a shipped feature should not rest on a surface its vendor hedges
about.

## 7. Error opacity on OpenAI

OpenAI's `401` responses omit `Access-Control-Allow-Origin`, so the browser blocks the body and the
caller sees a bare `TypeError: Failed to fetch`. The most common support case — a mistyped key —
therefore produces our least informative error.

The OpenAI adapter translates a `fetch` rejection into a message naming the likely cause (invalid
key, check Settings). It is a guess, but right most of the time and far better than `Failed to
fetch`. Anthropic does not share the problem — its `401` is readable — so this handling is
provider-specific, which is itself part of the case for separate adapters over one generic
OpenAI-compatible class.

## 8. Rejected: a proxy

Routing Anthropic through a serverless function would put user API keys through our
infrastructure, contradicting a shipped privacy claim and turning a local-first tool into a
credential-handling service. Direct browser access works, so the question is moot — but had it
not, the fallback was to skip the provider and point users at OpenRouter, which already reaches
those models with a key that is not the vendor's own.

## 9. Adding a provider

1. Extend `ProviderType` in `src/core/main-types.ts`.
2. Add two `AISettings` fields and their defaults.
3. Add one `PROVIDER_REGISTRY` entry.
4. Write the adapter; reuse `response-parsing.ts`.
5. Add one `case` to `createProvider()`.

No sync-lists, no copied parsers, no additional resolver.

## 10. Open questions

- **Provider-specific settings.** `ai.webSearchEnabled` and `ai.thinkingLevel` are Gemini-only and
  labelled as such. OpenAI and Anthropic have their own reasoning controls. Whether to generalise
  these into a per-provider capability concept, or leave them vendor-specific, is undecided.
- **`fetchOpenRouterModels()`** is exported with no callers — model fields are plain text inputs.
  Wire it into the settings UI or delete it.
