/**
 * The bridge between the NodeAssets domain and the reusable visual node-graph framework.
 *
 * `NodeAsset` is the source of truth. The controller creates blocks up front (palette drops and
 * {@link load}) and delegates keeping the domain in sync with the visuals to a {@link NodeAssetReconciler}.
 * Content changes trigger reconciliation, which removes blocks whose visual node was deleted and rebuilds
 * connections from the visual wires; presentation-only changes remain local to the editor. The controller
 * itself is a thin adapter — it seeds the showcase graph, builds property sections through the block
 * descriptors, serializes, and drives builds.
 *
 * All NodeAssets/gltf-transform types are confined to this app layer; the framework never imports it.
 */

import { Observable } from "core/Misc/observable";

import { type BuildPBRMaterial } from "node-assets/Blocks/buildPBRMaterial";
import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { ExportGLTFAggregateBlock } from "node-assets/Blocks/exportGLTFAggregateBlock";
import { type ImportGLTFAggregateBlock } from "node-assets/Blocks/importGLTFAggregateBlock";
import { type ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { type KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { NodeAsset } from "node-assets/nodeAsset";
import { NodeAssetBuildError } from "node-assets/nodeAssetBuildError";
import { AggregateBlock } from "node-assets/blockFoundation/aggregateBlock";
import { CustomAggregateBlock } from "node-assets/blockFoundation/customAggregateBlock";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

import { GraphEditorState } from "../nodeGraph/editorState";
import { GraphNodeDiagnostics } from "../nodeGraph/nodeDiagnostics";
import { type IGraphFrame, type IGraphNode, type IGraphSnapshot, type IGraphWire, type Vec2 } from "../nodeGraph/graphModel";
import { type IPaletteCategory, type IPaletteProjectionOptions } from "../nodeGraph/paletteModel";
import { type IPropertySection } from "../nodeGraph/propertyModel";

// Import the block descriptor modules for their registration side effects, so the palette and
// load-time lookups below see every built-in block. (See ./blockDescriptors/index.ts.)
import "./blockDescriptors";
import { ConfigureBlockForEditor, GetAllBlockDescriptors, GetBlockDescriptorByPaletteItemId, GetBlockDescriptorForBlock, type IBlockDescriptor } from "./blockCatalog";
import { BlockToNode, NodeIdForBlockId, PortIdForPoint } from "./blockNodeMapping";
import { BuildPaletteCategories } from "./paletteCategories";
import { NodeAssetReconciler } from "./nodeAssetReconciler";
import { NodeAssetBuildWorkerClient, type INodeAssetBuildClient } from "./nodeAssetBuildWorkerClient";
import { DefaultSampleAssetUrls } from "./defaultSampleAssets";

/** The editor metadata layered on top of a serialized graph: per-block visual state keyed by block id. */
interface IEditorBlockMetadata {
    readonly id: number;
    readonly position: Vec2;
    readonly title: string;
    readonly collapsed: boolean;
    readonly aggregateExpanded?: boolean;
    /** Export blocks only: the user-chosen base file name for the download (editor-owned, kept out of the domain graph). */
    readonly fileName?: string;
}

/** Editor-owned frame metadata stored in terms of runtime block ids so membership survives reconstruction. */
interface IEditorFrameMetadata {
    readonly id: string;
    readonly label: string;
    readonly color: string;
    readonly position: Vec2;
    readonly size: { readonly width: number; readonly height: number };
    readonly blockIds: readonly number[];
    readonly collapsed: boolean;
}

interface ISerializedNodeAssetBlock extends Record<string, unknown> {
    readonly id: number;
}

interface ISerializedNodeAssetConnection extends Record<string, unknown> {
    readonly fromBlock: number;
    readonly fromPoint: string;
    readonly toBlock: number;
    readonly toPoint: string;
}

interface ISerializedNodeAssetGraph extends Record<string, unknown> {
    readonly blocks: readonly ISerializedNodeAssetBlock[];
    readonly connections: readonly ISerializedNodeAssetConnection[];
}

/** The full editor save file: the domain graph plus the editor-owned visual metadata. */
interface INodeAssetEditorFile {
    readonly graph: ISerializedNodeAssetGraph;
    readonly editor: {
        readonly blocks: readonly IEditorBlockMetadata[];
        readonly frames: readonly IEditorFrameMetadata[];
    };
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function ValidateSerializedGraph(graph: Record<string, unknown>): asserts graph is ISerializedNodeAssetGraph {
    if (graph.name !== undefined && typeof graph.name !== "string") {
        throw new Error('The NodeAsset save file "graph.name" value must be a string when provided.');
    }
    if (!Array.isArray(graph.blocks)) {
        throw new Error('The NodeAsset save file "graph.blocks" value must be an array.');
    }
    if (!Array.isArray(graph.connections)) {
        throw new Error('The NodeAsset save file "graph.connections" value must be an array.');
    }

    const blockIds = new Set<number>();
    for (const [index, block] of graph.blocks.entries()) {
        if (!IsRecord(block)) {
            throw new Error(`Serialized graph block at index ${index} must be an object.`);
        }
        if (typeof block.id !== "number" || !Number.isSafeInteger(block.id) || block.id < 0 || block.id >= Number.MAX_SAFE_INTEGER) {
            throw new Error(`Serialized graph block at index ${index} must have an id that is a safe non-negative integer.`);
        }
        if (blockIds.has(block.id)) {
            throw new Error(`Serialized graph contains duplicate block id ${block.id}.`);
        }
        blockIds.add(block.id);
    }

    const connectedInputs = new Map<number, Set<string>>();
    for (const [index, connection] of graph.connections.entries()) {
        if (!IsRecord(connection)) {
            throw new Error(`Serialized graph connection at index ${index} must be an object.`);
        }
        const { fromBlock, fromPoint, toBlock, toPoint } = connection;
        if (typeof fromBlock !== "number" || !Number.isSafeInteger(fromBlock) || !blockIds.has(fromBlock)) {
            throw new Error(`Serialized graph connection at index ${index} references unknown source block ${String(fromBlock)}.`);
        }
        if (typeof toBlock !== "number" || !Number.isSafeInteger(toBlock) || !blockIds.has(toBlock)) {
            throw new Error(`Serialized graph connection at index ${index} references unknown destination block ${String(toBlock)}.`);
        }
        if (typeof fromPoint !== "string" || fromPoint.length === 0) {
            throw new Error(`Serialized graph connection at index ${index} must name an output.`);
        }
        if (typeof toPoint !== "string" || toPoint.length === 0) {
            throw new Error(`Serialized graph connection at index ${index} must name an input.`);
        }

        const blockInputs = connectedInputs.get(toBlock) ?? new Set<string>();
        if (blockInputs.has(toPoint)) {
            throw new Error(`Serialized graph connects block ${toBlock}'s "${toPoint}" input more than once.`);
        }
        blockInputs.add(toPoint);
        connectedInputs.set(toBlock, blockInputs);
    }
}

function ParseEditorFile(json: string): INodeAssetEditorFile {
    const parsed: unknown = JSON.parse(json);
    if (!IsRecord(parsed) || !IsRecord(parsed.graph)) {
        throw new Error("The NodeAsset save file must contain a graph object.");
    }
    ValidateSerializedGraph(parsed.graph);

    const rawEditor = parsed.editor;
    if (rawEditor !== undefined && !IsRecord(rawEditor)) {
        throw new Error('The NodeAsset save file "editor" value must be an object.');
    }
    const rawBlocks = rawEditor?.blocks ?? [];
    if (!Array.isArray(rawBlocks)) {
        throw new Error('The NodeAsset save file "editor.blocks" value must be an array.');
    }
    const rawFrames = rawEditor?.frames ?? [];
    if (!Array.isArray(rawFrames)) {
        throw new Error('The NodeAsset save file "editor.frames" value must be an array.');
    }

    const graphBlockIds = new Set(parsed.graph.blocks.map((block) => block.id));
    const editorBlockIds = new Set<number>();
    const blocks: IEditorBlockMetadata[] = rawBlocks.map((rawBlock, index) => {
        if (!IsRecord(rawBlock)) {
            throw new Error(`Editor block metadata at index ${index} must be an object.`);
        }
        const { id, position, title, collapsed, fileName, aggregateExpanded } = rawBlock;
        if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 || id >= Number.MAX_SAFE_INTEGER) {
            throw new Error(`Editor block metadata at index ${index} must have an id that is a safe non-negative integer.`);
        }
        if (editorBlockIds.has(id)) {
            throw new Error(`Editor block metadata contains duplicate id ${id}.`);
        }
        if (!graphBlockIds.has(id)) {
            throw new Error(`Editor block metadata references unknown block id ${id}.`);
        }
        editorBlockIds.add(id);
        if (!IsRecord(position) || typeof position.x !== "number" || !Number.isFinite(position.x) || typeof position.y !== "number" || !Number.isFinite(position.y)) {
            throw new Error(`Editor block metadata at index ${index} must have a finite x/y position.`);
        }
        if (typeof title !== "string") {
            throw new Error(`Editor block metadata at index ${index} must have a string title.`);
        }
        if (typeof collapsed !== "boolean") {
            throw new Error(`Editor block metadata at index ${index} must have a boolean collapsed value.`);
        }
        if (fileName !== undefined && typeof fileName !== "string") {
            throw new Error(`Editor block metadata at index ${index} must have a string fileName when provided.`);
        }
        if (aggregateExpanded !== undefined && typeof aggregateExpanded !== "boolean") {
            throw new Error(`Editor block metadata at index ${index} must have a boolean aggregateExpanded value when provided.`);
        }
        return {
            id,
            position: { x: position.x, y: position.y },
            title,
            collapsed,
            fileName,
            aggregateExpanded,
        };
    });

    const frameIds = new Set<string>();
    const frames: IEditorFrameMetadata[] = rawFrames.map((rawFrame, index) => {
        if (!IsRecord(rawFrame)) {
            throw new Error(`Editor frame metadata at index ${index} must be an object.`);
        }
        const { id, label, color, position, size, blockIds, collapsed } = rawFrame;
        if (typeof id !== "string" || id.length === 0) {
            throw new Error(`Editor frame metadata at index ${index} must have a non-empty string id.`);
        }
        if (frameIds.has(id)) {
            throw new Error(`Editor frame metadata contains duplicate id "${id}".`);
        }
        frameIds.add(id);
        if (typeof label !== "string") {
            throw new Error(`Editor frame metadata at index ${index} must have a string label.`);
        }
        if (typeof color !== "string") {
            throw new Error(`Editor frame metadata at index ${index} must have a string color.`);
        }
        if (!IsRecord(position) || typeof position.x !== "number" || !Number.isFinite(position.x) || typeof position.y !== "number" || !Number.isFinite(position.y)) {
            throw new Error(`Editor frame metadata at index ${index} must have a finite x/y position.`);
        }
        if (
            !IsRecord(size) ||
            typeof size.width !== "number" ||
            !Number.isFinite(size.width) ||
            size.width <= 0 ||
            typeof size.height !== "number" ||
            !Number.isFinite(size.height) ||
            size.height <= 0
        ) {
            throw new Error(`Editor frame metadata at index ${index} must have a positive finite width/height size.`);
        }
        if (!Array.isArray(blockIds)) {
            throw new Error(`Editor frame metadata at index ${index} must have a blockIds array.`);
        }
        const frameBlockIds = new Set<number>();
        for (const blockId of blockIds) {
            if (typeof blockId !== "number" || !Number.isSafeInteger(blockId) || !graphBlockIds.has(blockId)) {
                throw new Error(`Editor frame metadata at index ${index} references unknown block id ${String(blockId)}.`);
            }
            if (frameBlockIds.has(blockId)) {
                throw new Error(`Editor frame metadata at index ${index} contains duplicate block id ${blockId}.`);
            }
            frameBlockIds.add(blockId);
        }
        if (typeof collapsed !== "boolean") {
            throw new Error(`Editor frame metadata at index ${index} must have a boolean collapsed value.`);
        }
        return {
            id,
            label,
            color,
            position: { x: position.x, y: position.y },
            size: { width: size.width, height: size.height },
            blockIds: [...frameBlockIds],
            collapsed,
        };
    });

    return {
        graph: parsed.graph,
        editor: { blocks, frames },
    };
}

// Human-readable provenance labels for the seeded "energy orb" sample assets, shown in each import
// block's read-only "Source" field. The asset bytes are bundled with the editor and fetched from its
// own origin (see ./defaultSampleAssets and loadDefaultImportAsync), so these are display labels only.
const DefaultOrbGlbPath = "scenes/nodeAssets/orb.glb";
const DefaultOrbMetalImagePath = "scenes/nodeAssets/orbMetal.png";
const DefaultOrbPatternImagePath = "scenes/nodeAssets/orbPattern.png";

/**
 * Owns a live {@link NodeAsset} and the {@link GraphEditorState} that visualizes it, delegating the
 * visual-to-domain sync to a {@link NodeAssetReconciler}. Fills the framework's editor-context
 * contract (palette, property sections, node factory).
 */
export class NodeAssetGraphController {
    /** The visual editor state the framework renders and mutates. */
    public readonly state: GraphEditorState;

    /** Ephemeral build diagnostics keyed by visual node id. */
    public readonly diagnostics = new GraphNodeDiagnostics();

    /**
     * Fires when a build (export) is requested from the graph, e.g. the export node's action button.
     * Carries the export block's base file name (without extension) so the download can be named.
     */
    public readonly onExportRequested = new Observable<string>();

    /** Fires only when the runtime graph's serialized build identity changes. */
    public readonly onBuildRelevantChanged = new Observable<void>();

    private _nodeAsset: NodeAsset;
    private readonly _reconciler: NodeAssetReconciler;
    private readonly _buildClient: INodeAssetBuildClient;
    private _buildRelevantSignature: string;
    private readonly _onChangedObserver;
    private readonly _orbMetalImageBlock: ImportImageBlock;
    private readonly _orbPatternImageBlock: ImportImageBlock;
    private readonly _orbGltfBlock: ImportGLTFAggregateBlock;
    private readonly _aggregateRootByChildNodeId = new Map<string, string>();
    private _projectingAggregate = false;

    /**
     * Creates a controller seeded with the "energy orb" showcase graph. Two ImportImage blocks (a dark
     * metal base and a cyan circuit pattern) feed a CompositeImage whose result becomes the base colour,
     * while the same pattern fans out to the emissive input so one asset drives both the surface markings
     * and their glow. An ImportGLTF (a UV sphere) supplies the geometry to BuildPBRMaterial, which
     * produces a metallic, self-lit orb that flows through KTX2 and Draco compression (grouped in a
     * "Compression" frame) to ExportGLTF.
     * @param buildClient - Worker-backed build client.
     */
    public constructor(buildClient: INodeAssetBuildClient = new NodeAssetBuildWorkerClient()) {
        this._nodeAsset = new NodeAsset("nodeAsset");
        this._buildClient = buildClient;
        this._reconciler = new NodeAssetReconciler(this._nodeAsset);

        const importImageDescriptor = GetBlockDescriptorByPaletteItemId("import-image")!;
        const importGltfDescriptor = GetBlockDescriptorByPaletteItemId("import-gltf")!;
        const universalToGltfDescriptor = GetBlockDescriptorByPaletteItemId("universal-to-gltf")!;
        const gltfToUniversalDescriptor = GetBlockDescriptorByPaletteItemId("gltf-to-universal")!;
        const compositeDescriptor = GetBlockDescriptorByPaletteItemId("composite-image")!;
        const buildDescriptor = GetBlockDescriptorByPaletteItemId("build-pbr-material")!;
        const ktx2Descriptor = GetBlockDescriptorByPaletteItemId("ktx2-compression")!;
        const dracoDescriptor = GetBlockDescriptorByPaletteItemId("draco-compression")!;
        const exportDescriptor = GetBlockDescriptorByPaletteItemId("export-gltf")!;

        const metalNode = this._instantiateBlock(importImageDescriptor, { x: 80, y: 80 });
        const patternNode = this._instantiateBlock(importImageDescriptor, { x: 80, y: 300 });
        const gltfNode = this._instantiateBlock(importGltfDescriptor, { x: 80, y: 520 });
        const universalToGltfNode = this._instantiateBlock(universalToGltfDescriptor, { x: 340, y: 520 });
        const compositeNode = this._instantiateBlock(compositeDescriptor, { x: 380, y: 140 });
        const buildNode = this._instantiateBlock(buildDescriptor, { x: 680, y: 320 });
        const ktx2Node = this._instantiateBlock(ktx2Descriptor, { x: 980, y: 320 });
        const dracoNode = this._instantiateBlock(dracoDescriptor, { x: 1220, y: 320 });
        const gltfToUniversalNode = this._instantiateBlock(gltfToUniversalDescriptor, { x: 1460, y: 320 });
        const exportNode = this._instantiateBlock(exportDescriptor, { x: 1700, y: 320 });

        this._orbMetalImageBlock = this._reconciler.getBlock(metalNode.id)! as ImportImageBlock;
        this._orbPatternImageBlock = this._reconciler.getBlock(patternNode.id)! as ImportImageBlock;
        this._orbGltfBlock = this._reconciler.getBlock(gltfNode.id)! as ImportGLTFAggregateBlock;

        // A glossy, self-lit metal orb: near-metallic with a cyan emissive tint so the pattern glows.
        const buildBlock = this._reconciler.getBlock(buildNode.id)! as BuildPBRMaterial;
        buildBlock.metallicFactor = 0.9;
        buildBlock.roughnessFactor = 0.35;
        buildBlock.emissiveFactor = [0.05, 0.85, 1];
        // Mipmaps keep the fine circuit lines crisp as the orb recedes.
        (this._reconciler.getBlock(ktx2Node.id)! as KTX2CompressionBlock).generateMipmaps = true;

        const snapshot: IGraphSnapshot = {
            nodes: [metalNode, patternNode, gltfNode, universalToGltfNode, compositeNode, buildNode, ktx2Node, dracoNode, gltfToUniversalNode, exportNode],
            wires: [
                this._createWireToInput(metalNode, compositeNode, "base"),
                this._createWireToInput(patternNode, compositeNode, "overlay"),
                this._createWireToInput(compositeNode, buildNode, "baseColor"),
                this._createWireToInput(patternNode, buildNode, "emissive"),
                this._createWire(gltfNode, universalToGltfNode),
                this._createWireToInput(universalToGltfNode, buildNode, "scene"),
                this._createWire(buildNode, ktx2Node),
                this._createWire(ktx2Node, dracoNode),
                this._createWire(dracoNode, gltfToUniversalNode),
                this._createWire(gltfToUniversalNode, exportNode),
            ],
            frames: [
                {
                    id: "frame-compression",
                    label: "Compression",
                    color: "#8a5cf6",
                    position: { x: 940, y: 220 },
                    size: { width: 500, height: 260 },
                    nodeIds: [ktx2Node.id, dracoNode.id],
                    collapsed: false,
                },
            ],
        };
        this.state = new GraphEditorState(snapshot, {
            canConnectPorts: (fromPortId, toPortId) => this._canConnectPorts(fromPortId, toPortId),
            beforeWireChange: (nodeIds) => {
                if (this._projectingAggregate) {
                    return;
                }
                for (const nodeId of nodeIds) {
                    this._detachAggregateContainingNode(nodeId);
                }
            },
        });

        // Subscribe only after seeding so the reconcile sees consistent correspondence and state.
        this._reconciler.reconcile(this.state);
        this._buildRelevantSignature = this._createBuildRelevantSignature();
        this._onChangedObserver = this.state.onChanged.add((kind) => {
            if (kind === "content") {
                this._reconcileAndNotifyBuildRelevantChange();
            }
        });
    }

    /**
     * Projects the registered block catalog into the current palette discovery view.
     * @param options - Search and primitive visibility preferences.
     * @returns Non-empty categories containing only matching discoverable descriptors.
     */
    public getPaletteCategories(options?: IPaletteProjectionOptions): readonly IPaletteCategory[] {
        return BuildPaletteCategories(GetAllBlockDescriptors(), options);
    }

    /**
     * Loads the bundled "energy orb" sample assets into the seeded import blocks: the UV-sphere `.glb`
     * into the ImportGLTF block and the metal and cyan-pattern images into their ImportImage blocks, so
     * the graph builds the textured, self-lit orb on open.
     * @returns A promise that resolves after all assets are loaded.
     */
    public async loadDefaultImportAsync(): Promise<void> {
        const [orbGlb, orbMetal, orbPattern] = await Promise.all([
            this._fetchAssetBytesAsync(DefaultSampleAssetUrls.orbGlb),
            this._fetchAssetBytesAsync(DefaultSampleAssetUrls.orbMetalImage),
            this._fetchAssetBytesAsync(DefaultSampleAssetUrls.orbPatternImage),
        ]);

        this._orbGltfBlock.setUploadedSource(orbGlb, DefaultOrbGlbPath);

        this._orbMetalImageBlock.data = orbMetal;
        this._orbMetalImageBlock.mimeType = "image/png";
        this._orbMetalImageBlock.source = DefaultOrbMetalImagePath;

        this._orbPatternImageBlock.data = orbPattern;
        this._orbPatternImageBlock.mimeType = "image/png";
        this._orbPatternImageBlock.source = DefaultOrbPatternImagePath;

        this.state.notifyChanged();
    }

    /**
     * Creates the visual node for a dropped palette item, constructing the backing block first so the
     * subsequent `state.addNode` (and its reconcile) sees a fully mapped block.
     * @param paletteItemId - The dropped palette item id.
     * @param position - The graph-space position for the new node.
     * @returns The new visual node.
     */
    public createNodeFromPaletteItem(paletteItemId: string, position: Vec2): IGraphNode {
        const descriptor = GetBlockDescriptorByPaletteItemId(paletteItemId);
        if (!descriptor) {
            throw new Error(`Unknown palette item "${paletteItemId}".`);
        }
        return this._instantiateBlock(descriptor, position);
    }

    /**
     * Tests whether a visual node represents an aggregate block.
     * @param nodeId The visual node id.
     * @returns Whether the node is a compact aggregate root.
     */
    public isAggregateNode(nodeId: string): boolean {
        return this._reconciler.getBlock(nodeId) instanceof AggregateBlock && !this._aggregateRootByChildNodeId.has(nodeId);
    }

    /**
     * Expands or collapses an aggregate's projected primitive subgraph.
     * @param nodeId The compact aggregate node id.
     * @param expanded The requested presentation state.
     */
    public setAggregateExpanded(nodeId: string, expanded: boolean): void {
        const rootNode = this.state.getNode(nodeId);
        const aggregate = this._reconciler.getBlock(nodeId);
        if (!rootNode || !(aggregate instanceof AggregateBlock) || rootNode.aggregateExpanded === expanded) {
            return;
        }

        if (expanded) {
            this._projectingAggregate = true;
            try {
                rootNode.aggregateExpanded = true;
                const childNodes: IGraphNode[] = [];
                for (const [index, block] of aggregate.subgraph.attachedBlocks.entries()) {
                    const descriptor = GetBlockDescriptorForBlock(block);
                    if (!descriptor) {
                        throw new Error(`The "${block.getClassName()}" aggregate child is not supported by this Node Assets Editor.`);
                    }
                    const childNode = BlockToNode(block, descriptor, { x: rootNode.position.x + 260 + index * 260, y: rootNode.position.y + 120 }, block.name, false);
                    childNodes.push(childNode);
                    this._aggregateRootByChildNodeId.set(childNode.id, rootNode.id);
                    this._reconciler.registerNode(block, childNode);
                    this.state.addNode(childNode);
                }
                for (const block of aggregate.subgraph.attachedBlocks) {
                    for (const output of block.outputs) {
                        for (const input of output.connectedPoints) {
                            this.state.addWire(PortIdForPoint(block, output), PortIdForPoint(input.ownerBlock, input));
                        }
                    }
                }
                this.state.addFrame({
                    id: `aggregate-frame-${rootNode.id}`,
                    label: rootNode.title,
                    color: rootNode.headerColor,
                    position: { x: rootNode.position.x + 220, y: rootNode.position.y + 70 },
                    size: { width: Math.max(560, childNodes.length * 260 + 80), height: 300 },
                    nodeIds: childNodes.map((node) => node.id),
                    collapsed: false,
                    kind: "aggregate",
                    aggregateNodeId: rootNode.id,
                });
                this.state.notifyChanged("visual");
                return;
            } finally {
                this._projectingAggregate = false;
            }
        }

        const frame = this.state.frames.find((candidate) => candidate.kind === "aggregate" && candidate.aggregateNodeId === rootNode.id);
        if (frame) {
            this.state.removeNodes(frame.nodeIds);
            for (const childNodeId of frame.nodeIds) {
                this._aggregateRootByChildNodeId.delete(childNodeId);
            }
            this.state.removeFrame(frame.id);
        }
        rootNode.aggregateExpanded = false;
        this.state.notifyChanged("visual");
    }

    /**
     * Builds the property sections for a selected node: a general name field plus the block's own
     * descriptor-provided section, if any.
     * @param node - The selected node.
     * @returns The property sections to render.
     */
    public buildPropertySections(node: IGraphNode): readonly IPropertySection[] {
        const sections: IPropertySection[] = [
            {
                title: "GENERAL",
                properties: [
                    {
                        kind: "text",
                        label: "Name",
                        value: node.title,
                        onChange: (value) => {
                            if (node.title === value) {
                                return;
                            }
                            node.title = value;
                            const block = this._reconciler.getBlock(node.id);
                            if (block) {
                                block.name = value;
                            }
                            this._detachAggregateContainingNode(node.id);
                            this.state.notifyChanged("visual");
                        },
                    },
                    {
                        kind: "text",
                        label: "Type",
                        value: this._reconciler.getBlock(node.id)?.getClassName() ?? "",
                        disabled: true,
                        onChange: () => undefined,
                    },
                ],
            },
        ];
        const diagnostic = this.diagnostics.get(node.id);
        if (diagnostic) {
            sections.unshift({
                title: "BUILD ERROR",
                properties: [
                    {
                        kind: "text",
                        label: "Build error",
                        value: diagnostic.message,
                        disabled: true,
                        onChange: () => undefined,
                    },
                ],
            });
        }

        const block = this._reconciler.getBlock(node.id);
        if (block) {
            const propertyContext = {
                refresh: () => {
                    this._detachAggregateContainingNode(node.id);
                    this.state.notifyChanged();
                },
                requestExport: (fileName?: string) => this.onExportRequested.notifyObservers(fileName ?? "scene"),
            };
            if (block instanceof AggregateBlock) {
                for (const child of block.subgraph.attachedBlocks) {
                    const childSection = GetBlockDescriptorForBlock(child)?.getPropertySection?.(child, propertyContext);
                    if (childSection) {
                        sections.push({ ...childSection, title: child.name.toUpperCase() });
                    }
                }
            } else {
                const section = GetBlockDescriptorForBlock(block)?.getPropertySection?.(block, propertyContext);
                if (section) {
                    sections.push(section);
                }
            }
        }

        return sections;
    }

    /**
     * Reconciles the domain with the current visuals, then runs the graph and returns the exported
     * glb bytes. Content changes also reconcile eagerly, but calling it here makes the build robust to
     * any caller and is idempotent.
     * @returns The exported glb bytes.
     */
    public async buildAsync(): Promise<Uint8Array> {
        this._reconcileAndNotifyBuildRelevantChange();
        return await this._buildClient.buildAsync(this._nodeAsset.serialize());
    }

    /** Clears the node diagnostic produced by the previous build. */
    public clearBuildError(): void {
        this.diagnostics.clear();
    }

    /**
     * Maps a structured runtime failure to its visual node.
     * @param error - Build failure reported by the worker.
     */
    public reportBuildError(error: unknown): void {
        this.diagnostics.clear();
        if (!(error instanceof NodeAssetBuildError)) {
            return;
        }
        const nodeId = NodeIdForBlockId(error.blockId);
        if (this.state.getNode(nodeId)) {
            this.diagnostics.set(nodeId, { severity: "error", message: error.message });
        }
    }

    /**
     * Serializes the graph plus editor-owned node and frame presentation metadata to a JSON string.
     * @returns The JSON save file.
     */
    public serialize(): string {
        this._reconcileAndNotifyBuildRelevantChange();
        const blocks: IEditorBlockMetadata[] = [];
        for (const node of this.state.nodes) {
            if (this._aggregateRootByChildNodeId.has(node.id)) {
                continue;
            }
            const block = this._reconciler.getBlock(node.id);
            if (block) {
                blocks.push({
                    id: block.uniqueId,
                    position: node.position,
                    title: node.title,
                    collapsed: node.collapsed,
                    aggregateExpanded: node.aggregateExpanded,
                    fileName: block instanceof ExportGLTFBlock ? block.fileName : undefined,
                });
            }
        }
        const frames: IEditorFrameMetadata[] = this.state.frames
            .filter((frame) => frame.kind !== "aggregate")
            .map((frame) => {
                const blockIds = frame.nodeIds.map((nodeId) => {
                    const block = this._reconciler.getBlock(nodeId);
                    if (!block) {
                        throw new Error(`Cannot serialize frame "${frame.label}" because it references unknown node "${nodeId}".`);
                    }
                    return block.uniqueId;
                });
                return {
                    id: frame.id,
                    label: frame.label,
                    color: frame.color,
                    position: frame.position,
                    size: frame.size,
                    blockIds,
                    collapsed: frame.collapsed,
                };
            });
        const file: INodeAssetEditorFile = { graph: this._nodeAsset.serialize(), editor: { blocks, frames } };
        return JSON.stringify(file, null, 2);
    }

    /**
     * Replaces the current graph with one parsed from a JSON string produced by {@link serialize},
     * restoring blocks, connections, node presentation, frames, and frame membership.
     * @param json - The JSON save file.
     */
    public load(json: string): void {
        const file = ParseEditorFile(json);
        const asset = NodeAsset.Parse(file.graph);

        const metadataById = new Map<number, IEditorBlockMetadata>();
        for (const metadata of file.editor.blocks) {
            metadataById.set(metadata.id, metadata);
        }

        const nodes: IGraphNode[] = [];
        const blockNodes: Array<{ readonly block: NodeAssetBlock; readonly node: IGraphNode }> = [];
        const nodeIdByBlockId = new Map<number, string>();
        for (const block of asset.attachedBlocks) {
            ConfigureBlockForEditor(block);
            const descriptor = GetBlockDescriptorForBlock(block);
            if (!descriptor) {
                throw new Error(`The "${block.getClassName()}" block is not supported by this Node Assets Editor.`);
            }
            const metadata = metadataById.get(block.uniqueId);
            if (block instanceof ExportGLTFBlock && metadata?.fileName !== undefined) {
                block.fileName = metadata.fileName;
            }
            const node = BlockToNode(block, descriptor, metadata?.position ?? { x: 0, y: 0 }, metadata?.title ?? descriptor.label, metadata?.collapsed ?? false);
            nodes.push(node);
            blockNodes.push({ block, node });
            nodeIdByBlockId.set(block.uniqueId, node.id);
        }

        const wires: IGraphWire[] = [];
        for (const block of asset.attachedBlocks) {
            for (const output of block.outputs) {
                // An output can fan out to several inputs; emit one wire per fanned-out edge.
                for (const input of output.connectedPoints) {
                    wires.push({
                        id: `wire-${block.uniqueId}-${input.ownerBlock.uniqueId}-${input.name}`,
                        fromPortId: PortIdForPoint(block, output),
                        toPortId: PortIdForPoint(input.ownerBlock, input),
                    });
                }
            }
        }

        const frames: IGraphFrame[] = file.editor.frames.map((frame) => ({
            id: frame.id,
            label: frame.label,
            color: frame.color,
            position: frame.position,
            size: frame.size,
            nodeIds: frame.blockIds.map((blockId) => {
                const nodeId = nodeIdByBlockId.get(blockId);
                if (!nodeId) {
                    throw new Error(`Editor frame "${frame.label}" references block ${blockId}, which could not be loaded as a node.`);
                }
                return nodeId;
            }),
            collapsed: frame.collapsed,
        }));

        // Commit only after the complete candidate file has parsed and mapped successfully.
        this._nodeAsset = asset;
        this._reconciler.reset(asset);
        this._aggregateRootByChildNodeId.clear();
        for (const { block, node } of blockNodes) {
            this._reconciler.registerNode(block, node);
        }
        this.diagnostics.clear();
        // Correspondence is committed above, so the reconcile fired by reset sees a consistent world.
        this.state.reset({ nodes, wires, frames });
        for (const metadata of file.editor.blocks) {
            if (metadata.aggregateExpanded) {
                this.setAggregateExpanded(NodeIdForBlockId(metadata.id), true);
            }
        }
    }

    /** Releases the state subscription. */
    public dispose(): void {
        this._onChangedObserver.remove();
        this.onExportRequested.clear();
        this.onBuildRelevantChanged.clear();
        this._buildClient.dispose();
    }

    private _instantiateBlock(descriptor: IBlockDescriptor, position: Vec2): IGraphNode {
        const block = descriptor.create(this._nodeAsset);
        return this._registerBlockNode(block, descriptor, position, descriptor.label, false);
    }

    private _createWire(fromNode: IGraphNode, toNode: IGraphNode): IGraphWire {
        const fromPort = fromNode.ports.find((port) => port.direction === "output");
        const toPort = toNode.ports.find((port) => port.direction === "input");
        if (!fromPort || !toPort) {
            throw new Error(`Cannot wire "${fromNode.title}" to "${toNode.title}" because a compatible port is missing.`);
        }
        return {
            id: `wire-${fromNode.id}-${toNode.id}`,
            fromPortId: fromPort.id,
            toPortId: toPort.id,
        };
    }

    /**
     * Wires a node's output to a specific named input on the target node, so a multi-input block (e.g.
     * BuildPBRMaterial's `scene` and `baseColor`) can be seeded unambiguously rather than relying on the
     * first input {@link _createWire} picks.
     * @param fromNode - The source node (its single output is used).
     * @param toNode - The target node.
     * @param toInputName - The connection-point name of the target input to wire to.
     * @returns The wire connecting them.
     */
    private _createWireToInput(fromNode: IGraphNode, toNode: IGraphNode, toInputName: string): IGraphWire {
        const fromPort = fromNode.ports.find((port) => port.direction === "output");
        const toBlock = this._reconciler.getBlock(toNode.id);
        const toPoint = toBlock?.inputs.find((input) => input.name === toInputName);
        if (!fromPort || !toBlock || !toPoint) {
            throw new Error(`Cannot wire "${fromNode.title}" to "${toNode.title}"'s "${toInputName}" input because a compatible port is missing.`);
        }
        return {
            id: `wire-${fromNode.id}-${toNode.id}-${toInputName}`,
            fromPortId: fromPort.id,
            toPortId: PortIdForPoint(toBlock, toPoint),
        };
    }

    private _registerBlockNode(block: NodeAssetBlock, descriptor: IBlockDescriptor, position: Vec2, title: string, collapsed: boolean): IGraphNode {
        const node = BlockToNode(block, descriptor, position, title, collapsed);
        this._reconciler.registerNode(block, node);
        return node;
    }

    private _canConnectPorts(fromPortId: string, toPortId: string): boolean {
        if (!this._reconciler.canConnectPorts(fromPortId, toPortId)) {
            return false;
        }
        const fromRoot = this._aggregateRootByChildNodeId.get(this.state.getPortNode(fromPortId)?.id ?? "");
        const toRoot = this._aggregateRootByChildNodeId.get(this.state.getPortNode(toPortId)?.id ?? "");
        return fromRoot === toRoot;
    }

    private _detachAggregateContainingNode(nodeId: string): void {
        const rootNodeId = this._aggregateRootByChildNodeId.get(nodeId);
        if (!rootNodeId) {
            return;
        }
        const aggregate = this._reconciler.getBlock(rootNodeId);
        if (!(aggregate instanceof AggregateBlock) || aggregate instanceof CustomAggregateBlock) {
            return;
        }

        const custom = CustomAggregateBlock.FromAggregate(aggregate, aggregate.name, this._nodeAsset);
        custom.uniqueId = aggregate.uniqueId;
        this._nodeAsset.removeBlock(aggregate);

        const rootNode = this.state.getNode(rootNodeId);
        if (!rootNode) {
            throw new Error(`Cannot detach aggregate "${aggregate.name}" because its visual root is missing.`);
        }
        this._reconciler.registerNode(custom, rootNode);

        for (const childBlock of custom.subgraph.attachedBlocks) {
            const childNodeId = NodeIdForBlockId(childBlock.uniqueId);
            const childNode = this.state.getNode(childNodeId);
            if (childNode && this._aggregateRootByChildNodeId.get(childNodeId) === rootNodeId) {
                this._reconciler.registerNode(childBlock, childNode);
            }
        }
    }

    private async _fetchAssetBytesAsync(url: string): Promise<Uint8Array> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not load the default sample asset from "${url}" (${response.status} ${response.statusText}).`);
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    private _reconcileAndNotifyBuildRelevantChange(): void {
        if (!this._projectingAggregate) {
            this._reconcileCustomAggregateSubgraphs();
        }
        this._reconciler.reconcile(this.state);
        const signature = this._createBuildRelevantSignature();
        if (signature !== this._buildRelevantSignature) {
            this._buildRelevantSignature = signature;
            this.onBuildRelevantChanged.notifyObservers();
        }
    }

    private _createBuildRelevantSignature(): string {
        return JSON.stringify(this._nodeAsset.serialize(), (key, value) => (key === "fileName" ? undefined : value));
    }

    private _reconcileCustomAggregateSubgraphs(): void {
        const customAggregates = this.state.nodes
            .map((node) => ({ node, block: this._reconciler.getBlock(node.id) }))
            .filter((entry): entry is { node: IGraphNode; block: CustomAggregateBlock } => entry.node.aggregateExpanded === true && entry.block instanceof CustomAggregateBlock);

        for (const { node: rootNode, block: aggregate } of customAggregates) {
            const childNodeIds = new Set(
                Array.from(this._aggregateRootByChildNodeId)
                    .filter(([, rootNodeId]) => rootNodeId === rootNode.id)
                    .map(([childNodeId]) => childNodeId)
            );
            for (const block of aggregate.subgraph.attachedBlocks) {
                for (const output of block.outputs) {
                    output.disconnect();
                }
            }
            for (const wire of this.state.wires) {
                const fromNode = this.state.getPortNode(wire.fromPortId);
                const toNode = this.state.getPortNode(wire.toPortId);
                if (!fromNode || !toNode || !childNodeIds.has(fromNode.id) || !childNodeIds.has(toNode.id)) {
                    continue;
                }
                const fromBlock = this._reconciler.getBlock(fromNode.id);
                const toBlock = this._reconciler.getBlock(toNode.id);
                const from = fromBlock?.outputs.find((point) => PortIdForPoint(fromBlock, point) === wire.fromPortId);
                const to = toBlock?.inputs.find((point) => PortIdForPoint(toBlock, point) === wire.toPortId);
                if (from && to) {
                    from.connectTo(to);
                }
            }
        }
    }
}
