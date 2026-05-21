# Knogra Project Plan

# OUTDATED! NEED TO BE READ WITH CAUTION.

## Overview
Architecture-first approach: design complete system structure, then implement incrementally. Each milestone delivers working, tested functionality.

**Revised Implementation Order:** Build "minimum viable app" first (interactivity), then add sophistication (advanced views, AI). This ensures each milestone delivers immediate user value.

# MILESTONES (BIG PICTURE):

1. Settings and configuration interface (general approach to settings and configuration ui)
- There no specific priorities, I just want to establish some standard ui/infrastructure for exposing settings to the user and start filling them in as we go. For example, we can start from transition animation settings, I imagine people have different tastes here, so this might be useful [x]

2. Path panel (find and display path between nodes - breadcrumbs style top panel)
- Here is how I imagine it. User choose some 'anchor' node (e.g. the first node in the graph... say I use the app to study quantum mechanics. I start new graph with the node 'quantum mechanics' - this is my starting point and I mark it as 'anchor'). Then at any point I show the path from my anchor node to the current central node. If there are many possible paths I show the shortest one. And generally speaking I should be able to reset 'anchor' and make any point in the graph new anchor, so the paths are show to that point.
- Users can compose presentation-style sequence of scenes, save it and play it later. [x~]

3. Graph export/import (algorithm, infrastructure and ui)
- there are two possible scenarios. 1. user works with several independent graphs. He should be able to close one graph (including chat history and all supplementary materials, settings) and open another graph (again with all the materials). You can think of it as multiple workspaces (for each independent graph) or multiple files (of some complex structure). Ideally, the user should be able to transfer the graph file(s) to another machine and open them there. For this scenario it actually doesn't matter what is the format of the file, it's going to be interpreted and used only within the app, so whatever is the most convenient fo the app is the best option. 2. user want to truly export nodes network (graph per se) to use somewher outside the app. For this purpose we import only the graph (not chat history or images or settings, whatvever). For this scenario maximum compatibility is the key, so JSON probalby is the best option and the structue of the JSON file should be as siple as possible.[x~]

4. Node notes panel, global menu.
5. Edge edtior - styling the edges.

6. quizz / flashcards (turn nodes into question marks, test user memory)
- we can start simple, just hide nodes, provide users with the way to name them, keep score. What can be interesting is the selection of nodes to hide. There can be different strategies and they may have a different effect on learning and memorization. E.g. hide first order neighbours of the central node, but leave higher order neighbours open (kind of hinting the answers) or show context (neighbours) and hide (ask about) the central node. or hide everyghing. or hide randomly some percentage of nodes (again varying percentage we may make the task more difficult or less difficult) - i'm acutally quite excited about this feature, it can be a useful learning tool for sure. And yes, we should keep scores to let users track the progress.

7. system message fine-tuning (improve quality and relevance of the ai dialog and suggestions)
- This takes a lot of experimentation, I need to accumulate some experience of what AI does correctly and what it does wrong before i can articulate what enhancements/improvements are necessary. it generally gives good answers even now, but there is a feeling that AI is not app-aware, and that needs to be fixed. I mean the dialog should feel not like a generic dialogue with AI assistant, but it should be clear that AI understands that this is part of the app and what does that app do and what is AI role. But again, I need to use it more before I can explain what improvements are necessary.

8. Multiple scenes for a single node.


---
## 1. Core Data Model & Storage ✅

**Technologies:** TypeScript, IndexedDB (via Dexie.js)

**Deliverable:** Working data layer with CRUD operations for all entities

1.1. Define TypeScript interfaces for all core entities (Node, Edge, View, Attachment, AIArtifact) ✅
1.2. Implement storage interface (abstract layer for future backend swapping) ✅
1.3. Create IndexedDB schema and Dexie.js wrapper ✅
1.4. Build basic CRUD operations for nodes and edges ✅
1.5. Implement view storage (membership lists + layout positions) ✅
1.6. Add attachment and AI artifact storage ✅

**Validation:** Console app that creates nodes/edges/views, saves to IndexedDB, retrieves them correctly ✅

---

## 2. Graph State Management ✅

**Technologies:** TypeScript, custom state manager

**Deliverable:** Centralized state system that tracks graph content, focus, and visibility

