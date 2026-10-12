# AI vendor capabilities: current models and image output

> Status: Reference. External facts, not a design. Everything here is what the vendors' own docs said on the date below; re-verify before relying on a number.
> Last verified: 2026-10-03
> Authority: The fastest way to bring an agent up to date on what the four providers Knogra supports can do, which model ids are current, and the exact wire shapes for image output. Replaces whatever the agent remembers from training, which is reliably stale here.
> Related: [ai-provider-architecture.md](ai-provider-architecture.md) (how Knogra calls these vendors), [chat-image-retrieval.md](../chat-image-retrieval.md) §5 (the July 2026 decision against image generation, taken against older models)

## 0. Read this first

Model names and capabilities in this area move every few months.
An agent's training data is months to a year behind, and the defaults in `src/config/ai-settings.ts` may be behind too.
Before any discussion of what a model "can" do: read this file, check its date, and if more than a quarter has passed, re-fetch the sources in §6 and update the file.

The one-paragraph state as of 2026-10-03:
OpenAI generates images inside the Responses API through a built-in tool (the same endpoint Knogra already calls) or through a separate Images API; current image models are gpt-image-2.5-sunburst and gpt-image-2.5-flare.
Google generates images only with dedicated models (the Nano Banana family, gemini-3.1-flash-image and siblings); the general Gemini text models do not output images; the dedicated models can interleave text and images in one reply.
Anthropic's models do not output images at all; this is a stated company position, not a gap waiting to be filled.
OpenRouter has a dedicated image endpoint over 30-plus models, image output through chat completions for image-capable models, and a server tool that lets any text model, including Claude, call an image model mid-conversation.

## 1. Current model lineups

Text models, as named in the vendors' pricing pages on the date above.
Prices are USD per million tokens, input / output, standard tier.

    OpenAI       gpt-6-astra              10.00 / 50.00    most capable; accepts text and image input
                 gpt-6.1-sol               2.00 / 10.00
                 gpt-6-luna                0.10 /  0.50
                 gpt-5.6-sol               4.00 / 20.00
                 gpt-5.6-terra             2.00 / 12.00
                 gpt-5.6-luna              0.20 /  1.20
    Google       gemini-3.8-flash          0.75 /  3.75    stable; free tier exists
                 gemini-3.5-flash                           stable; free tier exists
                 gemini-3.5-flash-lite                      stable; free tier exists
                 gemini-3.1-pro-preview                     preview
                 the 2.5 family is restricted to existing users; new projects are steered to 3.5 Flash-Lite or 3.8 Flash
    Anthropic    Claude Opus 5, Sonnet 5, Fable 5, Haiku 4.5; Opus 4.8 / 4.7 / 4.6 and Sonnet 4.6 still served
                 all accept text and image input; output is text only
    OpenRouter   relays all of the above under vendor/model ids, e.g. google/gemini-3.1-flash-image

What this means for Knogra's defaults: check `AI_DEFAULTS` in `src/config/ai-settings.ts` against this list; a default naming a 2.5 Gemini or a GPT-5.x model is behind.

## 2. Image generation: who can, and how

### 2.1 OpenAI

Two routes, both returning base64 bytes.

Image models (all work on both routes):

    gpt-image-2.5-sunburst    released 2026-09-08; "editing precision"; slower, more detailed
    gpt-image-2.5-flare       released 2026-09-08; "fast, high-quality everyday generation"
    gpt-image-2               2026-04-21; transparent background in preview since 2026-08-20
    gpt-image-1.5, gpt-image-1, gpt-image-1-mini    older, still served

Pricing is per token, not per image: text input 5.00 / M; image input 8.00 / M and image output 30.00 / M for the 2.x and 2.5 models (gpt-image-1-mini: 2.50 / 8.00).
A 1024x1024 image is on the order of a thousand output tokens at low quality and several thousand at high, so a few cents to around twenty cents per image.
When the tool is used inside Responses, "tokens used for built-in tools are billed at the chosen model's per-token rates".

