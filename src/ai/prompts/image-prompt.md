Write the description of one picture for an image generation model: a picture that would help someone understand the concept this conversation is about.
Describe only what can be seen: what is in the picture, where each thing is, how the parts are arranged, which parts carry a short label and what each label says.
Choose the picture that explains best, not the one that is easiest to draw, and leave out anything the concept does not need.

{{#if userText}}
The user has started the description; keep its intent and complete it:
{{userText}}
{{/if}}

The picture will be {{shapeWords}}{{#if shapePanel}}, about {{frameWidth}} by {{frameHeight}} screen pixels{{/if}}{{#if backgroundWords}}, on a {{backgroundWords}} background{{/if}}.
{{#if detailFine}}
It will be viewed enlarged, so it may carry many labelled parts and fine detail.
{{/if}}
{{#if detailPanel}}
It will be read in a narrow side panel without zooming, so it must have few parts and few labels.
{{/if}}

Write one paragraph of plain English, whatever language this conversation is in: no heading, no list, no explanation, and nothing about style, colours, typefaces or resolution, which the app adds itself.
Reply with the paragraph only.
Do not include an action block.
