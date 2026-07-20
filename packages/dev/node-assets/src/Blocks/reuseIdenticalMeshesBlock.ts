import { PropertyType } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyUniversalOperatorTransformsAsync } from "./operatorSupport";

/** Reuses equivalent mesh resources in a Universal payload without introducing runtime GPU instancing. */
export class ReuseIdenticalMeshesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReuseIdenticalMeshesBlock";

    /** The Universal payload to process. */
    public readonly input: NodeAssetConnectionPoint;
    /** The processed Universal payload. */
    public readonly output: NodeAssetConnectionPoint;
    /** Whether otherwise equivalent mesh resources with different names remain separate. */
    public keepUniqueNames = false;

    /**
     * Creates a Reuse Identical Meshes block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Reuses identical mesh resources and forwards the same Universal payload. */
    public override async _buildBlockAsync(): Promise<void> {
        const { dedup } = await import("@gltf-transform/functions");
        await ApplyUniversalOperatorTransformsAsync(this, dedup({ propertyTypes: [PropertyType.MESH], keepUniqueNames: this.keepUniqueNames }));
    }

    /**
     * Serializes the mesh reuse configuration.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return { ...super.serialize(), keepUniqueNames: this.keepUniqueNames };
    }

    /**
     * Restores the mesh reuse configuration.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.keepUniqueNames = GetSerializedBoolean(serializationObject, "keepUniqueNames", false);
    }
}

RegisterBlock(ReuseIdenticalMeshesBlock.ClassName, (name, nodeAsset) => new ReuseIdenticalMeshesBlock(name, nodeAsset));
