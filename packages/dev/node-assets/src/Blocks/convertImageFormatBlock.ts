import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNumber, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { type ImagePayload } from "./imagePayload";

/** The encoded formats an image can be converted to. Each maps to the `image/<format>` mime type. */
export type ImageFormat = "png" | "jpeg" | "webp";

/**
 * Re-encodes an `IMAGE` payload to a different format. It decodes the source and re-encodes to the
 * chosen {@link format} (using {@link quality} for the lossy formats), emitting a new payload whose
 * mime type reflects the target format. The decode/encode canvas work lives in the shared
 * `imageCanvas` helper.
 */
export class ConvertImageFormatBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ConvertImageFormatBlock";

    /** The target format to re-encode to. */
    public format: ImageFormat = "png";

    /** Encode quality (0..1) for the lossy formats (jpeg/webp); ignored for png. */
    public quality = 0.9;

    /** The `IMAGE` payload to convert. */
    public readonly input: NodeAssetConnectionPoint;

    /** The converted image, emitted as a new `IMAGE` payload carrying the target mime type. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new image format conversion block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Re-encodes the connected image to {@link format} and sets the result as the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const payload = this.input.value as Nullable<ImagePayload>;
        if (!payload) {
            throw new Error(`The "${this.name}" convert block has no input image to convert.`);
        }

        const { ProcessImageAsync } = await import("./imageCanvas");
        this.output.value = await ProcessImageAsync(payload, { mimeType: `image/${this.format}`, quality: this.quality });
    }

    /**
     * Serializes this block's target format and quality.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.format = this.format;
        serializationObject.quality = this.quality;
        return serializationObject;
    }

    /**
     * Restores this block's target format and quality.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.format = GetSerializedStringUnion(serializationObject, "format", ["png", "jpeg", "webp"], "png");
        this.quality = GetSerializedNumber(serializationObject, "quality", 0.9);
    }
}

RegisterBlock(ConvertImageFormatBlock.ClassName, (name, nodeAsset) => new ConvertImageFormatBlock(name, nodeAsset));
