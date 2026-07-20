import { ImageUtils } from "@gltf-transform/core";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { GetSerializedIntegerInRange, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** Texture resampling behavior exposed by Resize Textures. */
export type TextureResizeMode = "sharp" | "smooth";

/** Reduces texture dimensions inside Universal content while preserving aspect ratio. */
export class ResizeTexturesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ResizeTexturesBlock";

    /** The Universal content containing textures to resize. */
    public readonly input: NodeAssetConnectionPoint;
    /** The Universal content with resized textures. */
    public readonly output: NodeAssetConnectionPoint;

    /** Maximum texture width in pixels. */
    public maximumWidth = 2048;
    /** Maximum texture height in pixels. */
    public maximumHeight = 2048;
    /** Resampling mode used when dimensions are reduced. */
    public resizeMode: TextureResizeMode = "sharp";

    /**
     * Creates a Resize Textures block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /**
     * Reduces supported in-document textures that exceed the configured maximum dimensions.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const { compressTexture, TEXTURE_COMPRESS_SUPPORTED_FORMATS, TextureResizeFilter } = await import("@gltf-transform/functions");
        const resizeFilter = this.resizeMode === "sharp" ? TextureResizeFilter.LANCZOS3 : TextureResizeFilter.LANCZOS2;
        await Promise.all(
            asset.document
                .getRoot()
                .listTextures()
                .map(async (texture) => {
                    const image = texture.getImage();
                    const mimeType = texture.getMimeType();
                    const format = mimeType?.split("/")[1];
                    const size = image && mimeType ? ImageUtils.getSize(image, mimeType) : null;
                    if (
                        !size ||
                        !format ||
                        !TEXTURE_COMPRESS_SUPPORTED_FORMATS.some((supportedFormat) => supportedFormat === format) ||
                        (size[0] <= this.maximumWidth && size[1] <= this.maximumHeight)
                    ) {
                        return;
                    }

                    await compressTexture(texture, {
                        resize: [this.maximumWidth, this.maximumHeight],
                        resizeFilter,
                    });
                })
        );
        this.output.value = asset;
    }

    /**
     * Serializes the maximum dimensions and resize mode.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.maximumWidth = this.maximumWidth;
        serializationObject.maximumHeight = this.maximumHeight;
        serializationObject.resizeMode = this.resizeMode;
        return serializationObject;
    }

    /**
     * Restores validated maximum dimensions and resize mode.
     * @param serializationObject The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.maximumWidth = GetSerializedIntegerInRange(serializationObject, "maximumWidth", 1, 16384, 2048);
        this.maximumHeight = GetSerializedIntegerInRange(serializationObject, "maximumHeight", 1, 16384, 2048);
        this.resizeMode = GetSerializedStringUnion(serializationObject, "resizeMode", ["sharp", "smooth"], "sharp");
    }
}

RegisterBlock(ResizeTexturesBlock.ClassName, (name, nodeAsset) => new ResizeTexturesBlock(name, nodeAsset));