Route 1: the Images API.

    POST https://api.openai.com/v1/images/generations
    {
      "model": "gpt-image-2.5-flare",
      "prompt": "...",
      "n": 1,
      "size": "1024x1024" | "1536x1024" | "1024x1536" | "WIDTHxHEIGHT",
      "quality": "low" | "medium" | "high" | "xhigh" | "max" | "auto",
      "output_format": "png" | "jpeg" | "webp",
      "output_compression": 0-100,
      "background": "transparent" | "opaque" | "auto",
      "moderation": "auto" | "low",
      "stream": false,
      "partial_images": 0-3
    }
    → { "data": [ { "b64_json": "..." } ] }

    POST https://api.openai.com/v1/images/edits    image (one or several) + optional mask + prompt; same options

Custom sizes: both edges multiples of 16, aspect between 1:3 and 3:1, neither edge above 3840, total pixels between 655,360 and 8,294,400; above 2560x1440 is experimental.

Route 2: the image_generation tool on the Responses API.
This is the route that matters for Knogra, because `/v1/responses` is the endpoint the OpenAI adapter already calls from the browser.

    POST https://api.openai.com/v1/responses
    {
      "model": "gpt-6-astra",                 // a mainline text model; the docs' examples use this one
      "input": [...],
      "tools": [ {
        "type": "image_generation",
        "model": "gpt-image-2.5-flare",
        "action": "auto" | "generate" | "edit",
        "quality": "...", "size": "...", "background": "...",
        "output_format": "png" | "jpeg" | "webp",
        "output_compression": 0-100,
        "partial_images": 0-3
      } ]
    }

The reply's `output` array gains items of `type: "image_generation_call"` with `result` (base64), `revised_prompt` (the mainline model rewrites the prompt) and `id`.
They sit beside `message` items in no guaranteed order, the same trap the adapter already handles for reasoning items.
Multi-turn editing: either `previous_response_id`, or replay the earlier `image_generation_call` item (by `id`) in the next `input`.
Streaming: `response.image_generation_call.partial_image` events with `partial_image_b64`.
Moderation failures come back as `error.code: "moderation_blocked"` with `moderation_details.moderation_stage` and `categories`.
The docs warn that complex prompts can take up to two minutes.

Verified 2026-10-04 in Knogra: `/v1/images/generations` answers a browser caller with a readable response (CORS headers present), so the Images API can be called directly with the user's key; `b64_json` avoids fetching any result URL.
Its `401` is presumably as opaque as `/v1/responses`' (ai-provider-architecture §7); the image adapter translates an unreadable failure to the same "check the key" sentence.
The list of mainline models that may call the Responses image tool was not retrieved; the docs point to a "supported models" page.

### 2.2 Google Gemini

Only the dedicated image models output images.
`gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.1-pro-preview` and the rest of the text lineup understand images but do not produce them.

    gemini-3.1-flash-lite-image    Nano Banana 2 Lite    1K only; cheapest; 0.0336 per image
    gemini-3.1-flash-image         Nano Banana 2         0.045 (0.5K) / 0.067 (1K) / 0.101 (2K) / 0.151 (4K) per image
    gemini-3-pro-image             Nano Banana Pro       0.134 (1K and 2K) / 0.24 (4K); text 2.00 / 12.00 per M; interleaves text and images
    gemini-2.5-flash-image         legacy                sunset 2026-10-02
    Imagen 4                       shut down

No free tier for any image model.
Every generated image carries a SynthID watermark.
Reference images for editing: up to 14 (10 object references on 3.1 Flash, up to 3 style references).
3.1 Flash can ground on web and image search; Lite cannot.
Thinking is on by default and controllable with `generation_config.thinking_level`.

Two API surfaces.

