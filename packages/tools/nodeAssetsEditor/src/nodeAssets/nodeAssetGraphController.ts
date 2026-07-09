/**
 * The bridge between the NodeAssets domain and the reusable visual node-graph framework.
 *
 * `NodeAsset` is the source of truth. This controller keeps it in sync with a {@link GraphEditorState}
 * via a one-directional (visual -> domain) reconcile subscribed to `state.onChanged`: blocks whose
 * visual node was deleted are removed, and connections are rebuilt from the visual wires. New blocks
 * are created up front in {@link createNodeFromPaletteItem} (palette drops) and {@link load}, so the
 * reconcile only ever needs to remove and re-wire, never add.
 *
 * All NodeAssets/gltf-transform types are confined to this app layer; the framework never imports it.
 */

import { Observable } from "core/Misc/observable";

import { DracoCompressionBlock, DracoEncoderMethod } from "node-assets/Blocks/dracoCompressionBlock";
import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { NodeAsset } from "node-assets/nodeAsset";
import { NodeAssetConnectionPointDirection } from "node-assets/connection/nodeAssetConnectionPointDirection";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "node-assets/connection/nodeAssetConnectionPoint";

import { GraphEditorState } from "../nodeGraph/editorState";
import { type IGraphNode, type IGraphPort, type IGraphSnapshot, type IGraphWire, type Vec2 } from "../nodeGraph/graphModel";
import { type IPaletteCategory } from "../nodeGraph/paletteModel";
import { type IPropertySection } from "../nodeGraph/propertyModel";

// Import the block descriptor modules for their registration side effects, so the palette and
// load-time lookups below see every built-in block. (See ./blockDescriptors/index.ts.)
import "./blockDescriptors";
import {
    ConfigureBlockForEditor,
    GetAllBlockDescriptors,
    GetBlockDescriptorByPaletteItemId,
    GetBlockDescriptorForBlock,
    ScenePortColor,
    type IBlockDescriptor,
} from "./blockCatalog";
import { PromptForFileAsync } from "./browserFiles";
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
const DefaultBoomBoxPath = "scenes/BoomBox.glb";

const DracoMethodLabels = ["Edgebreaker", "Sequential"] as const;
type DracoMethodLabel = (typeof DracoMethodLabels)[number];

function GetDefaultBoomBoxUrl(): string {
    const currentUrl = new URL(window.location.href);
    if ((currentUrl.hostname === "localhost" || currentUrl.hostname === "127.0.0.1") && currentUrl.port !== LocalCdnPort) {
        currentUrl.port = LocalCdnPort;
        currentUrl.pathname = "/";
        currentUrl.search = "";
        currentUrl.hash = "";
        return new URL(DefaultBoomBoxPath, currentUrl).href;
    }
    return new URL(DefaultBoomBoxPath, `${currentUrl.origin}/`).href;
}

function DracoMethodToLabel(method: DracoEncoderMethod): DracoMethodLabel {
    return method === DracoEncoderMethod.Sequential ? "Sequential" : "Edgebreaker";
}

function DracoMethodFromLabel(label: string): DracoEncoderMethod {
    return label === "Sequential" ? DracoEncoderMethod.Sequential : DracoEncoderMethod.Edgebreaker;
}

function SerializeQuantizationBits(quantizationBits: Record<string, number> | null): string {
    return quantizationBits ? JSON.stringify(quantizationBits) : "";
}

function IsValidQuantizationBitsJson(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            Object.values(parsed).every((entry) => typeof entry === "number" && Number.isFinite(entry) && Number.isInteger(entry) && entry > 0)
        );
    } catch {
        return false;
    }
}

function ParseQuantizationBits(value: string): Record<string, number> | null {
    const trimmed = value.trim();
    return trimmed ? (JSON.parse(trimmed) as Record<string, number>) : null;
}

function NodeIdForBlock(block: NodeAssetBlock): string {
    return `node-${block.uniqueId}`;
}

function PortIdForPoint(block: NodeAssetBlock, point: NodeAssetConnectionPoint): string {
    const direction = point.direction === NodeAssetConnectionPointDirection.Output ? "out" : "in";
    return `port-${block.uniqueId}-${direction}-${point.name}`;
}

function PointToPort(block: NodeAssetBlock, point: NodeAssetConnectionPoint): IGraphPort {
    return {
        id: PortIdForPoint(block, point),
        // The port name is purely cosmetic (the controller maps wires by id), so show the type.
        name: "Scene",
        direction: point.direction === NodeAssetConnectionPointDirection.Output ? "output" : "input",
        color: ScenePortColor,
    };
}

