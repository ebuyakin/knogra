# Prompt design thoughts

> **Status: SUPERSEDED — 2026-08-17.** Working notes, now absorbed into
> [node-image-generation.md](node-image-generation.md) and the plan in `todo.md`.
> Kept for reference until that work lands; delete after.

1. The prompt (specifically system message) is too restrictive and contains excessive specification, which may or may not be true for a specific case. So I'd suggest to leave only truly universal part in the system message (role, and output requirements) and move all image description to the user's message. So here is how I'd suggest to shape the system message:

== System message begins:

You are an SVG image generator for a concept-mapping application.

Each image you produce stands for a single concept described in the user request and is displayed inside a small node in a graph.

You have to produce the image exactly with the specifications provided by the user and present the output as follows:

Return exactly one JSON object. No Markdown fences, and no prose outside the JSON.

If you can draw the described subject under the constraints given, return:
{"type":"svg","svg":"<svg ...>...</svg>"}

If the description is too vague or too broad to draw as a single pictogram, return:
{"type":"clarification","message":"<one concise clarifying question>"}

The svg value is stored and rendered exactly as returned, so it must obey every rule in this prompt.

Return one root <svg> element carrying an xmlns attribute and a viewBox. The viewBox origin is "0 0" and its longest side is exactly 100; the other side may be shorter, so a wide plot or a tall figure is fine. Do not put width or height attributes on the root element: the node derives its shape from the viewBox alone, and a width or height there is discarded. Every coordinate and every stroke width is expressed in viewBox units.

The image must render with no network access and no scripting. Do not emit <script>, <foreignObject>, <image>, or <use> pointing outside the document. Do not reference external stylesheets, fonts, filters, or gradients. The only permitted href or xlink:href value is a same-document "#fragment" reference. Anything else is stripped, and some of it causes the whole image to be rejected.

=== End of system message


Maybe this should be further strengthen to guarantee the discipline of the output, so the output can be correctly parsed. Also the restiction about the size, color, stylistic coherence, purpose etc - don't belong to the system message. this all should be moved to the user's request and made variable depending on the user's input and template used. I would also not used word 'pictogram' as it is already framing the type of image to be generated. i'd say 'image' or 'picture' is better as it's more neutral (but open to your suggestions).

Now, the user message. It should start with the user description of the image composed as a prose from the input box.

== User request message:

1. image description from the node's title and input box content (probably framed as a prose)

2. image specs (and we need to clarify the list so the list is rich enough, but not overlapping and not creating too many degrees of freedom). The current list ('the picture'+'how is it drawn') is a good start but need further work, conceptual clarification and some audit/revision to make them right.  I have thoughts about it, we can discuss it separately. Importantly, I believe the user shall have an option to select 'None' or 'Undefined' or 'Free' in parameter setting dropdowns in the image preset editor and eliminate the corresponding part from the prompt. E.g. i don't want to specify the 'corners' and want to leave it to the LLM to decide

3. Color specs. I think this should be separate. And here is the question for you. Normally, we would generate an image with some pre-configured colors. e.g. i say (in some way) use 3 colors and let them be red, blue and green. This is one possible scenario. but more interesting is to use variable colors that will be set (replaced) depending on the theme of the scene. I.e. i create an svg image using 3 colors. Depending on the theme those 3 colors are chosen differently (to match the theme palette). And they (i am not sure if it's technically feasible) ideally should be adjusted at rendering time, not at generation time. Ie if i change the theme of the scene, the image in the node in that scene shall change the colors accordingly. That would also allow me to use the same image with different colors in different scenes having different themes. This is a separate topic. we need to discuss it as a separate item.

4. Size/Complexity. - this i believe also shall be a separate section setting the viewBox size, the file size limit and probably the number of primitives (shapes, lines, - help me to specify this correctly, what primitive means in case of svg image). 

5. The 'Direction' section of the image preset. Ie Free-form instructions provided by users.

6. Probably some boilerplate again reiterating the task, discipline, communication protocol (if you think it makes sense)

== End of user message

Now, one more thing... We have an option of 'Redraw' the image if the user is not happy with the output, but i guess it's just an independent second call (potentially with different input parameters). I think we can do much better if we allow users to use the previous output as a reference and explain how it needs to be changed. ie the second api call shall contain the first message, the response (the image), and the second message which shall be understood as a correction request. This should be the workflow... I send the initial request, get the response, inspect it, if i am happy, accept it, if not, send the second message asking to correct something in the image, get the second response, inspect it and then repeat... This probably takes some modifications in the system message (it should describe the purpose and the meaning of the initial and subsequent messages) and obviously it requires code modifications, so we need to discuss it too. We don't need to preserve this messages exchange, it can live in memory only and disregarded when the user accept the image.


