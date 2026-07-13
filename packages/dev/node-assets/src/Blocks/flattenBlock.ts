import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Flattens the node hierarchy of the incoming `Document`, baking transforms and lifting attachments to
 * be direct children of the scene, then passes the same `Document` along. Wraps
 * `@gltf-transform/functions`' `flatten` operation.
 */
export class FlattenBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FlattenBlock";

    /** The `Document` to flatten. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with a flattened node hierarchy. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to remove nodes left empty by flattening. */
    public cleanup = true;

    /**
     * Creates a new flatten block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Flattens the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { flatten } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, flatten({ cleanup: this.cleanup }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.cleanup = this.cleanup;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.cleanup = GetSerializedBoolean(serializationObject, "cleanup", true);
    }
}

RegisterBlock(FlattenBlock.ClassName, (name, nodeAsset) => new FlattenBlock(name, nodeAsset));
