import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Prunes the incoming `Document`, removing unused nodes, materials, textures, accessors, and other
 * orphaned properties, then passes the same `Document` along. Wraps `@gltf-transform/functions`'
 * `prune` operation.
 */
export class PruneBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "PruneBlock";

    /** The `Document` to prune. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with unused properties removed. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to keep empty leaf nodes instead of removing them. */
    public keepLeaves = false;

    /** Whether to keep unused vertex attributes, such as UVs without an assigned texture. */
    public keepAttributes = false;

    /**
     * Creates a new prune block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);
    }

    /**
     * Prunes the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { prune } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, prune({ keepLeaves: this.keepLeaves, keepAttributes: this.keepAttributes }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.keepLeaves = this.keepLeaves;
        serializationObject.keepAttributes = this.keepAttributes;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.keepLeaves = serializationObject.keepLeaves ?? false;
        this.keepAttributes = serializationObject.keepAttributes ?? false;
    }
}

RegisterBlock(PruneBlock.ClassName, (name, nodeAsset) => new PruneBlock(name, nodeAsset));
