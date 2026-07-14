import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedString, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/**
 * A source block with no inputs and a single STRING output carrying a constant text value, edited
 * in the properties pane. Feeds text (including a glTF Object Model JSON pointer) to other blocks'
 * inputs.
 */
export class StringLiteral extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "StringLiteral";

    /** The constant text value emitted on the {@link output}. */
    public value = "";

    /** The output carrying {@link value} as a STRING. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new string literal block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.STRING);
    }

    /**
     * Emits the stored {@link value} on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.value;
    }

    /**
     * Serializes this block's literal value.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.value = this.value;
        return serializationObject;
    }

    /**
     * Restores this block's literal value.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.value = GetSerializedString(serializationObject, "value", "");
    }
}

RegisterBlock(StringLiteral.ClassName, (name, nodeAsset) => new StringLiteral(name, nodeAsset));
