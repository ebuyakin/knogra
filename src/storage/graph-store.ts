// repository

import Dexie from 'dexie'
import type { Node, Edge, EdgeType, EdgeTypeId, Scene, SceneId, NodeId, EdgeId, BackgroundImage, BackgroundImageId } from '../core/main-types'
import { GRAPH_DB_NAME, GRAPH_DB_VERSION, GRAPH_DB_SCHEMA } from '../config/storage-config'
import { createStarterEdgeTypes, getDefaultEdgeTypeId } from '../config/edge-type-settings'
import { isDebug } from '../config/debug-flags'
import { recordPersistedPositions } from '../utils/diagnostics/recorder'

class GraphDataStore {
    #db: Dexie;
    
    // In-memory cache
    nodes: Node[] = [];
    edges: Edge[] = [];
    edgeTypes: EdgeType[] = [];
    scenes: Scene[] = [];
    backgroundImages: BackgroundImage[] = [];

    constructor() {
        this.#db = new Dexie(GRAPH_DB_NAME)

        // Version 2: original schema with auto-increment (++id)
        this.#db.version(2).stores({
            nodes: '++id, title, tags',
            edges: '++id, title, sourceId, targetId, tags',
            scenes: '++id, title',
            backgroundImages: '++id, name'
        })

        // Version 3: edge type object store and typeId edge index.
        this.#db.version(GRAPH_DB_VERSION).stores(GRAPH_DB_SCHEMA)
    }

    async init(): Promise<void> {
        this.nodes = await this.#db.table('nodes').toArray();
        this.edgeTypes = await this.#db.table('edgeTypes').toArray();
        if (this.edgeTypes.length === 0) {
            this.edgeTypes = createStarterEdgeTypes();
            await this.#db.table('edgeTypes').bulkPut(this.edgeTypes);
        }

        const rawEdges = await this.#db.table('edges').toArray() as Edge[];
        let edgesChanged = false;
        this.edges = rawEdges.map(edge => {
            const normalized = this.#withValidEdgeType(edge);
            if (normalized !== edge) edgesChanged = true;
            return normalized;
        });
        if (edgesChanged) {
            await this.#db.table('edges').bulkPut(this.edges);
        }
        this.scenes = await this.#db.table('scenes').toArray();
        this.backgroundImages = await this.#db.table('backgroundImages').toArray();
        
        // DEBUG: Log loaded edges
        //console.log(`[graphStore.init] Loaded ${this.edges.length} edges:`, this.edges.map(e => `${e.id}(${e.sourceId}->${e.targetId})`)); // don't delete it yet
    }

    async createNode(node: Node): Promise<NodeId> {
        const nodeId = await this.#db.table('nodes').add(node) as NodeId
        this.nodes.push({...node, id: nodeId})
        return nodeId
    }

    async updateNode(node: Node): Promise<void> {
        await this.#db.table('nodes').put(node);
        const index = this.nodes.findIndex(n => n.id === node.id);
        if (index >= 0) {
            this.nodes[index] = node;
        } else {
            this.nodes.push(node);
        }
    }

    async deleteNode(nodeId: NodeId): Promise<void> {
        await this.#db.table('nodes').delete(nodeId);
        const index = this.nodes.findIndex(n => n.id === nodeId);
        if (index >= 0) {
            this.nodes.splice(index, 1);
        }
    }

    async createEdge(edge: Edge): Promise<EdgeId> {
        const normalizedEdge = this.#withValidEdgeType(edge);
        const edgeId = await this.#db.table('edges').add(normalizedEdge) as EdgeId;
        this.edges.push({...normalizedEdge, id: edgeId});
        return edgeId;
    }

    async updateEdge(edge: Edge): Promise<void> {
        const normalizedEdge = this.#withValidEdgeType(edge);
        await this.#db.table('edges').put(normalizedEdge);
        const index = this.edges.findIndex(e => e.id === normalizedEdge.id);
        if (index >= 0) {
            this.edges[index] = normalizedEdge;
        } else {
            this.edges.push(normalizedEdge);
        }
    }

    async deleteEdge(edgeId: EdgeId): Promise<void> {
        await this.#db.table('edges').delete(edgeId);
        const index = this.edges.findIndex(e => e.id === edgeId);
        if (index >= 0) {
            this.edges.splice(index, 1);
        }
    }

    async createEdgeType(edgeType: EdgeType): Promise<EdgeTypeId> {
        await this.#db.table('edgeTypes').add(edgeType);
        this.edgeTypes.push(edgeType);
        return edgeType.id;
    }

    async updateEdgeType(edgeType: EdgeType): Promise<void> {
        await this.#db.table('edgeTypes').put(edgeType);
        const index = this.edgeTypes.findIndex(existing => existing.id === edgeType.id);
        if (index >= 0) {
            this.edgeTypes[index] = edgeType;
        } else {
            this.edgeTypes.push(edgeType);
        }
    }

    // Scene methods
    async createScene(scene: Scene): Promise<SceneId> {
        const sceneId = await this.#db.table('scenes').add(scene) as SceneId
        this.scenes.push({...scene, id: sceneId})
        return sceneId
    }

    async readScene(sceneId: SceneId): Promise<Scene | null> {
        return this.scenes.find(s => s.id === sceneId) || null
    }

    async updateScene(scene: Scene): Promise<void> {
        // Deep clone to prevent external references from mutating graphStore data
        const clonedScene = JSON.parse(JSON.stringify(scene)) as Scene;
        
        if (isDebug('d_store')) console.log(`[graphStore.updateScene] Called for scene: ${scene.id}`);
        await this.#db.table('scenes').put(clonedScene)
        // Update in-memory cache
        const index = this.scenes.findIndex(s => s.id === clonedScene.id)
        if (index >= 0) {
            this.scenes[index] = clonedScene
        } else {
            // If not in cache, add it
            this.scenes.push(clonedScene)
        }
        // Refresh drift-probe baseline so subsequent in-memory mutations show up.
        recordPersistedPositions(clonedScene);
    }

    async deleteScene(sceneId: SceneId): Promise<void> {
        await this.#db.table('scenes').delete(sceneId)
        // Remove from in-memory cache
        const index = this.scenes.findIndex(s => s.id === sceneId)
        if (index >= 0) {
            this.scenes.splice(index, 1)
        }
    }

    // Background image methods
    async createBackgroundImage(image: BackgroundImage): Promise<BackgroundImageId> {
        const imageId = await this.#db.table('backgroundImages').add(image) as BackgroundImageId;
        this.backgroundImages.push({ ...image, id: imageId });
        return imageId;
    }

    async deleteBackgroundImage(imageId: BackgroundImageId): Promise<void> {
        await this.#db.table('backgroundImages').delete(imageId);
        const index = this.backgroundImages.findIndex(img => img.id === imageId);
        if (index >= 0) {
            this.backgroundImages.splice(index, 1);
        }
    }

    #withValidEdgeType(edge: Edge): Edge {
        if (this.#isKnownEdgeType(edge.typeId)) return edge;
        return { ...edge, typeId: getDefaultEdgeTypeId() };
    }

    #isKnownEdgeType(edgeTypeId: EdgeTypeId | undefined): boolean {
        return !!edgeTypeId && this.edgeTypes.some(edgeType => edgeType.id === edgeTypeId);
    }

}

const graphStore = new GraphDataStore();
await graphStore.init();
export { graphStore }