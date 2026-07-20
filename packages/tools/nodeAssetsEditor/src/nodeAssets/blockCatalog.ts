/**
 * App-layer glue between the NodeAssets backend and the visual node-graph palette. It holds the
 * registry of block descriptors the palette offers and knows how to construct and color each one.
 * Each built-in block registers its descriptor from its own module under `./blockDescriptors`; this
 * module owns only the registry. The reusable framework in `../nodeGraph` never imports this module,
 * keeping it free of NodeAssets/gltf-transform types.
 */

import { type NodeAsset } from "node-assets/nodeAsset";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

import { type IPropertySection } from "../nodeGraph/propertyModel";

/**
 * The editor capabilities a block's property section can use. Passed to {@link IBlockDescriptor.getPropertySection}
 * so every block — including the import/export/compression blocks that once had bespoke handling —
 * builds its section through one seam.
 */
export interface IPropertySectionContext {
    /** Detaches aggregate-owned state when needed and returns the stable block an edit must target, or undefined if the property context is stale. */
    readonly prepareEdit: <BlockT extends NodeAssetBlock>(block: BlockT) => BlockT | undefined;
    /** Re-renders the property pane after an edit (and marks the graph changed). */
    readonly refresh: () => void;
    /** Requests that the editor export the current graph, optionally named by the export block's file name. */
    readonly requestExport: (fileName?: string) => void;
}

/** Data-driven dot color for scene-typed ports (applied inline as visual data, not theme chrome). */
export const ScenePortColor = "#d97b3f";

/** Data-driven dot color for Universal ports, distinct from the glTF delivery lane. */
export const UniversalPortColor = "#2f8f83";

/** Data-driven dot colors for the scalar port kinds, so each renders distinctly from SCENE. */
export const NumberPortColor = "#3f79d9";
export const StringPortColor = "#3fa86b";
export const JsonPortColor = "#b163c9";

/** Palette category and shared node header color for the SCENE-to-SCENE operator block family. */
export const OperatorCategory = "Operators";
export const OperatorHeaderColor = "#2f8f83";

/** Palette category for source-independent Universal operators. */
export const UniversalCategory = "Universal";

/** Palette category and shared node header color for blocks that operate on glTF documents. */
export const GltfCategory = "glTF";
export const GltfHeaderColor = "#2f8f83";

/** Palette family for Universal cleanup decisions. */
export const CleanupFamily = "Cleanup";

/** Palette family for compact source aggregates. */
export const AggregateImportsFamily = "Aggregate imports";

/** Palette family for Universal geometry reduction decisions. */
export const ReductionFamily = "Reduction";

/** Palette family for Universal hierarchy and composition decisions. */
export const StructureFamily = "Structure";

/** Palette family for Universal attribute decisions. */
export const AttributesFamily = "Attributes";

/** Palette family for Universal texture decisions. */
export const TexturesFamily = "Textures";

/** Palette family for glTF encoding and output decisions. */
export const EncodingOutputFamily = "Encoding/output";

/** Palette category and shared node header color for the value-literal source block family. */
export const ValuesCategory = "Values";
export const ValuesHeaderColor = "#5a5fb0";

/** Palette category and shared node header color for the composition block family (e.g. MergeScenes). */
export const CompositionCategory = "Composition";
export const CompositionHeaderColor = "#a84f5a";

/** Data-driven dot color for IMAGE-typed ports, distinct from the scene and scalar port kinds. */
export const ImagePortColor = "#38b2c4";

/** Palette category and shared node header color for the IMAGE boundary block family. */
export const ImageCategory = "Image";
export const ImageHeaderColor = "#a0568f";

/** Palette category and shared node header color for the selector/property-access block family. */
export const SelectorsCategory = "Selectors";
export const SelectorsHeaderColor = "#b0506a";

/** Data-driven dot color for USD_STAGE-typed ports. */
export const UsdStagePortColor = "#C4A265";

/** Data-driven dot color for BABYLON_SCENE-typed ports. */
export const BabylonScenePortColor = "#4A90D9";

/** Data-driven dot color for NODE_GEOMETRY-typed ports. */
export const NodeGeometryPortColor = "#7B68EE";

