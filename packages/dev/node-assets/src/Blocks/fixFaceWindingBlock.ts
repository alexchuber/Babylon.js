import { MathUtils, type Accessor, type Document, Primitive, type Transform } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

type EdgeOccurrence = {
    readonly triangleIndex: number;
    readonly direction: 1 | -1;
};

type WindingConstraint = {
    readonly triangleIndex: number;
    readonly mustFlipRelativeToSource: boolean;
};

/** Makes adjacent triangle winding consistent in Universal content. */
export class FixFaceWindingBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FixFaceWindingBlock";

    /** The Universal content whose face winding should be fixed. */
    public readonly input: NodeAssetConnectionPoint;

    /** The Universal content with consistent adjacent face winding. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Fix Face Winding block.
     * @param name The display name of the block.
     * @param nodeAsset The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Makes adjacent triangle winding consistent and passes the content to the output. */
    public override async _buildBlockAsync(): Promise<void> {
        await ApplyOperatorTransformsAsync(this, CreateFixFaceWindingTransform());
    }
}

function CreateFixFaceWindingTransform(): Transform {
    return (document: Document) => {
        for (const mesh of document.getRoot().listMeshes()) {
            for (const primitive of mesh.listPrimitives()) {
                FixPrimitiveFaceWinding(document, primitive);
            }
        }
    };
}

function FixPrimitiveFaceWinding(document: Document, primitive: Primitive): void {
    let indices = primitive.getIndices();
    if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
        return;
    }
    const positions = primitive.getAttribute("POSITION");
    if (!indices && positions) {
        const typedArrayConstructor = positions.getCount() <= 65535 ? Uint16Array : Uint32Array;
        const sequentialIndices = new typedArrayConstructor(positions.getCount());
        for (let index = 0; index < sequentialIndices.length; index++) {
            sequentialIndices[index] = index;
        }
        indices = document
            .createAccessor()
            .setType("SCALAR")
            .setArray(sequentialIndices)
            .setBuffer(positions.getBuffer() ?? document.createBuffer());
        primitive.setIndices(indices);
    }
    if (!indices) {
        return;
    }
    if (indices.listParents().length > 2) {
        indices = indices.clone();
        primitive.setIndices(indices);
    }
    const normals = primitive.getAttribute("NORMAL");
    const positionArray = positions?.getArray();
    const normalArray = normals?.getArray();
    if (positions && normals && positionArray && normalArray && positions.getCount() === normals.getCount()) {
        FixFaceWindingFromNormals(indices, positionArray, normals, normalArray);
        return;
    }

    const triangleCount = Math.floor(indices.getCount() / 3);
    const edgeOccurrences = new Map<string, EdgeOccurrence[]>();
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
        const offset = triangleIndex * 3;
        const a = indices.getScalar(offset);
        const b = indices.getScalar(offset + 1);
        const c = indices.getScalar(offset + 2);
        AddEdgeOccurrence(edgeOccurrences, a, b, triangleIndex);
        AddEdgeOccurrence(edgeOccurrences, b, c, triangleIndex);
        AddEdgeOccurrence(edgeOccurrences, c, a, triangleIndex);
    }

    const constraints = Array.from({ length: triangleCount }, () => [] as WindingConstraint[]);
    for (const occurrences of edgeOccurrences.values()) {
        const source = occurrences[0];
        for (let occurrenceIndex = 1; occurrenceIndex < occurrences.length; occurrenceIndex++) {
            const destination = occurrences[occurrenceIndex];
            if (source.triangleIndex === destination.triangleIndex) {
                continue;
            }
            const mustFlip = source.direction === destination.direction;
            constraints[source.triangleIndex].push({ triangleIndex: destination.triangleIndex, mustFlipRelativeToSource: mustFlip });
            constraints[destination.triangleIndex].push({ triangleIndex: source.triangleIndex, mustFlipRelativeToSource: mustFlip });
        }
    }

    const shouldFlip: Array<boolean | undefined> = new Array(triangleCount);
    for (let rootTriangle = 0; rootTriangle < triangleCount; rootTriangle++) {
        if (shouldFlip[rootTriangle] !== undefined) {
            continue;
        }
        shouldFlip[rootTriangle] = false;
        const queue = [rootTriangle];
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
            const sourceTriangle = queue[queueIndex];
            for (const constraint of constraints[sourceTriangle]) {
                if (shouldFlip[constraint.triangleIndex] !== undefined) {
                    continue;
                }
                shouldFlip[constraint.triangleIndex] = shouldFlip[sourceTriangle]! !== constraint.mustFlipRelativeToSource;
                queue.push(constraint.triangleIndex);
            }
        }
    }

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
        if (!shouldFlip[triangleIndex]) {
            continue;
        }
        const offset = triangleIndex * 3;
        const b = indices.getScalar(offset + 1);
        const c = indices.getScalar(offset + 2);
        indices.setScalar(offset + 1, c);
        indices.setScalar(offset + 2, b);
    }
}

