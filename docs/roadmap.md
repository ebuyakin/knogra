# Roadmap for v2

## Raw ideas

- [ ] Node embedded svg. Svg images catalog. AI creating svg for nodes. Shareable catalog on site.
- [ ] Fonts for node designs. Currently no way to change the font
- [ ] Configurable Node design set for specific tags. Ie tags work for nodes like types for edges. 
- [ ] Z-index control for nodes. (Move forward, Move back)
- [ ] Filtering by tag in Node manager

- [ ] Multiple background images on canvas. 
- [ ] Helicopter view. Full graph that can be traveled like map, can be used as intermediary in transitions.
- [ ] Edges routing (map like behavior, analogous to sea routes). Pipes for edges. 
- [ ] Dim nodes in a scene automatically based on their distance from the central node
- [ ] Various transition animatios. Key new feature!

- [ ] Auto-layouts collection to expand. 
- [ ] Ellipcital radial autolayout (rather than circle)
- [ ] Multiple scenes per node.

- [ ] Keyboard handler second refactoring - code deduplication, leader key support.
- [ ] UI theme (panels, modals). potentially matching the graph theme. Unified styling for UI elements.
- [ ] Markdown export/import redesign: extract UI code, extract layout - use feature. Node properties file.
- [ ] Chat markdown rendering: replace the regex pipeline in `chat-message-renderer.ts` with a Markdown library (markdown-it or similar), keeping the math-span lifting around it. Known gaps of the pipeline (2026-09-13): ordered lists never wrapped in `<ol>`, no nested lists, headings/lists/rules transformed inside code blocks, no escapes, thematic break added by hand. Each surfaces one at a time as model output varies; a parser closes the class. Re-verify the math path (`$`, `$$`, `\[ \]`, `\( \)`, `\begin`) after the switch.

