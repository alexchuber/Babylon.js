import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNumber, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Simplifies the meshes of the incoming `Document`, collapsing triangles down toward a target ratio,
 * then passes the same `Document` along. Wraps `@gltf-transform/functions`' `simplify` operation,
 * backed by the `meshoptimizer` simplifier.
 */
export class SimplifyBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "SimplifyBlock";

    /** The `Document` to simplify. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with simplified meshes. */
    public readonly output: NodeAssetConnectionPoint;

    /** Target ratio (0-1) of triangles to keep, relative to the input. */
    public ratio = 0.5;

    /** Limit (0-1) on the geometric error allowed while simplifying. */
    public error = 0.001;

    /**
     * Creates a new simplify block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Simplifies the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { simplify } = await import("@gltf-transform/functions");
        const { MeshoptSimplifier } = await import("meshoptimizer");
        await MeshoptSimplifier.ready;
        await ApplyOperatorTransformsAsync(this, simplify({ simplifier: MeshoptSimplifier, ratio: this.ratio, error: this.error }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.ratio = this.ratio;
        serializationObject.error = this.error;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.ratio = GetSerializedNumber(serializationObject, "ratio", 0.5);
        this.error = GetSerializedNumber(serializationObject, "error", 0.001);
    }
}

RegisterBlock(SimplifyBlock.ClassName, (name, nodeAsset) => new SimplifyBlock(name, nodeAsset));