function BlockToNode(block: NodeAssetBlock, descriptor: IBlockDescriptor, position: Vec2, title: string, collapsed: boolean): IGraphNode {
    const ports: IGraphPort[] = [];
    for (const input of block.inputs) {
        ports.push(PointToPort(block, input));
    }
    for (const output of block.outputs) {
        ports.push(PointToPort(block, output));
    }
    return { id: NodeIdForBlock(block), title, headerColor: descriptor.headerColor, position, collapsed, ports };
}

/**
 * Owns a live {@link NodeAsset} and the {@link GraphEditorState} that visualizes it, keeping the two
 * in sync. Fills the framework's editor-context contract (palette, property sections, node factory).
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
    private readonly _blockByNodeId = new Map<string, NodeAssetBlock>();
    private readonly _pointByPortId = new Map<string, NodeAssetConnectionPoint>();
    private readonly _buildClient: INodeAssetBuildClient;
    private _reconciling = false;
    private _buildRelevantSignature: string;
    private readonly _onChangedObserver;

    /**
     * Creates a controller seeded with a starter graph: Import -> KTX2 -> Draco -> Export.
     * @param buildClient - Worker-backed build client.
     */
    public constructor(buildClient: INodeAssetBuildClient = new NodeAssetBuildWorkerClient()) {
        this._nodeAsset = new NodeAsset("nodeAsset");
        this._buildClient = buildClient;

        const importDescriptor = GetBlockDescriptorByPaletteItemId("import-gltf")!;
        const ktx2Descriptor = GetBlockDescriptorByPaletteItemId("ktx2-compression")!;
        const dracoDescriptor = GetBlockDescriptorByPaletteItemId("draco-compression")!;
        const exportDescriptor = GetBlockDescriptorByPaletteItemId("export-gltf")!;
        const importNode = this._instantiateBlock(importDescriptor, { x: 120, y: 200 });
        const ktx2Node = this._instantiateBlock(ktx2Descriptor, { x: 400, y: 200 });
        const dracoNode = this._instantiateBlock(dracoDescriptor, { x: 680, y: 200 });
        const exportNode = this._instantiateBlock(exportDescriptor, { x: 960, y: 200 });

        const snapshot: IGraphSnapshot = {
            nodes: [importNode, ktx2Node, dracoNode, exportNode],
            wires: [this._createWire(importNode, ktx2Node), this._createWire(ktx2Node, dracoNode), this._createWire(dracoNode, exportNode)],
            frames: [],
        };
        this.state = new GraphEditorState(snapshot);

        this.paletteCategories = [{ label: "Blocks", items: GetAllBlockDescriptors().map((descriptor) => ({ id: descriptor.paletteItemId, label: descriptor.label })) }];

        // Subscribe only after seeding so the reconcile sees consistent maps and state.
        this._reconcile();
        this._buildRelevantSignature = this._createBuildRelevantSignature();
        this._onChangedObserver = this.state.onChanged.add(() => this._reconcileAndNotifyBuildRelevantChange());
    }

    /**
     * Loads the default BoomBox sample into the starter import block.
     * @returns A promise that resolves after the bytes are loaded.
     */
    public async loadDefaultImportAsync(): Promise<void> {
        const importBlock = this._getImportBlock();
        const url = GetDefaultBoomBoxUrl();
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not load the default BoomBox asset from "${url}" (${response.status} ${response.statusText}).`);
        }
        importBlock.data = new Uint8Array(await response.arrayBuffer());
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
     * Builds the property sections for a selected node: a general name field plus block-specific
     * import/export actions or compression settings.
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

        const block = this._blockByNodeId.get(node.id);
        if (block instanceof ImportGLTFBlock) {
            sections.push(this._buildImportSection(block));
        } else if (block instanceof ExportGLTFBlock) {
            sections.push(this._buildExportSection());
        } else if (block instanceof KTX2CompressionBlock) {
            sections.push(this._buildKtx2Section(block));
        } else if (block instanceof DracoCompressionBlock) {
            sections.push(this._buildDracoSection(block));
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
            const block = this._blockByNodeId.get(node.id);
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
        this._blockByNodeId.clear();
        this._pointByPortId.clear();

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
                const input = output.connectedPoint;
                if (input) {
                    wires.push({
                        id: `wire-${block.uniqueId}-${input.ownerBlock.uniqueId}-${input.name}`,
                        fromPortId: PortIdForPoint(block, output),
                        toPortId: PortIdForPoint(input.ownerBlock, input),
                    });
                }
            }
        }

        // Maps are rebuilt above, so the reconcile fired by reset sees a consistent world.
        this.state.reset({ nodes, wires, frames: [] });
    }

    /** Releases the state subscription. */
    public dispose(): void {
        this._onChangedObserver.remove();
        this.onExportRequested.clear();
        this.onBuildRelevantChanged.clear();
        this._buildClient.dispose();
    }

    private _buildImportSection(block: ImportGLTFBlock): IPropertySection {
        const status = block.data ? `Loaded (${block.data.length} bytes)` : "No file loaded";
        return {
            title: "IMPORT",
            properties: [
                { kind: "text", label: "Source", value: status, onChange: () => undefined },
                {
                    kind: "button",
                    label: "Import glTF file\u2026",
                    onClick: () => {
                        void this._promptImportAsync(block);
                    },
                },
            ],
        };
    }

    private _buildExportSection(): IPropertySection {
        return {
            title: "EXPORT",
            properties: [
                {
                    kind: "button",
                    label: "Export .glb",
                    onClick: () => this.onExportRequested.notifyObservers(),
                },
            ],
        };
    }

    private _buildKtx2Section(block: KTX2CompressionBlock): IPropertySection {
        return {
            title: "KTX2",
            properties: [
                {
                    kind: "switch",
                    label: "Generate mipmaps",
                    value: block.generateMipmaps,
                    onChange: (value) => {
                        block.generateMipmaps = value;
                        this.state.notifyChanged();
                    },
                },
            ],
        };
    }

    private _buildDracoSection(block: DracoCompressionBlock): IPropertySection {
        return {
            title: "DRACO",
            properties: [
                {
                    kind: "dropdown",
                    label: "Method",
                    value: DracoMethodToLabel(block.method),
                    options: DracoMethodLabels,
                    onChange: (value) => {
                        block.method = DracoMethodFromLabel(value);
                        this.state.notifyChanged();
                    },
                },
                {
                    kind: "slider",
                    label: "Encode speed",
                    value: block.encodeSpeed,
                    min: 0,
                    max: 10,
                    step: 1,
                    onChange: (value) => {
                        block.encodeSpeed = value;
                        this.state.notifyChanged();
                    },
                },
                {
                    kind: "slider",
                    label: "Decode speed",
                    value: block.decodeSpeed,
                    min: 0,
                    max: 10,
                    step: 1,
                    onChange: (value) => {
                        block.decodeSpeed = value;
                        this.state.notifyChanged();
                    },
                },
                {
                    kind: "text",
                    label: "Quantization bits",
                    value: SerializeQuantizationBits(block.quantizationBits),
                    validator: IsValidQuantizationBitsJson,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        block.quantizationBits = ParseQuantizationBits(value);
                        this.state.notifyChanged();
                    },
                },
            ],
        };
    }

    private async _promptImportAsync(block: ImportGLTFBlock): Promise<void> {
        const file = await PromptForFileAsync(".glb,.gltf");
        if (!file) {
            return;
        }
        block.data = new Uint8Array(await file.arrayBuffer());
        // Refresh so the property pane's status line updates.
        this.state.notifyChanged();
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

    private _registerBlockNode(block: NodeAssetBlock, descriptor: IBlockDescriptor, position: Vec2, title: string, collapsed: boolean): IGraphNode {
        const node = BlockToNode(block, descriptor, position, title, collapsed);
        this._blockByNodeId.set(node.id, block);
        for (const input of block.inputs) {
            this._pointByPortId.set(PortIdForPoint(block, input), input);
        }
        for (const output of block.outputs) {
            this._pointByPortId.set(PortIdForPoint(block, output), output);
        }
        return node;
    }

    private _getImportBlock(): ImportGLTFBlock {
        const importBlock = this._nodeAsset.attachedBlocks.find((block): block is ImportGLTFBlock => block instanceof ImportGLTFBlock);
        if (!importBlock) {
            throw new Error(`The "${this._nodeAsset.name}" node asset has no ImportGLTFBlock for the default asset.`);
        }
        return importBlock;
    }

    private _reconcile(): void {
        if (this._reconciling) {
            return;
        }
        this._reconciling = true;
        try {
            // 1) Remove domain blocks whose visual node no longer exists.
            const liveNodeIds = new Set(this.state.nodes.map((node) => node.id));
            for (const [nodeId, block] of Array.from(this._blockByNodeId)) {
                if (!liveNodeIds.has(nodeId)) {
                    this._nodeAsset.removeBlock(block);
                    this._blockByNodeId.delete(nodeId);
                    for (const input of block.inputs) {
                        this._pointByPortId.delete(PortIdForPoint(block, input));
                    }
                    for (const output of block.outputs) {
                        this._pointByPortId.delete(PortIdForPoint(block, output));
                    }
                }
            }

            // 2) Rebuild all connections from the visual wires. Clearing outputs clears both sides.
            for (const block of this._nodeAsset.attachedBlocks) {
                for (const output of block.outputs) {
                    output.disconnect();
                }
            }
            for (const wire of this.state.wires) {
                const from = this._pointByPortId.get(wire.fromPortId);
                const to = this._pointByPortId.get(wire.toPortId);
                if (from && to) {
                    from.connectTo(to);
                }
            }
        } finally {
            this._reconciling = false;
        }
    }

    private _reconcileAndNotifyBuildRelevantChange(): void {
        this._reconcile();
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
