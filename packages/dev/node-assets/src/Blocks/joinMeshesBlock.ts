import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Joins compatible primitives in a Universal asset to reduce draw calls. */
export class JoinMeshesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "JoinMeshesBlock";

    /** The Universal asset whose meshes will be joined. */
    public readonly input: NodeAssetConnectionPoint;
    /** The joined Universal asset. */
    public readonly output: NodeAssetConnectionPoint;
    /** Whether primitives may be joined only within their existing mesh. */
    public keepMeshes = false;
    /** Whether named nodes and meshes are excluded from joining. */
    public keepNamed = false;
    /** Whether temporary and unused resources are removed after joining. */
    public cleanup = true;

    /**
     * Creates a Join Meshes block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Joins compatible primitives in the incoming Universal asset in place. */
    public override async _buildBlockAsync(): Promise<void> {
        const { join } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(this, join({ keepMeshes: this.keepMeshes, keepNamed: this.keepNamed, cleanup: this.cleanup }));
    }

    /** @returns This block's serialized join options. */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.keepMeshes = this.keepMeshes;
        serializationObject.keepNamed = this.keepNamed;
        serializationObject.cleanup = this.cleanup;
        return serializationObject;
    }

    /**
     * Restores this block's join options.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.keepMeshes = GetSerializedBoolean(serializationObject, "keepMeshes", false);
        this.keepNamed = GetSerializedBoolean(serializationObject, "keepNamed", false);
        this.cleanup = GetSerializedBoolean(serializationObject, "cleanup", true);
    }
}

RegisterBlock(JoinMeshesBlock.ClassName, (name, nodeAsset) => new JoinMeshesBlock(name, nodeAsset));
