# Graph Explorer - Project Vision & Architecture

> **Status:** Historical  
> **Last reviewed:** 2026-06-14  
> **Authority:** Early Python/Neo4j R&D planning background. Current product and architecture authority lives in [knogra-vision.md](knogra-vision.md) and [architecture.md](architecture.md).  
> **Related:** [Documentation map](README.md), [Product vision](knogra-vision.md), [Architecture](architecture.md)

## Background

Started as a simple Neo4j graph visualization experiment (`src/experiments/neo4j_explorer.py`), the tool quickly proved valuable for spatial knowledge exploration. The ability to save custom node layouts emerged as a powerful feature for cognitive mapping - treating graph fragments as mind maps where spatial arrangement carries meaning.

## Vision

**Build a spatial knowledge graph explorer** - not just a graph viewer, but a tool for cognitive mapping where users can:
- Navigate graphs node-by-node with smooth transitions
- Create custom spatial arrangements that reflect meaning
- Save multiple "views" per node (e.g., "friendship view", "work view")
- Expand/collapse graph selectively (node-by-node, not just by degree)
- Filter relationships by type
- Display node properties visually
- Use advanced transition algorithms to minimize visual noise

**Core insight:** Spatial position = semantic meaning. Users manually arrange nodes to create understanding, then save those arrangements.

## Technology Decision

### Initial Question: Python or JavaScript?

**Considered:**
1. **Option 1:** Quick Python experiments → Pure JS web app
2. **Option 2:** Clean Python architecture → Port to JS later

**Decision: Option 2 (Clean Python first)**

### Rationale:

1. **Current code is spaghetti** - can't effectively experiment with advanced features without refactoring
2. **Need structure to validate ideas** - proper architecture enables testing complex features (multiple layouts, smart transitions, selective expansion)
3. **Python as R&D phase** - validates architecture and UX before committing to JS
4. **Eventual JS port** - Python version serves as blueprint; final production will be pure JS client (React + Neo4j JS driver)

### Why Python Now, JS Later?

**Python advantages (current phase):**
- Faster iteration with Dash
- Already have working prototype
- Can validate all features properly
- Easier debugging during R&D

**JavaScript advantages (future):**
- Direct Neo4j connection (no Python middleware needed)
- Better performance (native Cytoscape.js)
- Richer interactions
- No backend needed (Neo4j IS the backend)

**Storage strategy for JS:**
- Layouts in Neo4j as node properties, OR
- Browser LocalStorage for client-only persistence

## Architecture Principles

### Core Design Goals:

1. **Separation of Concerns**
   - Data layer (Neo4j queries) separate from UI
   - Business logic separate from visualization
   - Storage abstraction (easy to swap JSON → DB)

2. **Framework-Agnostic Core**
   - `core/` modules don't depend on Dash
   - Pure Python business logic
   - Easy to port to JS

3. **State Management**
   - `GraphState` tracks what's visible (nodes, edges, filters)
   - Separate from how it's displayed
   - Multiple layout profiles per node

4. **Progressive Enhancement**
   - Basic features work first
   - Advanced features build on top
   - Each module is independently testable

### Module Structure:

```
src/graph_explorer/
├── core/              # Framework-agnostic business logic
│   ├── neo4j_data.py       # Database queries (pure Python dicts)
│   ├── graph_state.py      # State management (what's visible)
│   └── transformer.py      # Neo4j → Cytoscape format
├── layout/            # Layout management
│   ├── layout_profiles.py  # Multiple saved views per node
│   ├── transitions.py      # Smart animation algorithms
│   └── positions.py        # Position calculations
├── features/          # User-facing features
│   ├── expansion.py        # Node-by-node expand/collapse
│   ├── filters.py          # Relationship type filtering
│   └── properties.py       # Property display (tooltips, icons)
├── storage/           # Persistence layer
│   └── layout_storage.py   # Save/load to JSON (single file)
├── ui/                # Dash-specific UI (will be replaced with React)
│   ├── components.py       # Reusable UI elements
│   ├── styles.py           # Visual configuration
│   └── callbacks.py        # Dash callbacks
├── config/
│   └── settings.py         # Configuration
├── data/
│   └── layouts.json        # Saved layouts (single file)
└── app.py             # Main entry point
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
- Create clean folder structure
- Extract working code from experiment
- Build core modules (Neo4j, GraphState, Transformer)
- Basic working app with current features

### Phase 2: Advanced Features (Weeks 2-3)
- Node-by-node expansion/collapse
- Multiple layout profiles per node
- Relationship type filtering
- Property tooltips and icons
- Smart transition algorithms

### Phase 3: Polish (Week 4)
- Keyboard shortcuts
- Performance optimization
- User testing and refinement

### Phase 4: JS Port (Future)
- Build React app using Python as blueprint
- Direct Neo4j JS driver connection
- No Python backend needed
- Same architecture, different stack

## Reference Implementation

The current working prototype (`src/experiments/neo4j_explorer.py`) remains as:
- Reference for working features
- Fallback if new architecture has issues
- Source for extracting proven code

## Success Criteria

**Python phase successful when:**
- All envisioned features work smoothly
- Code is clean, tested, maintainable
- UX is validated and intuitive
- Architecture is clear and documented

**Ready for JS port when:**
- Python version is feature-complete
- All edge cases handled
- Performance is acceptable
- Users have validated the UX

---

*Document created: December 11, 2025*
*Status: Architecture planning complete, ready for implementation*
