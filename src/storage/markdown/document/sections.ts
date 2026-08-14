/**
 * Knogra document — content sections
 *
 * Parses and serializes the `Knogra …` sections of a Markdown document:
 * equations, tags, comments, notes, the legacy tutorial section, and the
 * export-only ai chat section. Pure — no diagram knowledge, no IO.
 *
 * Canonical grammar: `docs/markdown-architecture.md` §4.3.
 */

/** One prose entry from the notes (or legacy tutorial) section. */
export interface DocumentNote {
  nodeId: string;
  /** Author- or Knogra-assigned note id; `null` when the entry carries none. */
  noteId: string | null;
  content: string;
}

/** One message of the export-only ai chat section. */
export interface DocumentChatEntry {
  nodeId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface DocumentSections {
  equationsByMermaidId: Map<string, string>;
  tagsByMermaidId: Map<string, string[]>;
  commentsByMermaidId: Map<string, string>;
  notes: DocumentNote[];
  articles: DocumentNote[];
}

const EQUATIONS_HEADING = /^#{1,6}\s+Knogra equations\s*$/i;
const TAGS_HEADING = /^#{1,6}\s+Knogra tags\s*$/i;
const NOTES_HEADING = /^#{1,6}\s+Knogra notes\s*$/i;
const ARTICLES_HEADING = /^#{1,6}\s+Knogra articles\s*$/i;
/** Legacy spelling of the articles section. Still read; never written. */
const TUTORIAL_HEADING = /^#{1,6}\s+Knogra tutorial\s*$/i;
const COMMENTS_HEADING = /^#{1,6}\s+Knogra comments\s*$/i;

/**
 * Every Knogra heading, including `ai chat`, which is written on export and
 * discarded on read. This one pattern is both the section terminator and the
 * diagram-body scrubber, so an unregistered heading is swallowed by the
 * preceding section and then leaks into the diagram.
 */
const KNOGRA_SECTION_HEADING =
  /^#{1,6}\s+Knogra (equations|tags|notes|articles|tutorial|comments|ai chat)\s*$/i;

const NOTE_END = '</note>';

/** Heading level written on export; any level parses (§4.3). */
const SECTION_HEADING_PREFIX = '##';

/**
 * Two prose sections, because the app has two kinds of stored prose and the
 * document must say which is which. The heading carries the kind, so the entry
 * grammar needs no `source` field:
 *
 *   `Knogra notes`    → `source: 'note'`     — editable, plain text
 *   `Knogra articles` → `source: 'tutorial'` — locked, markdown-rendered
 */
export function parseSections(source: string): DocumentSections {
  const prose = dedupeProse(
    parseNoteEntries(source, NOTES_HEADING),
    [...parseNoteEntries(source, ARTICLES_HEADING), ...parseNoteEntries(source, TUTORIAL_HEADING)]
  );

  return {
    equationsByMermaidId: parseEquations(source),
    tagsByMermaidId: parseTags(source),
    commentsByMermaidId: parseComments(source),
    notes: prose.notes,
    articles: prose.articles
  };
}

/**
 * Drop every Knogra section, leaving the diagram and any surrounding prose.
 * A section runs to the next Knogra heading or EOF — arbitrary markdown
 * headings do not close it, so note bodies may contain `#` headings.
 */
export function stripKnograSections(source: string): string {
  const result: string[] = [];
  let inSection = false;

  for (const line of source.split(/\r?\n/)) {
    if (KNOGRA_SECTION_HEADING.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (!inSection) result.push(line);
  }

  return result.join('\n');
}

// ============================================================================
// PARSING
// ============================================================================

function parseEquations(source: string): Map<string, string> {
  const equations = new Map<string, string>();
  for (const line of extractSection(source, EQUATIONS_HEADING)) {
    const match = line.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*`([^`]*)`\s*$/);
    if (!match) continue;
    const equation = match[2].trim();
    if (equation) equations.set(match[1], equation);
  }
  return equations;
}

function parseTags(source: string): Map<string, string[]> {
  const tagsByMermaidId = new Map<string, string[]>();
  for (const line of extractSection(source, TAGS_HEADING)) {
    const match = line.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!match) continue;
    const tags = match[2]
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    if (tags.length > 0) tagsByMermaidId.set(match[1], [...new Set(tags)]);
  }
  return tagsByMermaidId;
}

/**
 * Comments are single-valued prose, so the entry key is the node id alone —
 * the note-id rule below deliberately does not apply here. Last wins.
 */
function parseComments(source: string): Map<string, string> {
  const comments = new Map<string, string>();
  for (const entry of scanProseEntries(extractProseSection(source, COMMENTS_HEADING))) {
    const content = joinBody(entry.remainder, entry.bodyLines);
    if (content.length > 0) comments.set(entry.nodeId, content);
  }
  return comments;
}

function parseNoteEntries(source: string, heading: RegExp): DocumentNote[] {
  const notes: DocumentNote[] = [];
  for (const entry of scanProseEntries(extractProseSection(source, heading))) {
    const note = toNote(entry);
    if (note) notes.push(note);
  }
  return notes;
}

/**
 * Split an entry's opening line into a note id and the first line of body.
 *
 * The note id is recognised **only** when the text between the first and
 * second colon is an id token with no surrounding whitespace. That single rule
 * is what lets one grammar serve both forms: `N1:intro: text` names a note,
 * while `N1: Note: this matters` — the shape every pre-existing document uses —
 * keeps `Note:` as body. The space is the discriminator.
 */
function toNote(entry: RawProseEntry): DocumentNote | null {
  const keyed = entry.remainder.match(/^([A-Za-z0-9_-]+):(.*)$/);
  const content = joinBody(keyed ? keyed[2] : entry.remainder, entry.bodyLines);
  if (content.length === 0) return null;
  return { nodeId: entry.nodeId, noteId: keyed ? keyed[1] : null, content };
}

/**
 * Last wins for entries naming the same message. Entries with no note id are all
 * kept: without a key there is nothing to say they are the same message, and the
 * document explicitly allows a node to hold several.
 */
function dedupeKeyedNotes(notes: DocumentNote[]): DocumentNote[] {
  const lastIndexByKey = new Map<string, number>();
  notes.forEach((note, index) => {
    if (note.noteId !== null) lastIndexByKey.set(entryKey(note), index);
  });
  return notes.filter(
    (note, index) => note.noteId === null || lastIndexByKey.get(entryKey(note)) === index
  );
}

/**
 * The two prose sections share one keyspace, because their entries land in one
 * ordered message list per node and are resolved by id without regard to kind.
 * A key appearing in both is an authoring mistake; left alone it would build two
 * messages that no later Update can tell apart, one of them permanently stale.
 *
 * **Articles win**, being the kind documents are normally authored for.
 */
function dedupeProse(
  notes: DocumentNote[],
  articles: DocumentNote[]
): { notes: DocumentNote[]; articles: DocumentNote[] } {
  const dedupedArticles = dedupeKeyedNotes(articles);
  const articleKeys = new Set(
    dedupedArticles.filter(note => note.noteId !== null).map(entryKey)
  );

  return {
    notes: dedupeKeyedNotes(notes).filter(
      note => note.noteId === null || !articleKeys.has(entryKey(note))
    ),
    articles: dedupedArticles
  };
}

function entryKey(note: DocumentNote): string {
  return `${note.nodeId}:${note.noteId}`;
}

interface RawProseEntry {
  nodeId: string;
  /** The opening line's text after `<nodeId>:`, leading whitespace preserved. */
  remainder: string;
  bodyLines: string[];
}

/**
 * Split a prose section into entries. An entry opens on a line beginning
 * `<nodeId>:` and runs verbatim — indentation, blank lines, markdown, colons —
 * until `</note>`, which may sit inline at the end of a content line or alone
 * on its own line. An entry left open at section end is captured leniently.
 */
function scanProseEntries(sectionLines: string[]): RawProseEntry[] {
  const entries: RawProseEntry[] = [];
  let current: RawProseEntry | null = null;

  for (const rawLine of sectionLines) {
    if (!current) {
      const start = rawLine.trim().match(/^([A-Za-z0-9_-]+)\s*:(.*)$/);
      if (!start) continue;

      const endIndex = start[2].indexOf(NOTE_END);
      const entry: RawProseEntry = {
        nodeId: start[1],
        remainder: endIndex >= 0 ? start[2].slice(0, endIndex) : start[2],
        bodyLines: []
      };
      if (endIndex >= 0) entries.push(entry);
      else current = entry;
      continue;
    }

    const endIndex = rawLine.indexOf(NOTE_END);
    if (endIndex >= 0) {
      const before = rawLine.slice(0, endIndex);
      if (before.trim().length > 0) current.bodyLines.push(before);
      entries.push(current);
      current = null;
      continue;
    }

    current.bodyLines.push(rawLine);
  }

  if (current) entries.push(current);
  return entries;
}

function joinBody(firstLine: string, bodyLines: string[]): string {
  return trimOuterBlankLines([firstLine.trimStart(), ...bodyLines]).join('\n');
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim().length === 0) start += 1;
  while (end > start && lines[end - 1].trim().length === 0) end -= 1;
  return lines.slice(start, end);
}

/** Section lines up to the next heading of any kind — for one-line entries. */
function extractSection(source: string, heading: RegExp): string[] {
  return collectSectionLines(source, heading, line => /^#{1,6}\s+/.test(line));
}

/** Section lines up to the next *Knogra* heading — for verbatim prose. */
function extractProseSection(source: string, heading: RegExp): string[] {
  return collectSectionLines(source, heading, line => KNOGRA_SECTION_HEADING.test(line));
}

function collectSectionLines(
  source: string,
  heading: RegExp,
  isTerminator: (trimmedLine: string) => boolean
): string[] {
  const lines = source.split(/\r?\n/);
  const startIndex = lines.findIndex(line => heading.test(line.trim()));
  if (startIndex < 0) return [];

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index++) {
    if (isTerminator(lines[index].trim())) break;
    sectionLines.push(lines[index]);
  }
  return sectionLines;
}

// ============================================================================
// SERIALIZATION
// ============================================================================

export interface SectionsExportInput {
  equations: Array<{ nodeId: string; value: string }>;
  tags: Array<{ nodeId: string; values: string[] }>;
  comments: Array<{ nodeId: string; value: string }>;
  notes: Array<{ nodeId: string; noteId: string; content: string }>;
  articles: Array<{ nodeId: string; noteId: string; content: string }>;
  /** Written for reading outside the app; discarded when read back. */
  chat: DocumentChatEntry[];
}

/**
 * Sections are written in the order they are read most usefully, with ai chat
 * always last because it can dwarf everything above it. An empty section is
 * omitted rather than written as a bare heading.
 */
export function serializeSections(input: SectionsExportInput): string {
  const blocks: string[] = [];

  if (input.equations.length > 0) {
    blocks.push(
      section('equations', input.equations.map(entry => `${entry.nodeId}: \`${entry.value}\``))
    );
  }

  if (input.tags.length > 0) {
    blocks.push(
      section('tags', input.tags.map(entry => `${entry.nodeId}: ${entry.values.join(', ')}`))
    );
  }

  if (input.comments.length > 0) {
    blocks.push(
      section(
        'comments',
        input.comments.map(entry => `${entry.nodeId}: ${entry.value}\n${NOTE_END}`)
      )
    );
  }

  if (input.notes.length > 0) {
    blocks.push(
      section(
        'notes',
        input.notes.map(note => `${note.nodeId}:${note.noteId}:\n${note.content}\n${NOTE_END}`)
      )
    );
  }

  if (input.articles.length > 0) {
    blocks.push(
      section(
        'articles',
        input.articles.map(note => `${note.nodeId}:${note.noteId}:\n${note.content}\n${NOTE_END}`)
      )
    );
  }

  if (input.chat.length > 0) {
    blocks.push(
      section(
        'ai chat',
        input.chat.map(
          message =>
            `${message.nodeId}:${message.messageId}:${message.role}:\n${message.content}\n${NOTE_END}`
        )
      )
    );
  }

  return blocks.join('\n');
}

/**
 * One blank line after the heading, none between entries — blank lines between
 * entries multiply the file's height without making it easier to read. Prose
 * entries are already delimited by `</note>`.
 */
function section(name: string, entries: string[]): string {
  return `${SECTION_HEADING_PREFIX} Knogra ${name}\n\n${entries.join('\n')}\n`;
}
