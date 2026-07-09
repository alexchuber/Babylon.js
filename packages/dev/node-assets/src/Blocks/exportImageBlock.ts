import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type IExportBlock } from "../blockFoundation/exportBlock";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { type ImagePayload } from "./imagePayload";

/**
 * Surfaces the connected `IMAGE` payload's bytes as the graph's built result. A terminal export
 * block parallel to `ExportGLTFBlock`: it carries the {@link IExportBlock} marker so
 * {@link NodeAsset.buildAsync} can pull the built bytes from it generically.
 */
export class ExportImageBlock extends NodeAssetBlock implements IExportBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ExportImageBlock";

    /** Marks this as a terminal export block so {@link NodeAsset.buildAsync} can locate it generically. */
    public readonly isExportTerminal = true;

    /** The {@link ImagePayload} to export. */
    public readonly input: NodeAssetConnectionPoint;

    /** The exported image bytes; also returned by {@link NodeAsset.buildAsync}. */
    public result: Nullable<Uint8Array> = null;

    /**
     * Creates a new image export block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Reads the connected {@link ImagePayload} and stores its bytes in {@link result}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const payload = this.input.value as Nullable<ImagePayload>;
        if (!payload) {
            throw new Error(`The "${this.name}" export block has no input image to export.`);
        }
        this.result = payload.data;
    }
}

RegisterBlock(ExportImageBlock.ClassName, (name, nodeAsset) => new ExportImageBlock(name, nodeAsset));