2.1. Design state architecture (current graph, focused node, active view, visibility filters) ✅
2.2. Implement state store with subscriptions ✅
2.3. Create state update methods (focus node, load view, filter edges) ✅
2.4. Add state persistence layer (save/restore app state) ✅
2.5. Build state query methods (get visible nodes, get current view layout) ✅

**Validation:** State manager correctly tracks focus changes, view switches, and filter updates without UI ✅

---

## 3. Graph Renderer & Design System ✅

**Technologies:** Cytoscape.js, TypeScript, SVG, MathJax

**Deliverable:** Working graph visualization with design system and theme support

3.1. Initialize Cytoscape.js instance with container ✅
3.2. Create design registry structure and types ✅
3.3. Implement basic designs (simple-circle, simple-square, equation-dashboard) ✅
3.4. Implement theme system (dark, light, high-contrast themes) ✅
3.5. Node rendering using design registry + themes ✅
3.6. Edge rendering with type-based styling (color, line style, arrows, curvature) ✅
3.7. Add viewport controls (pan, zoom, fit to screen) ✅
3.8. Enable manual node positioning (drag and persist) ✅
3.9. Connect renderer to state (auto-update on state changes) ✅

**Validation:** Render sample graph with different node designs, switch themes, drag nodes to new positions, positions persist after reload ✅

---

## 4. Node Details Panel

**Technologies:** HTML/CSS, TypeScript, Marked.js (markdown)

**Deliverable:** Side panel showing focused node properties and attachments

4.1. Create panel UI structure (collapsible sections: properties, attachments, AI chat)
4.2. Implement property display (title, type, tags, custom fields)
4.3. Add property editing (inline edit with save)
4.4. Build attachment list viewer (render markdown, show links, display images)
4.5. Create attachment editor (add/edit/delete attachments)
4.6. Connect panel to focus state (update when focused node changes)

**Validation:** Focus different nodes, view/edit properties and attachments, changes persist

---

## 5. Graph Construction Tools

**Technologies:** Cytoscape.js, TypeScript UI components

**Deliverable:** Complete UI for creating and editing graph structure

5.1. Add node creation UI (form with type, title, initial properties)
5.2. Implement edge creation (select source, select target, choose type)
5.3. Build node deletion (with confirmation, cascade to edges)
5.4. Add edge deletion and type editing
5.5. Create view membership editor (add/remove nodes from current view)
5.6. Implement bulk import (JSON structure → graph)

**Validation:** Build 10-node knowledge graph from scratch, edit structure, export and re-import

---

## 6. View System & Design Management

**Technologies:** Cytoscape.js, custom view engine, design system

**Deliverable:** Multiple views per node with saved layouts, per-node designs, and themes

6.1. Expand view data structure (per-node designs, design configs, theme ID) ✅
6.2. Create view loading system (filter to members, apply positions, designs, and theme)
6.3. Build layout + design persistence (save positions and design assignments)
6.4. Add view switching (change active view, reload with correct theme)
6.5. Implement default view creation (assign default designs to nodes)
6.6. Add view CRUD operations (create, delete, rename, theme selection)
6.7. Per-node design assignment and configuration UI

**Validation:** Create node with 2 different views (different neighbors, different layouts, different themes), switch between them, assign different designs to nodes

---

## 7. Focus Mechanic & Transitions

**Technologies:** Cytoscape.js animations, custom transition engine

**Deliverable:** Smooth morphing transitions between node-focused views

7.1. Implement focus system (center on node, highlight state) ✅
7.2. Build transition algorithm (identify shared/new/removed nodes)
7.3. Create morph animation (shared nodes move, new nodes fade in, old nodes fade out)
7.4. Add viewport animation (smooth camera movement to new center)
7.5. Implement transition queue (handle rapid clicks gracefully)
7.6. Add transition preferences (speed, easing, effects)

**Validation:** Travel between 3+ nodes with overlapping and distinct neighborhoods, transitions feel smooth

---

## 8. Rich Node Content

**Technologies:** KaTeX/MathJax, Cytoscape.js custom rendering

**Deliverable:** Nodes display equations, images, and formatted content

8.1. Integrate MathJax for equation rendering ✅
8.2. Create custom node SVG generator (multi-section dashboard) ✅
8.3. Implement equation display in nodes (LaTeX → rendered math) ✅
8.4. Add image embedding in nodes (URLs or base64)
8.5. Build node content editor (WYSIWYG or markdown + preview)
8.6. Optimize rendering performance (cache SVG generation)

