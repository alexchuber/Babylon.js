import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { type ImagePayload } from "./imagePayload";

/** The axis an image is mirrored across. */
export type FlipAxis = "horizontal" | "vertical";

/**
 * Mirrors an `IMAGE` payload across the chosen {@link axis}. It decodes the source, redraws it with a
 * mirrored canvas transform, and re-encodes to a new payload preserving the source mime type and
 * dimensions. The canvas work lives in the shared `imageCanvas` helper.
 */
export class FlipImageBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FlipImageBlock";

    /** The axis to mirror across: `"horizontal"` (left/right) or `"vertical"` (top/bottom). */
    public axis: FlipAxis = "horizontal";

    /** The `IMAGE` payload to flip. */
    public readonly input: NodeAssetConnectionPoint;

    /** The mirrored image, emitted as a new `IMAGE` payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new image flip block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Redraws the connected image mirrored across {@link axis} and sets the result as the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const payload = this.input.value as Nullable<ImagePayload>;
        if (!payload) {
            throw new Error(`The "${this.name}" flip block has no input image to flip.`);
        }

        const { ProcessImageAsync } = await import("./imageCanvas");
        this.output.value = await ProcessImageAsync(payload, {
            flipHorizontal: this.axis === "horizontal",
            flipVertical: this.axis === "vertical",
        });
    }

    /**
     * Serializes this block's flip axis.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.axis = this.axis;
        return serializationObject;
    }

    /**
     * Restores this block's flip axis.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.axis = serializationObject.axis ?? "horizontal";
    }
}

RegisterBlock(FlipImageBlock.ClassName, (name, nodeAsset) => new FlipImageBlock(name, nodeAsset));
