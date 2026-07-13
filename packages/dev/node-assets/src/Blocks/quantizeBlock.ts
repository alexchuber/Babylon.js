import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNumber, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Quantizes the vertex attributes of the incoming `Document` to reduced-precision integers, declaring
 * the `KHR_mesh_quantization` extension, then passes the same `Document` along. Wraps
 * `@gltf-transform/functions`' `quantize` operation.
 */
export class QuantizeBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "QuantizeBlock";

    /** The `Document` to quantize. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with quantized vertex attributes. */
    public readonly output: NodeAssetConnectionPoint;

    /** The number of bits used to store position attributes (1-16). */
    public quantizePosition = 14;

    /** The number of bits used to store normal and tangent attributes (1-16). */
    public quantizeNormal = 10;

    /** The number of bits used to store texture coordinate attributes (1-16). */
    public quantizeTexcoord = 12;

    /**
     * Creates a new quantize block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Quantizes the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { quantize } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(
            this,
            quantize({
                quantizePosition: this.quantizePosition,
                quantizeNormal: this.quantizeNormal,
                quantizeTexcoord: this.quantizeTexcoord,
            })
        );
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.quantizePosition = this.quantizePosition;
        serializationObject.quantizeNormal = this.quantizeNormal;
        serializationObject.quantizeTexcoord = this.quantizeTexcoord;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.quantizePosition = GetSerializedNumber(serializationObject, "quantizePosition", 14);
        this.quantizeNormal = GetSerializedNumber(serializationObject, "quantizeNormal", 10);
        this.quantizeTexcoord = GetSerializedNumber(serializationObject, "quantizeTexcoord", 12);
    }
}

RegisterBlock(QuantizeBlock.ClassName, (name, nodeAsset) => new QuantizeBlock(name, nodeAsset));
