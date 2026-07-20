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

import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { NodeAsset } from "node-assets/nodeAsset";
import { NodeAssetBuildError } from "node-assets/nodeAssetBuildError";
import { AggregateBlock } from "node-assets/blockFoundation/aggregateBlock";
import { CustomAggregateBlock } from "node-assets/blockFoundation/customAggregateBlock";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

import { GraphEditorState, type GraphNodeRemovalPlan } from "../nodeGraph/editorState";
import { GraphNodeDiagnostics } from "../nodeGraph/nodeDiagnostics";
import { type IGraphFrame, type IGraphNode, type IGraphWire, type Vec2 } from "../nodeGraph/graphModel";
import { type IPaletteCategory, type IPaletteProjectionOptions } from "../nodeGraph/paletteModel";
import { type IPropertySection } from "../nodeGraph/propertyModel";

// Import the block descriptor modules for their registration side effects, so the palette and
// load-time lookups below see every built-in block. (See ./blockDescriptors/index.ts.)
import "./blockDescriptors";
import { ConfigureBlockForEditor, GetAllBlockDescriptors, GetBlockDescriptorByPaletteItemId, GetBlockDescriptorForBlock, type IBlockDescriptor } from "./blockCatalog";
import { BlockToNode, NodeIdForBlockId, PortIdForPoint } from "./blockNodeMapping";
import { BuildPaletteCategories } from "./paletteCategories";
import { NodeAssetReconciler } from "./nodeAssetReconciler";
import { Ktx2EncoderResourceConflictError, NodeAssetBuildWorkerClient, type INodeAssetBuildClient } from "./nodeAssetBuildWorkerClient";
import { GetDefaultBuiltInNodeAssetLibraryEntry } from "./builtInLibraryEntries";

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
    private readonly _aggregateRootByChildNodeId = new Map<string, string>();
    private _projectingAggregate = false;
    private _graphRevision = 0;
    private _isDisposed = false;
    /**
     * Authored (not merely visual) intent that an aggregate block is expanded, keyed by block id.
     * Unlike a projected node's own `aggregateExpanded` flag -- which is lost the moment its node is
     * removed by a collapsing ancestor -- this survives an ancestor's collapse so re-expanding the
     * ancestor can recursively restore exactly which descendants were expanded beforehand.
     */
    private readonly _authoredAggregateExpansion = new Set<number>();
    /** Durable build-diagnostic source keyed by runtime block id, surviving aggregate visibility changes. */
    private readonly _authoredBuildDiagnostics = new Map<number, string>();

    /**
     * Creates a controller seeded from the maintained default entry in the production pipeline catalog.
     * @param buildClient - Worker-backed build client.
     */
    public constructor(buildClient: INodeAssetBuildClient = new NodeAssetBuildWorkerClient()) {
        this._nodeAsset = new NodeAsset("nodeAsset");
        this._buildClient = buildClient;
        this._reconciler = new NodeAssetReconciler(this._nodeAsset);
        this.state = new GraphEditorState(
            { nodes: [], wires: [], frames: [] },
            {
                canConnectPorts: (fromPortId, toPortId) => this._canConnectPorts(fromPortId, toPortId),
                beforeWireChange: (nodeIds) => {
                    if (this._projectingAggregate) {
                        return;
                    }
                    for (const nodeId of nodeIds) {
                        this._detachAggregateContainingNode(nodeId);
                    }
                },
                prepareNodeRemoval: (nodeIds) => this._prepareNodeRemoval(nodeIds),
            }
        );

        this.load(GetDefaultBuiltInNodeAssetLibraryEntry().serializedGraph);
        this._buildRelevantSignature = this._createBuildRelevantSignature();
        this._onChangedObserver = this.state.onChanged.add((kind) => {
            if (kind === "content") {
                this._reconcileAndNotifyBuildRelevantChange();
            }
        });
    }

    /**
     * Preserves the build-orchestrator startup contract. Catalog source fixtures are already embedded in
     * the serialized default graph, so startup performs no network loading.
     * @returns An already-resolved promise.
     */
    public async loadDefaultImportAsync(): Promise<void> {}

    /**
     * Projects the registered block catalog into the current palette discovery view.
     * @param options - Search and primitive visibility preferences.
     * @returns Non-empty categories containing only matching discoverable descriptors.
     */
    public getPaletteCategories(options?: IPaletteProjectionOptions): readonly IPaletteCategory[] {
        return BuildPaletteCategories(GetAllBlockDescriptors(), options);
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
     * Expands or collapses an aggregate's projected primitive subgraph. Expanding also recursively
     * restores any descendant aggregate that was previously (authored-)expanded before an ancestor's
     * collapse tore its projection down; collapsing recursively tears down every descendant projection,
     * not just this aggregate's direct children, while preserving each descendant's own authored
     * expanded intent so a later re-expand restores the whole subtree exactly as it was.
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
            this._authoredAggregateExpansion.add(aggregate.uniqueId);
            this._projectingAggregate = true;
            try {
                rootNode.aggregateExpanded = true;
                this._projectAggregateChildren(rootNode, aggregate);
                this.state.notifyChanged("visual");
            } finally {
                this._projectingAggregate = false;
            }
        } else {
            this._authoredAggregateExpansion.delete(aggregate.uniqueId);
            this._projectingAggregate = true;
            try {
                const nodeIds: string[] = [];
                const frameIds: string[] = [];
                this._collectAggregateProjection(rootNode.id, nodeIds, frameIds);
                this.state.removeNodes(nodeIds);
                for (const removedNodeId of nodeIds) {
                    this._aggregateRootByChildNodeId.delete(removedNodeId);
                }
                for (const frameId of frameIds) {
                    this.state.removeFrame(frameId);
                }
                rootNode.aggregateExpanded = false;
                this.state.notifyChanged("visual");
            } finally {
                this._projectingAggregate = false;
            }
        }

        this._reprojectBuildDiagnostics();
    }

    /**
     * Projects an aggregate's direct primitive children as visual nodes plus their internal wires and
     * frame, then recursively re-projects any child that is itself an aggregate still marked expanded
     * in {@link _authoredAggregateExpansion} (restoring a subtree an ancestor's collapse tore down).
     * @param rootNode The aggregate's own (already-visible) visual node.
     * @param aggregate The aggregate block being expanded.
     */
    private _projectAggregateChildren(rootNode: IGraphNode, aggregate: AggregateBlock): void {
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

        for (const [index, block] of aggregate.subgraph.attachedBlocks.entries()) {
            if (block instanceof AggregateBlock && this._authoredAggregateExpansion.has(block.uniqueId)) {
                const childNode = childNodes[index];
                childNode.aggregateExpanded = true;
                this._projectAggregateChildren(childNode, block);
            }
        }
    }

    /**
     * Recursively collects every visual node id and aggregate-frame id belonging to an aggregate's
     * projected subgraph, including nested aggregates' own projected children and frames at any depth,
     * so a collapse can tear the whole subtree down in one batch instead of only its direct children.
     * @param rootNodeId The aggregate's own visual node id.
     * @param nodeIds Descendant node ids collected so far; appended to in place.
     * @param frameIds Descendant aggregate-frame ids collected so far; appended to in place.
     */
    private _collectAggregateProjection(rootNodeId: string, nodeIds: string[], frameIds: string[]): void {
        const frame = this.state.frames.find((candidate) => candidate.kind === "aggregate" && candidate.aggregateNodeId === rootNodeId);
        if (!frame) {
            return;
        }
        frameIds.push(frame.id);
        for (const childNodeId of frame.nodeIds) {
            nodeIds.push(childNodeId);
            const childNode = this.state.getNode(childNodeId);
            if (childNode?.aggregateExpanded) {
                this._collectAggregateProjection(childNodeId, nodeIds, frameIds);
            }
        }
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
            const graphRevision = this._graphRevision;
            const aggregateRootNodeId = this._aggregateRootByChildNodeId.get(node.id) ?? (block instanceof AggregateBlock ? node.id : undefined);
            const propertyContext = {
                prepareEdit: <BlockT extends NodeAssetBlock>(editedBlock: BlockT): BlockT | undefined =>
                    !this._isDisposed && graphRevision === this._graphRevision ? this._preparePropertyEdit(node.id, editedBlock, aggregateRootNodeId) : undefined,
                refresh: () => {
                    if (this._isDisposed || graphRevision !== this._graphRevision) {
                        return;
                    }
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
        this._authoredBuildDiagnostics.clear();
        this.diagnostics.clear();
    }

    /**
     * Records a build failure's block attribution as a durable, block-id-keyed diagnostic source (see
     * {@link _authoredBuildDiagnostics}) and projects it onto the current visual state. Recorded by
     * block id rather than resolved node id up front, so a later aggregate expand/collapse can
     * re-derive the correct node without losing or duplicating the diagnostic.
     * @param error - Build failure reported by the worker.
     */
    public reportBuildError(error: unknown): void {
        this._authoredBuildDiagnostics.clear();
        if (error instanceof Ktx2EncoderResourceConflictError) {
            for (const blockId of error.blockIds) {
                this._authoredBuildDiagnostics.set(blockId, error.message);
            }
        } else if (error instanceof NodeAssetBuildError) {
            this._authoredBuildDiagnostics.set(error.blockId, error.message);
        }
        this._reprojectBuildDiagnostics();
    }

    /**
     * Recomputes every visual diagnostic from {@link _authoredBuildDiagnostics}, the durable source of
     * truth keyed by runtime block id. Called after {@link reportBuildError} and after any aggregate
     * expand/collapse (see {@link setAggregateExpanded}), since which visual node currently best
     * represents a given block can change -- a projected child appearing or disappearing -- without the
     * underlying build failure itself changing. Fully replaces the visual diagnostics rather than
     * patching them, so a node that no longer applies is never left with a stale entry.
     *
     * Short-circuits when no diagnostic is active so that toggling an aggregate unrelated to any build
     * failure -- the common case -- never touches {@link diagnostics} (and so never notifies its
     * observers or forces node views to re-render) at all.
     */
    private _reprojectBuildDiagnostics(): void {
        if (this._authoredBuildDiagnostics.size === 0) {
            this.diagnostics.clear();
            return;
        }
        this.diagnostics.clear();
        for (const [blockId, message] of this._authoredBuildDiagnostics) {
            const nodeId = this._findAttributionNodeId(blockId);
            if (nodeId) {
                this.diagnostics.set(nodeId, { severity: "error", message });
            }
        }
    }

    /**
     * Resolves the visual node that should carry a diagnostic for a runtime block, walking outward
     * from the block itself through its aggregate ownership chain (nearest ancestor first) until a
     * node that currently exists in the visual state is found. A top-level block, or one exposed by an
     * expanded aggregate's projected children, has its own node and resolves directly; a block owned
     * by a collapsed aggregate has no node of its own, so this falls back to the aggregate root's node
     * (which always exists, since every top-level block gets a node regardless of expansion state).
     * @param blockId - The runtime block id to attribute.
     * @returns The visual node id to flag, or undefined if the block is not reachable from the current graph.
     */
    private _findAttributionNodeId(blockId: number): string | undefined {
        for (const candidateId of this._ownershipChain(blockId)) {
            const nodeId = NodeIdForBlockId(candidateId);
            if (this.state.getNode(nodeId)) {
                return nodeId;
            }
        }
        return undefined;
    }

    /**
     * Computes a block's aggregate ownership chain: the block's own id, followed by its immediate
     * owning aggregate's id, then that aggregate's owner, and so on up to the top-level graph. Resolved
     * from the authored runtime graph (recursing into aggregate-owned subgraphs), not from the current
     * visual child-node mapping, so it is correct regardless of whether any aggregate is expanded.
     * @param targetBlockId - The runtime block id to locate.
     * @returns The ownership chain from nearest to outermost; just `[targetBlockId]` if not found.
     */
    private _ownershipChain(targetBlockId: number): readonly number[] {
        const search = (blocks: ReadonlyArray<NodeAssetBlock>, ancestors: readonly number[]): number[] | undefined => {
            for (const block of blocks) {
                if (block.uniqueId === targetBlockId) {
                    return [targetBlockId, ...ancestors];
                }
                if (block instanceof AggregateBlock) {
                    const found = search(block.subgraph.attachedBlocks, [block.uniqueId, ...ancestors]);
                    if (found) {
                        return found;
                    }
                }
            }
            return undefined;
        };
        return search(this._nodeAsset.attachedBlocks, []) ?? [targetBlockId];
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
        this._graphRevision++;
        this._reconciler.reset(asset);
        this._aggregateRootByChildNodeId.clear();
        this._authoredAggregateExpansion.clear();
        for (const { block, node } of blockNodes) {
            this._reconciler.registerNode(block, node);
        }
        this._authoredBuildDiagnostics.clear();
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
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this._graphRevision++;
        this._onChangedObserver.remove();
        this.onExportRequested.clear();
        this.onBuildRelevantChanged.clear();
        this._buildClient.dispose();
    }

    private _instantiateBlock(descriptor: IBlockDescriptor, position: Vec2): IGraphNode {
        const block = descriptor.create(this._nodeAsset);
        return this._registerBlockNode(block, descriptor, position, descriptor.label, false);
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
        this._detachAggregate(rootNodeId);
    }

    private _detachAggregate(rootNodeId: string): void {
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

    private _preparePropertyEdit<BlockT extends NodeAssetBlock>(nodeId: string, block: BlockT, rootNodeId: string | undefined): BlockT | undefined {
        if (!rootNodeId) {
            return this._reconciler.getBlock(nodeId) === block ? block : undefined;
        }
        const currentAggregate = this._reconciler.getBlock(rootNodeId);
        if (!(currentAggregate instanceof AggregateBlock) || !currentAggregate.subgraph.attachedBlocks.some((candidate) => candidate.uniqueId === block.uniqueId)) {
            return undefined;
        }

        this._detachAggregate(rootNodeId);
        const aggregate = this._reconciler.getBlock(rootNodeId);
        const authoredBlock = aggregate instanceof AggregateBlock ? aggregate.subgraph.attachedBlocks.find((candidate) => candidate.uniqueId === block.uniqueId) : undefined;
        if (!authoredBlock) {
            return undefined;
        }
        return authoredBlock as BlockT;
    }

    private _prepareNodeRemoval(nodeIds: readonly string[]): GraphNodeRemovalPlan {
        if (this._projectingAggregate) {
            return { nodeIds };
        }

        const removedNodeIds = new Set(nodeIds);
        const removedFrameIds = new Set<string>();
        const removedWireIds = new Set<string>();
        const removedRootIds = new Set(nodeIds.filter((nodeId) => this.isAggregateNode(nodeId)));
        for (const rootNodeId of removedRootIds) {
            const frame = this.state.frames.find((candidate) => candidate.kind === "aggregate" && candidate.aggregateNodeId === rootNodeId);
            if (!frame) {
                continue;
            }
            removedFrameIds.add(frame.id);
            for (const childNodeId of frame.nodeIds) {
                removedNodeIds.add(childNodeId);
                this._aggregateRootByChildNodeId.delete(childNodeId);
            }
        }

        for (const nodeId of nodeIds) {
            const rootNodeId = this._aggregateRootByChildNodeId.get(nodeId);
            if (!rootNodeId || removedRootIds.has(rootNodeId)) {
                continue;
            }
            this._detachAggregate(rootNodeId);
            const aggregate = this._reconciler.getBlock(rootNodeId);
            const child = this._reconciler.getBlock(nodeId);
            if (!(aggregate instanceof CustomAggregateBlock) || !child) {
                throw new Error(`Cannot delete aggregate child "${nodeId}" because its authored block is missing.`);
            }
            const removedPublicPortIds = new Set(aggregate._removeOwnedBlock(child).map((point) => PortIdForPoint(aggregate, point)));
            for (const wire of this.state.wires) {
                if (removedPublicPortIds.has(wire.fromPortId) || removedPublicPortIds.has(wire.toPortId)) {
                    removedWireIds.add(wire.id);
                }
            }
            this._aggregateRootByChildNodeId.delete(nodeId);
        }

        return { nodeIds: [...removedNodeIds], frameIds: [...removedFrameIds], wireIds: [...removedWireIds] };
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
