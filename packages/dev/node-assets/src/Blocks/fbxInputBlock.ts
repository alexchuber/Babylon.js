import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";
import { Tools } from "core/Misc/tools.pure";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { FBXSource } from "../representations/fbxSource";
import { GetSerializedNullableString, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** The active source kind for a FBX input block. */
export type FBXSourceKind = "url" | "upload";

/** Minimal response surface used to load an FBX URL. */
export interface IFBXSourceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

/** Fetch-compatible loader used by {@link FBXInputBlock.setUrlAsync}. */
export type FBXSourceFetcher = (url: string) => Promise<IFBXSourceResponse>;

/** Reports whether an asynchronous FBX source operation became the active source. */
export interface IFBXSourceApplyResult {
    /** Whether the operation's resolved bytes became active. */
    applied: boolean;
}

function InvalidFBXSourceState(): TypeError {
    return new TypeError("Invalid serialized FBX source state.");
}

function ValidateFBXSourceState(data: Nullable<Uint8Array>, source: Nullable<string>, sourceKind: Nullable<FBXSourceKind>): void {
    if (data === null && source === null && sourceKind === null) {
        return;
    }
    if (
        (data === null || data instanceof Uint8Array) &&
        source !== null &&
        source.trim().length > 0 &&
        (sourceKind === "url" || sourceKind === "upload") &&
        (sourceKind === "url" || data !== null)
    ) {
        return;
    }
    throw InvalidFBXSourceState();
}

function DecodeSerializedFBXData(value: Nullable<string>): Nullable<Uint8Array> {
    if (value === null) {
        return null;
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw InvalidFBXSourceState();
    }
    const data = new Uint8Array(DecodeBase64ToBinary(value));
    if (EncodeArrayBufferToBase64(data) !== value) {
        throw InvalidFBXSourceState();
    }
    return data;
}

/** Resolves a URL or uploaded `.fbx` file into an immutable FBX source payload. */
export class FBXInputBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FBXInputBlock";

    /** Resolved `.fbx` bytes for the active source. */
    public data: Nullable<Uint8Array> = null;

    /** The active source URL or uploaded file name. */
    public source: Nullable<string> = null;

    /** Whether the active source was loaded from a URL or upload. */
    public sourceKind: Nullable<FBXSourceKind> = null;

    /** The immutable FBX source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _sourceAttempt = 0;
    private _lastSuccessfulSourceAttempt = 0;

    /**
     * Creates a FBX input block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.FBX_SOURCE);
    }

    /**
     * Makes uploaded bytes the active source.
     * @param data The uploaded `.fbx` bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        if (!(data instanceof Uint8Array) || typeof fileName !== "string" || fileName.trim().length === 0) {
            throw new TypeError("The FBX input block requires source bytes and a non-empty source.");
        }
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this.data = data.slice();
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
     * @param url The FBX URL.
     * @param fetcher The fetch-compatible loader.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after ownership and source-order checks.
     */
    public async setUrlAsync(
        url: string,
        fetcher: FBXSourceFetcher = async (sourceUrl) => await fetch(sourceUrl),
        canApplyResult: () => boolean = () => true,
        applyResult?: IFBXSourceApplyResult
    ): Promise<void> {
        if (typeof url !== "string" || url.trim().length === 0) {
            throw new TypeError("The FBX input block requires a non-empty URL.");
        }
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        let data: Uint8Array;
        try {
            const response = await fetcher(url);
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`.trim());
            }
            data = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (sourceAttempt !== this._sourceAttempt || sourceAttempt < this._lastSuccessfulSourceAttempt || !canApplyResult()) {
                return;
            }
            throw new Error(`Could not load FBX from "${url}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        if (sourceAttempt !== this._sourceAttempt || sourceAttempt < this._lastSuccessfulSourceAttempt || !canApplyResult()) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this.data = data;
        this.source = url;
        this.sourceKind = "url";
        if (applyResult) {
            applyResult.applied = true;
        }
    }

    /**
     * Emits the active source without parsing the FBX document.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        const source = this.source;
        const sourceKind = this.sourceKind;
        if (!(data instanceof Uint8Array) || source === null || source.trim().length === 0 || (sourceKind !== "url" && sourceKind !== "upload")) {
            throw new Error(`The "${this.name}" input block has no FBX source. Choose a URL or upload a .fbx file before building.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        this.output.value = new FBXSource(data, source, sourceKind === "url" ? Tools.GetFolderPath(source) : "");
    }

    /**
     * Serializes the resolved source bytes and active source state.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        ValidateFBXSourceState(this.data, this.source, this.sourceKind);
        return {
            ...super.serialize(),
            data: this.data === null ? null : EncodeArrayBufferToBase64(this.data),
            source: this.source,
            sourceKind: this.sourceKind ?? "",
        };
    }

    /**
     * Restores the resolved source bytes and active source state.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const data = DecodeSerializedFBXData(GetSerializedNullableString(serializationObject, "data"));
        const source = GetSerializedNullableString(serializationObject, "source");
        const sourceKind = GetSerializedStringUnion(serializationObject, "sourceKind", ["url", "upload", ""] as const, "") || null;
        ValidateFBXSourceState(data, source, sourceKind);
        this.data = data;
        this.source = source;
        this.sourceKind = sourceKind;
    }
}

RegisterBlock(FBXInputBlock.ClassName, (name, nodeAsset) => new FBXInputBlock(name, nodeAsset));
