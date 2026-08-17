/**
 * The System Contract
 *
 * One half of the two-message split: this is what the app **enforces** and what
 * is true of every request Knogra will ever make, while the brief is
 * user-authored, varies per image, and nothing enforces it.
 *
 * Its own module because it changes for entirely different reasons than the
 * brief does — it is the half the sanitizer mirrors, and it takes no parameters
 * at all.
 *
 * Not user-facing: editing it breaks ingestion, since the sanitizer and the
 * designs both depend on what it promises.
 *
 * See docs/nodes-svg-images.md §7 and docs/node-image-generation.md §4.
 */

/**
 * The whole system message.
 *
 * It carries **no description of what to draw** — not the kind of drawing, not
 * the style, not how detailed. All of that is the brief's, and anything stated
 * here as well would either duplicate the user's request or contradict it, with
 * no way for the model to tell which of the two we meant.
 *
 * What is left is three things the brief cannot say: that the system message
 * outranks the user's, how a conversation works, and the mechanical contract the
 * sanitizer enforces.
 *
 * **Flat numbered rules, no headings and no justifications.** Headings invited
 * sentences that explained rather than instructed, and every explanation was one
 * more claim for the model to reconcile.
 *
 * There is **no clarification arm**. Every request returns a drawing; a vague
 * description gets a vague image, and the user corrects it through a revision
 * turn, which is a better tool than a question-and-restart.
 *
 * Rule 1 is stated without exceptions because there are none: the system message
 * wins outright, so nothing in the brief can relax the markup rules. Naming the
 * rules it covers only invited the reader to look for ones it did not.
 *
 * It takes **no parameters**, which is the test of whether something belongs
 * here. The byte cap used to be interpolated in, and a cap read from a setting
 * is not invariant: a stored value silently overrides a raised default, so the
 * contract would state one limit while the sanitizer enforced another. It moved
 * to the brief, where per-request numbers live. Opacity left for the opposite
 * reason — it is a rendering choice, so it became a preset knob
 * (`transparencyAllowed`) rather than a rule nobody could switch off.
 */
export const NODE_IMAGE_SYSTEM_CONTRACT = `You are an SVG image generator. You create professional-looking SVG images.

1. The system message has absolute priority. Follow the instructions in the user's message wherever they do not conflict with it.

2. A conversation may run for several turns. The first user message specifies the image, and may attach an image to modify or an image to use as a style reference; each attachment is introduced by the sentence before it. Every later message is a correction to the image you returned immediately before it, and nothing else. Keep the specification from the first message in force, keep every part of the previous image that the correction does not mention exactly as it was, change only what is asked, and return the complete SVG again. Never return a fragment, a difference, or a description of what you changed.

3. Return exactly one JSON object, and nothing else. No Markdown fences, and no text before or after it:

{"type":"svg","svg":"<svg ...>...</svg>"}

4. Use single quotes for every XML attribute value, so the markup contains no double-quote character. Emit the SVG on one line, with no literal newline characters.

5. Use one root <svg> element carrying an xmlns attribute and a viewBox, and no width or height attribute. Round every coordinate to at most one decimal place.

6. Give every shape an explicit fill attribute, using fill='none' where a shape is stroked but not filled.

7. Write every colour as a six-digit hex value such as #40d8c0. Never use a colour name, an rgb() value, or the three-digit shorthand.

8. Emit no <title> and no <desc> element.

9. The image must render with no network access and no scripting. Emit no <script>, <foreignObject>, or <image> element. Reference no external stylesheet, font, filter, or gradient. The only value permitted for an href or xlink:href attribute is a same-document "#fragment" reference.`;
