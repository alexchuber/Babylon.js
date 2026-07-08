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

import { BlockDescriptors, GetBlockDescriptorByPaletteItemId, GetBlockDescriptorForBlock, GltfPortColor, type IBlockDescriptor } from "./blockCatalog";
import { PromptForFileAsync } from "./browserFiles";

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
        name: "glTF",
        direction: point.direction === NodeAssetConnectionPointDirection.Output ? "output" : "input",
        color: GltfPortColor,
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

    private _nodeAsset: NodeAsset;
    private readonly _blockByNodeId = new Map<string, NodeAssetBlock>();
    private readonly _pointByPortId = new Map<string, NodeAssetConnectionPoint>();
    private _reconciling = false;
    private readonly _onChangedObserver;

    /**
     * Creates a controller seeded with a starter graph: one Import and one Export block, positioned
     * side by side and left unconnected so the user (or a test) wires them.
     */
    public constructor() {
        this._nodeAsset = new NodeAsset("nodeAsset");

        const importDescriptor = GetBlockDescriptorByPaletteItemId("import-gltf")!;
        const exportDescriptor = GetBlockDescriptorByPaletteItemId("export-gltf")!;
        const importNode = this._instantiateBlock(importDescriptor, { x: 120, y: 200 });
        const exportNode = this._instantiateBlock(exportDescriptor, { x: 560, y: 200 });

        const snapshot: IGraphSnapshot = { nodes: [importNode, exportNode], wires: [], frames: [] };
        this.state = new GraphEditorState(snapshot);

        this.paletteCategories = [{ label: "Blocks", items: BlockDescriptors.map((descriptor) => ({ id: descriptor.paletteItemId, label: descriptor.label })) }];

        // Subscribe only after seeding so the reconcile sees consistent maps and state.
        this._onChangedObserver = this.state.onChanged.add(() => this._reconcile());
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
     * Builds the property sections for a selected node: a general name field plus a block-specific
     * action (import a file for import blocks, export for export blocks).
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
        this._reconcile();
        return await this._nodeAsset.buildAsync();
    }

    /**
     * Serializes the graph plus the editor-owned visual metadata (positions, titles) to a JSON string.
     * @returns The JSON save file.
     */
    public serialize(): string {
        this._reconcile();
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
}
