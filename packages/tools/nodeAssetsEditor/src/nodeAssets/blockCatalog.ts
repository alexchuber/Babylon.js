/**
 * App-layer glue between the NodeAssets backend and the visual node-graph palette. It names the
 * blocks the palette offers and knows how to construct and color each one. The reusable framework in
 * `../nodeGraph` never imports this module, keeping it free of NodeAssets/gltf-transform types.
 */

import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { DracoCompressionBlock } from "node-assets/Blocks/dracoCompressionBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { type NodeAsset } from "node-assets/nodeAsset";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

// The KTX2 encoder's matched wasm + JS glue, served same-origin by the dev server via relative `?url`
// imports into the root node_modules (bypasses the package's restrictive "exports" map). Passing them to
// the block lets the browser encode run without any external CDN dependency.
import BasisEncoderJsUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.js?url";
import BasisEncoderWasmUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm?url";

/** Data-driven dot color for glTF-typed ports (applied inline as visual data, not theme chrome). */
export const GltfPortColor = "#d97b3f";

// Data-driven node header colors: green/blue for the boundary blocks, purple for compression.
const ImportHeaderColor = "#3f7d4e";
const ExportHeaderColor = "#3a6ea5";
const CompressionHeaderColor = "#7d5aa8";

// Data-driven node header color for the Draco compression block.
const DracoHeaderColor = "#6f5b9e";

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

/** The blocks offered by the palette, in display order. */
export const BlockDescriptors: readonly IBlockDescriptor[] = [
    {
        paletteItemId: "import-gltf",
        label: "Import glTF",
        headerColor: ImportHeaderColor,
        className: ImportGLTFBlock.ClassName,
        create: (nodeAsset) => new ImportGLTFBlock("Import glTF", nodeAsset),
    },
    {
        paletteItemId: "draco-compression",
        label: "Draco Compression",
        headerColor: DracoHeaderColor,
        className: DracoCompressionBlock.ClassName,
        create: (nodeAsset) => new DracoCompressionBlock("Draco Compression", nodeAsset),
    },
    {
        paletteItemId: "export-gltf",
        label: "Export glTF",
        headerColor: ExportHeaderColor,
        className: ExportGLTFBlock.ClassName,
        create: (nodeAsset) => new ExportGLTFBlock("Export glTF", nodeAsset),
    },
    {
        paletteItemId: "ktx2-compression",
        label: "KTX2 Compress",
        headerColor: CompressionHeaderColor,
        className: KTX2CompressionBlock.ClassName,
        create: (nodeAsset) => {
            const block = new KTX2CompressionBlock("KTX2 Compress", nodeAsset);
            // Point the browser encoder at the same-origin assets so it needs no external CDN.
            block.jsUrl = BasisEncoderJsUrl;
            block.wasmUrl = BasisEncoderWasmUrl;
            return block;
        },
    },
];

/**
 * Looks up a descriptor by palette item id.
 * @param paletteItemId - The dropped palette item id.
 * @returns The matching descriptor, or undefined if unknown.
 */
export function GetBlockDescriptorByPaletteItemId(paletteItemId: string): IBlockDescriptor | undefined {
    return BlockDescriptors.find((descriptor) => descriptor.paletteItemId === paletteItemId);
}

/**
 * Recovers the descriptor for an existing block (e.g. after load) by its class name.
 * @param block - The block to describe.
 * @returns The matching descriptor, or undefined if unknown.
 */
export function GetBlockDescriptorForBlock(block: NodeAssetBlock): IBlockDescriptor | undefined {
    const className = block.getClassName();
    return BlockDescriptors.find((descriptor) => descriptor.className === className);
}
