import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Welds the incoming `Document`, merging bit-identical vertices within each primitive and indexing the
 * result, then passes the same `Document` along. Wraps `@gltf-transform/functions`' `weld` operation.
 */
export class WeldBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "WeldBlock";

    /** The `Document` whose primitives will be welded. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with welded (indexed, de-duplicated) primitives. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to overwrite existing indices while welding. */
    public overwrite = true;

    /**
     * Creates a new weld block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Welds the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { weld } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, weld({ overwrite: this.overwrite }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.overwrite = this.overwrite;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.overwrite = serializationObject.overwrite ?? true;
    }
}

RegisterBlock(WeldBlock.ClassName, (name, nodeAsset) => new WeldBlock(name, nodeAsset));
