import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { UsdSourceAsset, type USDSourceKind } from "../representations/usdSourceAsset";
import { GetSerializedNullableString, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** Minimal response surface used to load a USD URL. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IUSDSourceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

/** Fetch-compatible loader used by {@link ReadUSDBlock.setUrlAsync}. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type USDSourceFetcher = (url: string) => Promise<IUSDSourceResponse>;

/** Reports whether an asynchronous source operation became the active source. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IUSDSourceApplyResult {
    /** Whether the operation's resolved bytes became active. */
    applied: boolean;
}

/** Resolves USD bytes from a URL or upload into a lightweight USD source payload. */
export class ReadUSDBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadUSDBlock";

    /** Resolved USD bytes for the active source. */
    public data: Nullable<Uint8Array> = null;

    /** The active source URL or uploaded file name. */
    public source: Nullable<string> = null;

    /** Whether the active source was loaded from a URL or upload. */
    public sourceKind: Nullable<USDSourceKind> = null;

    /** The lightweight USD source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _sourceAttempt = 0;
    private _lastSuccessfulSourceAttempt = 0;

    /**
     * Creates a USD read block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.USD_SOURCE);
    }

    /**
     * Makes uploaded bytes the active source.
     * @param data The uploaded USD bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this.data = data.slice();
        this.source = fileName;
        this.sourceKind = "upload";
    }

    /**
     * Reads uploaded bytes and makes them active only if no newer source has succeeded.
     * @param loadDataAsync The uploaded file reader.
     * @param fileName The uploaded file name.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after the ownership and source-order checks.
     */
    public async setUploadedSourceAsync(
        loadDataAsync: () => Promise<ArrayBuffer>,
        fileName: string,
        canApplyResult: () => boolean = () => true,
        applyResult?: IUSDSourceApplyResult
    ): Promise<void> {
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        const data = new Uint8Array(await loadDataAsync());
        if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this.data = data;
        this.source = fileName;
        this.sourceKind = "upload";
        if (applyResult) {
            applyResult.applied = true;
        }
    }

    /**
     * Clears the active source and invalidates every pending URL request.
     */
    public clearSource(): void {
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this.data = null;
        this.source = null;
        this.sourceKind = null;
    }

    /**
     * Loads a URL and makes it active only after the request succeeds.
     * @param url The USD URL.
     * @param fetcher The fetch-compatible loader.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after the ownership and source-order checks.
     */
    public async setUrlAsync(
        url: string,
        fetcher: USDSourceFetcher = async (sourceUrl) => await fetch(sourceUrl),
        canApplyResult: () => boolean = () => true,
        applyResult?: IUSDSourceApplyResult
    ): Promise<void> {
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        const response = await fetcher(url);
        if (!response.ok) {
            throw new Error(`Could not load USD from "${url}" (${response.status} ${response.statusText}).`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
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
     * Emits the active source as a lightweight USD payload without parsing it.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        const source = this.source;
        const sourceKind = this.sourceKind;
        if (!data || !source || !sourceKind) {
            throw new Error(`The "${this.name}" read block has no USD source.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        this.output.value = new UsdSourceAsset(data, source, sourceKind);
    }

    /**
     * Serializes the resolved bytes and active source choice.
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
     * Restores the resolved bytes and active source choice.
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

RegisterBlock(ReadUSDBlock.ClassName, (name, nodeAsset) => new ReadUSDBlock(name, nodeAsset));
