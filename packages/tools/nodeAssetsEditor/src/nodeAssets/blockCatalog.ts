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

/** Data-driven dot color for scene-typed ports (applied inline as visual data, not theme chrome). */
export const ScenePortColor = "#d97b3f";

/** Data-driven dot colors for the scalar port kinds, so each renders distinctly from SCENE. */
export const NumberPortColor = "#3f79d9";
export const StringPortColor = "#3fa86b";
export const JsonPortColor = "#b163c9";

/** Palette category and shared node header color for the SCENE-to-SCENE operator block family. */
export const OperatorCategory = "Operators";
export const OperatorHeaderColor = "#2f8f83";

/** Palette category and shared node header color for the value-literal source block family. */
export const ValuesCategory = "Values";
export const ValuesHeaderColor = "#5a5fb0";

/** Palette category and shared node header color for the composition block family (e.g. MergeScenes). */
export const CompositionCategory = "Composition";
export const CompositionHeaderColor = "#a84f5a";

/**
 * Describes one palette entry: its id and label, its node header color, the backend class it maps to,
 * and how to construct that block.
 */
export interface IBlockDescriptor {
    /** Palette item id; also the drag payload carried from palette to canvas. */
    readonly paletteItemId: string;
    /** Human readable label, used both in the palette and as the new node's title. */
    readonly label: string;
    /** Data-driven node header color. */
    readonly headerColor: string;
    /** The backend class name this descriptor maps to, used to recover the descriptor on load. */
    readonly className: string;
    /** Optional palette category label; entries without one fall into the default category. */
    readonly category?: string;
    /** Constructs the backing block, registering it with the given node asset. */
    readonly create: (nodeAsset: NodeAsset) => NodeAssetBlock;
    /**
     * Optional builder for this block's property pane section. When provided, the controller renders
     * it for any block whose type it does not handle explicitly. `refresh` re-renders after an edit.
     */
    readonly getPropertySection?: (block: NodeAssetBlock, refresh: () => void) => IPropertySection;
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
