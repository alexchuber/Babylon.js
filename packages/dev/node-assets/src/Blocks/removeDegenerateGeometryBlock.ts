import { ComponentTypeToTypedArray, type Document, Primitive, type Transform } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNumber, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Default maximum doubled triangle area treated as degenerate. */
export const DefaultDegenerateGeometryTolerance = 1e-8;

/** Removes zero-area and near-zero-area triangles from Universal content. */
export class RemoveDegenerateGeometryBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "RemoveDegenerateGeometryBlock";

    /** The Universal content to clean. */
    public readonly input: NodeAssetConnectionPoint;

    /** The cleaned Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Maximum doubled triangle area treated as degenerate. */
    public tolerance = DefaultDegenerateGeometryTolerance;

    /**
     * Creates a Remove Degenerate Geometry block.
     * @param name The display name of the block.
     * @param nodeAsset The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Removes degenerate triangles and passes the content to the output. */
    public override async _buildBlockAsync(): Promise<void> {
        if (!Number.isFinite(this.tolerance) || this.tolerance < 0) {
            throw new Error(`The "${this.name}" tolerance must be a finite non-negative number.`);
        }
        await ApplyOperatorTransformsAsync(this, CreateRemoveDegenerateGeometryTransform(this.tolerance));
    }

    /**
     * Serializes this block's options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.tolerance = this.tolerance;
        return serializationObject;
    }

    /**
     * Restores this block's options.
     * @param serializationObject The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const tolerance = GetSerializedNumber(serializationObject, "tolerance", DefaultDegenerateGeometryTolerance);
        if (tolerance < 0) {
            throw new TypeError('Invalid serialized block property "tolerance".');
        }
        this.tolerance = tolerance;
    }
}

function CreateRemoveDegenerateGeometryTransform(tolerance: number): Transform {
    return (document: Document) => {
        for (const mesh of document.getRoot().listMeshes()) {
            for (const primitive of mesh.listPrimitives()) {
                if (RemoveDegenerateTriangles(document, primitive, tolerance)) {
                    mesh.removePrimitive(primitive);
                    primitive.dispose();
                }
            }
            if (mesh.listPrimitives().length === 0) {
                mesh.dispose();
            }
        }
    };
}

function RemoveDegenerateTriangles(document: Document, primitive: Primitive, tolerance: number): boolean {
    if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
        return false;
    }
    const positions = primitive.getAttribute("POSITION");
    const positionArray = positions?.getArray();
    if (!positions || !positionArray) {
        return false;
    }

    const indices = primitive.getIndices();
    const sourceIndices = indices?.getArray() ?? CreateSequentialIndices(positions.getCount());
    const keptIndices: number[] = [];
    const toleranceSquared = tolerance * tolerance;
    for (let index = 0; index + 2 < sourceIndices.length; index += 3) {
        const a = sourceIndices[index];
        const b = sourceIndices[index + 1];
        const c = sourceIndices[index + 2];
        if (GetDoubledAreaSquared(positionArray, a, b, c) > toleranceSquared) {
            keptIndices.push(a, b, c);
        }
    }
    if (keptIndices.length === sourceIndices.length) {
        return false;
    }
    if (keptIndices.length === 0) {
        return true;
    }

    if (indices) {
        const typedArrayConstructor = ComponentTypeToTypedArray[indices.getComponentType()];
        primitive.setIndices(indices.clone().setArray(new typedArrayConstructor(keptIndices)));
        if (indices.listParents().length === 1) {
            indices.dispose();
        }
    } else {
        const typedArrayConstructor = positions.getCount() <= 65535 ? Uint16Array : Uint32Array;
        primitive.setIndices(
            document
                .createAccessor()
                .setType("SCALAR")
                .setArray(new typedArrayConstructor(keptIndices))
                .setBuffer(positions.getBuffer() ?? document.createBuffer())
        );
    }
    return false;
}

function CreateSequentialIndices(vertexCount: number): Uint32Array {
    const indices = new Uint32Array(vertexCount);
    for (let index = 0; index < vertexCount; index++) {
        indices[index] = index;
    }
    return indices;
}

function GetDoubledAreaSquared(positions: ArrayLike<number>, a: number, b: number, c: number): number {
    const abX = positions[b * 3] - positions[a * 3];
    const abY = positions[b * 3 + 1] - positions[a * 3 + 1];
    const abZ = positions[b * 3 + 2] - positions[a * 3 + 2];
    const acX = positions[c * 3] - positions[a * 3];
    const acY = positions[c * 3 + 1] - positions[a * 3 + 1];
    const acZ = positions[c * 3 + 2] - positions[a * 3 + 2];
    const crossX = abY * acZ - abZ * acY;
    const crossY = abZ * acX - abX * acZ;
    const crossZ = abX * acY - abY * acX;
    return crossX * crossX + crossY * crossY + crossZ * crossZ;
}

RegisterBlock(RemoveDegenerateGeometryBlock.ClassName, (name, nodeAsset) => new RemoveDegenerateGeometryBlock(name, nodeAsset));
