# AI Provider Architecture

> **Status:** Current — built and exercised against all four providers (v1.7)
> **Last reviewed:** 2026-09-01
> **Authority:** Canonical model for how AI providers are declared, resolved, and called.
> Supersedes the ad-hoc two-provider arrangement shipped through 1.6.
> **Related:** [Documentation map](README.md), [Architecture](architecture.md),
> [AI assistant](ai-assistant-vision.md), [Chat panel](chat-panel-architecture.md)

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
node-image (SVG) generation. Raster image generation for notes does **not** go through it: an
image call is a different contract, `ImageProvider.generateImage(request)`, with its own adapters
([chat-image-generation.md](chat-image-generation.md) §4.1).

## 3. Registry, split across the layer boundary

Provider identity was previously spelled out in six places, two of them carrying "keep in sync"
comments. It now lives in one table — but the table cannot be a single module, because adapters
import `getSetting` from `src/config`, so `ai → config`. A registry in `ai` that `config` had to
read would close the cycle.

The split follows the honest division:

| Where | What | Why |
|---|---|---|
| `src/config/ai-providers.ts` | `PROVIDER_REGISTRY` — type, labels, setting keys | It is settings metadata; `config` imports nothing from `ai` |
| `src/ai/providers/provider.ts` | `createProvider()` — type → adapter class | Behaviour, and the one legitimate `switch` |

```ts
interface ProviderDescriptor {
  readonly type: ProviderType;
  readonly label: string;              // provider dropdown
  readonly apiKeySettingKey: SettingKey;
  readonly modelSettingKey: SettingKey;
  readonly apiKeyLabel: string;        // Settings-UI copy for the
  readonly apiKeyDescription: string;  // generated key and model inputs
  readonly modelLabel: string;
  readonly defaultModel: string;
}
```

`defaultModel` **references** `AI_DEFAULTS` rather than repeating the string —
`defaultModel: AI_DEFAULTS.geminiModel` — so model names are still written exactly once, in
`ai-settings.ts`. Carrying the field here is what lets `modelFor()` recover from a blanked-out
model input without every adapter keeping a private fallback constant.

Since 2026-10-04 a descriptor may also carry `imageGeneration?: { modelSettingKey, modelLabel,
defaultModel }`: the vendor can draw pictures, and this is its image model setting. Gemini and
OpenAI have it, Anthropic does not, and that absence is how "cannot generate images" is stated —
`imageCapableProviders()` filters on it for the image provider select and the per-provider Image
Model rows. The image contract, adapters and resolution are a separate layer under
`src/ai/image-generation/` ([chat-image-generation.md](chat-image-generation.md) §4); `AIProvider`
and `resolveProviderConfig()` are untouched by it.

The eight `AISettings` fields (`<provider>ApiKey`, `<provider>Model`) stay explicitly declared.
Deriving them with mapped types would obscure `SettingKey` inference for no real gain.

Four consumers read the table instead of hard-coding provider names: the provider dropdown and the
per-provider key/model entries in `setting-definitions.ts`, `SENSITIVE_KEYS` in
`storage/workspace/transfer.ts` (export blocklist), and `PRESERVED_KEYS` in `settings-modal.ts`
(factory-reset allowlist). Both "keep in sync" comments go away.

The last two matter more than they look. They were hand-written lists of literal setting keys, and
**adding a provider without remembering the export blocklist would have leaked an API key into an
exported workspace file** — silently, with the file looking correct. That edge is the strongest
argument for the registry, and it was not the reason the registry was built.

Vendor-specific tuning (`PROVIDER_PARAMETERS`) is **not** on the descriptor: it lives in
`setting-definitions.ts`, because `ai-providers.ts` would otherwise have to import
`SettingDefinition` from that file and close a second cycle. A provider with nothing to tune has
no entry.

| Provider | Parameters offered |
|---|---|
| Gemini | Web Search, Thinking Level |
| OpenAI | Web Search, Reasoning Effort |
| Claude | Effort, Max Output Tokens |
| OpenRouter | none |

Web Search is one shared setting key across Gemini and OpenAI rather than two: it reads as a
single user intent, and two keys would drift apart with no one noticing which was in effect. Both
provider blocks label it as shared. Reversible cheaply if that proves wrong.

Our shipped defaults sit **below** each vendor's own: Gemini `minimal`, OpenAI `low` (vendor
default `medium`), Anthropic `low` (vendor default `high`). Most requests here are short, and
latency and cost matter more than reasoning depth. The Settings dropdowns label each vendor's own
default so the neutral choice stays visible.

## 4. Resolution

One function, `resolveProviderConfig()` in `src/ai/providers/provider-resolution.ts`, replaces
three hand-written copies (chat session, equation generator, SVG generator — the latter two were
byte-identical). The rule is unchanged from 1.6, now expressed against the registry:

1. The selected provider, if it has a key.
2. Otherwise the first provider in registry order that has one.
3. Otherwise `null` — callers surface "add an API key in Settings".

Registry order is therefore the fallback preference, and is a deliberate choice rather than an
accident of `if`-chain ordering.

`modelFor()` treats a **blanked-out** model field as unset and falls back to the registry default,
rather than sending an empty model string to the vendor. `ProviderConfig.model` is therefore
always resolved, and no adapter handles an empty model.

## 4a. Timeouts

Every provider call is bounded, in `src/ai/providers/request-timeout.ts`. Without it a vendor that
accepts the connection and never answers leaves the chat sitting in `sending` — no error, no
cancel, no recovery short of a page reload.

