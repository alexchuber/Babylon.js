import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Recomputes flat vertex normals in Universal content. */
export class RecomputeNormalsBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "RecomputeNormalsBlock";

    /** The Universal content to process. */
    public readonly input: NodeAssetConnectionPoint;
    /** The processed Universal content. */
    public readonly output: NodeAssetConnectionPoint;
    /** Whether existing NORMAL attributes are replaced. */
    public overwriteExisting = false;

    /**
     * Creates a Recompute Normals block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Recomputes normals and passes the same Universal payload onward. */
    public override async _buildBlockAsync(): Promise<void> {
        const { normals } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, normals({ overwrite: this.overwriteExisting }));
    }

    /**
     * Serializes the block.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.overwriteExisting = this.overwriteExisting;
        return serializationObject;
    }

    /**
     * Restores the block.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.overwriteExisting = GetSerializedBoolean(serializationObject, "overwriteExisting", false);
    }
}

RegisterBlock(RecomputeNormalsBlock.ClassName, (name, nodeAsset) => new RecomputeNormalsBlock(name, nodeAsset));
