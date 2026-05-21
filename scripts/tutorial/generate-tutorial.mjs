#!/usr/bin/env node
/**
 * Generate Tutorial .knogra File
 *
 * Reads an existing .knogra file (with manually crafted layouts/scenes),
 * parses tutorial-content.md, and injects tutorial conversations into
 * the chat-history.json — preserving everything else untouched.
 *
 * Must be run via tsx (not plain node) because it imports FACTORY_DEFAULTS
 * from the TypeScript config module to verify settings against factory values.
 *
 * Usage (zero-arg — auto-detects latest graph-*.knogra):
 *   npm run tutorial
 *
 * Usage (explicit paths):
 *   npx tsx scripts/tutorial/generate-tutorial.mjs <input.knogra> <content.md> <output.knogra>
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { FACTORY_DEFAULTS } from '../../src/config/index.ts';

// =============================================================================
// Intentional tutorial-specific setting overrides
//
// These keys are forced by this script regardless of what the input .knogra
// file contains. Listed once here and consumed both by the override-application
// code and the settings report.
// =============================================================================

const INTENTIONAL_OVERRIDES = {
  'ai.chatScrollPosition': 'top',
  'interaction.doubleClickNode': 'navigate',
};

// =============================================================================
// Parse tutorial-content.md
// =============================================================================

function parseContent(mdText) {
  const sections = [];
  // Split on h1 headings (`# Title`) — node markers.
  // `\n# ` matches only single-hash headings; `##` subtitles inside content won't match.
  // slice(1) discards the preamble before the first heading.
  const parts = mdText.split(/\n# /).slice(1);

  for (const part of parts) {
    // First line is the title, rest is the body
    const newlineIndex = part.indexOf('\n');
    if (newlineIndex === -1) continue;

    const title = part.substring(0, newlineIndex).trim();
    const body = part.substring(newlineIndex + 1).trim();

    if (!body) continue;

    // Split messages by ---
    const messages = body.split(/^---$/gm)
      .map(m => m.trim())
      .filter(m => m.length > 0);

    sections.push({ title, messages });
  }
  return sections;
}

// =============================================================================
// Normalize titles for matching (handles &/and, extra spaces, punctuation diffs)
// =============================================================================

function normalizeTitle(title) {
  return title.trim().toLowerCase()
    .replace(/\s+/g, ' ')           // collapse multiple spaces
    .replace(/&/g, 'and')           // & → and
    .replace(/[.,;:!]+$/g, '');     // strip trailing punctuation
}

// =============================================================================
// Build title → nodeId map from graph.json
// =============================================================================

function buildTitleMap(graphJson) {
  const map = new Map();
  for (const node of graphJson.nodes) {
    const key = normalizeTitle(node.title);
    if (map.has(key)) {
      console.warn(`  ⚠ Duplicate title: "${node.title}" — using first match`);
    } else {
      map.set(key, node.id);
    }
  }
  return map;
}

// =============================================================================
// Generate chat-history.json from content + title map
// =============================================================================

function generateChatHistory(sections, titleMap) {
  const conversations = [];
  let msgCounter = 0;
  let matched = 0;
  let unmatched = 0;

  for (const { title, messages } of sections) {
    const nodeId = titleMap.get(normalizeTitle(title));
    if (!nodeId) {
      console.warn(`  ⚠ No node found for "${title}" — skipping`);
      unmatched++;
      continue;
    }

    matched++;
    const now = new Date().toISOString();
    const chatMessages = messages.map(content => {
      msgCounter++;
      return {
        id: `tutorial-msg-${String(msgCounter).padStart(4, '0')}`,
        role: 'assistant',
        content,
        timestamp: now,
        source: 'tutorial'
      };
    });

    conversations.push({
      nodeId,
      messages: chatMessages,
      createdAt: now,
      updatedAt: now
    });
  }

  console.log(`  ✅ ${matched} nodes matched, ${msgCounter} messages total`);
  if (unmatched > 0) console.log(`  ⚠ ${unmatched} sections had no matching node`);

  return conversations;
}

// =============================================================================
// Build reconciliation report
// =============================================================================

function buildReport(graphJson, sections, titleMap) {
  const sectionResults = sections.map(({ title, messages }) => {
    const nodeId = titleMap.get(normalizeTitle(title)) ?? null;
    return { title, nodeId, messageCount: messages.length };
  });

  const matchedNodeIds = new Set(
    sectionResults.filter(s => s.nodeId !== null).map(s => s.nodeId)
  );

  const nodeResults = graphJson.nodes.map(node => ({
    id: node.id,
    title: node.title,
    hasContent: matchedNodeIds.has(node.id),
    hasScene: graphJson.scenes.some(s => s.centralNodeId === node.id),
  }));

  const unmatchedSections = sectionResults.filter(s => s.nodeId === null);
  const nodesWithoutContent = nodeResults.filter(n => !n.hasContent);

  const lines = [];

  lines.push('# Tutorial Reconciliation Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Graph nodes | ${nodeResults.length} |`);
  lines.push(`| Content sections | ${sectionResults.length} |`);
  lines.push(`| Matched | ${sectionResults.length - unmatchedSections.length} |`);
  lines.push(`| ⚠ Unmatched content sections | ${unmatchedSections.length} |`);
  lines.push(`| ⚠ Graph nodes without content | ${nodesWithoutContent.length} |`);
  lines.push('');

  // Issues first — most actionable
  if (unmatchedSections.length > 0 || nodesWithoutContent.length > 0) {
    lines.push('## Issues');
    lines.push('');

    if (unmatchedSections.length > 0) {
      lines.push('### Content sections with no matching graph node');
      lines.push('_These sections exist in tutorial-content.md but no node title matches them._');
      lines.push('');
      unmatchedSections.forEach(s => {
        lines.push(`- \`${s.title}\` (${s.messageCount} message${s.messageCount !== 1 ? 's' : ''})`);
      });
      lines.push('');
    }

    if (nodesWithoutContent.length > 0) {
      lines.push('### Graph nodes without content section');
      lines.push('_These nodes exist in the graph but have no section in tutorial-content.md._');
      lines.push('');
      nodesWithoutContent.forEach(n => {
        const tag = n.hasScene ? '(has scene)' : '(no scene)';
        lines.push(`- \`${n.title}\` ${tag} — ${n.id}`);
      });
      lines.push('');
    }
  } else {
    lines.push('## Issues');
    lines.push('');
    lines.push('_None — all sections matched, all nodes have content. ✅_');
    lines.push('');
  }

  // Full content sections table
  lines.push('## Content Sections');
  lines.push('');
  lines.push('| # | Title | Status | Messages | Node ID |');
  lines.push('|---|-------|--------|----------|---------|');
  sectionResults.forEach((s, i) => {
    const status = s.nodeId ? '✅' : '❌ no node';
    const nodeId = s.nodeId ?? '—';
    lines.push(`| ${i + 1} | ${s.title} | ${status} | ${s.messageCount} | ${nodeId} |`);
  });
  lines.push('');

  // Full graph nodes table
  lines.push('## Graph Nodes');
  lines.push('');
  lines.push('| # | Title | Content | Has scene | Node ID |');
  lines.push('|---|-------|---------|-----------|---------|');
  nodeResults.forEach((n, i) => {
    const content = n.hasContent ? '✅' : '❌ missing';
    const scene = n.hasScene ? 'yes' : 'no';
    lines.push(`| ${i + 1} | ${n.title} | ${content} | ${scene} | ${n.id} |`);
  });
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Build settings report
//
// Compares input file's settings.json against FACTORY_DEFAULTS, producing:
//   - intentional tutorial overrides (always shown)
//   - customizations (input keys that differ from factory, excluding overrides)
//   - unknown keys (in input but not in current schema)
//
// `inputSettings` is the raw settings.json from the input .knogra, BEFORE
// this script applies its overrides.
// =============================================================================

function flattenSettings(obj) {
  const out = {};
  for (const [domain, settings] of Object.entries(obj ?? {})) {
    if (!settings || typeof settings !== 'object') continue;
    for (const [key, val] of Object.entries(settings)) {
      out[`${domain}.${key}`] = val;
    }
  }
  return out;
}

function buildSettingsReport(inputSettings) {
  const lines = [];
  lines.push('## Settings');
  lines.push('');

  const inputIsEmpty = !inputSettings || Object.keys(inputSettings).length === 0;
  if (inputIsEmpty) {
    lines.push('_Input file has no settings — full factory defaults will be used._');
    lines.push('_(Tutorial overrides will still be written: `' +
      Object.keys(INTENTIONAL_OVERRIDES).join('`, `') + '`)_');
    lines.push('');
    return lines.join('\n');
  }

  const factoryFlat = flattenSettings(FACTORY_DEFAULTS);
  const inputFlat = flattenSettings(inputSettings);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Intentional overrides — always shown
  const overrideRows = Object.entries(INTENTIONAL_OVERRIDES).map(([key, expected]) => ({
    key,
    factory: factoryFlat[key],
    expected,
  }));

  // Customizations: input keys that differ from factory.
  // Skip:
  //   - intentional override keys (their final value is forced by this script)
  //   - undefined input values (key absent from input → uses default at runtime)
  //   - sensitive keys stripped on export (always undefined in input)
  const customRows = [];
  for (const key of Object.keys(factoryFlat)) {
    if (key in INTENTIONAL_OVERRIDES) continue;
    const input = inputFlat[key];
    if (input === undefined) continue;
    if (eq(input, factoryFlat[key])) continue;
    customRows.push({ key, factory: factoryFlat[key], input });
  }

  // Unknown keys: in input but not in current schema
  const unknownRows = [];
  for (const key of Object.keys(inputFlat)) {
    if (!(key in factoryFlat)) {
      unknownRows.push({ key, value: inputFlat[key] });
    }
  }

  // Summary
  lines.push('| | Count |');
  lines.push('|---|---|');
  lines.push(`| Intentional tutorial overrides | ${overrideRows.length} |`);
  lines.push(`| ⚠ Customizations in input file | ${customRows.length} |`);
  lines.push(`| ⚠ Unknown keys (schema drift) | ${unknownRows.length} |`);
  lines.push('');

  // Intentional overrides
  lines.push('### Intentional tutorial overrides');
  lines.push('_Applied by this script regardless of input file. Expected, not issues._');
  lines.push('');
  lines.push('| Setting | Factory | Tutorial |');
  lines.push('|---|---|---|');
  for (const row of overrideRows) {
    lines.push(`| \`${row.key}\` | \`${JSON.stringify(row.factory)}\` | \`${JSON.stringify(row.expected)}\` |`);
  }
  lines.push('');

  // Customizations
  lines.push('### Customizations in input file');
  if (customRows.length === 0) {
    lines.push('_None — input file matches factory defaults. ✅_');
    lines.push('');
  } else {
    lines.push('_Settings in the input `.knogra` that differ from `FACTORY_DEFAULTS`._');
    lines.push('_Review each: if intentional, consider promoting to a factory default;_');
    lines.push('_if accidental, reset before regenerating the tutorial._');
    lines.push('');
    lines.push('| Setting | Factory | Input |');
    lines.push('|---|---|---|');
    for (const row of customRows) {
      lines.push(`| \`${row.key}\` | \`${JSON.stringify(row.factory)}\` | \`${JSON.stringify(row.input)}\` |`);
    }
    lines.push('');
  }

  // Unknown keys
  if (unknownRows.length > 0) {
    lines.push('### Unknown keys');
    lines.push('_Keys in input file that no longer exist in the settings schema._');
    lines.push('_Likely a renamed or removed setting — safe to ignore but worth a glance._');
    lines.push('');
    for (const row of unknownRows) {
      lines.push(`- \`${row.key}\` = \`${JSON.stringify(row.value)}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Find latest graph-*.knogra in a directory
// =============================================================================

function findLatestKnogra(dir) {
  const files = readdirSync(dir)
    .filter(f => f.startsWith('graph-') && f.endsWith('.knogra'))
    .sort();  // alphabetical = chronological for YYYY-MM-DD dates
  if (files.length === 0) return null;
  return join(dir, files[files.length - 1]); // latest by date
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(scriptDir, '..', '..');

  // Resolve paths: allow explicit args or use defaults
  const inputPath = process.argv[2] || findLatestKnogra(scriptDir);
  const contentPath = process.argv[3] || join(scriptDir, 'tutorial-content.md');
  const outputPath = process.argv[4] || join(scriptDir, 'tutorial.knogra');

  if (!inputPath) {
    console.error('❌ No graph-*.knogra file found in', scriptDir);
    console.error('   Export from browser and copy to scripts/tutorial/');
    process.exit(1);
  }

  console.log('📚 Generating tutorial...');
  console.log(`  Input:   ${inputPath}`);
  console.log(`  Content: ${contentPath}`);
  console.log(`  Output:  ${outputPath}`);

  // Read inputs
  const zipData = readFileSync(inputPath);
  const mdText = readFileSync(contentPath, 'utf8');

  // Parse .knogra ZIP
  const zip = await JSZip.loadAsync(zipData);

  // Read graph.json for title→nodeId mapping
  const graphFile = zip.file('graph.json');
  if (!graphFile) throw new Error('No graph.json found in .knogra file');
  const graphJson = JSON.parse(await graphFile.async('string'));

  console.log(`  Found ${graphJson.nodes.length} nodes in graph`);

  // Parse markdown content
  const sections = parseContent(mdText);
  console.log(`  Found ${sections.length} sections in content.md`);

  // Build title map and generate conversations
  const titleMap = buildTitleMap(graphJson);
  const conversations = generateChatHistory(sections, titleMap);

  // Replace chat-history.json in ZIP (everything else stays)
  zip.file('chat-history.json', JSON.stringify(conversations, null, 2));

  // Force initial scene to the welcome node (first section in content.md).
  // Without this, the exported app-state.json would dictate the start scene —
  // brittle, depends on what was open when the .knogra was exported.
  const welcomeSection = sections[0];
  if (!welcomeSection) throw new Error('No sections found in tutorial-content.md');
  const welcomeNodeId = titleMap.get(normalizeTitle(welcomeSection.title));
  if (!welcomeNodeId) {
    throw new Error(`Welcome node "${welcomeSection.title}" not found in graph`);
  }
  const welcomeScene = graphJson.scenes.find(s => s.centralNodeId === welcomeNodeId);
  if (!welcomeScene) {
    throw new Error(`No scene found with central node "${welcomeSection.title}"`);
  }
  const appStateFile = zip.file('app-state.json');
  const appState = appStateFile ? JSON.parse(await appStateFile.async('string')) : {};
  const prevSceneId = appState.lastSceneId;
  appState.lastSceneId = welcomeScene.id;
  // Force View mode for tutorial readers — they shouldn't accidentally edit
  // nodes while exploring. User can switch to Edit via context menu / shortcut.
  appState.appMode = 'view';
  zip.file('app-state.json', JSON.stringify(appState, null, 2));
  console.log(`  📌 Set initial scene → "${welcomeSection.title}" (${welcomeScene.id})`);
  if (prevSceneId && prevSceneId !== welcomeScene.id) {
    console.log(`     (was ${prevSceneId})`);
  }
  console.log(`  📌 Set app mode → 'view'`);

  // Read input settings (preserved as-is for the report — captured BEFORE overrides)
  const settingsFile = zip.file('settings.json');
  const inputSettings = settingsFile ? JSON.parse(await settingsFile.async('string')) : {};

  // Apply intentional tutorial overrides.
  // Driven by INTENTIONAL_OVERRIDES so the constant is the single source of truth
  // for both override-application and the settings report.
  const settings = JSON.parse(JSON.stringify(inputSettings));
  for (const [dottedKey, value] of Object.entries(INTENTIONAL_OVERRIDES)) {
    const [domain, key] = dottedKey.split('.');
    if (!settings[domain]) settings[domain] = {};
    settings[domain][key] = value;
    console.log(`  📌 Set ${dottedKey} = ${JSON.stringify(value)} in settings`);
  }
  zip.file('settings.json', JSON.stringify(settings, null, 2));

  // Write output
  const output = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(outputPath, output);

  // Write reconciliation report — graph/content reconciliation + settings audit
  const reportPath = outputPath.replace(/\.knogra$/, '-report.md');
  const report = buildReport(graphJson, sections, titleMap)
    + '\n' + buildSettingsReport(inputSettings);
  writeFileSync(reportPath, report);

  console.log(`\n✅ Done!`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Report: ${reportPath}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
