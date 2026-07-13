import { RegisterAllNodeGeometryBlocks } from "core/Meshes/Node/Blocks/allBlocks.pure";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { VertexData } from "core/Meshes/mesh.vertexData";

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
        this.evaluatedVertexData = evaluatedVertexData ? CloneAndValidateVertexData(evaluatedVertexData) : undefined;
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

    const snapshot = VertexData.Parse(vertexData.serialize());
    const positions = ValidateVertexAttribute("positions", snapshot.positions, 3);
    const vertexCount = positions.length / 3;
    const attributes: ReadonlyArray<readonly [string, ArrayLike<number> | null | undefined, number]> = [
        ["normals", snapshot.normals, 3],
        ["tangents", snapshot.tangents, 4],
        ["uvs", snapshot.uvs, 2],
        ["uvs2", snapshot.uvs2, 2],
        ["uvs3", snapshot.uvs3, 2],
        ["uvs4", snapshot.uvs4, 2],
        ["uvs5", snapshot.uvs5, 2],
        ["uvs6", snapshot.uvs6, 2],
        ["colors", snapshot.colors, 4],
        ["matricesIndices", snapshot.matricesIndices, 4],
        ["matricesWeights", snapshot.matricesWeights, 4],
        ["matricesIndicesExtra", snapshot.matricesIndicesExtra, 4],
        ["matricesWeightsExtra", snapshot.matricesWeightsExtra, 4],
    ];
    for (const [name, values, stride] of attributes) {
        if (values == null) {
            continue;
        }
        const attribute = ValidateVertexAttribute(name, values, stride);
        if (attribute.length / stride !== vertexCount) {
            throw new TypeError(`The evaluated VertexData snapshot ${name} count must match its position count.`);
        }
    }

    if (snapshot.indices) {
        for (const index of snapshot.indices) {
            if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
                throw new TypeError("The evaluated VertexData snapshot indices must reference existing vertices.");
            }
        }
    }

    return DeepFreeze(snapshot);
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
