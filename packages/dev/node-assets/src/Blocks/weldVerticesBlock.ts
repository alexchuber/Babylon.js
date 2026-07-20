import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Welds equivalent vertices in Universal content. */
export class WeldVerticesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "WeldVerticesBlock";

    /** The Universal content to weld. */
    public readonly input: NodeAssetConnectionPoint;

    /** The welded Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether existing indices may be replaced while welding. */
    public overwrite = true;

    /**
     * Creates a Weld Vertices block.
     * @param name The display name of the block.
     * @param nodeAsset The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Welds the input content and passes it to the output. */
    public override async _buildBlockAsync(): Promise<void> {
        const { weld } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, weld({ overwrite: this.overwrite }));
    }

    /**
     * Serializes this block's options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.overwrite = this.overwrite;
        return serializationObject;
    }

    /**
     * Restores this block's options.
     * @param serializationObject The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.overwrite = GetSerializedBoolean(serializationObject, "overwrite", true);
    }
}

RegisterBlock(WeldVerticesBlock.ClassName, (name, nodeAsset) => new WeldVerticesBlock(name, nodeAsset));
