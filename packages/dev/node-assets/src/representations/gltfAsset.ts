import { type Document } from "@gltf-transform/core";
import { cloneDocument } from "@gltf-transform/functions";

import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { ValidateAndFreezeAssetMetadata } from "./immutableMetadata";

/** Immutable caller-supplied metadata for a {@link GltfAsset}. */
export interface IGltfAssetMetadata {
    /** Stable identity for the represented asset. */
    readonly identity: string;
    /** Stable revision represented by the wrapped document. */
    readonly revision: number;
    /** Representation facts surfaced to later build and editor layers. */
    readonly manifest: NodeAssetJsonObject;
}

/** Owns a live glTF-Transform document and deterministic metadata. */
export class GltfAsset {
    /** The owned live glTF-Transform document. */
    public readonly document: Document;
    /** Stable caller-supplied asset identity. */
    public readonly identity: string;
    /** Caller-supplied document revision. */
    public readonly revision: number;
    /** Deeply frozen representation facts. */
    public readonly manifest: Readonly<NodeAssetJsonObject>;

    private _isDisposed = false;

    /**
     * Creates a glTF representation payload.
     * @param document The live document owned by this payload.
     * @param metadata Stable caller-supplied identity, revision, and manifest.
     */
    public constructor(document: Document, metadata: IGltfAssetMetadata) {
        const validatedMetadata = ValidateAndFreezeAssetMetadata(metadata);
        this.document = document;
        this.identity = validatedMetadata.identity;
        this.revision = validatedMetadata.revision;
        this.manifest = validatedMetadata.manifest;
    }

    /** Whether this representation was released by its build scope. */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Structurally clones the document while preserving immutable metadata.
     * @returns A value-like copy suitable for an independent consumer.
     */
    public clone(): GltfAsset {
        return new GltfAsset(cloneDocument(this.document), {
            identity: this.identity,
            revision: this.revision,
            manifest: this.manifest,
        });
    }

    /** Releases this wrapper's build ownership once. */
    public dispose(): void {
        this._isDisposed = true;
    }
}

/**
 * Tests whether a runtime connection value is a glTF representation payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link GltfAsset}.
 */
export function IsGltfAsset(value: unknown): value is GltfAsset {
    return value instanceof GltfAsset;
}

/**
 * Narrows a runtime connection value to a glTF representation payload.
 * @param value The value to narrow.
 * @param connectionName The connection point name used in an invalid-value error.
 * @returns The narrowed glTF payload.
 */
export function GetGltfAsset(value: unknown, connectionName: string): GltfAsset {
    if (!IsGltfAsset(value)) {
        throw new Error(`The "${connectionName}" connection point did not receive a GltfAsset.`);
    }
    return value;
}
