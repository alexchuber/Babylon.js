/**
 * The bridge between the NodeAssets domain and the reusable visual node-graph framework.
 *
 * `NodeAsset` is the source of truth. The controller creates blocks up front (palette drops and
 * {@link load}) and delegates keeping the domain in sync with the visuals to a {@link NodeAssetReconciler}:
 * on every editor change the reconciler removes blocks whose visual node was deleted and rebuilds
 * connections from the visual wires. The controller itself is a thin adapter — it seeds the showcase
 * graph, builds property sections through the block descriptors, serializes, and drives builds.
 *
 * All NodeAssets/gltf-transform types are confined to this app layer; the framework never imports it.
 */

import { Observable } from "core/Misc/observable";

import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { NodeAsset } from "node-assets/nodeAsset";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

import { GraphEditorState } from "../nodeGraph/editorState";
import { type IGraphNode, type IGraphSnapshot, type IGraphWire, type Vec2 } from "../nodeGraph/graphModel";
import { type IPaletteCategory } from "../nodeGraph/paletteModel";
import { type IPropertySection } from "../nodeGraph/propertyModel";

// Import the block descriptor modules for their registration side effects, so the palette and
// load-time lookups below see every built-in block. (See ./blockDescriptors/index.ts.)
import "./blockDescriptors";
import { ConfigureBlockForEditor, GetAllBlockDescriptors, GetBlockDescriptorByPaletteItemId, GetBlockDescriptorForBlock, type IBlockDescriptor } from "./blockCatalog";
import { BlockToNode, PortIdForPoint } from "./blockNodeMapping";
import { BuildPaletteCategories } from "./paletteCategories";
import { NodeAssetReconciler } from "./nodeAssetReconciler";
import { NodeAssetBuildWorkerClient, type INodeAssetBuildClient } from "./nodeAssetBuildWorkerClient";

/** The editor metadata layered on top of a serialized graph: per-block visual state keyed by block id. */
interface IEditorBlockMetadata {
    readonly id: number;
    readonly position: Vec2;
    readonly title: string;
    readonly collapsed: boolean;
}

/** The full editor save file: the domain graph plus the editor-owned visual metadata. */
interface INodeAssetEditorFile {
    readonly graph: ReturnType<NodeAsset["serialize"]>;
    readonly editor: { readonly blocks: readonly IEditorBlockMetadata[] };
}

const LocalCdnPort = "1337";
// The compose-up showcase assets, served alongside the editor's other samples (see BoomBox) by the CDN.
const DefaultBareGlbPath = "scenes/nodeAssets/bareCube.glb";
const DefaultBaseColorImagePath = "scenes/nodeAssets/baseColor.png";

/**
 * Resolves a bundled sample asset path (e.g. `scenes/nodeAssets/bareCube.glb`) to an absolute URL on
 * the local CDN, mirroring how the editor served the default BoomBox: from a `localhost` dev origin the
 * assets live on the CDN port, otherwise they resolve against the current origin.
 * @param assetPath - The CDN-relative asset path.
 * @returns The absolute asset URL.
 */
function ResolveCdnAssetUrl(assetPath: string): string {
    const currentUrl = new URL(window.location.href);
    if ((currentUrl.hostname === "localhost" || currentUrl.hostname === "127.0.0.1") && currentUrl.port !== LocalCdnPort) {
        currentUrl.port = LocalCdnPort;
        currentUrl.pathname = "/";
        currentUrl.search = "";
        currentUrl.hash = "";
        return new URL(assetPath, currentUrl).href;
    }
    return new URL(assetPath, `${currentUrl.origin}/`).href;
}

/**
 * Owns a live {@link NodeAsset} and the {@link GraphEditorState} that visualizes it, delegating the
 * visual-to-domain sync to a {@link NodeAssetReconciler}. Fills the framework's editor-context
 * contract (palette, property sections, node factory).
 */
export class NodeAssetGraphController {
    /** The visual editor state the framework renders and mutates. */
    public readonly state: GraphEditorState;

