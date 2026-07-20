import { type Accessor, BufferUtils, PropertyType, type Transform } from "@gltf-transform/core";

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
    /** Whether otherwise equivalent named data remains separate. */
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
        await ApplyUniversalOperatorTransformsAsync(
            this,
            CreateAccessorDedupTransform(this.keepUniqueNames),
            dedup({ propertyTypes: [PropertyType.SKIN], keepUniqueNames: this.keepUniqueNames })
        );
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

// glTF-Transform 4.4.1 omits morph targets and skin inverse-bind matrices, and ignores keepUniqueNames for accessors.
function CreateAccessorDedupTransform(keepUniqueNames: boolean): Transform {
    return (document) => {
        const indices = new Map<string, Set<Accessor>>();
        const attributes = new Map<string, Set<Accessor>>();
        const animationInputs = new Map<string, Set<Accessor>>();
        const animationOutputs = new Map<string, Set<Accessor>>();
        const inverseBindMatrices = new Map<string, Set<Accessor>>();
        const meshes = document.getRoot().listMeshes();

        for (const mesh of meshes) {
            for (const primitive of mesh.listPrimitives()) {
                for (const accessor of primitive.listAttributes()) {
                    AddAccessorToGroup(accessor, attributes, keepUniqueNames);
                }
                // Primitive and morph-target attributes share ARRAY_BUFFER usage, so byte-identical accessors are interchangeable.
                for (const target of primitive.listTargets()) {
                    for (const accessor of target.listAttributes()) {
                        AddAccessorToGroup(accessor, attributes, keepUniqueNames);
                    }
                }
                AddAccessorToGroup(primitive.getIndices(), indices, keepUniqueNames);
            }
        }

        for (const animation of document.getRoot().listAnimations()) {
            for (const sampler of animation.listSamplers()) {
                AddAccessorToGroup(sampler.getInput(), animationInputs, keepUniqueNames);
                AddAccessorToGroup(sampler.getOutput(), animationOutputs, keepUniqueNames);
            }
        }

        for (const skin of document.getRoot().listSkins()) {
            AddAccessorToGroup(skin.getInverseBindMatrices(), inverseBindMatrices, keepUniqueNames);
        }

        const duplicates = FindDuplicateAccessors([attributes, indices, animationInputs, animationOutputs, inverseBindMatrices]);
        ReplaceDuplicateAccessors(duplicates);
    };
}

function AddAccessorToGroup(accessor: Accessor | null, groups: Map<string, Set<Accessor>>, keepUniqueNames: boolean): void {
    if (!accessor) {
        return;
    }

    const key = JSON.stringify([
        keepUniqueNames ? accessor.getName() : null,
        accessor.getCount(),
        accessor.getType(),
        accessor.getComponentType(),
        accessor.getNormalized(),
        accessor.getSparse(),
    ]);
    let group = groups.get(key);
    if (!group) {
        group = new Set<Accessor>();
        groups.set(key, group);
    }
    group.add(accessor);
}

function FindDuplicateAccessors(groups: Map<string, Set<Accessor>>[]): Map<Accessor, Accessor> {
    const duplicates = new Map<Accessor, Accessor>();
    for (const groupMap of groups) {
        for (const group of groupMap.values()) {
            const accessors = Array.from(group);
            for (let firstIndex = 0; firstIndex < accessors.length; firstIndex++) {
                const first = accessors[firstIndex];
                const firstArray = first.getArray();
                if (!firstArray || duplicates.has(first)) {
                    continue;
                }

                const firstData = BufferUtils.toView(firstArray);
                for (let secondIndex = firstIndex + 1; secondIndex < accessors.length; secondIndex++) {
                    const second = accessors[secondIndex];
                    const secondArray = second.getArray();
                    if (!secondArray || duplicates.has(second)) {
                        continue;
                    }
                    if (BufferUtils.equals(firstData, BufferUtils.toView(secondArray))) {
                        duplicates.set(second, first);
                    }
                }
            }
        }
    }
    return duplicates;
}

function ReplaceDuplicateAccessors(duplicates: Map<Accessor, Accessor>): void {
    for (const [accessor, replacement] of duplicates) {
        for (const parent of accessor.listParents()) {
            if (parent.propertyType !== PropertyType.ROOT) {
                parent.swap(accessor, replacement);
            }
        }
        accessor.dispose();
    }
}

RegisterBlock(DeduplicateDataBlock.ClassName, (name, nodeAsset) => new DeduplicateDataBlock(name, nodeAsset));
