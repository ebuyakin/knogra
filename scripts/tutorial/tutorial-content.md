# Knogra Tutorial — Chat Content

Format: `# Title` (first-level heading) as node marker, followed by messages separated by `---`.
Each message becomes a tutorial chat message (source: 'tutorial') on that node.
Markdown headings (##, ###) can be used freely inside message content.
The merge script matches sections to nodes by title (case-insensitive).

# Welcome to Knogra

Welcome to **Knogra** — a spatial knowledge graph explorer for learning, thinking, and research.

---

This graph is both a **tutorial** and a **showcase**. It teaches you how to use Knogra while demonstrating what it can do. Explore it freely — you can always re-download a fresh copy.

---

**The purpose of Knogra** is to let you build your own knowledge graphs as a natural by-product of learning and thinking. You focus on the ideas — the visual structure emerges from how you organize them. No time wasted on "drawing" or "designing". Your cognitive effort stays on the content, not the tool.

---

**What you're looking at.** This is the **anchor scene** — the starting point. Each box is a **node** (a concept or topic). Lines between them are **edges** (relationships). Together they form a knowledge graph. This scene shows the big picture — the branches of the tutorial you can explore.

---

**Getting around.** Click any node to select it, then press **G** to travel to its scene — a focused view with that node at the center, surrounded by related concepts. The transition is animated: shared nodes slide to new positions, new ones appear, irrelevant ones fade out. This keeps you oriented as you move through the graph. Explore in any order — there is no "correct" path. Follow your curiosity. If you get lost, click the **Home** button (top-left) to return here.

---

**AI assistant.** Knogra integrates with an AI that understands your graph. It can explain concepts, suggest new nodes, and discuss your subject in context. You chat naturally — the difference is the AI sees what you see. To enable it, enter your own API key in Settings.

---

**Minimalist interface.** The app is intentionally sparse — a few buttons, no clutter. Most actions are in the **right-click context menu**: right-click on a node, an edge, or the empty canvas to see what you can do in that context. Different targets show different options. Try it now.

# What is Knogra?

Knogra is a **visual knowledge graph builder** — a tool for constructing, exploring, and remembering structured knowledge through spatial, animated scenes.

---

Think of it as: **Knowledge graph meets Memory palace meets Prezi** — with an AI assistant helping you build, explore, and make sense of your subject.

---

**The core idea.** Unlike linear notes or flat mind maps, Knogra lets you organize knowledge as a multi-dimensional network of connected ideas — and navigate it one focused view at a time. A knowledge graph captures how ideas connect, not just what they are. But traditional graph tools force a choice — either you get a strict database with no visual appeal, or a pretty diagram with no structural depth. Knogra aims to give you both.

---

**Rigor meets aesthetics.** Under the hood, your graph is a real data structure — nodes, edges, properties, typed relationships — the same mathematical foundation used in graph databases and knowledge representation. On the surface, it's a visual, spatial experience: customized layouts, smooth transitions, themed scenes. You get the logical clarity of a graph database and the expressiveness of a curated infographic.

---

**Spatial arrangement carries meaning.** When you position nodes deliberately, you create a visual structure that aids understanding and recall. Every graph in Knogra reflects its author — the layouts, the groupings, the visual styling aren't decorations, they're part of the meaning. Two people studying the same subject will arrange it differently, and that's the point. Your spatial organization encodes your understanding. Knogra preserves it and makes it navigable.

---

**Minimal effort, maximum structure.** You shouldn't have to spend time "drawing" to get a useful visual. Knogra is designed so that the act of thinking — adding a concept, linking it to another, arranging a scene — naturally produces a structured, visual knowledge base. The design follows from the thinking, not the other way around.

---

**Dynamic, not static.** Unlike a diagram you draw once and stare at, a Knogra graph is something you *travel through*. Scenes transition fluidly. The same node appears in different contexts. You see your subject from multiple angles, at multiple scales — and that dynamic engagement aids comprehension and recall.

---

**Free and open source.** Knogra is a web application — no installation, no account required. Your data stays in your browser. The project is open source and community-oriented: use it privately for your own learning, or share your graphs with others. We're building toward a platform where visual learners can exchange knowledge graphs, learn from each other's structures, and contribute to the tool's evolution.

# How to use?

This branch is your practical guide. Everything here is about *doing* — navigating, building, customizing, and using the AI assistant.

---

**First things first.** Learn the **App vocabulary** — it takes a minute and will make everything else click. Knogra uses a few specific terms (node, edge, scene, scene view) that have precise meanings. Once you know them, the interface becomes self-explanatory.

---

**The right-click is your best friend.** Almost everything in Knogra is accessible through the context menu. Right-click on different targets to see what's available:
- **Empty canvas** — add a new node, open node manager, paste
- **A node** — edit it, go to its scene, create an edge, add child/parent nodes, delete
- **An edge** — edit style, change label, delete

The menu adapts to what you clicked. Experiment — you can't break anything.

---

**Building a graph from scratch.** The typical workflow looks like this:
1. Right-click on empty space → **Add node** → type a title
2. Right-click the new node → **Add child** or **Add parent** → type another title
3. An edge is created automatically between them
4. Arrange nodes by dragging them where they feel right
5. Press **G** on a node to open its scene and continue building from there

That's it. Five steps and you have a growing knowledge graph.

---

**Don't overthink the structure.** You can always reorganize later — rename nodes, rewire edges, move things between scenes. Start messy, refine as your understanding deepens. The graph evolves with your thinking.

---

**Use the AI to accelerate.** Once you've set up your API key, the AI can suggest related concepts, explain topics, and even propose new nodes and edges. It's like having a research partner who reads what's on your screen.

---

**Keyboard shortcuts save time.** You don't need to memorize them all — just a few make a big difference: **G** (go to scene), **E** (edit node), **L** (link two nodes), **N** (node manager). You'll discover more as you go — they're shown next to each action in the right-click menus. Press **F1** at any time to open the full shortcut reference.

---

**Folding nodes.** When a scene gets complex, you can temporarily hide a node's subtree by pressing **Z** on it. A small **+** badge marks the fold — press **Z** again to reveal.

---

**Save your work.** Your graph is saved automatically in the browser, but export regularly with **Ctrl+S** — this creates a .knogra file you can back up, share, or import on another device with **Ctrl+O**.

# Basic navigation

**Screen layout.** Knogra's interface has four areas:
- **The graph canvas** (center) — where your nodes and edges live. This is where you spend most of your time: viewing scenes, dragging nodes, right-clicking to act.
- **Chat panel** (right side) — shows conversation history for the focused node, an input box at the bottom, and quick-action buttons (Explain, Suggest, Deepen). It activates when you add your API key. But the chat panel is useful even without AI — you can use it to write personal **notes** on any node (right-click in the panel → Add note). Notes are saved with your graph and won't be sent to the AI.
- **Path panel** (top bar) — shows your travel history: the sequence of scenes you've visited. Use **[** and **]** keys to go back and forth. You can save a specific path and replay it later — like a presentation mode for walking someone through your graph.
- **Shelf** (bottom, dark strip) — this area is empty by default. When the AI suggests new nodes to expand your graph, they appear here as candidates you can accept or dismiss.

---

**Moving around the canvas.** Scroll to zoom in and out. Click and drag the empty canvas to pan. These are standard map controls — if you've used Google Maps, you already know how.

---

**Navigating between scenes.** Click a node to select it (it gets highlighted). Then press **G** to go to that node's scene. The view morphs smoothly: shared nodes slide to their new positions, new ones fade in, others fade out. This animated transition is intentional — it helps your brain maintain spatial orientation as you travel through the graph.

---

**Alternative ways to navigate:**
- **Right-click a node** → "Go to scene (G)" — same as selecting + pressing G
- **Double-click a node** — opens the node editor by default; can be configured in **Settings → Interaction** to navigate to the node's scene instead
- **Home button** (top-left) — returns to the anchor scene, your starting point
- **Path panel breadcrumbs** — if you've set an anchor, you'll see a trail of where you've been

---

**Selecting things.** Click a node or edge to select it. The selection determines context: the chat panel shows that node's conversation, the context menu shows relevant actions, and keyboard shortcuts apply to the selected element.

---

**Right-click everything.** This is the primary way to discover actions. The context menu is *context-sensitive* — you get different options depending on what you clicked:
- **Node** — edit, go to scene, add child/parent, create edge, include/exclude from scene, delete
- **Edge** — edit style, rename, delete
- **Empty canvas** — add node, open node manager, paste, scene options

Shortcuts are shown next to each action in the menu — this is how you'll naturally learn them.

---

**Undo? Not quite.** Knogra saves changes continuously. There's no undo button (yet). But you can always re-import a previously exported .knogra file to go back to a saved state. Get in the habit of exporting (**Ctrl+S**) before making big changes.

---

**Full shortcut reference.** Press **F1** at any time to open the keyboard shortcuts panel — all shortcuts listed by category.

# AI Assistant

Knogra includes a built-in **AI assistant** that understands your graph. It's not a generic chatbot — it sees the node you're focused on, the scene around it, and the connections in your graph. This makes its answers specific and contextual.

---

**Every node has its own conversation.** When you navigate to a different node, the chat panel shows that node's conversation history. Think of it as separate chat threads — one per topic. This keeps discussions focused and organized.

---

**Two providers are supported** (more coming):
- **Google Gemini** — get your API key at [aistudio.google.com](https://aistudio.google.com/apikey)
- **OpenRouter** — get your API key at [openrouter.ai/keys](https://openrouter.ai/keys) (gives access to many models: Claude, GPT, Llama, etc.)

Knogra does not provide or charge for AI access — it connects to the provider you choose using your own key. You pay the provider directly (or use their free tier). Knogra is not responsible for AI-generated content.

---

**Setting up.** Open Settings (**Ctrl+,** or **⌘,**) → **Assistant** section. Choose your provider, paste your API key, and specify the model name. **Important:** the model name must be copied exactly as shown by the provider (e.g., `gemini-2.0-flash`, `anthropic/claude-sonnet-4`). Even small typos will cause errors.

---

**Your API key stays local.** It's stored in your browser's local storage — never sent to any server except the AI provider you chose. This is the standard approach used by many web tools. Your key goes directly from your browser to the provider's API. For more details, see our **Privacy Policy**.

---

**Using the app without AI is perfectly fine.** Knogra is a knowledge graph tool first, AI assistant second. You can build, navigate, and explore graphs without ever setting up an API key. In that case, the chat panel becomes a personal **notebook** — use it for notes on any node without AI involvement.

# Chat panel

**Asking questions.** Type your question in the input box at the bottom of the chat panel and press Enter. The AI responds in the context of the current node — it knows the node's title, properties, connections, and what's visible in your scene. Ask anything: "What is this?", "How does this relate to X?", "Give me an example."

---

**Quick-action buttons.** Four buttons above the input box give you one-click access to common prompts:
- **Explain** — "What is this concept and why is it important?" — helps you understand the current node
- **Suggest** — asks the AI to suggest **new concepts** not yet in your graph. These are ideas related to the current scene that could expand your knowledge map.
- **Deepen** — asks the AI to find **existing nodes** already in your graph that are relevant to the current scene but not yet included. This helps you discover connections you've already built but haven't linked yet.
- **Clear** — clears the conversation history for the current node (a fresh start)

The difference: **Suggest** creates new knowledge ("what should I learn next?"), **Deepen** surfaces existing knowledge ("what do I already have that connects here?").

---

**AI-suggested nodes.** When the AI suggests new concepts, they may appear on the **shelf** (bottom of screen) as candidates. You can preview them, accept them into your graph (they'll be added as connected nodes), or dismiss them. This is how the AI helps you *build* the graph, not just talk about it.

---

**Managing messages.** Right-click on any message in the chat panel to see options:
- **Copy** — copies the message text
- **Delete** — removes the message from the conversation
- **Add note** — inserts a personal note below that message

You can also copy your own questions by right-clicking them.

# Notes

**Notes** are personal annotations you add to the chat timeline. They're visually distinct from AI messages — they're *yours*, not the assistant's.

---

**Adding a note.** Right-click anywhere in the chat panel → **Add note**. Or right-click on a specific message → **Add note below**. A text box appears — type your thought and save. Notes appear inline in the conversation, between AI messages.

---

**Notes are independent of AI.** They're stored in your graph and exported in .knogra files, but they are **not** sent to the AI as context. This means you can freely annotate without affecting future AI responses. Use them for:
- Personal observations ("This connects to what I read in Chapter 3")
- Reminders ("Come back to this — need to verify the dates")
- Corrections ("The AI got this wrong — actual formula is...")
- Summary of your understanding so far

---

**Notes without AI.** Even if you never set up an API key, the chat panel works as a notebook. You can add notes to any node — creating a per-topic journal. This is useful for pure knowledge mapping without AI assistance.

# BYOK

**BYOK** stands for **Bring Your Own Key**. If you've only ever used ChatGPT, Gemini, or Claude through their regular websites, this section is for you.

---

**What's different here?** When you use ChatGPT or Claude through their websites, the company handles everything — you pay a subscription (or use a free tier) and just type. With Knogra, there's an extra step: you get an **API key** from an AI provider and paste it into Knogra's settings. After that, the experience is the same — you type questions and get answers.

---

**What is an API key?** It's a password-like string of characters (e.g., `AIza...` or `sk-or-...`) that lets one program talk to another. When you paste your API key into Knogra, you're giving it permission to send your questions to the AI provider on your behalf. The key is like a hotel room keycard — it identifies you to the provider so they know who to bill.

---

**Why does Knogra use BYOK instead of just providing AI?** Three reasons:
- **Knogra stays free.** If Knogra bundled AI access, it would need to charge a subscription to cover the cost. BYOK means the app itself is free forever — you only pay the AI provider for what you actually use.
- **No middleman for AI.** Your questions go directly from your browser to the AI provider. Knogra does not relay, read, or store your AI conversations on its servers.
- **You choose your model.** Different models have different strengths, speeds, and prices. BYOK lets you pick what works for you, and switch anytime.

---

**Is it expensive?** Generally, no. API pricing is based on usage — how many words you send and receive.
- **Google Gemini** offers a **free tier** that's generous enough for most personal use. You may never need to pay.
- **OpenRouter** lets you add credits (starting from a few dollars) and choose from hundreds of models, including many free ones.

For casual use (a few dozen questions per day), costs are typically pennies or nothing.

---

**How to get an API key — step by step:**

**Option 1: Google Gemini** (recommended for beginners — free tier available)
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API key"
4. Copy the key string

**Option 2: OpenRouter** (access to many models through one key)
1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create an account
3. Add credits (optional — some models are free)
4. Create a new API key and copy it

The whole process takes 2-3 minutes.

---

**Pasting your key into Knogra:**
1. Open Settings (**Ctrl+,** or **⌘,**)
2. Go to the **Assistant** section
3. Choose your provider (Gemini or OpenRouter)
4. Paste the API key
5. Enter the model name — **copy it exactly** from the provider's documentation (e.g., `gemini-2.0-flash` or `anthropic/claude-sonnet-4`). Even small typos will cause errors.

That's it. The chat panel is now active.

---

**Is it safe?** Your API key is stored in your browser's local storage — the same place websites store your preferences and session data. It is only sent to the AI provider you chose to authenticate your requests — never to Knogra or any third party. If you want extra security, most providers let you set spending limits and revoke keys from their dashboard at any time. See our **Privacy Policy** for full details.

---

**A note about subscriptions.** If you already pay for ChatGPT Plus, Claude Pro, or Gemini Advanced, you might wonder: "Can I use that subscription?" Unfortunately, **chat subscriptions and API keys are separate things** at most providers. A ChatGPT Plus subscription doesn't give you an OpenAI API key, and a Claude Pro subscription doesn't give you an Anthropic API key. API access has its own (usually pay-as-you-go) billing. The good news: API usage-based pricing is often cheaper than a subscription for moderate use — and Google Gemini's API has a free tier with no credit card required.

# Graph design

**The clutter problem.** A well-connected graph is powerful — but it can also be overwhelming. As your graph grows, so does the tension between showing everything at once and keeping things readable. Imagine a graph of 20 nodes where every concept connects to every other — that's 190 edges, a dense web that says little beyond "everything is related." Finding the right balance between scope and clarity is essential for effective learning and recall.

---

**Scenes solve this.** Knogra doesn't ask you to look at your whole graph at once. Instead, you compose **scenes** — focused views of specific parts of the graph, like a flashlight illuminating one area of a large landscape. Your graph may contain hundreds or thousands of nodes, but each scene shows just the concepts relevant to one central idea. You choose what to include, what to leave out, and which edges to display — giving you precise control over complexity.

---

**Every scene is independent.** Each scene has its own layout, its own styling, its own visual character. The same node can appear in multiple scenes, positioned differently in each. This means you can present the same concept in different contexts — and each context gets its own spatial arrangement and visual treatment. What you see in one scene doesn't constrain another.

---

**Animated transitions connect scenes.** When you navigate between scenes, the view morphs smoothly: shared nodes slide to new positions, new nodes appear, others fade out. This isn't just eye candy — dynamic, moving scenes engage a different memory mechanism than static images. The visual continuity helps your mind link separate scenes together, so you can mentally travel your graph even when you're not looking at it.

---

**Three pillars of graph design.** In practice, designing a graph means working with three things:

**1. Scene composition** — which nodes to include, which edges to show. This is about *what* the viewer sees. Too many elements create clutter; too few lose context. The right composition tells a focused story.

---

**2. Scene layout** — where you position nodes on the canvas. This is critically important for recall. Spatial proximity implies conceptual relatedness — things that are close together feel related. You can create hierarchical layouts (top-down), radial layouts (center-out), linear flows (left-to-right), clusters, or freeform arrangements. Different scenes can use different patterns. Experiment: your spatial intuition about "where this concept belongs" is part of how you'll remember it.

---

**3. Node and edge styling** — visual properties that guide attention and convey meaning. For nodes: size, color, opacity, font size, aspect ratio, scale, gradients. For edges: color, thickness, curve style, control points, labels. Use similar styles to imply similarity between nodes; use contrast to highlight differences or importance. To edit a node: double-click it, press **E**, or right-click → Edit. To edit an edge: right-click it → Edit edge.

---

**Themes** give you a starting point. Instead of styling every node individually, choose a theme (**Settings → Themes**) that sets the overall palette — background, node colors, text, edge defaults. Then customize individual nodes or edges where you want to draw attention or create contrast. Think of the theme as the "base coat" and per-node styling as the "highlights."

---

**Start simple.** You don't have to design everything upfront. Start with default styling and basic layouts — refine as your understanding of the subject deepens. The best graph designs evolve organically, reflecting how your thinking has matured.

# Themes

**Themes** control the visual palette of a scene — background, node colors, text, edge defaults, and accent colors. Knogra ships with several pre-configured themes and lets you create your own.

---

**Finding themes.** Open **Settings** (**Ctrl+,**) → **Themes** tab. The pre-configured themes are listed there — click one to apply it to the current scene. Themes are per-scene: changing the theme here only affects the scene you're currently in. Other scenes keep their own themes.

---

**Pre-configured themes.** The built-in themes cover a range of palettes: dark backgrounds for focused work, lighter options for print-friendly graphs, and variants with different accent colors. Each theme sets consistent defaults for all visual elements — nodes, edges, canvas, and UI.

---

**Custom themes.** You can create a custom theme based on any existing one. In the Themes section, click **+ New theme**, choose a base, adjust colors and background to taste, and save. Custom themes are stored in your workspace and exported with your .knogra file.

---

**Scene-level theming.** Because each scene stores its own theme, you can give different branches of your graph distinct visual identities — dark for one subject, warm tones for another. This is useful both aesthetically and for memory: visually distinct scenes are easier to distinguish and recall. When a new scene is created, it inherits the current scene's theme.

---

**Per-node styling on top of themes.** Themes set the baseline. Individual nodes can override any visual property — color, size, opacity, design type — through the node editor (**E** or double-click). Think of the theme as the canvas and per-node styling as deliberate highlights: use contrast to draw attention to important nodes, and similarity to visually group related ones.

# App vocabulary

Knogra uses a small set of specific terms. Learning them takes a minute and makes everything else intuitive.

---

**Graph** — the complete collection of all your nodes and edges. This is your data core — what mathematicians and computer scientists mean by "graph": a set of vertices connected by edges. It's stored in the browser's database and can grow as large as you need. Your graph (along with conversations, settings, and themes) can be exported as a .knogra file — a portable package you can back up, share, or import on another device.

---

**Node** — the elementary unit of the graph. A node represents one atomic piece of knowledge: a concept, idea, fact, question, task, formula, person, event — anything worth capturing. Each node has a title, optional tags, properties, and an equation field for LaTeX math. Nodes gain meaning through their connections to other nodes and their positions in scenes.

---

**Edge** — a connection between two nodes, representing a relationship. Edges can be directional (A → B) and carry labels describing the nature of the link: "is a part of", "leads to", "is a type of", "depends on", "works for" — whatever fits your content. A pair of nodes can have multiple edges representing different types of relationship. Edges are what turn a collection of isolated ideas into a structured, navigable network.

---

**Scene** — a focused view of a subset of the graph, centered on one particular node called the **central node**. Each scene has exactly one central node, but you can include any other nodes from the graph — related or not. A scene is the visual unit of graph exploration: it has its own layout (node positions), its own styling, and its own set of visible edges. You compose scenes to tell focused stories about specific parts of your knowledge.

---

**Scene view** — what you actually see on screen when viewing a scene. Sometimes a scene includes more nodes than you want to look at all at once. You can **fold** nodes to temporarily hide their children — a small **+** badge appears on the folded node, indicating hidden content. Folded nodes stay in the scene (their positions and styling are preserved), but their children are hidden until you unfold them. This lets you control visual complexity without changing the scene's composition.

---

**Path** — a saved sequence of scenes you can replay. Think of it as a presentation route through your graph — a guided tour of your knowledge, visiting scenes in a deliberate order. Paths are useful for studying (a structured review of the material), presenting (walking someone else through your graph), or just bookmarking a meaningful traversal. The path panel also shows your travel history — the scenes you've visited, in order — so you can retrace your steps with **[** and **]**.

# Scene

A **scene** is a focused view of a subset of your graph, centered on one particular node — the **central node**. The scene belongs to that node: it was created for it, and it exists as long as the node exists. The central node is marked with a distinct border (blue in the default theme) so you always know which concept the scene is about.

---

Scenes are the fundamental UX unit. You don't look at the whole graph at once — you travel between scenes, one node at a time, like a flashlight over a landscape. Each scene has its own layout — you arrange nodes however you want, and positions are saved automatically.

---

**Creating scenes.** You don't create scenes separately — they appear naturally as you explore. When you select a node and press **G** (or right-click → "Go to scene"), Knogra checks if that node already has a scene. If it does, you travel there. If it doesn't, a new scene is created automatically.

The new scene starts pre-populated: it includes the nodes from your current scene that are directly connected to the new central node. This gives you a meaningful starting point — you're not dropped into an empty canvas, but into a view that already shows relevant context.

---

**Not every node needs a scene.** A node can exist in the graph and appear in other nodes' scenes without having its own scene. Scenes are created on demand — only when you navigate to a node for the first time. For leaf concepts or simple facts, you may never need to create a scene at all.

---

**Building up a scene.** Once you're in a scene, you can expand it in several ways:
- **Right-click a node** → Include children (**J**), parents (**P**), or neighbors (**C**) — pulls related nodes from the graph into this scene
- **Add new nodes** — right-click on empty canvas → "Add free node", or right-click a node → "Add child" / "Add parent"
- **AI suggestions** — ask the assistant to suggest related concepts; accept them from the shelf
- **Node Manager** (**N**) — browse all nodes in the graph and include any of them

You can also exclude nodes from the scene to reduce clutter, without deleting them from the graph.

---

**The central node doesn't have to be physically centered.** You can drag it anywhere on the canvas. "Central" refers to its role (the concept the scene is about), not its position. Place it wherever makes sense for your layout — top, middle, corner, wherever.

---

**Active node.** Click any node in the scene to make it active (orange border in the default theme). The active node is the one you're currently working with — you can drag it, edit it, fold/unfold it, include its children or parents, or navigate to its scene. Use **arrow keys** to move focus to neighboring nodes (up/down/left/right moves to the nearest node in that direction). When the central node is focused, it becomes both central and active, shown with a combined border color.

---

**Background images.** You can add images to a scene as a background or as visual elements. This helps create a unique visual identity for each scene — like rooms in a memory palace, where the environment itself aids recall.

---

**Pan, zoom, and viewport memory.** Scroll to zoom in and out, click-drag the canvas to pan. Each scene remembers its viewport — the zoom level and pan position are saved automatically. Next time you return, you find the scene exactly as you left it. Two handy shortcuts: **F** fits all nodes into view, **Shift+F** fits the background image into view.

# Animated transition

When you navigate from one scene to another, Knogra doesn't simply swap one diagram for the next. It plays a purposeful, rule-driven transformation: the current scene *morphs* into the target scene. Nodes that belong to both scenes slide smoothly to their new positions. Nodes that are leaving fly outward toward the edge of the screen and disappear. Nodes that are new to the incoming scene fly in from outside the frame. The whole sequence is choreographed — not a visual flourish, but a deliberate communication: *here is what changed, and here is what stayed the same.*

---

**The three roles a node can play in a transition:**

- **Shared nodes** — present in both the outgoing and incoming scene. They stay on screen and move to their new positions (or crossfade to a new visual style if their design changed). You can follow them with your eyes through the transition.
- **Departing nodes** — present in the outgoing scene but not in the incoming one. They fly toward the edge of the screen in waves, farthest from the center first, then disappear.
- **Arriving nodes** — new to the incoming scene. They appear at the edge of the screen and fly inward to their positions, creating a sense of "entering a new space."

This three-way classification is computed automatically every time you navigate — no manual configuration needed.

---

**Why animated? The cognitive case.**

The human visual system is extraordinarily sensitive to motion. Our brains evolved to immediately notice anything that moves in the environment — a survival instinct that has been running for hundreds of millions of years. Smooth animated transitions borrow this mechanism for a different purpose: they direct attention and encode change. When a node slides from one position to another, your brain automatically tracks it. The spatial relationship between the node's old position and its new one becomes part of how you understand the relationship between the two scenes.

Beyond motion detection, transitions engage **episodic memory** — the brain's system for storing experiences and events, not just facts. Navigating through an animated graph feels like traveling through a space. Each transition is an event with a beginning, a transformation, and an end. These experiential traces are richer and more durable than static images. Research on spatial cognition (see the **Science of mind mapping** and **Spatial memory** nodes) consistently shows that movement through a structured environment — real or virtual — builds stronger, more retrievable memory than passive observation of static content.

---

**Customizing transitions.** The timing, sequencing, and behavior of every phase can be adjusted in **Settings → Transitions**. You can control how fast departing nodes fly out, how long shared nodes take to reach their new positions, whether edges fade before or after their connected nodes move, whether the background crossfades in parallel or sequentially, and more. Every parameter has a sensible default — but if a particular rhythm feels off to you, the settings are there to fine-tune it to your cognitive style.

A word of caution: the transition is a tightly sequenced multi-phase choreography. Changing one timing value affects how phases overlap. If you find transitions look broken after adjusting settings, restore the defaults and make smaller incremental changes. The defaults were tuned through extensive testing.

---

**What's coming next.** Animated transitions are one of Knogra's most actively developed features. The current implementation covers the core mechanics, but there is a lot of room to grow: different *styles* of transition (zoom-based, perspective shifts, edge-tracing animations), visual effects tied to semantic relationships (e.g. a parent→child transition could animate differently from a sibling→sibling one), and finer control over per-node and per-edge timing. If you have ideas about what would make navigation feel more meaningful or more memorable, we'd love to hear them — see the **About** node for how to reach us.

# Folding nodes

**Folding** lets you temporarily hide a node's children in a scene without removing them. When a scene gets visually complex, folding is how you manage what's visible without changing the scene's actual composition.

---

**Any node can be folded** — not just the central node. Click a node to make it active, then press **Z** to fold it. Its child nodes disappear from view, and a small **+** badge appears on the folded node, indicating hidden content. Press **Z** again to unfold and reveal the children.

---

**Folding is visual, not structural.** Folded nodes remain in the scene — their positions, styling, and edges are all preserved. Folding only hides them temporarily. Think of it as closing a drawer: everything is still there, just tucked away.

---

**Multi-parent nodes don't fold.** Folding only hides children that have a single parent in the scene. If a child node is connected to multiple parents, folding one parent won't hide it — the child remains visible because it's still reachable from another parent. This prevents nodes from disappearing unexpectedly when they belong to multiple branches.

---

**When to fold.** Folding is useful when:
- A scene has many nodes and you want to focus on one branch at a time
- You're presenting or studying and want to reveal information progressively
- You want a cleaner overview without permanently excluding nodes

# Graph

The **graph** is the complete network of all your nodes and edges — your knowledge base. It exists independently of any scene. When you add a node, it joins the graph. When you create an edge, it's stored in the graph. Scenes are just windows into parts of it.

---

**Creating a graph.** You start with a fresh graph when you open Knogra for the first time (or press **Ctrl+N** for a new workspace). There's no setup — just start adding nodes. The graph grows organically as you build.

---

**Size and scale.** Your graph can contain hundreds or thousands of nodes and edges. There's no practical limit for knowledge-building purposes. You'll never see the whole graph at once — that's by design. Scenes give you focused access to whatever slice you need.

---

**Exporting and importing.** Your graph is saved automatically in the browser's local database. But browsers can be cleared, so export regularly:
- **Ctrl+S** — exports everything (graph, conversations, settings, themes) as a **.knogra** file
- **Ctrl+O** — imports a .knogra file, replacing the current workspace
- **Ctrl+N** — starts a fresh, empty workspace

The .knogra file is portable — you can share it with someone, open it on another device, or keep it as a versioned backup.

---

**Workspace** — a workspace is everything Knogra holds at one time: your graph (nodes and edges), all scenes and their layouts, chat conversations, saved paths, settings, themes, and customization. When you export with **Ctrl+S**, you're exporting the entire workspace. When you import, you're loading a complete workspace.

---

**One workspace at a time.** Knogra works with one workspace per browser. Importing a new .knogra file replaces the current workspace. If you want to preserve your work before opening another graph, export first (**Ctrl+S**). You can return to a previous workspace anytime by importing its .knogra file — nothing is lost as long as you've exported it. This also means you can use workspaces shared by others: just import their .knogra file and explore their knowledge graph.

# Node

A **node** is the basic building block of your knowledge graph. It represents one piece of knowledge — a concept, fact, idea, question, person, formula, task, or anything else worth capturing. Each node has a title and can optionally carry tags, properties, an equation (LaTeX), and a chat conversation with notes.

---

**Creating a node.** When you create a node, it appears in your current scene, ready to use. Several ways to do it:
- **Right-click on empty canvas** → "Add free node" — a standalone node, not connected to anything yet
- **Right-click a node** → "Add child" or "Add parent" — creates a new node with an edge connecting it to the one you clicked
- **AI suggestions** — the assistant may suggest nodes that appear on the **shelf** (bottom strip); click one to accept it into your graph and scene

---

**Nodes live in the graph, appear in scenes.** Your graph is the full collection of all nodes. A scene is a focused view showing some of those nodes. When you create a node, it's stored in the graph *and* shown in the current scene. But one node can appear in multiple scenes — for example, a concept like "Relativity" might be relevant in a scene about Physics and a scene about Einstein. Each scene gives the node its own position and visual styling, independently.

---

**Including existing nodes in a scene.** You can pull existing nodes from your graph into any scene. This is how you build up scenes and create cross-references:
- **Right-click a node** → "Include children" (**J**), "Include parents" (**P**), or "Include neighbors" (**C**) — if the selected node has connections in the graph that aren't yet visible in this scene, these actions bring them in
- **Node Manager** (press **M**) — browse all nodes in the graph and include any of them

This is the natural way to grow a scene: start with the central node, include its children, explore, include more. The scene expands outward from the concept.

---

**Editing a node.** Three ways to open the node editor:
- **Double-click** the node
- Select the node and press **E**
- Right-click → "Edit node"

In the editor you can change the title, tags, equation (LaTeX), properties (JSON), design type, scale, colors, opacity, and design parameters. Press **Ctrl+Enter** to save and close.

---

**Excluding vs. deleting — know the difference.**

**Exclude** (right-click → "Exclude from scene") removes a node from the current scene only. The node itself is untouched — it stays in the graph, keeps its edges, and remains in any other scenes. You can re-include it anytime. **This is safe and reversible.**

**Exclude descendants** (right-click → "Exclude descendants") does the same but also removes all child nodes from the scene in one step — useful when a whole branch is cluttering the view. Nothing is deleted from the graph.

**Delete** (right-click → "Delete node" or press **Del**) permanently removes the node from the graph. This is irreversible and cascading:
- The node disappears from all scenes
- All its edges are deleted
- Its own scene (where it was central node) is deleted
- Its chat conversation and notes are deleted
- Saved paths that included its scene are updated (empty paths are removed)

**When in doubt, exclude.** You can always export (**Ctrl+S**) before deleting as a safety net.

# Edge

An **edge** is a connection between two nodes — a relationship that gives structure to your knowledge. Without edges, you have a collection of isolated ideas. With edges, you have a network.

---

**Important distinction: graph vs. scene.** Like nodes, edges exist at two levels:
- **In the graph** — the edge is a permanent data relationship between two nodes. It exists until deleted.
- **In a scene** — the edge can be included or excluded independently. Just because both endpoint nodes are in a scene doesn't mean all their edges are visible — you have manual control.

You can include or exclude edges from a scene without affecting the graph. This lets you reduce visual clutter by hiding edges that aren't relevant to the current scene's story.

---

**Creating edges.** Two main ways:
- **Right-click a node** → "Add child" / "Add parent" — creates a new node AND an edge in one step
- **Right-click a node** → "Add edge" (**L**) — enters linking mode: click the target node to create an edge between them. The edge is created in the graph and included in the current scene.

---

**Including and excluding edges.**
- **Show edges** (**S**) — right-click a node → "Show edges". This finds all edges in the graph that connect the selected node to any other node currently in the scene, and includes them. Useful after including new nodes — their edges don't always appear automatically.
- **Exclude from scene** — right-click an edge → "Exclude from scene". The edge remains in the graph but becomes invisible in this scene. Use this to clean up clutter while keeping the underlying data intact.

---

**Editing edges.** Right-click an edge → "Edit edge" to open the edge editor. You can change:
- **Label** — the text describing the relationship
- **Curve style** — straight, bezier (bundled), bezier with manual control points, round segments, and others
- **Visual properties** — color, thickness, opacity, arrow styles
- **Control points** — for manual bezier curves, you can fine-tune the curvature with adjustable distance and weight values

---

**Directionality.** Edges in Knogra have a direction — from source to target, shown by an arrow. The direction can carry meaning ("A leads to B" is different from "B leads to A") or be purely organizational. When creating via "Add child", the arrow points from parent to child.

---

**Multiple edges.** Two nodes can have multiple edges with different labels. For example, between "Einstein" and "Relativity" you might have both "developed" and "is famous for" — capturing different facets of the same relationship. Each edge is styled independently.

---

**Deleting edges.** Right-click an edge → "Delete edge". This removes the connection from the graph permanently. The nodes at each end are not affected — only the link between them is removed.

# Science of mind mapping

Why does arranging knowledge visually help us learn? This isn't just intuition — there's a substantial body of cognitive science research behind it. This branch introduces the key ideas and gives you a foundation for understanding why tools like Knogra work the way they do.

---

**The dual coding hypothesis.** In the 1970s, psychologist Allan Paivio proposed that the mind processes information through two distinct channels: verbal (words, language) and non-verbal (images, spatial arrangements). When you encode something through both channels simultaneously — reading a concept AND seeing its position in a visual structure — you create redundant memory traces. If one fades, the other can still retrieve the information. This is why diagrams with labels are more memorable than text alone.

---

**Why graphs beat lists.** Linear notes — outlines, bullet points, sequential text — force knowledge into a one-dimensional structure. But most knowledge isn't linear. Ideas have multiple connections, hierarchies overlap, and the same concept can belong to several contexts. A graph preserves these relationships natively. Research on concept mapping (Novak & Cañas, 2008) consistently shows that students who organize material as connected networks outperform those who use linear summaries on measures of deep understanding and transfer — the ability to apply knowledge to new problems.

---

**Active construction matters.** Simply looking at a diagram isn't enough. The learning benefit comes from *building* the visual structure yourself. When you decide where to place a concept, which connections to draw, and how to group related ideas, you're engaging in elaborative encoding — the kind of deep processing that forms strong, retrievable memories. This is why Knogra emphasizes building your own graphs rather than presenting pre-made ones.

---

**Spatial cognition is fundamental.** Humans navigated physical environments for millions of years before we invented writing. Our spatial cognitive abilities — locating objects, remembering paths, building mental maps — are among the most powerful and reliable systems in the brain. Research on spatial memory shows we can remember the locations of thousands of objects with remarkable accuracy, even after brief exposure. When we attach abstract knowledge to spatial positions, we're borrowing this ancient, high-capacity system for a new purpose.

---

**Dynamic scenes and episodic memory.** Static images activate visual memory. But *movement through a space* — transitions, animations, changing perspectives — activates episodic memory: the system that records events and experiences. Episodic memories are richer and more durable than semantic memories (isolated facts). When you navigate between scenes in Knogra, the animated transitions create a sense of traveling through your knowledge, forming episodic traces that bind separate concepts together in a narrative of exploration.

---

**The spacing and interleaving effect.** Cognitive research shows that revisiting material at intervals (spaced repetition) and mixing different topics (interleaving) significantly improves long-term retention. A graph naturally supports both: as you explore different branches and return to nodes from different directions, you're revisiting concepts in varied contexts — exactly the pattern that strengthens memory.

---

**Limitations and honest caveats.** Visual-spatial learning isn't a silver bullet. The research shows clear benefits for conceptual understanding and knowledge organization, but rote memorization of arbitrary facts (phone numbers, random word lists) benefits less from spatial encoding. Graph-based tools work best when the knowledge genuinely has structure — relationships, hierarchies, dependencies. Fortunately, most subjects worth studying do.

# Spatial memory

Humans have remarkably powerful spatial memory. We can remember the positions of thousands of objects with high accuracy, even after brief exposure. This isn't a learned skill — it's a deep feature of how mammalian brains are organized.

---

**Place cells and grid cells.** In 1971, John O'Keefe discovered that certain neurons in the hippocampus fire only when an animal is in a specific location — he called them "place cells." Later, May-Britt and Edvard Moser discovered "grid cells" in the entorhinal cortex, which fire in a regular hexagonal pattern as an animal moves through space, forming an internal coordinate system. Together, these cells create a neural GPS — a spatial framework that the brain uses not just for navigation, but for organizing memory in general. O'Keefe and the Mosers shared the 2014 Nobel Prize in Physiology or Medicine for this work.

---

**The cognitive map.** O'Keefe and Nadel (1978) proposed that the hippocampus constructs a "cognitive map" — an internal model of the environment that supports flexible navigation and memory retrieval. Subsequent research has shown that this mapping system extends beyond physical space: the brain uses similar spatial frameworks to organize abstract knowledge, social relationships, and even temporal sequences. When you build a spatial layout in Knogra, you're engaging this same mapping system.

---

**Visual memory capacity.** Standing (1973) showed participants 10,000 photographs over five days. Recognition accuracy was 83% — remarkably high for such a massive set. When spatial context is added (where you saw something, what was around it), performance improves further. This is why spatially arranged knowledge graphs can hold more information in a more accessible way than linear notes.

---

**Spatial arrangement as meaning.** The position of a concept relative to others isn't just a visual convenience — it becomes part of the memory representation itself. Research on spatial semantics shows that people naturally map abstract relationships onto spatial dimensions: importance maps to size, similarity maps to proximity, hierarchy maps to vertical position. When you arrange nodes in Knogra, you're creating a spatial language of relationships that your brain reads effortlessly.

---

**Implications for learning.** The practical takeaway: deliberate spatial arrangement, consistent layouts, and distinctive visual environments all contribute to stronger memory encoding. When you spend time positioning nodes thoughtfully in a scene, you aren't wasting time on aesthetics — you're building memory infrastructure.

# Memory palace

The **method of loci** — from the Latin for "method of places" — is one of the oldest and most effective memory techniques known. It dates to ancient Greece (attributed to the poet Simonides, around 500 BC) and has been used continuously for over two millennia by orators, scholars, and memory competitors.

---

**How it works.** You imagine a familiar place — your home, a route you walk daily, a building you know well. You mentally walk through it and place each item you want to remember at a specific location: a fact on the kitchen table, a formula by the front door, a name on the bookshelf. To recall, you mentally walk the same route and "see" each item where you left it. The technique converts abstract, hard-to-remember information into vivid, spatial, easy-to-remember scenes.

---

**Why it's so effective.** The method of loci works because it piggybacks on the brain's spatial and episodic memory systems — the same systems that evolved to help us navigate physical environments. Spatial memories are naturally strong, persistent, and organized. By linking abstract knowledge to spatial locations, you give it the same properties. Memory competition research (Maguire et al., 2003) showed that champion memorizers don't have superior brains — they use spatial mnemonic strategies, and their hippocampi (the brain's spatial processing center) are more active during memorization.

---

**Distinctiveness matters.** The technique works best when each "location" is visually distinct. A generic corridor with identical doors is a poor memory palace. A varied environment — different rooms, colors, textures, lighting — creates more differentiated memory slots. This is why Knogra supports scene-specific backgrounds, themes, and styling: visual distinctiveness across scenes mirrors the architecture of a good memory palace.

---

**The digital memory palace.** Knogra's scene-based navigation is a digital implementation of the method of loci. Each scene is a "room" with its own spatial layout, visual identity, and conceptual focus. Navigating between scenes is like walking through your palace. The animated transitions create a sense of movement through space — reinforcing the spatial relationships between rooms. The key difference from a classical memory palace: in Knogra, the "palace" is also a structured knowledge graph, so the spatial associations are reinforced by logical connections.

---

**Beyond memory: understanding.** The classical method of loci is primarily about memorization — storing and retrieving discrete items. Knogra extends this by adding structure: nodes are connected by typed edges, scenes overlap through shared nodes, and the graph itself captures relationships. This means the spatial arrangement supports not just recall but *comprehension* — seeing how ideas relate, discovering gaps, and building a coherent mental model of the subject.

# Literature

Research and references for further reading on the science behind spatial knowledge tools and visual learning. This is not an exhaustive bibliography — it's a curated starting point for exploration.

---

**Foundational works on spatial memory and cognitive maps:**
- O'Keefe, J. & Nadel, L. (1978). *The Hippocampus as a Cognitive Map.* Oxford University Press. — The landmark work proposing that the hippocampus constructs internal spatial representations.
- O'Keefe, J. & Dostrovsky, J. (1971). "The hippocampus as a spatial map." *Brain Research*, 34(1), 171–175. — The original discovery of place cells.
- Moser, E.I., Kropff, E. & Moser, M.B. (2008). "Place cells, grid cells, and the brain's spatial representation system." *Annual Review of Neuroscience*, 31, 69–89.

---

**Visual memory and dual coding:**
- Paivio, A. (1971). *Imagery and Verbal Processes.* Holt, Rinehart, and Winston. — The dual coding theory: verbal and non-verbal channels of memory.
- Standing, L. (1973). "Learning 10,000 pictures." *Quarterly Journal of Experimental Psychology*, 25(2), 207–222. — The landmark study on visual memory capacity.

---

**Method of loci and mnemonic techniques:**
- Yates, F.A. (1966). *The Art of Memory.* University of Chicago Press. — Historical survey of memory techniques from antiquity through the Renaissance.
- Maguire, E.A. et al. (2003). "Routes to remembering: the brains behind superior memory." *Nature Neuroscience*, 6(1), 90–95. — Brain imaging of memory champions using spatial strategies.
- Dresler, M. et al. (2017). "Mnemonic training reshapes brain networks to support superior memory." *Neuron*, 93(5), 1227–1235.

---

**Concept mapping and knowledge graphs in education:**
- Novak, J.D. & Cañas, A.J. (2008). "The Theory Underlying Concept Maps and How to Construct and Use Them." Technical Report, Florida Institute for Human and Machine Cognition. — The standard reference on concept mapping.
- Nesbit, J.C. & Adesope, O.O. (2006). "Learning with concept and knowledge maps: A meta-analysis." *Review of Educational Research*, 76(3), 413–448.
- Kinchin, I.M. (2014). "Concept mapping as a learning tool in higher education." *Journal of Education for Teaching*, 40(4).

---

**Spatial cognition and abstract thought:**
- Tversky, B. (2019). *Mind in Motion: How Action Shapes Thought.* Basic Books. — How spatial thinking underlies abstract reasoning.
- Boroditsky, L. (2000). "Metaphoric structuring: understanding time through spatial metaphors." *Cognition*, 75(1), 1–28.
- Epstein, R.A. et al. (2017). "The cognitive map in humans: spatial navigation and beyond." *Nature Neuroscience*, 20(11), 1504–1513.

# Who is it for?

Knogra is a general-purpose knowledge tool — but it particularly shines for people who need to *understand* complex material, not just store it. Here are some of the audiences we had in mind.

---

**Students.** Whether you're in high school, university, or graduate school, Knogra can serve as a living, evolving textbook — one you build yourself. Instead of passively reading chapters in sequence, you construct a knowledge graph that mirrors how the subject actually connects. Benefits over traditional note-taking:
- **Non-linear learning** — follow your curiosity, not a fixed chapter order
- **Visualization** — see the structure of a subject at a glance
- **Retention** — spatial layouts and animated transitions leverage your spatial memory
- **AI-assisted learning** — ask the assistant to explain, expand, or quiz you
- **Debate and brainstorm** — use the chat to argue with the AI, test your understanding, explore "what if?" questions
- **Collaboration** — export your graph and share it with classmates; import theirs and compare structures

---

**Educators and trainers.** If you teach or present complex material, Knogra offers something slide decks can't: depth with navigation. Build a graph of your curriculum, use **paths** to create guided walkthrough sequences, and let students explore freely after the presentation. The graph becomes a reusable teaching artifact — more structured than slides, more flexible than a textbook, and interactive through the AI assistant.

---

**Business professionals.** Strategy, product planning, competitive analysis, onboarding documentation — any domain where the material has structure and relationships benefits from a graph approach. Knogra can serve as an alternative to presentation software for material that requires in-depth thinking rather than linear storytelling. Use **paths** for board presentations, **notes** for personal annotations during research, and **background images** for visual context like screenshots, wireframes, or process diagrams.

---

**Writers and creative professionals.** Drafting a book, structuring an argument, outlining a screenplay, mapping a research project — Knogra is a spatial thinking canvas for creative work. Build a graph of your ideas, rearrange them, discover unexpected connections. The non-linear structure mirrors how creative thinking actually works: messy, associative, iterative. Use the AI to brainstorm, challenge assumptions, or generate variations.

---

**Researchers.** Literature reviews, theoretical frameworks, experimental designs, interdisciplinary connections — research is inherently graph-shaped. Knogra can serve as a personal research wiki where each concept, paper, theory, or finding is a node, and the edges capture how they relate. As your project evolves, the graph evolves with it. Use different scenes to present the same material from different angles — one scene for the chronological view, another for the thematic structure, another for open questions.

---

**Anyone who thinks visually.** You don't need to fit a category. If you've ever wished you could "see" how the ideas in your head connect — if you've sketched concept maps on paper, used sticky notes on a wall, or tried to explain something by drawing — Knogra is built for you.

# Roadmap

Knogra is an actively developed open-source project. Here's where we're heading — not promises, but directions we're excited about.

---

**Sharing platform and community.** Right now, sharing a graph means exporting a .knogra file and sending it to someone. We want to build a platform where users can publish, discover, and remix knowledge graphs — a library of community-created tutorials, study guides, research maps, and reference graphs. Think of it as GitHub for knowledge structures: fork a graph, build on it, share your version.

---

**Quizzes and knowledge testing.** One of the most powerful things about spatial learning is that it's testable. Imagine a mode where node contents are hidden and you try to recall what each node contains based on its position in the scene — spatial recall testing. Or a mode where edges are hidden and you reconstruct the connections from memory. Or AI-generated quiz questions based on your graph content. Multiple approaches to active recall, all leveraging the spatial structure you've already built.

---

**AI-generated visuals.** Nodes currently contain text and equations. We want to extend this with AI-generated images — diagrams, illustrations, visual metaphors — created automatically to match each concept. A node about "mitochondria" could show a generated diagram, a node about "supply and demand" could show a generated curve. Visual richness without the effort of finding or creating images yourself.

---

**Format conversion.** Import: take a book, a PDF, a set of lecture notes, and let the AI convert it into a Knogra graph — extracting concepts, relationships, and structure automatically. Export: convert your graph into a PDF document, a slide presentation, a structured outline, or a study guide. Knogra as a hub format: knowledge comes in from any source, goes out in any form.

---

**Open source — contributions welcome.** Knogra is built in the open. The codebase is on GitHub, and we welcome contributors at all levels: feature development, bug fixes, documentation, tutorial graphs, design improvements, accessibility work, translations. If you're a developer, educator, designer, or just someone with ideas — we'd love to hear from you. Check the repository for contribution guidelines and open issues.

# About

Knogra is a non-commercial, open-source project built by a small team of enthusiasts who believe that knowledge deserves better tools than linear text.

---

**Get in touch.** We'd love to hear from you — feedback, questions, bug reports, feature ideas, or just to say hello:
- **GitHub** — [github.com/knogra](https://github.com/knogra) — open an issue for bugs or feature requests, start a discussion for questions and ideas
- **Email** — contact@knogra.io

---

**Report a bug or request a feature.** The best way is through GitHub Issues. Describe what happened (or what you'd like to see), include a screenshot if relevant, and we'll respond. Every report helps — even small annoyances are worth mentioning.

---

**This is a community project.** Knogra has no investors, no subscription model, no ads. It's built because we think spatial knowledge tools should exist and be freely available. The project sustains itself through community energy — contributions, feedback, shared graphs, and word of mouth. If Knogra is useful to you, the best way to support it is to tell someone about it.

# Visual knowledge tools

There are many tools for organizing knowledge visually. Knogra isn't trying to replace all of them — it occupies a specific niche. This section helps you understand where Knogra fits and how it differs from tools you may already know.

---

**Mind mapping tools** (MindMeister, XMind, Coggle, FreeMind). Mind maps are tree-structured: one central topic branches into sub-topics, which branch further. They're great for brainstorming and quick overviews — but they enforce a strict hierarchy. Real knowledge rarely fits neatly into a single tree. Knogra uses a graph, not a tree: any node can connect to any other, multiple parents are normal, and cross-links are first-class citizens. Scenes give you focused tree-like views when you want them, without sacrificing the underlying network structure.

---

**Concept mapping tools** (CmapTools, Lucidchart). Concept maps are closer to Knogra — they are graphs with labeled relationships. But most concept mapping tools show the entire map at once, which becomes unreadable as it grows. Knogra's scene-based navigation solves this: you work with focused subsets of the graph, one scene at a time, with animated transitions preserving spatial context. Knogra also adds per-scene layouts, AI assistance, and rich styling — features concept mappers typically lack.

---

**Diagramming tools** (Miro, FigJam, draw.io, Lucidchart). These are general-purpose visual canvases — flexible but unstructured. You can draw anything, but the tool doesn't "know" what your boxes and arrows mean. There's no data model, no typed relationships, no structured export. Knogra's graph is a real data structure: nodes have properties, edges have types, scenes have composition rules. This structure enables AI integration, query-based exploration, and format conversion that freeform canvases can't support.

---

**Presentation tools** (PowerPoint, Keynote, Google Slides, Prezi). Slide decks are linear — slide 1, slide 2, slide 3. Prezi added spatial navigation and zoom, which was a breakthrough, but it's still a presentation tool: author-controlled, audience-passive. Knogra is closer to Prezi's spatial spirit but goes much further: the graph is a living, editable knowledge base, not a fixed presentation. Paths give you guided sequences when you want them (like a slide deck), but the audience — or you — can break out and explore freely at any time.

---

**Personal knowledge management** (Obsidian, Roam Research, Logseq, Notion). PKM tools excel at text-based note-taking with backlinks. They do support graph views, but the graph is typically a secondary visualization — a map of your text files, not a first-class navigable space. In Knogra, the graph IS the primary interface. Spatial arrangement, scene composition, and animated navigation are the core experience, not an afterthought. The trade-off: PKM tools are better for long-form writing and daily journaling; Knogra is better for structured knowledge you need to understand, recall, and present.

---

**Graph databases and knowledge graphs** (Neo4j, Obsidian Canvas, Kumu). These are powerful but technical — built for data professionals, not learners. Knogra borrows the structural rigor of a graph database (typed nodes, labeled edges, queryable relationships) but wraps it in a visual, approachable interface designed for thinking and learning, not data engineering.

---

**Where Knogra is unique.** No other tool we know of combines all of these: graph data model + scene-based navigation + animated transitions + per-scene layouts and styling + integrated AI assistant + spatial memory research foundation + open source + local-first privacy. Each feature exists somewhere — Knogra's contribution is bringing them together in a tool designed specifically for human understanding and recall.

# Workspace

A **workspace** is everything Knogra holds at one time: your graph (all nodes and edges), every scene with its layout and styling, chat conversations and notes, saved paths, themes, settings, and background images. It's the complete package — your entire knowledge project in one place.

---

**Saving and loading.** Your workspace is saved automatically in the browser's local database as you work. But browsers can be cleared, computers change, and you'll want to share — so export regularly:
- **Ctrl+S** — exports the workspace as a **.knogra** file
- **Ctrl+O** — imports a .knogra file (replaces the current workspace)
- **Ctrl+N** — starts a fresh, empty workspace

Always export before importing a new file or starting fresh. Your current workspace will be replaced.

---

**What's inside a .knogra file?** It's a ZIP archive containing a collection of plain JSON files — no executable code, no scripts, nothing that can run on your machine. Completely safe to download, share, and open. Here's what's inside:
- **graph.json** — all your nodes and edges, plus scene compositions and layouts
- **chat-history.json** — conversations and notes for every node
- **themes.json** — your custom visual themes
- **settings.json** — app preferences (provider, model, display options)
- **paths.json** — saved path sequences
- **background-images.json** — scene background image data
- **app-state.json** — current scene, viewport position
- **manifest.json** — version info and export timestamp

You can unzip a .knogra file with any standard tool and inspect or edit the JSON directly if you're technically inclined.

---

**One workspace at a time.** Knogra works with one workspace per browser tab. Importing a new .knogra file replaces your current workspace entirely. To switch between projects, export the current one first, then import the other. You can maintain a collection of .knogra files — one per subject, project, or purpose — and switch between them as needed.

---

**Sharing workspaces.** A .knogra file is fully portable. You can email it, put it on a shared drive, or post it online. Anyone who imports it gets exactly what you see: the same graph, the same layouts, the same conversations. This is how this tutorial reached you — as a .knogra file.

---

**Your data stays yours.** All workspace data lives in your browser's local storage and in .knogra files on your machine. Nothing is uploaded to any server unless you explicitly choose to share. You own your knowledge graph completely.