Two entry points, because Gemini needs a different shape: `fetchWithTimeout()` wraps `fetch` for
the three REST adapters, and `createTimeoutSignal()` hands a raw `AbortSignal` to the Gemini SDK,
which takes an `abortSignal` of its own. Both check `signal.aborted` in the catch so a timeout is
reported as `ProviderTimeoutError` rather than as a generic network failure, and both clear the
timer in `finally`.

## 5. Shared response handling

Action parsing, LLM-JSON sanitising, and conversational-content extraction move to
`src/ai/providers/response-parsing.ts`. They existed as near-identical copies in both adapters;
with four adapters that would be four copies of the five-name action vocabulary. Adapters are left
owning only what is genuinely per-vendor: the wire format.

The boundary is worth stating plainly, because it is what keeps the layer small: **every adapter
is handed the same prompt contract, so every adapter gets back the same fenced JSON block.
Vendors differ on the request side, not the reply side.**

That gives one `VALID_ACTION_TYPES` list — anything else in the block is dropped — and one home
for the LaTeX JSON repair. Models reliably emit `\nabla`, `\partial`, `\frac` as lone backslashes,
and `\upsilon` / `\underline` as invalid `\u` escapes that abort `JSON.parse` outright.
`sanitizeLlmJson()` escapes lone backslashes while leaving already-escaped pairs alone, fixes the
bad unicode escapes, and drops trailing commas. `providerName` is threaded through so a malformed
reply can be traced to the vendor that produced it.

## 6. Per-provider facts

| Provider | Transport | Notes |
|---|---|---|
| Gemini | `@google/genai` SDK | Only provider with a dependency; supports `googleSearch` grounding and `thinkingLevel` |
| OpenRouter | `fetch`, OpenAI-compatible | Adds `HTTP-Referer` / `X-Title` attribution headers |
| OpenAI | `fetch`, **Responses API** | See §6a and §7 |
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

Two more Anthropic-only facts: Claude takes **one top-level `system` field** and accepts no system
role in the conversation, so any system-role message in the history is folded into it; and
**`max_tokens` is required**, unlike every other provider here. A reply truncated at that cap
loses its JSON action block silently, so `stop_reason: "max_tokens"` is raised as an error naming
the setting that fixes it.

**The key must be scoped to a workspace.** An identity-linked Anthropic key that is *not* scoped
to a single workspace must send an `anthropic-workspace-id` header on every request, and without
it the API returns a 400 `invalid_request_error`. We do not send that header and do not offer a
setting for it: a user who creates a key can scope it at creation time, and an optional
workspace-id field would be meaningless to everyone with a correctly-scoped key. This is a
documentation obligation, not a code one — wherever we tell users where to get an Anthropic key,
we say to scope it.

## 6a. Why Responses rather than Chat Completions

OpenAI is called on `/v1/responses`, not `/v1/chat/completions`, because that is where OpenAI
ships capability rather than merely where it prefers traffic: **the hosted web search tool and the
reasoning controls do not exist on Chat Completions at all.** Chat Completions now appears only in
the OpenRouter adapter, which is correct — that is OpenRouter's own protocol, not a fallback.

The system prompt becomes the top-level `instructions` field rather than a pseudo-message at the
head of the array, and `input` takes `{role, content}` items, so `ProviderMessage` needs no
translation.

**Reading the reply is the trap.** The Chat Completions habit is `choices[0].message.content`, and
the Responses analogue looks like `output[0].content[0].text` — which the documentation
contradicts explicitly: reasoning items and tool calls sit in the same `output` array in no
guaranteed order. Reading a fixed position returns `''` the moment reasoning or a web search is
involved: **no exception, no bad status, just an empty answer and no proposed actions.** The
adapter filters to `message` items, then to `output_text` blocks, and joins. (`output_text` as a
flat convenience property is SDK-only and absent from the raw JSON we `fetch`.)

Two failure modes are surfaced rather than swallowed, mirroring the Anthropic `stop_reason` check:
`status: "incomplete"` with `incomplete_details.reason`, and content blocks of `type: "refusal"`.

**`store: false` is sent deliberately.** It defaults to `true`, which leaves the request and reply
on OpenAI's servers. Its real purpose is server-side conversation state via `previous_response_id`,
which we do not use — we replay the full message array each turn — so disabling it costs no
functionality. For a tool that markets itself on privacy, the conservative option should be a
choice rather than an inherited default. Hardcoded, not a setting.

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
4. Write the adapter; reuse `response-parsing.ts` and `request-timeout.ts`.
5. Add one `case` to `createProvider()`.
6. Optionally, one `PROVIDER_PARAMETERS` entry for vendor-specific tuning.

No sync-lists, no copied parsers, no additional resolver, and no risk of the new key escaping into
an exported workspace.

## 10. Open questions

- **Effort levels are model-dependent, and we offer the full list regardless of the selected
  model.** `claude-sonnet-4-6` has no `xhigh`; OpenAI's support varies per model. Picking an
  unsupported level surfaces as a raw API error — loud, but ugly. No per-model filtering.
- **`anthropicMaxTokens` caps at 32768** while Anthropic recommends roughly double that for
  `xhigh`/`max` effort, both of which are selectable. Raising the cap risks errors on smaller
  models; leaving it means high effort can truncate. Left deliberately, with the truncation error
  naming the setting that fixes it.
- **No reasoning continuity across turns on OpenAI.** We send no `previous_response_id` and replay
  no reasoning items, so each turn reasons from scratch. Interacts with `store: false` above: the
  two would have to be reconsidered together.
- **OpenAI assistant messages carry no `phase`.** The docs recommend `commentary` /
  `final_answer` in tool-heavy flows and warn that dropping it can cause preambles to be treated
  as final answers. Not known to bite us; recorded before it does.