    /** The palette contents shown in the left pane, derived from the block catalog. */
    public readonly paletteCategories: readonly IPaletteCategory[];

    /** Fires when a build (export) is requested from the graph, e.g. the export node's action button. */
    public readonly onExportRequested = new Observable<void>();

    /** Fires only when the runtime graph's serialized build identity changes. */
    public readonly onBuildRelevantChanged = new Observable<void>();

    private _nodeAsset: NodeAsset;
    private readonly _reconciler: NodeAssetReconciler;
    private readonly _buildClient: INodeAssetBuildClient;
    private _buildRelevantSignature: string;
    private readonly _onChangedObserver;

    /**
     * Creates a controller seeded with the compose-up showcase graph: ImportGLTF (bare mesh) and
     * ImportImage feed a BuildPBRMaterial (the image is its base colour), which flows to ExportGLTF.
     * @param buildClient - Worker-backed build client.
     */
    public constructor(buildClient: INodeAssetBuildClient = new NodeAssetBuildWorkerClient()) {
        this._nodeAsset = new NodeAsset("nodeAsset");
        this._buildClient = buildClient;
        this._reconciler = new NodeAssetReconciler(this._nodeAsset);

        const importGltfDescriptor = GetBlockDescriptorByPaletteItemId("import-gltf")!;
        const importImageDescriptor = GetBlockDescriptorByPaletteItemId("import-image")!;
        const buildDescriptor = GetBlockDescriptorByPaletteItemId("build-pbr-material")!;
        const exportDescriptor = GetBlockDescriptorByPaletteItemId("export-gltf")!;
        const importGltfNode = this._instantiateBlock(importGltfDescriptor, { x: 120, y: 120 });
        const importImageNode = this._instantiateBlock(importImageDescriptor, { x: 120, y: 340 });
        const buildNode = this._instantiateBlock(buildDescriptor, { x: 480, y: 230 });
        const exportNode = this._instantiateBlock(exportDescriptor, { x: 840, y: 230 });

        const snapshot: IGraphSnapshot = {
            nodes: [importGltfNode, importImageNode, buildNode, exportNode],
            wires: [
                this._createWireToInput(importGltfNode, buildNode, "scene"),
                this._createWireToInput(importImageNode, buildNode, "baseColor"),
                this._createWire(buildNode, exportNode),
            ],
            frames: [],
        };
        this.state = new GraphEditorState(snapshot);

        this.paletteCategories = BuildPaletteCategories(GetAllBlockDescriptors());

        // Subscribe only after seeding so the reconcile sees consistent correspondence and state.
        this._reconciler.reconcile(this.state);
        this._buildRelevantSignature = this._createBuildRelevantSignature();
        this._onChangedObserver = this.state.onChanged.add(() => this._reconcileAndNotifyBuildRelevantChange());
    }