generateContent, labelled legacy but "fully supported" and "the recommended path for stable deployments"; it will not receive new features.
This is what `@google/genai` `ai.models.generateContent` calls and what Knogra's Gemini adapter uses today.

    await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: prompt,                          // or parts with inlineData for editing
      config: {
        responseModalities: ['TEXT', 'IMAGE'],   // or ['IMAGE']
        responseFormat: {
          image: {
            aspectRatio: '16:9',   // 1:1 1:4 1:8 2:3 3:2 3:4 4:1 4:3 4:5 5:4 8:1 9:16 16:9 21:9
            imageSize: '1K'        // 512 1K 2K 4K
          }
        }
      }
    });
    response.candidates[0].content.parts[]  →  { text }  and  { inlineData: { mimeType: 'image/png', data: '<base64>' } }

The SDK installed in Knogra (@google/genai 1.48.0, checked 2026-10-04 in node_modules) types the block as `config.imageConfig: { aspectRatio, imageSize }` with aspect ratios "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"; the web docs' `responseFormat.image` and the wider ratio list belong to a newer SDK. Code against the installed types.
Multi-turn editing goes through the SDK's chat object, replaying parts.

The Interactions API, GA since June 2026, "recommended for all new projects", stateful by default (`store: true`, `previous_interaction_id`), `store: false` for stateless.
Needs `@google/genai` 1.33.0 or later (`ai.interactions.create`); Knogra is on ^1.37.0.

    await ai.interactions.create({
      model: 'gemini-3.1-flash-image',
      input: prompt,
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' }
    });
    interaction.output_image.data   // base64; for interleaved text+image iterate interaction.steps instead

A schema change in Interactions removed the legacy `outputs` array on 2026-06-08; that date is about Interactions, not generateContent.
For Knogra's purposes generateContent is still the right surface: stateless, already wired, and the image models are reachable through it.

### 2.3 Anthropic

No Claude model outputs images.
The support article (dated 2026-03-16) says Claude "doesn't generate photos or illustrations the way image-generation tools do" and offers HTML/SVG diagrams and image analysis instead.
Dario Amodei stated in February 2026 that Anthropic does not make image or video generation models, citing the difficulty of telling real from fabricated content.
The Messages API output content is text (plus tool_use and thinking blocks); image input is supported on every current model.

Consequence: a Knogra user whose only key is Anthropic's cannot get a generated image from that key.
Through OpenRouter a Claude model can call an image model (§2.4), but that is OpenRouter's key and OpenRouter's billing.

### 2.4 OpenRouter

Three mechanisms.

Dedicated Image API, announced late June 2026, 30-plus models from Google, OpenAI, Black Forest Labs, xAI, ByteDance, Microsoft, Recraft, Krea, Sourceful.

    POST https://openrouter.ai/api/v1/images
    { "model": "google/gemini-3.1-flash-image", "prompt": "...",
      "resolution": "1K" | "2K" | "4K", "aspect_ratio": "16:9", "size": "2K" | "2048x2048",
      "quality": "auto" | "low" | "medium" | "high",
      "output_format": "png" | "jpeg" | "webp" | "svg",
      "background": "auto" | "transparent" | "opaque",
      "n": 1-10, "seed": ..., "stream": false,
      "input_references": [ { "type": "image_url", "image_url": { "url": "https://... or data:..." } } ],
      "provider": { "only": [...], "order": [...], "sort": "price" | "throughput" | "latency" } }
    → { "data": [ { "b64_json": "...", "media_type": "image/png" } ], "usage": { ..., "cost": 0.04 } }

    GET  /api/v1/images/models                         capability discovery: supported_parameters, architecture
    GET  /api/v1/images/models/{model_id}/endpoints     per-provider pricing by output_image / input_image / input_reference
    GET  /api/v1/models?output_modalities=image         the general listing, filtered

Billing is all-or-nothing per completed image; failed or cancelled requests cost nothing.
Streaming events: `image_generation.partial_image`, `image_generation.completed`, `error`.