**Validation:** Physics node shows equation, history node shows image, render smoothly in graph

---

## 9. AI Assistant Foundation

**Technologies:** OpenAI API (or Anthropic), TypeScript

**Deliverable:** Node-focused AI chat with artifact storage

9.1. Set up AI API client (configurable provider)
9.2. Create chat interface in node details panel
9.3. Implement context builder (focused node + neighbors as AI context)
9.4. Build conversation system (send/receive messages)
9.5. Add artifact storage (save Q&A pairs attached to node)
9.6. Create artifact viewer (show conversation history)

**Validation:** Ask AI questions about focused node, answers reference graph context, conversation persists

---

## 10. AI Graph Suggestions

**Technologies:** OpenAI API, custom suggestion engine

**Deliverable:** AI proposes new nodes and edges, user reviews and accepts

10.1. Implement suggestion generator (AI proposes relevant nodes + edges)
10.2. Create ghost node rendering (semi-transparent preview)
10.3. Build suggestion review UI (show proposal, accept/reject)
10.4. Add batch suggestions (propose multiple at once)
10.5. Implement suggestion refinement (user edits before accepting)
10.6. Create suggestion history (track accepted/rejected)

**Validation:** AI suggests 3-5 relevant additions to focused node, user accepts 2, they integrate smoothly

---

## 11. Navigation & Mode System

**Technologies:** TypeScript, keyboard event handling

**Deliverable:** Distinct construction and travel modes with shortcuts

11.1. Implement mode system (construction vs. travel mode)
11.2. Add mode-specific UI (show/hide editing tools)
11.3. Create keyboard shortcuts (focus, navigate, mode switch)
11.4. Build navigation history (breadcrumb trail)
11.5. Implement back/forward navigation
11.6. Add click behavior modes (travel vs. select for editing)

**Validation:** Switch modes, keyboard navigate through graph, retrace path using history

---

## 12. View Rules Engine

**Technologies:** TypeScript, graph query system

**Deliverable:** Algorithmic view membership (not just manual lists)

12.1. Design rule specification format (JSON-based query language)
12.2. Implement basic rule types ("all neighbors", "children only", "N-hop")
12.3. Create rule evaluator (compute membership from rules)
12.4. Add rule editor UI (build rules visually)
12.5. Implement hybrid views (rules + manual overrides)
12.6. Create rule preview (show what would be included)

**Validation:** Create view with rule "show all neighbors 2 hops away", verify correct nodes appear

---

## 13. Multiple View Types

**Technologies:** TypeScript, view type system

**Deliverable:** Different view types per node (conceptual, historical, mathematical)

13.1. Define view type taxonomy (preset types + custom)
13.2. Add view type selection when creating views
13.3. Implement type-specific rendering (colors, layouts, decorations)
13.4. Create view type switcher UI (tabs or dropdown)
13.5. Add type-specific default rules (e.g., "historical" prefers temporal edges)
13.6. Build view type templates (quick-create common patterns)

**Validation:** Node has conceptual view (broad connections) and mathematical view (equation dependencies)

---

## 14. Edge Filtering & Typing

**Technologies:** Cytoscape.js, TypeScript

**Deliverable:** Show/hide edges by relationship type

14.1. Define edge type taxonomy (preset types + custom) ✅
14.2. Implement edge type styling (colors, line styles) ✅
14.3. Create edge filter UI (checkboxes for types)
14.4. Add filter state management (persist active filters)
14.5. Implement filtered rendering (hide edges without removing from graph)
14.6. Build filter presets ("only causal", "only derivations")

**Validation:** Graph with 5 edge types, toggle filters, see relevant connections appear/disappear

---

## 15. Knowledge Testing System

**Technologies:** TypeScript, quiz generator

**Deliverable:** AI-generated quizzes from graph structure

15.1. Design quiz format (question types: definition, relationship, path)
15.2. Implement question generator (use graph structure + AI)
15.3. Create quiz UI (present question, collect answer)
15.4. Build answer evaluation (compare to correct answer)
15.5. Add quiz session management (track progress)
15.6. Implement spaced repetition scheduling (basic algorithm)

**Validation:** Generate 5 questions from 10-node graph, answer them, get feedback

