/**
 * App-layer glue between the NodeAssets backend and the visual node-graph palette. It holds the
 * registry of block descriptors the palette offers and knows how to construct and color each one.
 * Each built-in block registers its descriptor from its own module under `./blockDescriptors`; this
 * module owns only the registry and the shared wasm-URL wiring. The reusable framework in
 * `../nodeGraph` never imports this module, keeping it free of NodeAssets/gltf-transform types.
 */

import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { type NodeAsset } from "node-assets/nodeAsset";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

// The KTX2 encoder's matched wasm + JS glue, served same-origin by the dev server via relative `?url`
// imports into the root node_modules (bypasses the package's restrictive "exports" map). Passing them to
// the block lets the browser encode run without any external CDN dependency.
import BasisEncoderJsUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.js?url";
import BasisEncoderWasmUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm?url";
// The Draco encoder/decoder wasm sidecars, served same-origin so draco3dgltf does not fetch index.html.
import DracoDecoderWasmUrl from "../../../../../node_modules/draco3dgltf/draco_decoder_gltf.wasm?url";
import DracoEncoderWasmUrl from "../../../../../node_modules/draco3dgltf/draco_encoder.wasm?url";

/** Data-driven dot color for scene-typed ports (applied inline as visual data, not theme chrome). */
export const ScenePortColor = "#d97b3f";

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
    /** Constructs the backing block, registering it with the given node asset. */
    readonly create: (nodeAsset: NodeAsset) => NodeAssetBlock;
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
 * Injects browser-served runtime resources into blocks that need wasm sidecars.
 * @param block - The block to configure.
 * @returns The same block for construction pipelines.
 */
export function ConfigureBlockForEditor<T extends NodeAssetBlock>(block: T): T {
    if (block instanceof ImportGLTFBlock) {
        block.dracoDecoderWasmUrl = DracoDecoderWasmUrl;
    } else if (block instanceof ExportGLTFBlock) {
        block.dracoEncoderWasmUrl = DracoEncoderWasmUrl;
    } else if (block instanceof KTX2CompressionBlock) {
        block.jsUrl = BasisEncoderJsUrl;
        block.wasmUrl = BasisEncoderWasmUrl;
    }
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