Chat completions with image output, for models whose `output_modalities` include image (the Gemini image family, openai/gpt-5-image, others).

    POST https://openrouter.ai/api/v1/chat/completions
    { "model": "google/gemini-3.1-flash-image", "messages": [...], "modalities": ["text", "image"] }
    → choices[0].message.content  (text)
      choices[0].message.images[] → { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }

Image input for editing goes in the usual `image_url` content parts.
A request naming a model that does not accept image input fails with a message saying so.

Server tool, beta: gives any tool-calling model, Claude included, an image generator.

    { "model": "anthropic/claude-sonnet-5", "messages": [...],
      "tools": [ { "type": "openrouter:image_generation",
                   "parameters": { "model": "...", "quality": "...", "size": "...", "aspect_ratio": "...",
                                   "background": "...", "output_format": "...", "output_compression": ... } } ] }

Default image model `openai/gpt-5-image`.
The tool result the model receives is `{ "status": "ok", "imageUrl": "https://..." }`; the image cost is added to the token cost.
Also available on OpenRouter's Responses API.
"Server tools are currently in beta. The API and behavior may change."

## 3. Vision input (images sent to the model)

All current models at all four vendors accept image input: OpenAI GPT-6 and GPT-5.6 on Responses and Chat Completions, every current Gemini, every current Claude, and OpenRouter relays whatever the model accepts.
The wire form differs per vendor (OpenAI `input_image` items; Gemini `inlineData` parts; Anthropic `image` content blocks with base64 `source`; OpenRouter `image_url` parts).
Knogra sends none today (chat-image-retrieval §10.3; node-image-generation D43 sends SVG as text instead).

## 4. What follows for Knogra, briefly

This section is interpretation, kept short so the facts above stay the point.

- "One call, text and image together" exists on three of four vendors: OpenAI via the Responses tool, Gemini via an image model with `['TEXT','IMAGE']` (but then the chat model is the image model, and the Pro one is the only strong writer), OpenRouter via `modalities` or the server tool.
  Anthropic direct cannot do it under any shape.
- "Two calls, chat then image" works everywhere a user has an OpenAI, Google or OpenRouter key, whatever key the chat uses.
- Everything returns base64 bytes in the response body; nothing requires fetching an image URL cross-origin, so the CORS question is only about the endpoints themselves.
- Per-image cost is ten to a hundred times a chat turn: roughly 0.03 to 0.07 for the cheap tiers, 0.13 to 0.24 for the premium ones.
- The July 2026 rejection in chat-image-retrieval §5 was argued against gpt-image-1-era and Imagen-era output; the 2.5 and Nano Banana 2 generations advertise text rendering as a feature, and the docs still list text and composition precision under limitations.

## 5. How to refresh this file

Re-fetch the sources in §6, diff model ids and prices, update the date in the header.
Add a vendor only when Knogra adds it (ai-provider-architecture §9); this file follows the provider registry, not the market.

## 6. Sources, fetched 2026-10-03

https://developers.openai.com/api/docs/guides/image-generation
https://developers.openai.com/api/docs/changelog
https://developers.openai.com/api/docs/pricing
https://ai.google.dev/gemini-api/docs/image-generation
https://ai.google.dev/gemini-api/docs/generate-content/image-generation
https://ai.google.dev/gemini-api/docs/interactions-overview
https://ai.google.dev/gemini-api/docs/pricing
https://ai.google.dev/gemini-api/docs/models
https://support.claude.com/en/articles/9002504-can-claude-produce-images
https://platform.claude.com/docs/en/about-claude/models/overview
https://openrouter.ai/docs/guides/overview/multimodal/image-generation
https://openrouter.ai/docs/guides/features/server-tools/image-generation
https://openrouter.ai/blog/tutorials/image-generation-models/
https://byteiota.com/gemini-interactions-api-migrate-before-june-8/
