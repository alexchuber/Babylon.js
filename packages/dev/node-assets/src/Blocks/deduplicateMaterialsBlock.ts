import { PropertyType } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyUniversalOperatorTransformsAsync } from "./operatorSupport";

/** Deduplicates equivalent materials in a Universal payload. */
export class DeduplicateMaterialsBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DeduplicateMaterialsBlock";

    /** The Universal payload to process. */
    public readonly input: NodeAssetConnectionPoint;
    /** The processed Universal payload. */
    public readonly output: NodeAssetConnectionPoint;
    /** Whether otherwise equivalent materials with different names remain separate. */
    public keepUniqueNames = false;

    /**
     * Creates a Deduplicate Materials block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Deduplicates materials and forwards the same Universal payload. */
    public override async _buildBlockAsync(): Promise<void> {
        const { dedup } = await import("@gltf-transform/functions");
        await ApplyUniversalOperatorTransformsAsync(this, dedup({ propertyTypes: [PropertyType.MATERIAL], keepUniqueNames: this.keepUniqueNames }));
    }

    /**
     * Serializes the material deduplication configuration.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return { ...super.serialize(), keepUniqueNames: this.keepUniqueNames };
    }

    /**
     * Restores the material deduplication configuration.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.keepUniqueNames = GetSerializedBoolean(serializationObject, "keepUniqueNames", false);
    }
}

RegisterBlock(DeduplicateMaterialsBlock.ClassName, (name, nodeAsset) => new DeduplicateMaterialsBlock(name, nodeAsset));
