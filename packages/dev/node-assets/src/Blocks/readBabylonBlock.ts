import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";
import { Tools } from "core/Misc/tools.pure";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { BabylonSource } from "../representations/babylonSource";
import { GetSerializedNullableString, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** The active source kind for a Read Babylon block. */
export type BabylonSourceKind = "url" | "upload";

/** Minimal response surface used to load a Babylon URL. */
export interface IBabylonSourceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

/** Fetch-compatible loader used by {@link ReadBabylonBlock.setUrlAsync}. */
export type BabylonSourceFetcher = (url: string) => Promise<IBabylonSourceResponse>;

/** Resolves a URL or uploaded `.babylon` file into a shallow Babylon source payload. */
export class ReadBabylonBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadBabylonBlock";

    /** Resolved `.babylon` source bytes. */
    public data: Nullable<Uint8Array> = null;
    /** The active source URL or uploaded file name. */
    public source: Nullable<string> = null;
    /** Whether the active source was loaded from a URL or upload. */
    public sourceKind: Nullable<BabylonSourceKind> = null;
    /** The shallow Babylon source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _sourceAttempt = 0;
    private _lastSuccessfulSourceAttempt = 0;

    /**
     * Creates a Babylon read block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.BABYLON_SOURCE);
    }

    /**
     * Makes uploaded bytes the active source.
     * @param data The uploaded `.babylon` bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this.data = data;
        this.source = fileName;
        this.sourceKind = "upload";
    }

    /** Clears the active source and prevents older pending URL requests from replacing it. */
    public clearSource(): void {
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this.data = null;
        this.source = null;
        this.sourceKind = null;
    }

    /**
     * Loads a URL and makes it active only after the request succeeds.
     * @param url The `.babylon` URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher: BabylonSourceFetcher = async (sourceUrl) => await fetch(sourceUrl)): Promise<void> {
        const sourceAttempt = ++this._sourceAttempt;
        let data: Uint8Array;
        try {
            const response = await fetcher(url);
            if (!response.ok) {
                throw new Error(`Could not load Babylon from "${url}" (${response.status} ${response.statusText}).`);
            }
            data = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (sourceAttempt < this._lastSuccessfulSourceAttempt) {
                return;
            }
            throw error;
        }
        if (sourceAttempt < this._lastSuccessfulSourceAttempt) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this.data = data;
        this.source = url;
        this.sourceKind = "url";
    }

    /**
     * Emits the active source bytes without parsing the Babylon scene.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        if (!data) {
            throw new Error(`The "${this.name}" read block has no Babylon source.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        const source = this.source ?? this.name;
        this.output.value = new BabylonSource(data, source, this.sourceKind === "url" ? Tools.GetFolderPath(source) : "");
    }

    /**
     * Serializes the source bytes and active source choice.
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
     * Restores the source bytes and active source choice.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const data = GetSerializedNullableString(serializationObject, "data");
        this.data = data ? new Uint8Array(DecodeBase64ToBinary(data)) : null;
        this.source = GetSerializedNullableString(serializationObject, "source");
        this.sourceKind = GetSerializedStringUnion(serializationObject, "sourceKind", ["url", "upload", ""] as const, "") || null;
    }
}

RegisterBlock(ReadBabylonBlock.ClassName, (name, nodeAsset) => new ReadBabylonBlock(name, nodeAsset));
