import { PropertyType } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyUniversalOperatorTransformsAsync } from "./operatorSupport";

/** Deduplicates equivalent accessor and skin data in a Universal payload. */
export class DeduplicateDataBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DeduplicateDataBlock";

    /** The Universal payload to process. */
    public readonly input: NodeAssetConnectionPoint;
    /** The processed Universal payload. */
    public readonly output: NodeAssetConnectionPoint;
    /** Whether otherwise equivalent named data remains separate when supported by the resource type. */
    public keepUniqueNames = false;

    /**
     * Creates a Deduplicate Data block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Deduplicates accessor and skin data and forwards the same Universal payload. */
    public override async _buildBlockAsync(): Promise<void> {
        const { dedup } = await import("@gltf-transform/functions");
        await ApplyUniversalOperatorTransformsAsync(this, dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.SKIN], keepUniqueNames: this.keepUniqueNames }));
    }

    /**
     * Serializes the shared-data deduplication configuration.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return { ...super.serialize(), keepUniqueNames: this.keepUniqueNames };
    }

    /**
     * Restores the shared-data deduplication configuration.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.keepUniqueNames = GetSerializedBoolean(serializationObject, "keepUniqueNames", false);
    }
}

RegisterBlock(DeduplicateDataBlock.ClassName, (name, nodeAsset) => new DeduplicateDataBlock(name, nodeAsset));
