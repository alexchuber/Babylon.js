import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * De-duplicates the incoming `Document`, merging identical accessors, meshes, textures, and materials,
 * then passes the same `Document` along. Wraps `@gltf-transform/functions`' `dedup` operation.
 */
export class DedupBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DedupBlock";

    /** The `Document` to de-duplicate. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with duplicate properties merged. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to keep properties that have unique names, even when they are otherwise duplicates. */
    public keepUniqueNames = false;

    /**
     * Creates a new dedup block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * De-duplicates the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { dedup } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, dedup({ keepUniqueNames: this.keepUniqueNames }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.keepUniqueNames = this.keepUniqueNames;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.keepUniqueNames = serializationObject.keepUniqueNames ?? false;
    }
}

RegisterBlock(DedupBlock.ClassName, (name, nodeAsset) => new DedupBlock(name, nodeAsset));
