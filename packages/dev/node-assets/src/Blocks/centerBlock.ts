import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Where on the model to place at the origin when centering. */
export type CenterPivot = "center" | "above" | "below";

/**
 * Recenters the incoming `Document` so the chosen pivot of its bounding box sits at the origin, then
 * passes the same `Document` along. Wraps `@gltf-transform/functions`' `center` operation.
 */
export class CenterBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "CenterBlock";

    /** The `Document` to recenter. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, recentered on the origin. */
    public readonly output: NodeAssetConnectionPoint;

    /** Which point of the bounding box to move to the origin: its center, top, or bottom. */
    public pivot: CenterPivot = "center";

    /**
     * Creates a new center block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Recenters the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { center } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, center({ pivot: this.pivot }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.pivot = this.pivot;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.pivot = serializationObject.pivot ?? "center";
    }
}

RegisterBlock(CenterBlock.ClassName, (name, nodeAsset) => new CenterBlock(name, nodeAsset));
