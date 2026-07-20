import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Flattens a Universal asset's node hierarchy while preserving its attachments and transforms. */
export class FlattenHierarchyBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FlattenHierarchyBlock";

    /** The Universal asset to flatten. */
    public readonly input: NodeAssetConnectionPoint;
    /** The flattened Universal asset. */
    public readonly output: NodeAssetConnectionPoint;
    /** Whether nodes left empty by flattening are removed. */
    public cleanup = true;

    /**
     * Creates a Flatten Hierarchy block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Flattens the incoming Universal asset in place. */
    public override async _buildBlockAsync(): Promise<void> {
        const { flatten } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, flatten({ cleanup: this.cleanup }));
    }

    /** @returns This block's serialized cleanup option. */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.cleanup = this.cleanup;
        return serializationObject;
    }

    /**
     * Restores this block's cleanup option.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.cleanup = GetSerializedBoolean(serializationObject, "cleanup", true);
    }
}

RegisterBlock(FlattenHierarchyBlock.ClassName, (name, nodeAsset) => new FlattenHierarchyBlock(name, nodeAsset));
