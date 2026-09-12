# Node Shelf Architecture

> **Status:** Draft — describes the unified-shelf design, not the shipped code.
> Promote to Current when implemented.
>
> **Last reviewed:** 2026-09-10
>
> **Authority:** The shelf's data model, lifecycle, validity rules, storage and management
> commands. Takes over shelf filtering and acceptance from `~/pro/knogra/docs/ai/ai-chat-api-call-composition.md`
> and the shelf section of `~/pro/knogra/docs/ai/ai-assistant-vision.md`. Placement geometry stays
> with `~/pro/knogra/docs/node-placement.md`; the prompt text is `src/ai/prompts/workspace.md`, Node Shelf section.

## 1. Segregation of duties

The assistant may only put entries on the shelf of a scene. It never creates a node, adds one to a
scene, or draws an edge. The user may only accept an entry — which performs the edit — or remove it.
The user cannot put anything on a shelf. The shelf is what makes "the AI suggests, never executes"
enforceable rather than a promise in the prompt.

## 2. Model

The shelf is one workspace-wide collection. An entry is a concept, unique by title; a placement is
the intent to put that concept in one scene.

`src/ai/types/ShelfEntry`: `id`, `title`, `properties`, `nodeId?`, `placements`.
`src/ai/types/ShelfPlacement`: `centralNodeId`, `edgeType?`, `direction?`, `reason`, `addedAt`.

What is true of the concept everywhere lives on the entry; what varies by scene lives on the
placement. `reason` is per-placement — it justifies inclusion in *this* scene. `comment` is
per-entry, lives in `properties`, and is the disambiguation of a short title.

`nodeId` is set once the concept exists in the graph. Create-versus-include is not stored: an entry
with `nodeId` renders with the ∃ badge and accepts by including; without it, by creating. The mode
can flip while the entry sits on the shelf, and nothing rewrites the entry when it does.

No `create_connected` / `include_existing` split survives at shelf level. The wire contract with the
model is unchanged: an action's title resolves in one order — graph node, then shelf entry, then new
entry — and where it lands is the app's business.

## 3. Lifecycle

Suggested in scene A: entry created, `nodeId` null, one placement for A.
Suggested again in scene B: the title matches the existing entry, so a placement is appended.
Accepted in B: the node is created, `entry.nodeId` is set, B's placement is consumed and removed.
Scene A now shows the same entry with the ∃ badge, derived, not written.
Accepted in A: the existing node is included — no second node. This is the duplication the
per-scene shelf produces today and the reason for the unified model.

Invariants: an entry with no placements does not exist and is deleted. The badge is never persisted.

## 4. Validity and reconciliation

A placement is valid only while its concept is absent from the placement's scene. The user has
several ways to put a node into a scene that never touch the shelf — include children, the node
manager, drawing an edge — and none can be expected to know the shelf exists. The shelf must check
rather than be told.

The check runs at two moments only. On scene load, catching everything that changed while the user
was elsewhere. On accept, where it is correctness: accepting an entry whose node is already in the
scene consumes the placement and performs no graph or scene edit.

There is deliberately no third trigger reacting to scene edits as they happen, so a stale placement
can stay visible until the user leaves the scene or clicks it. Rejected because a shelf that
rearranges itself in response to unrelated scene work is more distracting than a stale item, and
because the trigger would need a signal the event bus does not carry.

For a materialised entry the test is node id membership in the scene. For an unmaterialised entry
there is no id, so a graph node with a matching title binds the entry — it becomes materialised
rather than being dropped, which is what stops an entry vanishing silently once the concept exists.

## 5. Storage

`knogra.shelf` in localStorage, and a member of the workspace export envelope, so its shape is a
persisted format: `{ version: 2, entries: ShelfEntry[] }`.

Version 1 is the shipped shape — an object keyed by central node id, each holding `actions` and a
`timestamp`. It exists in every exported workspace file on disk and must keep loading. Migration:
absence of `version` selects it; each action becomes one placement, actions sharing a lowercased
title merge into one entry, `include_existing` actions resolve to `nodeId` when the title still
matches a graph node, and `migrateLegacyDirection()` in `src/ai/shelf/shelf-store.ts` continues to run per action.

Cascades: nothing cascades into the shelf. Node deletion does not touch it — the shelf lives in
localStorage, owns its own format, and on the next reconcile drops any placement whose scene is gone
and any entry whose backing node is gone. Deleting a node is the strongest rejection of a concept
available, so such an entry is not resurrected as a create-new suggestion. Pruning is skipped while
the graph is empty, so an unloaded graph cannot be mistaken for a deleted one. Excluding a node from
a scene does not touch the shelf, and clearing a scene does not either.

## 6. What the assistant sees

The shelf reaches the prompt as its own context section, which the shipped design deliberately
omitted. Without it the model re-proposes what is already pending, and — since only the assistant
can create a placement — an entry could never reach a second scene, so the unified model would not
function. The section lists the entries placed in the current scene, and separately the entries
placed elsewhere that are not yet in the graph, which the model may propose here.

In the other direction the shelf decides nothing about the timeline. Actions reach the shelf before
the assistant message is stored, and the stored turn is the model's prose, whatever the shelf
accepted. Between 2026-09-10 and 2026-09-12 the shelf's one-line-per-item summary replaced the prose
on any reply with accepted actions; that was withdrawn because it broke the dialogue's rhythm,
duplicated what the shelf itself shows, and, on a typed message that came back with both prose and
actions, threw away the answer. The section above is what carries the memory of proposals; the
prose does not need to.

## 7. Module layout

The slice lives in `src/ai/shelf/`. The store owns the format and is the only module that knows it.
The context renderer is internal; `src/ai/context-builder` goes through the `NodeShelf` facade.
`ShelfItem` keeps its role, so the panel's animation and interaction guard are untouched.

## 8. Management commands

Right-clicking an item offers four: add to scene, remove from this shelf, remove from all shelves,
clear this shelf. Add to scene duplicates what clicking the item already does, because that is not
discoverable, and it is offered only in edit mode. Removing from this shelf drops one placement;
removing from all shelves deletes the entry. Placing is one at a time; there is no place-all.

## 9. Open decisions

- Whether title equality is enough to bind an unmaterialised entry to a hand-created node.
- Whether removing the last placement of a materialised entry is worth distinguishing from
  removing the concept.
- Cap and truncation for the shelf context section, if the shelf grows large.
