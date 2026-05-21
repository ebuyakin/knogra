/**
 * Populate knogra-graph with Newtonian Physics sample data
 * 
 * HOW TO RUN:
 * Import this in main.ts temporarily:
 *   import { populateSampleData } from './storage/populate-sample-data.js';
 *   await populateSampleData();
 */

import Dexie from 'dexie';

export async function populateSampleData() {
  console.log('🌱 Populating knogra-graph with Newtonian Physics data...');

  const db = new Dexie('knogra-graph');
  db.version(2).stores({
    nodes: '++id, title, tags',
    edges: '++id, title, sourceId, targetId, tags',
    scenes: '++id, title',
    backgroundImages: '++id, name'
  });

  try {
    await db.open();

    await db.nodes.clear();
    await db.edges.clear();
    await db.scenes.clear();
    await db.table('backgroundImages').clear();

    // Clear associated databases that reference graph data
    const chatDb = new Dexie('knogra-chat');
    chatDb.version(1).stores({ conversations: 'nodeId, updatedAt' });
    await chatDb.open();
    await chatDb.table('conversations').clear();
    chatDb.close();

    const pathDb = new Dexie('knogra-paths');
    pathDb.version(1).stores({ paths: '++id, name, createdAt' });
    await pathDb.open();
    await pathDb.table('paths').clear();
    pathDb.close();

    // Clear all localStorage (state, shelf, settings)
    localStorage.removeItem('knogra.state');
    localStorage.removeItem('knogra.shelf');
    localStorage.removeItem('knogra.settings');

    console.log('✅ Cleared existing data (graph, chat, paths, app state)');

    // ========================================================================
    // Nodes (11 total, hierarchy: 1-4-4-2)
    //
    // n-0001  Newtonian Physics (central/anchor)
    // ├── n-0002  Newton's Laws of Motion
    // │   ├── n-0003  Second Law (F=ma)
    // │   └── n-0004  Third Law (action-reaction)
    // ├── n-0005  Universal Gravitation
    // │   ├── n-0006  Gravitational Field
    // │   └── n-0007  Orbital Mechanics
    // │       ├── n-0008  Escape Velocity
    // │       └── n-0011  Kepler's Third Law
    // ├── n-0009  Conservation of Energy
    // └── n-0010  Projectile Motion
    // ========================================================================

    const nodes = [
      {
        id: 'n-0001',
        title: 'Newtonian Physics',
        tags: ['physics', 'classical-mechanics'],
        properties: {
          difficulty: 'intermediate',
          typeText: 'Foundation'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: [],
        isAnchor: true
      },
      {
        id: 'n-0002',
        title: "Newton's Laws of Motion",
        tags: ['physics', 'laws', 'motion'],
        properties: {
          difficulty: 'intermediate',
          equation: '\\sum \\vec{F} = \\frac{d\\vec{p}}{dt}',
          typeText: 'Laws'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0003',
        title: 'Second Law',
        tags: ['physics', 'laws', 'force'],
        properties: {
          difficulty: 'beginner',
          equation: '\\vec{F} = m\\vec{a}',
          typeText: 'Law'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0004',
        title: 'Third Law',
        tags: ['physics', 'laws', 'action-reaction'],
        properties: {
          difficulty: 'beginner',
          equation: '\\vec{F}_{12} = -\\vec{F}_{21}',
          typeText: 'Law'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0005',
        title: 'Universal Gravitation',
        tags: ['physics', 'gravity'],
        properties: {
          difficulty: 'intermediate',
          equation: 'F = G\\frac{m_1 m_2}{r^2}',
          typeText: 'Law'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0006',
        title: 'Gravitational Field',
        tags: ['physics', 'gravity', 'field'],
        properties: {
          difficulty: 'intermediate',
          equation: '\\vec{g} = -\\frac{GM}{r^2}\\hat{r}',
          typeText: 'Concept'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0007',
        title: 'Orbital Mechanics',
        tags: ['physics', 'gravity', 'orbits'],
        properties: {
          difficulty: 'advanced',
          equation: '\\frac{mv^2}{r} = \\frac{GMm}{r^2}',
          typeText: 'Application'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0008',
        title: 'Escape Velocity',
        tags: ['physics', 'gravity', 'velocity'],
        properties: {
          difficulty: 'advanced',
          equation: 'v_e = \\sqrt{\\frac{2GM}{r}}',
          typeText: 'Derivation'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0009',
        title: 'Conservation of Energy',
        tags: ['physics', 'energy', 'conservation'],
        properties: {
          difficulty: 'intermediate',
          equation: '\\frac{1}{2}mv^2 + mgh = E',
          typeText: 'Principle'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0010',
        title: 'Projectile Motion',
        tags: ['physics', 'motion', 'kinematics'],
        properties: {
          difficulty: 'beginner',
          equation: '\\vec{r}(t) = \\vec{v}_0 t + \\frac{1}{2}\\vec{g}t^2',
          typeText: 'Application'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      },
      {
        id: 'n-0011',
        title: "Kepler's Third Law",
        tags: ['physics', 'gravity', 'orbits', 'kepler'],
        properties: {
          difficulty: 'advanced',
          equation: 'T^2 = \\frac{4\\pi^2}{GM}a^3',
          typeText: 'Law'
        },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01'),
        attachments: [],
        aiArtifacts: []
      }
    ];

    for (const node of nodes) {
      await db.nodes.add(node);
    }
    console.log(`✅ Created ${nodes.length} nodes`);

    // ========================================================================
    // Edges (10 tree edges)
    // ========================================================================

    const edges = [
      {
        id: 'e0001', title: 'encompasses',
        sourceId: 'n-0001', targetId: 'n-0002',
        tags: ['foundation'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0002', title: 'encompasses',
        sourceId: 'n-0001', targetId: 'n-0005',
        tags: ['foundation'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0003', title: 'principle',
        sourceId: 'n-0001', targetId: 'n-0009',
        tags: ['foundation'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0004', title: 'application',
        sourceId: 'n-0001', targetId: 'n-0010',
        tags: ['application'], properties: { strength: 'medium' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0005', title: 'second law',
        sourceId: 'n-0002', targetId: 'n-0003',
        tags: ['formalization'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0006', title: 'third law',
        sourceId: 'n-0002', targetId: 'n-0004',
        tags: ['formalization'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0007', title: 'derives',
        sourceId: 'n-0005', targetId: 'n-0006',
        tags: ['derivation'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0008', title: 'application',
        sourceId: 'n-0005', targetId: 'n-0007',
        tags: ['application'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0009', title: 'derives',
        sourceId: 'n-0007', targetId: 'n-0008',
        tags: ['derivation'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      },
      {
        id: 'e0010', title: 'governs',
        sourceId: 'n-0007', targetId: 'n-0011',
        tags: ['law'], properties: { strength: 'strong' },
        createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01')
      }
    ];

    for (const edge of edges) {
      await db.edges.add(edge);
    }
    console.log(`✅ Created ${edges.length} edges`);

    // ========================================================================
    // Scene: Newtonian Physics (all 11 nodes, viewport-adaptive star layout)
    // Positions derived from container size — see code below
    // ========================================================================

    // ========================================================================
    // Background images (4 from /guides, stored as base64 in IndexedDB)
    // ========================================================================
    async function loadImage(path) {
      const resp = await fetch(path);
      const blob = await resp.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const img = new Image();
          img.onload = () => resolve({ dataUri: reader.result, width: img.width, height: img.height });
          img.onerror = reject;
          img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const imgFiles = [
      { id: 'bg-1', name: 'Photo 1', path: '/guides/img_1.jpg' },
      { id: 'bg-2', name: 'Photo 2', path: '/guides/img_2.png' },
      { id: 'bg-3', name: 'Photo 3', path: '/guides/img_3.png' },
      { id: 'bg-4', name: 'Photo 4', path: '/guides/img_4.jpg' }
    ];

    for (const f of imgFiles) {
      const { dataUri, width, height } = await loadImage(f.path);
      await db.table('backgroundImages').add({
        id: f.id, name: f.name, dataUri, width, height,
        createdAt: new Date('2026-04-01')
      });
    }
    console.log(`✅ Loaded ${imgFiles.length} background images`);

    const EC = { id: 'equation-compact-node', params: {} };
    const DN = { id: 'default-node', params: {} };

    // Derive layout from actual viewport size so all nodes fit nicely
    const cyContainer = document.getElementById('cy');
    const vw = cyContainer?.clientWidth || 1400;
    const vh = cyContainer?.clientHeight || 800;
    const pad = 60; // padding from edges in screen pixels
    const zoom = 0.7;

    // Usable model space at given zoom, centered on (0,0)
    const halfW = (vw / 2 - pad) / zoom;
    const halfH = (vh / 2 - pad) / zoom;

    // Vertical tiers spaced relative to model halfH
    const t1 = -0.30 * halfH;
    const t2 = -0.60 * halfH;
    const t3 = -0.90 * halfH;
    const t4 = +0.55 * halfH;

    // Horizontal: left/right branches and spreads relative to model halfW
    const bL = -0.40 * halfW;
    const bR = +0.40 * halfW;
    const spread2 = 0.25 * halfW;
    const spread3 = 0.22 * halfW;

    const scenes = [
      {
        id: 'scene-newtonian-physics-n-0001',
        title: 'Newtonian Physics',
        description: 'Core Newtonian physics concepts — anchor scene',
        centralNodeId: 'n-0001',
        nodes: {
          'n-0001': { position: { x: 0,                y: 0 },   scale: 1.3, design: DN },
          'n-0002': { position: { x: bL,               y: t1 },  scale: 1.0, design: DN },
          'n-0003': { position: { x: bL - spread2,     y: t2 },  scale: 1.0, design: EC },
          'n-0004': { position: { x: bL + spread2,     y: t2 },  scale: 1.0, design: DN },
          'n-0005': { position: { x: bR,               y: t1 },  scale: 1.0, design: EC },
          'n-0006': { position: { x: bR - spread2,     y: t2 },  scale: 1.0, design: EC },
          'n-0007': { position: { x: bR + spread2,     y: t2 },  scale: 1.0, design: DN },
          'n-0008': { position: { x: bR + spread2 - spread3, y: t3 }, scale: 1.0, design: EC },
          'n-0009': { position: { x: bL,               y: t4 },  scale: 1.0, design: DN },
          'n-0010': { position: { x: bR,               y: t4 },  scale: 1.0, design: DN },
          'n-0011': { position: { x: bR + spread2 + spread3, y: t3 }, scale: 1.0, design: EC }
        },
        edges: {
          e0001: { design: null },
          e0002: { design: null },
          e0003: { design: null },
          e0004: { design: null },
          e0005: { design: null },
          e0006: { design: null },
          e0007: { design: null },
          e0008: { design: null },
          e0009: { design: null },
          e0010: { design: null }
        },
        backgroundImages: [
          {
            id: 'sbg-1', imageId: 'bg-1',
            position: { x: -halfW, y: -halfH },
            size: { width: halfW * 2, height: halfH * 2 },
            zIndex: 1,
            appearance: { opacity: 0.7, brightness: 0.8, contrast: 1.1, saturation: 0.6, borderFade: 0.25 }
          }
        ],
        themeId: 'dark',
        viewport: { zoom: zoom, pan: { x: vw / 2, y: vh / 2 } },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01')
      },
      // Scene 2: Universal Gravitation — central + parent + 2 children
      {
        id: 'scene-universal-gravitation-n-0005',
        title: 'Universal Gravitation',
        description: 'Gravitation law with field concept and orbital mechanics',
        centralNodeId: 'n-0005',
        nodes: {
          'n-0005': { position: { x: 0,   y: 0 },    scale: 1.3, design: EC },
          'n-0001': { position: { x: 0,   y: t4 },   scale: 1.0, design: DN },
          'n-0006': { position: { x: bL,  y: t1 },   scale: 1.0, design: EC },
          'n-0007': { position: { x: bR,  y: t1 },   scale: 1.0, design: DN }
        },
        edges: {
          e0002: { design: null },
          e0007: { design: null },
          e0008: { design: null }
        },
        backgroundImages: [
          {
            id: 'sbg-2', imageId: 'bg-3',
            position: { x: -halfW, y: -halfH },
            size: { width: halfW * 2, height: halfH * 2 },
            zIndex: 1,
            appearance: { opacity: 0.7, brightness: 0.7, contrast: 1.2, saturation: 0.5, hue: 180, borderFade: 0.25 }
          }
        ],
        themeId: 'dark',
        viewport: { zoom: zoom, pan: { x: vw / 2, y: vh / 2 } },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01')
      },
      // Scene 3: Orbital Mechanics — central + parent + 2 children
      {
        id: 'scene-orbital-mechanics-n-0007',
        title: 'Orbital Mechanics',
        description: 'Orbital dynamics with escape velocity and Kepler\'s law',
        centralNodeId: 'n-0007',
        nodes: {
          'n-0007': { position: { x: 0,   y: 0 },    scale: 1.3, design: DN },
          'n-0005': { position: { x: 0,   y: t4 },   scale: 1.0, design: EC },
          'n-0008': { position: { x: bL,  y: t1 },   scale: 1.0, design: EC },
          'n-0011': { position: { x: bR,  y: t1 },   scale: 1.0, design: EC }
        },
        edges: {
          e0008: { design: null },
          e0009: { design: null },
          e0010: { design: null }
        },
        backgroundImages: [],
        themeId: 'dark',
        viewport: { zoom: zoom, pan: { x: vw / 2, y: vh / 2 } },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01')
      },
      // Scene 4: Kepler's Third Law — central + parent
      {
        id: 'scene-kepler-s-third-law-n-0011',
        title: "Kepler's Third Law",
        description: 'Kepler\'s period-radius relationship',
        centralNodeId: 'n-0011',
        nodes: {
          'n-0011': { position: { x: 0,   y: 0 },    scale: 1.3, design: EC },
          'n-0007': { position: { x: 0,   y: t4 },   scale: 1.0, design: DN }
        },
        edges: {
          e0010: { design: null }
        },
        backgroundImages: [],
        themeId: 'dark',
        viewport: { zoom: zoom, pan: { x: vw / 2, y: vh / 2 } },
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-04-01')
      }
    ];

    for (const scene of scenes) {
      await db.scenes.add(scene);
    }
    console.log(`✅ Created ${scenes.length} scene(s)`);

    // ========================================================================
    // Path: Gravitation deep-dive
    // Newtonian Physics → Universal Gravitation → Orbital Mechanics → Kepler's Third Law
    // ========================================================================

    const pathDbWrite = new Dexie('knogra-paths');
    pathDbWrite.version(1).stores({ paths: '++id, name, createdAt' });
    await pathDbWrite.open();
    await pathDbWrite.table('paths').add({
      name: 'Gravitation deep-dive',
      scenes: [
        'scene-newtonian-physics-n-0001',
        'scene-universal-gravitation-n-0005',
        'scene-orbital-mechanics-n-0007',
        'scene-kepler-s-third-law-n-0011'
      ],
      createdAt: new Date('2026-04-01'),
      updatedAt: new Date('2026-04-01')
    });
    pathDbWrite.close();
    console.log('✅ Created 1 path');

    console.log('\n✨ Newtonian Physics sample data ready!');
    console.log(`  Nodes: ${nodes.length}, Edges: ${edges.length}, Scenes: ${scenes.length}, Paths: 1`);

    // Set app state to open the anchor scene on next load
    localStorage.setItem('knogra.state', JSON.stringify({
      lastSceneId: 'scene-newtonian-physics-n-0001'
    }));

  } catch (error) {
    console.error('❌ Population failed:', error);
  } finally {
    db.close();
  }
}
