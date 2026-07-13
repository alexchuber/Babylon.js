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
     * @param evaluatedVertexData An optional evaluated snapshot to clone and freeze.
     */
    public constructor(nodeGeometry: NodeGeometry, metadata: INodeGeometryAssetMetadata, evaluatedVertexData?: VertexData) {
        const validatedMetadata = ValidateAndFreezeAssetMetadata(metadata);
        this.nodeGeometry = nodeGeometry;
        this.identity = validatedMetadata.identity;
        this.revision = validatedMetadata.revision;
        this.manifest = validatedMetadata.manifest;
        this.evaluatedVertexData = evaluatedVertexData ? DeepFreeze(VertexData.Parse(evaluatedVertexData.serialize())) : undefined;
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
