# Chat Panel Architecture

> The chat panel is a **per-node timeline** combining user notes, AI conversations, and pre-filled tutorial content in a single unified interface.

## Overview

The chat panel always shows a chronological timeline of messages for the active node. Three types of content live in this timeline:

1. **Notes** — User's personal annotations, created via right-click menu
2. **AI dialog** — User questions + AI responses (when API key is configured)
3. **Tutorial content** — Pre-filled instructional messages (from imported demo graphs)

AI and notes use different input mechanisms and coexist naturally in the same timeline.

## Unified Interface

### AI controls (bottom bar)

The input box and quick action buttons (Explain, Suggest, Deepen, Clear) are **always visible**:

- **API key configured**: controls are active, input placeholder: "Ask about {nodeTitle}..."
- **No API key**: controls are dimmed/disabled, placeholder: "Set up AI key in Settings..."
- **Clear button**: always active — clears the full timeline (notes + AI messages)

This maintains visual stability. The interface never changes shape. Users discover AI capabilities by seeing the controls, even before configuring a key.

### Notes (context menu)

Notes are created and edited through the right-click context menu and inline editing:

1. **Right-click** in the chat panel (on empty space or panel background) → "Add note"
2. A new element appears at the bottom of the timeline, styled like an **input box** (border, cursor) — the user is immediately in edit mode
3. User types, presses **Enter** → note is saved, element transforms into a display-style message (plain formatted text, like AI responses — no background box)
4. **Double-click** any existing note → transforms back into input-box style for editing
5. **Enter** or **click-away** (blur) → saves changes, returns to display style

The input-box appearance is the visual metaphor for "editable content."

## Message Model

```typescript
interface ChatMessage {
  id: MessageId;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: MessageSource;
  attachments?: MessageAttachment[];  // Future: images, files
}

type MessageSource = 'ai' | 'note' | 'tutorial';

interface MessageAttachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  dataUrl: string;           // Base64 data URL for images
  // Future: could support Blob storage for large files
}
```

### Source semantics

| Source | Role | Meaning |
|--------|------|---------|
| `'ai'` | `'user'` | User message sent to AI |
| `'ai'` | `'assistant'` | AI response |
| `'note'` | `'user'` | User's personal note |
| `'tutorial'` | `'assistant'` | Pre-filled instructional content |
| `undefined` | any | Legacy message (pre-migration, treat as `'ai'`) |

### Migration

- Existing messages (no `source` field) are treated as `source: 'ai'`
- ChatStore DB version bump: v1 → v2
- No data transformation needed — `source` is optional, defaults gracefully

## Visual Styling

All message types share the same timeline. Distinguished by minimal styling differences:

| Source | Style |
|--------|-------|
| AI user message | Background box (current `message.user` style) |
| AI response | Plain formatted markdown (current `message.assistant` style) |
| Note (display) | Plain text, similar to AI response style. Separator line on top + timestamp. Slightly muted color. No background box |
| Note (editing) | Input-box style: border, editable textarea |
| Tutorial | Formatted markdown + LaTeX, subtle left accent border |

### Design principles

- **Minimal visual noise** — differences between content types are subtle, not loud
- **Notes are quiet** — plain text, personal scribbles, blend with the timeline
- **AI dialog is a conversation** — user messages have background box ("I said this to someone")
- **Editing = input-box style** — border appears around content when editable, disappears on save

## Context Menu (per source)

Right-click behavior varies by what was clicked:

### Right-click on empty panel area / panel background
- **Add note** — creates editable note at bottom

### Right-click on a Note
- **Edit note** — enters edit mode (same as double-click)
- **Delete note** — removes single note
- **Copy message** — copies content

### Right-click on AI message (user or assistant)
- **Copy block** — copy block-level element
- **Copy message** — copy raw content
- **Delete message** — removes user+assistant pair

### Right-click on Tutorial message
- **Copy block** — copy block-level element
- **Copy message** — copy raw content
- (No delete, no edit)

## AI Context Filtering

When building the prompt for AI requests, only `source: 'ai'` messages are included in conversation history. Notes and tutorial content are excluded — they are personal/instructional, not part of the AI dialog.

## Storage Changes

### ChatStore v2

New method:
```
updateMessage(nodeId, messageId, newContent) → void
```

Schema: same table, messages gain optional `source` and `attachments` fields. Dexie handles this gracefully — no migration needed for optional fields.

### Settings

No new settings required. AI availability is determined by checking whether the active provider's API key is configured. No explicit on/off toggle — presence of API key is the signal.

## Tutorial Graph Integration

### How it works

1. User imports a `.knogra` file containing tutorial content
2. The file includes scenes with nodes AND pre-filled conversations
3. Conversations contain messages with `source: 'tutorial'`
4. On import, conversations are written to ChatStore
5. When user navigates to a tutorial node, they see pre-filled content
6. User can add their own notes alongside tutorial content
7. If API key is configured, they can ask questions — AI sees scene context but NOT tutorial/note messages

### Export format

The `.knogra` export format includes conversations:
```
{
  nodes: [...],
  edges: [...],
  scenes: [...],
  paths: [...],
  conversations: {
    [nodeId]: ChatMessage[]
  }
}
```

### First-run experience

Landing page offers two entry points:
- **"Try Tutorial"** — imports the tutorial graph into the workspace. If user data already exists, warns and offers to export first. A "Reset Tutorial" option re-downloads a fresh copy.
- **"Start New Graph"** — opens empty workspace.

Single global workspace in v1. Multi-workspace support (isolated DBs, multi-tab, workspace picker) is planned for a future version.

## Attachments (Future)

The `attachments` field on ChatMessage is reserved for future use:

- Image attachments rendered inline in the chat timeline
- Stored as base64 data URLs (small images) or Blob references (large files)
- IndexedDB supports Blob storage natively
- UI: drag-and-drop or paste into input area
- Not in v1 scope — schema supports it from day one

## Implementation Plan

### Phase 1: Message model + storage
- Add `source` to ChatMessage type
- Add `updateMessage` to ChatStore
- DB version bump (backward compatible)

### Phase 2: AI controls gating
- Chat panel checks whether active provider's API key is configured
- When no API key: dim input box + buttons (Explain, Suggest, Deepen)
- Clear button remains active (NOTE: clear button shall require confirmation, probably with checkboxes for notes and ai dialog separately)
- No layout changes — just enabled/disabled state

### Phase 3: Notes
- Context menu: "Add note" on panel background
- Note creation → editable element at bottom of timeline
- Enter saves, transforms to display style
- Double-click to re-edit
- Note styling: plain text, separator + timestamp, muted color
- Context menu on notes: Edit, Delete, Copy

### Phase 4: Tutorial graph
- Include conversations in export/import format
- Create tutorial graph content
- Tutorial messages rendered with accent styling
- Tutorial messages not deletable/editable

### Phase 5: Attachments (future)
- Image paste/drop in note editing
- Inline rendering in timeline
- Storage as data URLs