/** Palette category and shared node header color for Node Geometry resource blocks. */
export const NodeGeometryCategory = "Node Geometry";
export const NodeGeometryHeaderColor = "#7B68EE";

/** Palette category and shared node header color for the transcoder block family. */
export const TranscodersCategory = "Transcoders";
export const TranscodersHeaderColor = "#6B4C8A";

/** Palette category and shared node header color for the Babylon operator block family. */
export const BabylonCategory = "Babylon";
export const BabylonHeaderColor = "#4A90D9";

/** Palette category and shared node header color for the USD operator block family. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const USDCategory = "USD";
// eslint-disable-next-line @typescript-eslint/naming-convention
export const USDHeaderColor = "#C4A265";

/**
 * Describes one palette entry: its id and label, its node header color, the backend class it maps to,
 * and how to construct that block.
 */
export interface IBlockDescriptor {
    /** Palette item id; also the drag payload carried from palette to canvas. */
    readonly paletteItemId: string;
    /** Human readable label, used both in the palette and as the new node's title. */
    readonly label: string;
    /** Concise explanation shown in the palette. */
    readonly description?: string;
    /** Workflow terms and aliases used by palette search. */
    readonly keywords?: readonly string[];
    /** Data-driven node header color. */
    readonly headerColor: string;
    /** The backend class name this descriptor maps to, used to recover the descriptor on load. */
    readonly className: string;
    /** Optional palette category label; entries without one fall into the default category. */
    readonly category?: string;
    /** Optional family label within a category. */
    readonly family?: string;
    /** Whether this descriptor is discoverable in the palette. Defaults to true. */
    readonly isPaletteVisible?: boolean;
    /**
     * Palette item id of the built-in aggregate that abstracts this primitive. Abstracted primitives remain
     * authorable but are discoverable only while Show primitives is enabled.
     */
    readonly abstractedBy?: string;
    /** Constructs the backing block, registering it with the given node asset. */
    readonly create: (nodeAsset: NodeAsset) => NodeAssetBlock;
    /**
     * Optional builder for this block's property pane section. The controller renders it for every
     * block that provides one, passing an {@link IPropertySectionContext} to refresh the pane or
     * request an export after an edit.
     */
    readonly getPropertySection?: (block: NodeAssetBlock, context: IPropertySectionContext) => IPropertySection;
}

// Registry of block descriptors keyed by palette item id, populated by the per-block modules under
// `./blockDescriptors` at import time. Insertion order is the palette display order.
const DescriptorsByPaletteItemId = new Map<string, IBlockDescriptor>();

/**
 * Registers a block descriptor so the palette and load-time lookups can find it. Called once per
 * block at module load; a later registration for the same palette item id replaces the earlier one.
 * @param descriptor - The descriptor to register.
 */
export function RegisterBlockDescriptor(descriptor: IBlockDescriptor): void {
    DescriptorsByPaletteItemId.set(descriptor.paletteItemId, descriptor);
}

/**
 * Lists all registered block descriptors, in registration (palette display) order.
 * @returns The registered descriptors.
 */
export function GetAllBlockDescriptors(): readonly IBlockDescriptor[] {
    return Array.from(DescriptorsByPaletteItemId.values());
}

/**
 * Applies editor-side defaults to a newly created block.
 * @param block - The block to configure.
 * @returns The same block for construction pipelines.
 */
export function ConfigureBlockForEditor<T extends NodeAssetBlock>(block: T): T {
    return block;
}

/**
 * Looks up a descriptor by palette item id.
 * @param paletteItemId - The dropped palette item id.
 * @returns The matching descriptor, or undefined if unknown.
 */
export function GetBlockDescriptorByPaletteItemId(paletteItemId: string): IBlockDescriptor | undefined {
    return DescriptorsByPaletteItemId.get(paletteItemId);
}

/**
 * Recovers the descriptor for an existing block (e.g. after load) by its class name.
 * @param block - The block to describe.
 * @returns The matching descriptor, or undefined if unknown.
 */
export function GetBlockDescriptorForBlock(block: NodeAssetBlock): IBlockDescriptor | undefined {
    const className = block.getClassName();
    for (const descriptor of DescriptorsByPaletteItemId.values()) {
        if (descriptor.className === className) {
            return descriptor;
        }
    }
    return undefined;
}
