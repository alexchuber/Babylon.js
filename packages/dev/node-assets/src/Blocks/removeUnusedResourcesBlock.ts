import { PropertyType } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Property types that Remove Unused Resources can preserve. */
export const RemovableResourcePropertyTypes = [
    PropertyType.NODE,
    PropertyType.SKIN,
    PropertyType.MESH,
    PropertyType.CAMERA,
    PropertyType.PRIMITIVE,
    PropertyType.PRIMITIVE_TARGET,
    PropertyType.ANIMATION,
    PropertyType.MATERIAL,
    PropertyType.TEXTURE,
    PropertyType.ACCESSOR,
    PropertyType.BUFFER,
] as const;

/** A resource property type that Remove Unused Resources can preserve. */
export type RemovableResourcePropertyType = (typeof RemovableResourcePropertyTypes)[number];

const RemovableResourcePropertyTypeSet: ReadonlySet<string> = new Set(RemovableResourcePropertyTypes);

/** Removes unused resources from Universal content. */
export class RemoveUnusedResourcesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "RemoveUnusedResourcesBlock";

    /** The Universal content to clean. */
    public readonly input: NodeAssetConnectionPoint;

    /** The cleaned Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Resource property types excluded from removal. */
    public keptPropertyTypes: RemovableResourcePropertyType[] = [];

    /** Whether empty leaf nodes should be kept. */
    public keepLeafNodes = false;

    /** Whether unused vertex attributes should be kept. */
    public keepAttributes = false;

    /** Whether single-color textures should be kept instead of converted to factors. */
    public keepSolidTextures = false;

    /** Whether custom extras should prevent a resource from being removed. */
    public keepExtras = false;

    /**
     * Creates a Remove Unused Resources block.
     * @param name The display name of the block.
     * @param nodeAsset The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Removes the configured unused resources and passes the content to the output. */
    public override async _buildBlockAsync(): Promise<void> {
        const { prune } = await import("@gltf-transform/functions");
        const keptTypes = new Set(this.keptPropertyTypes);
        await ApplyOperatorTransformsAsync(
            this,
            prune({
                propertyTypes: RemovableResourcePropertyTypes.filter((propertyType) => !keptTypes.has(propertyType)),
                keepLeaves: this.keepLeafNodes,
                keepAttributes: this.keepAttributes,
                keepSolidTextures: this.keepSolidTextures,
                keepExtras: this.keepExtras,
            })
        );
    }

    /**
     * Serializes this block's options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.keptPropertyTypes = [...this.keptPropertyTypes];
        serializationObject.keepLeafNodes = this.keepLeafNodes;
        serializationObject.keepAttributes = this.keepAttributes;
        serializationObject.keepSolidTextures = this.keepSolidTextures;
        serializationObject.keepExtras = this.keepExtras;
        return serializationObject;
    }

    /**
     * Restores this block's options.
     * @param serializationObject The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.keptPropertyTypes = ParseKeptPropertyTypes(serializationObject.keptPropertyTypes);
        this.keepLeafNodes = GetSerializedBoolean(serializationObject, "keepLeafNodes", false);
        this.keepAttributes = GetSerializedBoolean(serializationObject, "keepAttributes", false);
        this.keepSolidTextures = GetSerializedBoolean(serializationObject, "keepSolidTextures", false);
        this.keepExtras = GetSerializedBoolean(serializationObject, "keepExtras", false);
    }
}

function ParseKeptPropertyTypes(value: unknown): RemovableResourcePropertyType[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || !value.every((entry): entry is RemovableResourcePropertyType => typeof entry === "string" && RemovableResourcePropertyTypeSet.has(entry))) {
        throw new TypeError('Invalid serialized block property "keptPropertyTypes".');
    }
    return [...new Set(value)];
}

RegisterBlock(RemoveUnusedResourcesBlock.ClassName, (name, nodeAsset) => new RemoveUnusedResourcesBlock(name, nodeAsset));