---

## 16. Import/Export & Data Portability

**Technologies:** TypeScript, JSON serialization

**Deliverable:** Full graph backup and restore

16.1. Design export format (complete graph snapshot: nodes, edges, views, attachments)
16.2. Implement export function (serialize to JSON)
16.3. Create import function (deserialize and restore)
16.4. Add validation (check format before import)
16.5. Build conflict resolution (merge vs. replace)
16.6. Create backup scheduler (auto-export periodically)

**Validation:** Export graph, clear database, import backup, everything restored correctly

---

## 17. Performance Optimization

**Technologies:** Cytoscape.js, IndexedDB indexes

**Deliverable:** Smooth performance with 100+ node graphs

17.1. Profile rendering performance (identify bottlenecks)
17.2. Implement viewport culling (only render visible nodes)
17.3. Optimize state updates (batch changes, debounce)
17.4. Add database indexing (speed up queries)
17.5. Implement lazy loading (load views on demand)
17.6. Create performance monitoring (FPS, query times)

**Validation:** 150-node graph with complex views, smooth transitions and interactions

---

## 18. UI Polish & User Experience

**Technologies:** CSS, TypeScript animations

**Deliverable:** Polished, professional interface

18.1. Design color scheme and theme system ✅
18.2. Add smooth UI animations (panel transitions, button feedback)
18.3. Implement loading states (spinners, progress indicators)
18.4. Create error handling UI (toast notifications, error boundaries)
18.5. Add onboarding flow (welcome screen, guided tour)
18.6. Build help system (tooltips, documentation links)

**Validation:** App feels responsive and professional, errors handled gracefully, new users can start quickly

---

## Implementation Strategy

**Phase 1: Minimum Viable App** (M1-M5)
- ✅ Core foundation (data, state, rendering)
- → User interaction (node panel, graph construction)
- Result: Usable knowledge graph builder

**Phase 2: Advanced Visualization** (M6-M8)
- Polish navigation and transitions
- Enhance content rendering
- Result: Smooth, professional graph experience

**Phase 3: AI Integration** (M9-M10)
- AI assistant for node exploration
- AI-powered graph suggestions
- Result: Intelligent knowledge building

**Phase 4: Power Features** (M11-M18)
- Advanced views and rules
- Performance optimization
- Testing and polish
- Result: Production-ready application

---

## Notes

- Each milestone includes testing/debugging as part of the deliverable
- Milestones can overlap where dependencies allow
- Tech stack may evolve (consider React/Vue if vanilla TS becomes unwieldy)
- Target: 1-2 weeks of focused work per milestone
- **Revised order optimizes for user value and learning feedback**

**Deliverable:** AI proposes new nodes and edges, user reviews and accepts

9.1. Implement suggestion generator (AI proposes relevant nodes + edges)
9.2. Create ghost node rendering (semi-transparent preview)
9.3. Build suggestion review UI (show proposal, accept/reject)
9.4. Add batch suggestions (propose multiple at once)
9.5. Implement suggestion refinement (user edits before accepting)
9.6. Create suggestion history (track accepted/rejected)

**Validation:** AI suggests 3-5 relevant additions to focused node, user accepts 2, they integrate smoothly

---

## 10. Navigation & Mode System

**Technologies:** TypeScript, keyboard event handling

**Deliverable:** Distinct construction and travel modes with shortcuts

10.1. Implement mode system (construction vs. travel mode)
10.2. Add mode-specific UI (show/hide editing tools)
10.3. Create keyboard shortcuts (focus, navigate, mode switch)
10.4. Build navigation history (breadcrumb trail)
10.5. Implement back/forward navigation
10.6. Add click behavior modes (travel vs. select for editing)

**Validation:** Switch modes, keyboard navigate through graph, retrace path using history

---

## 11. View Rules Engine

**Technologies:** TypeScript, graph query system

**Deliverable:** Algorithmic view membership (not just manual lists)

11.1. Design rule specification format (JSON-based query language)
11.2. Implement basic rule types ("all neighbors", "children only", "N-hop")
11.3. Create rule evaluator (compute membership from rules)
11.4. Add rule editor UI (build rules visually)
11.5. Implement hybrid views (rules + manual overrides)
11.6. Create rule preview (show what would be included)

