import { RegisterAllNodeGeometryBlocks } from "core/Meshes/Node/Blocks/allBlocks.pure";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { VertexData, VertexDataMaterialInfo } from "core/Meshes/mesh.vertexData";

import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { DeepFreeze, ValidateAndFreezeAssetMetadata } from "./immutableMetadata";

RegisterAllNodeGeometryBlocks();

/** Immutable caller-supplied metadata for a {@link NodeGeometryAsset}. */
export interface INodeGeometryAssetMetadata {
    /** Stable identity for the represented asset. */
    readonly identity: string;
    /** Stable revision represented by the graph and optional snapshot. */
    readonly revision: number;
    /** Representation facts surfaced to later build and editor layers. */
    readonly manifest: NodeAssetJsonObject;
}

/** Owns an unevaluated NodeGeometry graph and an optional frozen evaluated VertexData snapshot. */
export class NodeGeometryAsset {
    /** The owned parsed, unevaluated graph. */
    public readonly nodeGeometry: NodeGeometry;
    /** The optional owned, deeply frozen evaluated geometry snapshot. */
    public readonly evaluatedVertexData: Readonly<VertexData> | undefined;
    /** Stable caller-supplied asset identity. */
    public readonly identity: string;
    /** Caller-supplied graph/snapshot revision. */
    public readonly revision: number;
    /** Deeply frozen representation facts. */
    public readonly manifest: Readonly<NodeAssetJsonObject>;

    private _isDisposed = false;

    /**
     * Creates a NodeGeometry resource payload.
     * @param nodeGeometry The parsed, unevaluated graph owned by this payload.
     * @param metadata Stable caller-supplied identity, revision, and manifest.
     * @param evaluatedVertexData An optional evaluated snapshot to validate, clone, and freeze.
     */
    public constructor(nodeGeometry: NodeGeometry, metadata: INodeGeometryAssetMetadata, evaluatedVertexData?: VertexData) {
        const validatedMetadata = ValidateAndFreezeAssetMetadata(metadata);
        this.nodeGeometry = nodeGeometry;
        this.identity = validatedMetadata.identity;
        this.revision = validatedMetadata.revision;
        this.manifest = validatedMetadata.manifest;
        this.evaluatedVertexData = evaluatedVertexData === undefined ? undefined : CloneAndValidateVertexData(evaluatedVertexData);
    }

    /** Whether this resource was disposed by its build scope. */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Clones the unevaluated graph through serialization without invoking `build`.
     * @returns A full-fidelity independent resource with a copied optional snapshot.
     */
    public cloneForFanOut(): NodeGeometryAsset {
        const sourceSerialization = this.nodeGeometry.serialize();
        const parseInput = structuredClone(sourceSerialization);
        const clone = new NodeGeometry(parseInput.name);
        clone.parseSerializedObject(parseInput);
        for (let index = 0; index < clone.attachedBlocks.length; index++) {
            clone.attachedBlocks[index].uniqueId = sourceSerialization.blocks[index].id;
        }
        clone.editorData = structuredClone(sourceSerialization.editorData);
        return new NodeGeometryAsset(
            clone,
            {
                identity: this.identity,
                revision: this.revision,
                manifest: this.manifest,
            },
            this.evaluatedVertexData as VertexData | undefined
        );
    }

    /** Disposes the owned graph once. */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this.nodeGeometry.dispose();
    }
}

/**
 * Tests whether a runtime connection value is a NodeGeometry resource payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link NodeGeometryAsset}.
 */
export function IsNodeGeometryAsset(value: unknown): value is NodeGeometryAsset {
    return value instanceof NodeGeometryAsset;
}

