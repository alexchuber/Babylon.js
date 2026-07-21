import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";
import { Tools } from "core/Misc/tools.pure";
import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { FBXSource } from "../representations/fbxSource";
import { GetSerializedNullableString, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** The active source kind for a Read FBX block. */
export type FBXSourceKind = "url" | "upload";

/** Minimal response surface used to load an FBX URL. */
export interface IFBXSourceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

/** Fetch-compatible loader used by {@link ReadFBXBlock.setUrlAsync}. */
export type FBXSourceFetcher = (url: string) => Promise<IFBXSourceResponse>;

/** Reports whether an asynchronous FBX source operation became active. */
export interface IFBXSourceApplyResult {
    /** Whether the operation's resolved bytes became active. */
    applied: boolean;
}

function GetFBXRootUrl(source: string): string {
    return Tools.GetFolderPath(source.split(/[?#]/, 1)[0]);
}

function InvalidFBXSourceState(): TypeError {
    return new TypeError("Invalid serialized FBX source state.");
}

function ValidateFBXSourceState(data: Nullable<Uint8Array>, source: Nullable<string>, sourceKind: Nullable<FBXSourceKind>): void {
    if (data === null && source === null && sourceKind === null) {
        return;
    }
    if (data !== null && source !== null && source.length > 0 && (sourceKind === "url" || sourceKind === "upload")) {
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

/** Resolves URL or uploaded `.fbx` bytes into an immutable FBX source payload. */
export class ReadFBXBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadFBXBlock";

    /** Resolved `.fbx` bytes. */
    public data: Nullable<Uint8Array> = null;

    /** The active source URL or uploaded file name. */
    public source: Nullable<string> = null;

    /** Whether the active source was loaded from a URL or upload. */
    public sourceKind: Nullable<FBXSourceKind> = null;

    /** The immutable FBX source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _sourceAttempt = 0;

    /**
     * Creates an FBX read block.
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
        this._sourceAttempt++;
        this.data = data.slice();
        this.source = fileName;
        this.sourceKind = "upload";
    }

    /**
     * Reads uploaded bytes and makes them active only while this block still owns the operation.
     * @param loadDataAsync The uploaded file reader.
     * @param fileName The uploaded file name.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after ownership and source-order checks.
     */
    public async setUploadedSourceAsync(
        loadDataAsync: () => Promise<ArrayBuffer>,
        fileName: string,
        canApplyResult: () => boolean = () => true,
        applyResult?: IFBXSourceApplyResult
    ): Promise<void> {
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        let data: Uint8Array;
        try {
            data = new Uint8Array(await loadDataAsync());
        } catch (error) {
            if (!canApplyResult() || sourceAttempt !== this._sourceAttempt) {
                return;
            }
            throw error;
        }
        if (!canApplyResult() || sourceAttempt !== this._sourceAttempt) {
            return;
        }
        this.data = data;
        this.source = fileName;
        this.sourceKind = "upload";
        if (applyResult) {
            applyResult.applied = true;
        }
    }

    /**
     * Loads a URL and makes it active only after its status and body resolve successfully.
     * @param url The `.fbx` URL.
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
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        let data: Uint8Array;
        try {
            const response = await fetcher(url);
            if (!response.ok) {
                throw new Error(`Could not load FBX from "${url}" (${response.status} ${response.statusText}).`);
            }
            data = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (!canApplyResult() || sourceAttempt !== this._sourceAttempt) {
                return;
            }
            throw error;
        }
        if (!canApplyResult() || sourceAttempt !== this._sourceAttempt) {
            return;
        }
        this.data = data;
        this.source = url;
        this.sourceKind = "url";
        if (applyResult) {
            applyResult.applied = true;
        }
    }

    /** Clears the active source state. */
    public clearSource(): void {
        this._sourceAttempt++;
        this.data = null;
        this.source = null;
        this.sourceKind = null;
    }

    /**
     * Emits the active source without parsing the FBX document.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        const source = this.source;
        const sourceKind = this.sourceKind;
        if (!data || !source || !sourceKind) {
            throw new Error(`The "${this.name}" read block has no FBX source. Set an FBX URL or upload a .fbx file before building.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        this.output.value = new FBXSource(data, source, sourceKind === "url" ? GetFBXRootUrl(source) : "");
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
     * Restores the uploaded source bytes and active source state.
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

RegisterBlock(ReadFBXBlock.ClassName, (name, nodeAsset) => new ReadFBXBlock(name, nodeAsset));