**Validation:** Create view with rule "show all neighbors 2 hops away", verify correct nodes appear

---

## 12. Multiple View Types

**Technologies:** TypeScript, view type system

**Deliverable:** Different view types per node (conceptual, historical, mathematical)

12.1. Define view type taxonomy (preset types + custom)
12.2. Add view type selection when creating views
12.3. Implement type-specific rendering (colors, layouts, decorations)
12.4. Create view type switcher UI (tabs or dropdown)
12.5. Add type-specific default rules (e.g., "historical" prefers temporal edges)
12.6. Build view type templates (quick-create common patterns)

**Validation:** Node has conceptual view (broad connections) and mathematical view (equation dependencies)

---

## 13. Rich Node Content

**Technologies:** KaTeX (math), Cytoscape.js custom rendering

**Deliverable:** Nodes display equations, images, and formatted content

13.1. Integrate KaTeX for equation rendering
13.2. Create custom node SVG generator (multi-section dashboard)
13.3. Implement equation display in nodes (LaTeX → rendered math)
13.4. Add image embedding in nodes (URLs or base64)
13.5. Build node content editor (WYSIWYG or markdown + preview)
13.6. Optimize rendering performance (cache SVG generation)

**Validation:** Physics node shows equation, history node shows image, render smoothly in graph

---

## 14. Edge Filtering & Typing

**Technologies:** Cytoscape.js, TypeScript

**Deliverable:** Show/hide edges by relationship type

14.1. Define edge type taxonomy (preset types + custom)
14.2. Implement edge type styling (colors, line styles)
14.3. Create edge filter UI (checkboxes for types)
14.4. Add filter state management (persist active filters)
14.5. Implement filtered rendering (hide edges without removing from graph)
14.6. Build filter presets ("only causal", "only derivations")

**Validation:** Graph with 5 edge types, toggle filters, see relevant connections appear/disappear

---

## 15. Knowledge Testing System

**Technologies:** TypeScript, quiz generator

**Deliverable:** AI-generated quizzes from graph structure

15.1. Design quiz format (question types: definition, relationship, path)
15.2. Implement question generator (use graph structure + AI)
15.3. Create quiz UI (present question, collect answer)
15.4. Build answer evaluation (compare to correct answer)
15.5. Add quiz session management (track progress)
15.6. Implement spaced repetition scheduling (basic algorithm)

**Validation:** Generate 5 questions from 10-node graph, answer them, get feedback

---

## 16. Import/Export & Data Portability

**Technologies:** TypeScript, JSON serialization

**Deliverable:** Full graph backup and restore

16.1. Design export format (complete graph snapshot: nodes, edges, views, attachments)
16.2. Implement export function (serialize to JSON)
16.3. Create import function (deserialize and restore)
16.4. Add validation (check format before import)
16.5. Build conflict resolution (merge vs. replace)
16.6. Create backup scheduler (auto-export periodically)

**Validation:** Export graph, clear database, import backup, everything restored correctly

---

## 17. Performance Optimization

**Technologies:** Cytoscape.js, IndexedDB indexes

**Deliverable:** Smooth performance with 100+ node graphs

17.1. Profile rendering performance (identify bottlenecks)
17.2. Implement viewport culling (only render visible nodes)
17.3. Optimize state updates (batch changes, debounce)
17.4. Add database indexing (speed up queries)
17.5. Implement lazy loading (load views on demand)
17.6. Create performance monitoring (FPS, query times)

**Validation:** 150-node graph with complex views, smooth transitions and interactions

---

## 18. UI Polish & User Experience

**Technologies:** CSS, TypeScript animations

**Deliverable:** Polished, professional interface

18.1. Design color scheme and theme system
18.2. Add smooth UI animations (panel transitions, button feedback)
18.3. Implement loading states (spinners, progress indicators)
18.4. Create error handling UI (toast notifications, error boundaries)
18.5. Add onboarding flow (welcome screen, guided tour)
18.6. Build help system (tooltips, documentation links)

**Validation:** App feels responsive and professional, errors handled gracefully, new users can start quickly

---

## Notes

- Each milestone includes testing/debugging as part of the deliverable
- Dependencies: Milestones should generally be completed in order, though some can overlap
- Tech stack can evolve (e.g., add React later if vanilla TS becomes unwieldy)
- Each milestone should take 1-2 weeks of focused work