function FixFaceWindingFromNormals(
    indices: NonNullable<ReturnType<Primitive["getIndices"]>>,
    positions: ArrayLike<number>,
    normalAccessor: Accessor,
    normals: ArrayLike<number>
): void {
    for (let offset = 0; offset + 2 < indices.getCount(); offset += 3) {
        const a = indices.getScalar(offset);
        const b = indices.getScalar(offset + 1);
        const c = indices.getScalar(offset + 2);
        const abX = positions[b * 3] - positions[a * 3];
        const abY = positions[b * 3 + 1] - positions[a * 3 + 1];
        const abZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        const acX = positions[c * 3] - positions[a * 3];
        const acY = positions[c * 3 + 1] - positions[a * 3 + 1];
        const acZ = positions[c * 3 + 2] - positions[a * 3 + 2];
        const faceNormalX = abY * acZ - abZ * acY;
        const faceNormalY = abZ * acX - abX * acZ;
        const faceNormalZ = abX * acY - abY * acX;
        const vertexNormalX =
            GetNormalComponent(normals, a * 3, normalAccessor) + GetNormalComponent(normals, b * 3, normalAccessor) + GetNormalComponent(normals, c * 3, normalAccessor);
        const vertexNormalY =
            GetNormalComponent(normals, a * 3 + 1, normalAccessor) +
            GetNormalComponent(normals, b * 3 + 1, normalAccessor) +
            GetNormalComponent(normals, c * 3 + 1, normalAccessor);
        const vertexNormalZ =
            GetNormalComponent(normals, a * 3 + 2, normalAccessor) +
            GetNormalComponent(normals, b * 3 + 2, normalAccessor) +
            GetNormalComponent(normals, c * 3 + 2, normalAccessor);
        if (faceNormalX * vertexNormalX + faceNormalY * vertexNormalY + faceNormalZ * vertexNormalZ < 0) {
            indices.setScalar(offset + 1, c);
            indices.setScalar(offset + 2, b);
        }
    }
}

function GetNormalComponent(normals: ArrayLike<number>, index: number, accessor: Accessor): number {
    const value = normals[index];
    return accessor.getNormalized() ? MathUtils.decodeNormalizedInt(value, accessor.getComponentType()) : value;
}

function AddEdgeOccurrence(edgeOccurrences: Map<string, EdgeOccurrence[]>, start: number, end: number, triangleIndex: number): void {
    const minimum = Math.min(start, end);
    const maximum = Math.max(start, end);
    const key = `${minimum}:${maximum}`;
    const occurrences = edgeOccurrences.get(key) ?? [];
    occurrences.push({ triangleIndex, direction: start === minimum ? 1 : -1 });
    edgeOccurrences.set(key, occurrences);
}

RegisterBlock(FixFaceWindingBlock.ClassName, (name, nodeAsset) => new FixFaceWindingBlock(name, nodeAsset));
