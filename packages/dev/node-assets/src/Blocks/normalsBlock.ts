import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Generates flat vertex normals for the meshes of the incoming `Document`, then passes the same
 * `Document` along. Wraps `@gltf-transform/functions`' `normals` operation.
 */
export class NormalsBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "NormalsBlock";

    /** The `Document` to generate normals for. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with generated vertex normals. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to overwrite existing NORMAL attributes instead of only filling in missing ones. */
    public overwrite = false;

    /**
     * Creates a new normals block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Generates normals for the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { normals } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, normals({ overwrite: this.overwrite }));
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
        this.overwrite = serializationObject.overwrite ?? false;
    }
}

RegisterBlock(NormalsBlock.ClassName, (name, nodeAsset) => new NormalsBlock(name, nodeAsset));
