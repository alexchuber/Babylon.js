import { type Nullable } from "core/types";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { NodeGeometrySource, type NodeGeometrySourceKind } from "../representations/nodeGeometrySource";
import { GetSerializedNullableString, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** Fetches resolved serialized Node Geometry bytes for a snippet ID. */
export type NodeGeometrySnippetFetcher = (snippetId: string) => Promise<Uint8Array>;

/** Reads a snippet ID or uploaded serialized graph into a shallow Node Geometry source payload. */
export class ReadNodeGeometryBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadNodeGeometryBlock";

    /** Resolved serialized Node Geometry bytes. */
    public data: Nullable<Uint8Array> = null;
    /** The active snippet ID or uploaded file name. */
    public source: Nullable<string> = null;
    /** Whether the active source came from a snippet or upload. */
    public sourceKind: Nullable<NodeGeometrySourceKind> = null;
    /** The shallow Node Geometry source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _sourceAttempt = 0;
    private _lastSuccessfulSourceAttempt = 0;

    /**
     * Creates a Node Geometry read block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    }

    /**
     * Validates and activates an uploaded serialized Node Geometry graph.
     * @param data The uploaded JSON bytes.
     * @param fileName The uploaded file name.
     */
    public async setUploadedSourceAsync(data: Uint8Array, fileName: string): Promise<void> {
        const sourceAttempt = ++this._sourceAttempt;
        ValidateSerializedNodeGeometry(data);
        this._activateSource(sourceAttempt, data, fileName, "upload");
    }

    /**
     * Resolves and activates a Node Geometry snippet.
     * @param snippetId The snippet ID, with or without a leading hash.
     * @param fetcher The snippet resolver.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     */
    public async setSnippetIdAsync(
        snippetId: string,
        fetcher: NodeGeometrySnippetFetcher = FetchNodeGeometrySnippetAsync,
        canApplyResult: () => boolean = () => true
    ): Promise<void> {
        const sourceAttempt = ++this._sourceAttempt;
        const normalizedSnippetId = snippetId.replace(/^#/, "");
        if (!normalizedSnippetId) {
            throw new Error("A Node Geometry snippet ID is required.");
        }
        let data: Uint8Array;
        try {
            data = await fetcher(normalizedSnippetId);
            ValidateSerializedNodeGeometry(data);
        } catch (error) {
            if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
                return;
            }
            throw error;
        }
        if (!canApplyResult()) {
            return;
        }
        this._activateSource(sourceAttempt, data, normalizedSnippetId, "snippet");
    }

    /** Clears the active source and prevents older pending snippet requests from replacing it. */
    public clearSource(): void {
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this.data = null;
        this.source = null;
        this.sourceKind = null;
    }

    /**
     * Emits the active resolved source without parsing or evaluating the graph.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        if (!this.data || !this.source || !this.sourceKind) {
            throw new Error(`The "${this.name}" read block has no Node Geometry source.`);
        }
        scope?.accountSourceBytes(this.data.byteLength);
        this.output.value = new NodeGeometrySource(this.data, {
            source: this.source,
            sourceKind: this.sourceKind,
        });
    }

    /**
     * Serializes the resolved source bytes and active source identity.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return {
            ...super.serialize(),
            data: this.data ? EncodeArrayBufferToBase64(this.data) : null,
            source: this.source,
            sourceKind: this.sourceKind ?? "",
        };
    }

    /**
     * Restores the resolved source bytes and active source identity.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const data = GetSerializedNullableString(serializationObject, "data");
        this.data = data ? new Uint8Array(DecodeBase64ToBinary(data)) : null;
        this.source = GetSerializedNullableString(serializationObject, "source");
        this.sourceKind = GetSerializedStringUnion(serializationObject, "sourceKind", ["snippet", "upload", ""] as const, "") || null;
    }

    private _activateSource(sourceAttempt: number, data: Uint8Array, source: string, sourceKind: NodeGeometrySourceKind): void {
        if (sourceAttempt < this._lastSuccessfulSourceAttempt) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this.data = data.slice();
        this.source = source;
        this.sourceKind = sourceKind;
    }
}

async function FetchNodeGeometrySnippetAsync(snippetId: string): Promise<Uint8Array> {
    const response = await fetch(`${NodeGeometry.SnippetUrl}/${snippetId.replace(/#/g, "/")}`);
    if (!response.ok) {
        throw new Error(`Could not load Node Geometry snippet "${snippetId}" (${response.status} ${response.statusText}).`);
    }

    const responseBody: unknown = await response.json();
    if (!IsRecord(responseBody) || typeof responseBody.jsonPayload !== "string") {
        throw new TypeError(`Node Geometry snippet "${snippetId}" returned an invalid response.`);
    }
    const payload: unknown = JSON.parse(responseBody.jsonPayload);
    if (!IsRecord(payload) || typeof payload.nodeGeometry !== "string") {
        throw new TypeError(`Node Geometry snippet "${snippetId}" returned an invalid payload.`);
    }
    return new TextEncoder().encode(payload.nodeGeometry);
}

function ValidateSerializedNodeGeometry(data: Uint8Array): void {
    const serialization: unknown = JSON.parse(new TextDecoder().decode(data));
    if (!IsRecord(serialization) || !Array.isArray(serialization.blocks)) {
        throw new TypeError("Node Geometry source must contain a serialized graph.");
    }
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

RegisterBlock(ReadNodeGeometryBlock.ClassName, (name, nodeAsset) => new ReadNodeGeometryBlock(name, nodeAsset));
