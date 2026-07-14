import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNumber, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { type ImagePayload } from "./imagePayload";

/**
 * Resizes an `IMAGE` payload to a target pixel size. It decodes the source, redraws it into a
 * {@link width}×{@link height} canvas, and re-encodes to a new payload preserving the source mime
 * type. The canvas work lives in the shared `imageCanvas` helper, so this block only supplies its
 * target dimensions.
 */
export class ResizeImageBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ResizeImageBlock";

    /** Target width in pixels. */
    public width = 256;

    /** Target height in pixels. */
    public height = 256;

    /** The `IMAGE` payload to resize. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resized image, emitted as a new `IMAGE` payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new image resize block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Redraws the connected image at {@link width}×{@link height} and sets the result as the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const payload = this.input.value as Nullable<ImagePayload>;
        if (!payload) {
            throw new Error(`The "${this.name}" resize block has no input image to resize.`);
        }

        const { ProcessImageAsync } = await import("./imageCanvas");
        this.output.value = await ProcessImageAsync(payload, { width: this.width, height: this.height });
    }

    /**
     * Serializes this block's target dimensions.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.width = this.width;
        serializationObject.height = this.height;
        return serializationObject;
    }

    /**
     * Restores this block's target dimensions.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.width = GetSerializedNumber(serializationObject, "width", 256);
        this.height = GetSerializedNumber(serializationObject, "height", 256);
    }
}

RegisterBlock(ResizeImageBlock.ClassName, (name, nodeAsset) => new ResizeImageBlock(name, nodeAsset));
