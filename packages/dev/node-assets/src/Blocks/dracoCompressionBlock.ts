import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";

/**
 * The Draco geometry-compression method.
 */
export enum DracoEncoderMethod {
    /** Preserves the original vertex order, at the cost of a lower compression ratio. */
    Sequential = 0,
    /** Reorders vertices for a higher compression ratio. */
    Edgebreaker = 1,
}

/**
 * Tags a gltf-transform `Document` for `KHR_draco_mesh_compression`. The block only configures the
 * extension; the actual Draco encode happens when {@link ExportGLTFBlock} writes the document.
 */
export class DracoCompressionBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DracoCompressionBlock";

    /** The glTF `Document` to compress. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same glTF `Document`, configured for Draco compression on export. */
    public readonly output: NodeAssetConnectionPoint;

    /** The compression method to use. */
    public method: DracoEncoderMethod = DracoEncoderMethod.Edgebreaker;

    /** The encode speed, from 0 (slowest/smallest) to 10 (fastest/largest). */
    public encodeSpeed = 5;

    /** The decode speed, from 0 (slowest) to 10 (fastest). */
    public decodeSpeed = 5;

    /** Per-attribute quantization bits (e.g. `{ POSITION: 14 }`), or null to use the encoder defaults. */
    public quantizationBits: Nullable<Record<string, number>> = null;

    /**
     * Creates a new Draco compression block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Enables `KHR_draco_mesh_compression` on the connected `Document` and passes it through.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" Draco block has no input document to compress.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);

        const { KHRDracoMeshCompression } = await import("@gltf-transform/extensions");

        const method = this.method === DracoEncoderMethod.Sequential ? KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL : KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER;

        asset.document
            .createExtension(KHRDracoMeshCompression)
            .setRequired(true)
            .setEncoderOptions({
                method,
                encodeSpeed: this.encodeSpeed,
                decodeSpeed: this.decodeSpeed,
                ...(this.quantizationBits ? { quantizationBits: this.quantizationBits } : {}),
            });

        this.output.value = asset;
    }

    /**
     * Serializes this block's build-affecting compression options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.method = this.method;
        serializationObject.encodeSpeed = this.encodeSpeed;
        serializationObject.decodeSpeed = this.decodeSpeed;
        serializationObject.quantizationBits = this.quantizationBits;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting compression options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.method = serializationObject.method ?? DracoEncoderMethod.Edgebreaker;
        this.encodeSpeed = serializationObject.encodeSpeed ?? 5;
        this.decodeSpeed = serializationObject.decodeSpeed ?? 5;
        this.quantizationBits = serializationObject.quantizationBits ?? null;
    }
}

RegisterBlock(DracoCompressionBlock.ClassName, (name, nodeAsset) => new DracoCompressionBlock(name, nodeAsset));
