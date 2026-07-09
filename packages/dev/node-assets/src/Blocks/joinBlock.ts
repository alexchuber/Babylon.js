import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/**
 * Joins compatible meshes and primitives of the incoming `Document` into fewer draw calls, then passes
 * the same `Document` along. Wraps `@gltf-transform/functions`' `join` operation.
 */
export class JoinBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "JoinBlock";

    /** The `Document` to join. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with compatible meshes merged. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to keep separate meshes rather than merging them, joining only primitives within a mesh. */
    public keepMeshes = false;

    /** Whether to prevent joining named nodes and meshes, preserving them for scene structure. */
    public keepNamed = false;

    /**
     * Creates a new join block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);
    }

    /**
     * Joins the input `Document` in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { join } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, join({ keepMeshes: this.keepMeshes, keepNamed: this.keepNamed }));
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.keepMeshes = this.keepMeshes;
        serializationObject.keepNamed = this.keepNamed;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.keepMeshes = serializationObject.keepMeshes ?? false;
        this.keepNamed = serializationObject.keepNamed ?? false;
    }
}

RegisterBlock(JoinBlock.ClassName, (name, nodeAsset) => new JoinBlock(name, nodeAsset));