    /**
     * Loads the bundled compose-up sample assets into the seeded import blocks: the bare `.glb` into the
     * ImportGLTF block and the base-colour image into the ImportImage block, so the graph builds a
     * textured asset on open.
     * @returns A promise that resolves after both assets are loaded.
     */
    public async loadDefaultImportAsync(): Promise<void> {
        const gltfBlock = this._getImportBlock();
        gltfBlock.data = await this._fetchAssetBytesAsync(ResolveCdnAssetUrl(DefaultBareGlbPath));

        const imageBlock = this._getImportImageBlock();
        imageBlock.data = await this._fetchAssetBytesAsync(ResolveCdnAssetUrl(DefaultBaseColorImagePath));
        imageBlock.mimeType = "image/png";

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
                            node.title = value;
                            this.state.notifyChanged();
                        },
                    },
                ],
            },
        ];

        const block = this._reconciler.getBlock(node.id);
        if (block) {
            const section = GetBlockDescriptorForBlock(block)?.getPropertySection?.(block, {
                refresh: () => this.state.notifyChanged(),
                requestExport: () => this.onExportRequested.notifyObservers(),
            });
            if (section) {
                sections.push(section);
            }
        }

        return sections;
    }

    /**
     * Reconciles the domain with the current visuals, then runs the graph and returns the exported
     * glb bytes. Reconcile also runs on every change, but calling it here makes the build robust to
     * any caller and is idempotent.
     * @returns The exported glb bytes.
     */
    public async buildAsync(): Promise<Uint8Array> {
        this._reconcileAndNotifyBuildRelevantChange();
        return await this._buildClient.buildAsync(this._nodeAsset.serialize());
    }

    /**
     * Serializes the graph plus the editor-owned visual metadata (positions, titles) to a JSON string.
     * @returns The JSON save file.
     */
    public serialize(): string {
        this._reconcileAndNotifyBuildRelevantChange();
        const blocks: IEditorBlockMetadata[] = [];
        for (const node of this.state.nodes) {
            const block = this._reconciler.getBlock(node.id);
            if (block) {
                blocks.push({ id: block.uniqueId, position: node.position, title: node.title, collapsed: node.collapsed });
            }
        }
        const file: INodeAssetEditorFile = { graph: this._nodeAsset.serialize(), editor: { blocks } };
        return JSON.stringify(file, null, 2);
    }

    /**
     * Replaces the current graph with one parsed from a JSON string produced by {@link serialize},
     * restoring blocks, connections, and visual positions/titles.
     * @param json - The JSON save file.
     */
    public load(json: string): void {
        const file = JSON.parse(json) as INodeAssetEditorFile;
        const asset = NodeAsset.Parse(file.graph);

        this._nodeAsset = asset;
        this._reconciler.reset(asset);

        const metadataById = new Map<number, IEditorBlockMetadata>();
        for (const metadata of file.editor?.blocks ?? []) {
            metadataById.set(metadata.id, metadata);
        }

        const nodes: IGraphNode[] = [];
        for (const block of asset.attachedBlocks) {
            ConfigureBlockForEditor(block);
            const descriptor = GetBlockDescriptorForBlock(block);
            if (!descriptor) {
                continue;
            }
            const metadata = metadataById.get(block.uniqueId);
            const node = this._registerBlockNode(block, descriptor, metadata?.position ?? { x: 0, y: 0 }, metadata?.title ?? descriptor.label, metadata?.collapsed ?? false);
            nodes.push(node);
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

        // Correspondence is rebuilt above, so the reconcile fired by reset sees a consistent world.
        this.state.reset({ nodes, wires, frames: [] });
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

    private _getImportBlock(): ImportGLTFBlock {
        const importBlock = this._nodeAsset.attachedBlocks.find((block): block is ImportGLTFBlock => block instanceof ImportGLTFBlock);
        if (!importBlock) {
            throw new Error(`The "${this._nodeAsset.name}" node asset has no ImportGLTFBlock for the default asset.`);
        }
        return importBlock;
    }

    private _getImportImageBlock(): ImportImageBlock {
        const importImageBlock = this._nodeAsset.attachedBlocks.find((block): block is ImportImageBlock => block instanceof ImportImageBlock);
        if (!importImageBlock) {
            throw new Error(`The "${this._nodeAsset.name}" node asset has no ImportImageBlock for the default base-colour image.`);
        }
        return importImageBlock;
    }

    private async _fetchAssetBytesAsync(url: string): Promise<Uint8Array> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not load the default sample asset from "${url}" (${response.status} ${response.statusText}).`);
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    private _reconcileAndNotifyBuildRelevantChange(): void {
        this._reconciler.reconcile(this.state);
        const signature = this._createBuildRelevantSignature();
        if (signature !== this._buildRelevantSignature) {
            this._buildRelevantSignature = signature;
            this.onBuildRelevantChanged.notifyObservers();
        }
    }

    private _createBuildRelevantSignature(): string {
        return JSON.stringify(this._nodeAsset.serialize());
    }
}
