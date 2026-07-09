import { type Nullable } from "core/types";

import { type NodeAssetBlock } from "./nodeAssetBlock";

/**
 * The contract a terminal export block satisfies so {@link NodeAsset.buildAsync} can pull the built
 * bytes from it without knowing its concrete type. Any block that produces the deliverable output of
 * a graph (glTF, image, ...) implements this: it carries the {@link isExportTerminal} marker so it
 * can be found generically, and surfaces the built bytes on {@link result}.
 *
 * This is the minimal relaxation of the single-sink assumption — the terminal is located by marker,
 * not by concrete class, so a new export block joins the set with no change to `buildAsync`.
 */
export interface IExportBlock {
    /** Marks this block as a terminal export block; used to locate it generically during a build. */
    readonly isExportTerminal: true;

    /** The built bytes, populated during the block's build and returned by {@link NodeAsset.buildAsync}. */
    result: Nullable<Uint8Array>;
}

/**
 * Narrows a block to a terminal export block via its {@link IExportBlock.isExportTerminal} marker.
 * @param block - The block to test.
 * @returns True if the block is a terminal export block.
 */
export function IsExportBlock(block: NodeAssetBlock): block is NodeAssetBlock & IExportBlock {
    return (block as Partial<IExportBlock>).isExportTerminal === true;
}
