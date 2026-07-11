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

import { type BuildPBRMaterial } from "node-assets/Blocks/buildPBRMaterial";
import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { type ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { type ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { type KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
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
    /** Export blocks only: the user-chosen base file name for the download (editor-owned, kept out of the domain graph). */
    readonly fileName?: string;
}

/** The full editor save file: the domain graph plus the editor-owned visual metadata. */
interface INodeAssetEditorFile {
    readonly graph: ReturnType<NodeAsset["serialize"]>;
    readonly editor: { readonly blocks: readonly IEditorBlockMetadata[] };
}

const LocalCdnPort = "1337";
// The "energy orb" showcase assets, served alongside the editor's other samples (see BoomBox) by the CDN.
const DefaultOrbGlbPath = "scenes/nodeAssets/orb.glb";
const DefaultOrbMetalImagePath = "scenes/nodeAssets/orbMetal.png";
const DefaultOrbPatternImagePath = "scenes/nodeAssets/orbPattern.png";

/**
 * Resolves a bundled sample asset path (e.g. `scenes/nodeAssets/orb.glb`) to an absolute URL on
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
    private readonly _orbGltfBlock: ImportGLTFBlock;

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
        const compositeDescriptor = GetBlockDescriptorByPaletteItemId("composite-image")!;
        const buildDescriptor = GetBlockDescriptorByPaletteItemId("build-pbr-material")!;
        const ktx2Descriptor = GetBlockDescriptorByPaletteItemId("ktx2-compression")!;
        const dracoDescriptor = GetBlockDescriptorByPaletteItemId("draco-compression")!;
        const exportDescriptor = GetBlockDescriptorByPaletteItemId("export-gltf")!;

        const metalNode = this._instantiateBlock(importImageDescriptor, { x: 80, y: 80 });
        const patternNode = this._instantiateBlock(importImageDescriptor, { x: 80, y: 300 });
        const gltfNode = this._instantiateBlock(importGltfDescriptor, { x: 80, y: 520 });
        const compositeNode = this._instantiateBlock(compositeDescriptor, { x: 380, y: 140 });
        const buildNode = this._instantiateBlock(buildDescriptor, { x: 680, y: 320 });
        const ktx2Node = this._instantiateBlock(ktx2Descriptor, { x: 980, y: 320 });
        const dracoNode = this._instantiateBlock(dracoDescriptor, { x: 1220, y: 320 });
        const exportNode = this._instantiateBlock(exportDescriptor, { x: 1460, y: 320 });

        this._orbMetalImageBlock = this._reconciler.getBlock(metalNode.id)! as ImportImageBlock;
        this._orbPatternImageBlock = this._reconciler.getBlock(patternNode.id)! as ImportImageBlock;
        this._orbGltfBlock = this._reconciler.getBlock(gltfNode.id)! as ImportGLTFBlock;

        // A glossy, self-lit metal orb: near-metallic with a cyan emissive tint so the pattern glows.
        const buildBlock = this._reconciler.getBlock(buildNode.id)! as BuildPBRMaterial;
        buildBlock.metallicFactor = 0.9;
        buildBlock.roughnessFactor = 0.35;
        buildBlock.emissiveFactor = [0.05, 0.85, 1];
        // Mipmaps keep the fine circuit lines crisp as the orb recedes.
        (this._reconciler.getBlock(ktx2Node.id)! as KTX2CompressionBlock).generateMipmaps = true;

        const snapshot: IGraphSnapshot = {
            nodes: [metalNode, patternNode, gltfNode, compositeNode, buildNode, ktx2Node, dracoNode, exportNode],
            wires: [
                this._createWireToInput(metalNode, compositeNode, "base"),
                this._createWireToInput(patternNode, compositeNode, "overlay"),
                this._createWireToInput(compositeNode, buildNode, "baseColor"),
                this._createWireToInput(patternNode, buildNode, "emissive"),
                this._createWireToInput(gltfNode, buildNode, "scene"),
                this._createWire(buildNode, ktx2Node),
                this._createWire(ktx2Node, dracoNode),
                this._createWire(dracoNode, exportNode),
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
        this.state = new GraphEditorState(snapshot);

        this.paletteCategories = BuildPaletteCategories(GetAllBlockDescriptors());

        // Subscribe only after seeding so the reconcile sees consistent correspondence and state.
        this._reconciler.reconcile(this.state);
        this._buildRelevantSignature = this._createBuildRelevantSignature();
        this._onChangedObserver = this.state.onChanged.add(() => this._reconcileAndNotifyBuildRelevantChange());
    }

    /**
     * Loads the bundled "energy orb" sample assets into the seeded import blocks: the UV-sphere `.glb`
     * into the ImportGLTF block and the metal and cyan-pattern images into their ImportImage blocks, so
     * the graph builds the textured, self-lit orb on open.
     * @returns A promise that resolves after all assets are loaded.
     */
    public async loadDefaultImportAsync(): Promise<void> {
        const orbGlbUrl = ResolveCdnAssetUrl(DefaultOrbGlbPath);
        const orbMetalUrl = ResolveCdnAssetUrl(DefaultOrbMetalImagePath);
        const orbPatternUrl = ResolveCdnAssetUrl(DefaultOrbPatternImagePath);
        const [orbGlb, orbMetal, orbPattern] = await Promise.all([
            this._fetchAssetBytesAsync(orbGlbUrl),
            this._fetchAssetBytesAsync(orbMetalUrl),
            this._fetchAssetBytesAsync(orbPatternUrl),
        ]);

        this._orbGltfBlock.data = orbGlb;
        this._orbGltfBlock.source = orbGlbUrl;

        this._orbMetalImageBlock.data = orbMetal;
        this._orbMetalImageBlock.mimeType = "image/png";
        this._orbMetalImageBlock.source = orbMetalUrl;

        this._orbPatternImageBlock.data = orbPattern;
        this._orbPatternImageBlock.mimeType = "image/png";
        this._orbPatternImageBlock.source = orbPatternUrl;

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
                requestExport: (fileName) => this.onExportRequested.notifyObservers(fileName ?? "scene"),
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
                blocks.push({
                    id: block.uniqueId,
                    position: node.position,
                    title: node.title,
                    collapsed: node.collapsed,
                    fileName: block instanceof ExportGLTFBlock ? block.fileName : undefined,
                });
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
            if (block instanceof ExportGLTFBlock && metadata?.fileName !== undefined) {
                block.fileName = metadata.fileName;
            }
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
