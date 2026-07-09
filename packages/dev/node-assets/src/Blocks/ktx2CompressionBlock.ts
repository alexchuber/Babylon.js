import { type Document } from "@gltf-transform/core";
import { type KTX2Options } from "ktx2-encoder/gltf-transform";

import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Compresses a glTF `Document`'s textures to KTX2 / Basis Universal in place and flags the
 * `KHR_texture_basisu` extension, so an `ImportGLTFBlock -> KTX2CompressionBlock -> ExportGLTFBlock`
 * graph writes a glb whose textures are KTX2.
 *
 * The encode runs inside this block (not at export time) via the `ktx2-encoder` library, which
 * wraps the Basis Universal WASM encoder and integrates with gltf-transform. Two passes implement
 * the color/data codec split from the design:
 * - ETC1S for color textures (sRGB base color / emissive slots).
 * - UASTC for non-color data textures (normal / metallic-roughness / occlusion slots).
 *
 * Textures the encoder cannot or should not handle pass through unchanged and the export stays
 * valid: unsupported source formats (e.g. HDR, or anything other than jpeg/png/webp) and already
 * KTX2 textures are skipped by the library, and any per-texture encode failure is caught and left
 * as-is.
 *
 * Note: the design also calls for skipping textures whose dimensions are not a multiple of four.
 * The Basis encoder used here handles arbitrary dimensions without corruption, so that check is
 * treated as a documented simplification rather than implemented as a bespoke pre-filter.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KTX2CompressionBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "KTX2CompressionBlock";

    /** The gltf-transform `Document` whose textures will be compressed. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with compatible textures replaced by KTX2 payloads. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to generate mipmaps while encoding. */
    public generateMipmaps = false;

    /**
     * Decodes a source image (png/jpeg/webp bytes) to raw RGBA for the encoder. Required in non-DOM
     * environments such as Node/unit tests; in browsers the encoder decodes via canvas, so this can
     * be left undefined.
     */
    public imageDecoder: KTX2Options["imageDecoder"] = undefined;

    /**
     * URL of the Basis encoder wasm binary. Left undefined, the encoder falls back to its own default
     * (an external CDN in the browser). Hosts that bundle the encoder should point this at a served
     * copy so the encode has no external dependency.
     */
    public wasmUrl: KTX2Options["wasmUrl"] = undefined;

    /**
     * URL of the Basis encoder JS glue module. Left undefined, the encoder falls back to its own
     * default, which does not resolve under a bundler; hosts that bundle the encoder should point this
     * at a served copy of the matching glue module.
     */
    public jsUrl: KTX2Options["jsUrl"] = undefined;

    /**
     * Creates a new KTX2 compression block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);
    }

    /**
     * Compresses the input `Document`'s textures to KTX2 in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const document = this.input.value as Nullable<Document>;
        if (!document) {
            throw new Error(`The "${this.name}" KTX2 block has no input document to compress.`);
        }

        const { ktx2 } = await import("ktx2-encoder/gltf-transform");

        // The encoder's option names (isUASTC, isKTX2File, ...) are external API and do not follow
        // the repo's camelCase convention, hence the scoped disable.
        /* eslint-disable @typescript-eslint/naming-convention */
        const baseOptions: Partial<KTX2Options> = {
            isKTX2File: true,
            generateMipmap: this.generateMipmaps,
            imageDecoder: this.imageDecoder,
            wasmUrl: this.wasmUrl,
            jsUrl: this.jsUrl,
        };

        // ETC1S for color (sRGB) textures.
        const compressColor = ktx2({
            ...baseOptions,
            isUASTC: false,
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
            slots: /baseColor|emissive/i,
        });

        // UASTC for non-color (linear) data textures. Color textures are already KTX2 by now and
        // are skipped by the library, so this pass only touches the remaining data textures.
        const compressData = ktx2({
            ...baseOptions,
            isUASTC: true,
            isPerceptual: false,
            slots: /normal|metallicRoughness|occlusion/i,
        });
        /* eslint-enable @typescript-eslint/naming-convention */

        await document.transform(compressColor, compressData);

        this.output.value = document;
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.generateMipmaps = this.generateMipmaps;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.generateMipmaps = serializationObject.generateMipmaps ?? false;
    }
}

RegisterBlock(KTX2CompressionBlock.ClassName, (name, nodeAsset) => new KTX2CompressionBlock(name, nodeAsset));