function CloneAndValidateVertexData(vertexData: VertexData): Readonly<VertexData> {
    if (!(vertexData instanceof VertexData)) {
        throw new TypeError("The evaluated VertexData snapshot must be a VertexData instance.");
    }

    const positions = ValidateVertexAttribute("positions", vertexData.positions, 3);
    const vertexCount = positions.length / 3;

    const snapshot = new VertexData();
    snapshot.positions = Array.from(positions);
    snapshot.normals = CloneOptionalVertexAttribute("normals", vertexData.normals, 3, vertexCount);
    snapshot.tangents = CloneOptionalVertexAttribute("tangents", vertexData.tangents, 4, vertexCount);
    snapshot.uvs = CloneOptionalVertexAttribute("uvs", vertexData.uvs, 2, vertexCount);
    snapshot.uvs2 = CloneOptionalVertexAttribute("uvs2", vertexData.uvs2, 2, vertexCount);
    snapshot.uvs3 = CloneOptionalVertexAttribute("uvs3", vertexData.uvs3, 2, vertexCount);
    snapshot.uvs4 = CloneOptionalVertexAttribute("uvs4", vertexData.uvs4, 2, vertexCount);
    snapshot.uvs5 = CloneOptionalVertexAttribute("uvs5", vertexData.uvs5, 2, vertexCount);
    snapshot.uvs6 = CloneOptionalVertexAttribute("uvs6", vertexData.uvs6, 2, vertexCount);
    snapshot.colors = CloneOptionalVertexAttribute("colors", vertexData.colors, 4, vertexCount);
    snapshot.matricesIndices = CloneOptionalVertexAttribute("matricesIndices", vertexData.matricesIndices, 4, vertexCount);
    snapshot.matricesWeights = CloneOptionalVertexAttribute("matricesWeights", vertexData.matricesWeights, 4, vertexCount);
    snapshot.matricesIndicesExtra = CloneOptionalVertexAttribute("matricesIndicesExtra", vertexData.matricesIndicesExtra, 4, vertexCount);
    snapshot.matricesWeightsExtra = CloneOptionalVertexAttribute("matricesWeightsExtra", vertexData.matricesWeightsExtra, 4, vertexCount);

    if (vertexData.indices) {
        for (const index of vertexData.indices) {
            if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
                throw new TypeError("The evaluated VertexData snapshot indices must reference existing vertices.");
            }
        }
        snapshot.indices = Array.from(vertexData.indices);
    } else {
        snapshot.indices = null;
    }
    snapshot.materialInfos = vertexData.materialInfos
        ? vertexData.materialInfos.map((info) =>
              Object.assign(new VertexDataMaterialInfo(), {
                  materialIndex: info.materialIndex,
                  verticesStart: info.verticesStart,
                  verticesCount: info.verticesCount,
                  indexStart: info.indexStart,
                  indexCount: info.indexCount,
              })
          )
        : null;
    snapshot.hasVertexAlpha = vertexData.hasVertexAlpha;
    try {
        snapshot.metadata = structuredClone(vertexData.metadata);
    } catch {
        throw new TypeError("The evaluated VertexData snapshot metadata must be structured-cloneable.");
    }

    return DeepFreeze(snapshot);
}

function CloneOptionalVertexAttribute(name: string, values: ArrayLike<number> | null | undefined, stride: number, vertexCount: number): number[] | null {
    if (values == null) {
        return null;
    }
    const attribute = ValidateVertexAttribute(name, values, stride);
    if (attribute.length / stride !== vertexCount) {
        throw new TypeError(`The evaluated VertexData snapshot ${name} count must match its position count.`);
    }
    return Array.from(attribute);
}

function ValidateVertexAttribute(name: string, values: ArrayLike<number> | null | undefined, stride: number): ArrayLike<number> {
    if (values == null) {
        throw new TypeError(`The evaluated VertexData snapshot requires ${name}.`);
    }
    if (values.length % stride !== 0) {
        throw new TypeError(`The evaluated VertexData snapshot ${name} length must be a multiple of ${stride}.`);
    }
    for (let index = 0; index < values.length; index++) {
        if (!Number.isFinite(values[index])) {
            throw new TypeError(`The evaluated VertexData snapshot ${name} must contain only finite numbers.`);
        }
    }
    return values;
}
