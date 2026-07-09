import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * A source block with no inputs and a single JSON output carrying a constant JSON-serialisable
 * value (primitive, array, or plain object), edited in the properties pane. Feeds structured
 * values to other blocks' inputs.
 */
export class JsonLiteral extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "JsonLiteral";

    /** The constant JSON-serialisable value emitted on the {@link output}. */
    public value: unknown = null;

    /** The output carrying {@link value} as JSON. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new JSON literal block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Emits the stored {@link value} on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.value;
    }

    /**
     * Serializes this block's literal value. The value is already JSON-serialisable, so it is
     * stored as-is.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.value = this.value;
        return serializationObject;
    }

    /**
     * Restores this block's literal value.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.value = serializationObject.value ?? null;
    }
}

RegisterBlock(JsonLiteral.ClassName, (name, nodeAsset) => new JsonLiteral(name, nodeAsset));
