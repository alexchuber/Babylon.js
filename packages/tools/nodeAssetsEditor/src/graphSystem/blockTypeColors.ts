/**
 * Maps NAE block categories to header/body colors for the shared node graph display managers.
 * These mirror the colors previously defined in blockCatalog.ts but exposed in the format
 * the shared display manager expects.
 */

import { GetBlockDescriptorForBlock } from "../nodeAssets/blockCatalog";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

/** Default header color when the block has no descriptor match. */
const DefaultHeaderColor = "#555555";

/**
 * Gets the header color for a block based on its descriptor.
 * @param block - The block to get the color for.
 * @returns The header color string.
 */
export function GetBlockHeaderColor(block: NodeAssetBlock): string {
    const descriptor = GetBlockDescriptorForBlock(block);
    return descriptor?.headerColor ?? DefaultHeaderColor;
}

/**
 * Gets the body/background color for a block. For NAE we use the same color as the header
 * since that matches the existing visual design.
 * @param block - The block to get the color for.
 * @returns The body color string.
 */
export function GetBlockBodyColor(block: NodeAssetBlock): string {
    return GetBlockHeaderColor(block);
}
