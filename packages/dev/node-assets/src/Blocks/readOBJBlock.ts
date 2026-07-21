import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { type IOBJSourceFile, OBJSourceAsset, type OBJSourceKind } from "../representations/objSourceAsset";
import { type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** Minimal response surface used to load an OBJ URL. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IOBJSourceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

/** Fetch-compatible loader used by {@link ReadOBJBlock.setUrlAsync}. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type OBJSourceFetcher = (url: string) => Promise<IOBJSourceResponse>;

/** Reports whether an asynchronous OBJ source operation became the active source. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IOBJSourceApplyResult {
    /** Whether the operation's resolved bytes became active. */
    applied: boolean;
}

function CloneSourceFile(file: IOBJSourceFile): IOBJSourceFile {
    return Object.freeze({ path: file.path, bytes: file.bytes.slice() });
}

function IsOBJFileName(fileName: string): boolean {
    return fileName.trim().length > 0 && /\.obj$/i.test(fileName);
}

function DecodeSerializedBytes(value: unknown): Uint8Array {
    if (typeof value !== "string") {
        throw new TypeError("primary.bytes must be a base64 string.");
    }
    const bytes = new Uint8Array(DecodeBase64ToBinary(value));
    if (EncodeArrayBufferToBase64(bytes) !== value) {
        throw new TypeError("primary.bytes must be canonical base64.");
    }
    return bytes;
}

/** Resolves a URL or one uploaded `.obj` file into a shallow OBJ source payload. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class ReadOBJBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadOBJBlock";

    /** The shallow OBJ source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _primary: Nullable<IOBJSourceFile> = null;
    private _source: Nullable<string> = null;
    private _sourceKind: Nullable<OBJSourceKind> = null;
    private readonly _companions: ReadonlyArray<IOBJSourceFile> = Object.freeze([]);
    private _sourceAttempt = 0;
    private _lastSuccessfulSourceAttempt = 0;

    /**
     * Creates an OBJ read block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.OBJ_SOURCE);
    }

    /** A defensive copy of the active primary OBJ file. */
    public get primary(): IOBJSourceFile | null {
        return this._primary ? CloneSourceFile(this._primary) : null;
    }

    /** The active source URL or uploaded file name. */
    public get source(): string | null {
        return this._source;
    }

    /** Whether the active source was loaded from a URL or upload. */
    public get sourceKind(): OBJSourceKind | null {
        return this._sourceKind;
    }

    /** Defensive copies of the active companion files. Empty for the basic workflow. */
    public get companions(): ReadonlyArray<IOBJSourceFile> {
        return Object.freeze(this._companions.map(CloneSourceFile));
    }

    /**
     * Makes one uploaded OBJ file the active source.
     * @param bytes The uploaded `.obj` bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(bytes: Uint8Array, fileName: string): void {
        if (!(bytes instanceof Uint8Array) || !IsOBJFileName(fileName)) {
            throw new TypeError("Read OBJ requires a single .obj file.");
        }
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this._primary = CloneSourceFile({ path: fileName, bytes });
        this._source = fileName;
        this._sourceKind = "upload";
    }

    /**
     * Reads one uploaded OBJ and makes it active only if no newer source has succeeded.
     * @param loadBytesAsync The uploaded file reader.
     * @param fileName The uploaded file name.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after ownership and source-order checks.
     */
    public async setUploadedSourceAsync(
        loadBytesAsync: () => Promise<ArrayBuffer>,
        fileName: string,
        canApplyResult: () => boolean = () => true,
        applyResult?: IOBJSourceApplyResult
    ): Promise<void> {
        if (!IsOBJFileName(fileName)) {
            throw new TypeError("Read OBJ requires a single .obj file.");
        }
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        const bytes = new Uint8Array(await loadBytesAsync());
        if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this._primary = CloneSourceFile({ path: fileName, bytes });
        this._source = fileName;
        this._sourceKind = "upload";
        if (applyResult) {
            applyResult.applied = true;
        }
    }

    /** Clears the active source and prevents older pending URL requests from replacing it. */
    public clearSource(): void {
        this._lastSuccessfulSourceAttempt = ++this._sourceAttempt;
        this._primary = null;
        this._source = null;
        this._sourceKind = null;
    }

    /**
     * Loads a URL and makes it active only after the request succeeds.
     * @param url The OBJ URL.
     * @param fetcher The fetch-compatible loader.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after ownership and source-order checks.
     */
    public async setUrlAsync(
        url: string,
        fetcher: OBJSourceFetcher = async (sourceUrl) => await fetch(sourceUrl),
        canApplyResult: () => boolean = () => true,
        applyResult?: IOBJSourceApplyResult
    ): Promise<void> {
        if (typeof url !== "string" || url.trim().length === 0) {
            throw new TypeError("Read OBJ requires a non-empty URL.");
        }
        if (applyResult) {
            applyResult.applied = false;
        }
        const sourceAttempt = ++this._sourceAttempt;
        let bytes: Uint8Array;
        try {
            const response = await fetcher(url);
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`.trim());
            }
            bytes = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
                return;
            }
            throw new Error(`Could not load OBJ from "${url}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this._primary = CloneSourceFile({ path: url, bytes });
        this._source = url;
        this._sourceKind = "url";
        if (applyResult) {
            applyResult.applied = true;
        }
    }

    /**
     * Emits the active source without parsing OBJ geometry.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const primary = this._primary;
        const source = this._source;
        const sourceKind = this._sourceKind;
        if (!primary || !source || !sourceKind) {
            throw new Error(`The "${this.name}" read block has no OBJ source.`);
        }
        scope?.accountSourceBytes(primary.bytes.byteLength + this._companions.reduce((total, companion) => total + companion.bytes.byteLength, 0));
        this.output.value = new OBJSourceAsset(primary, source, sourceKind, this._companions);
    }

    /**
     * Serializes the primary bytes, source choice, and forward-compatible companion list.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return {
            ...super.serialize(),
            primary: this._primary ? { path: this._primary.path, bytes: EncodeArrayBufferToBase64(this._primary.bytes) } : null,
            source: this._source,
            sourceKind: this._sourceKind ?? "",
            companions: [],
        };
    }

    /**
     * Restores one coherent persisted OBJ source state.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        try {
            const primary = serializationObject.primary;
            const source = serializationObject.source;
            const sourceKind = serializationObject.sourceKind;
            const companions = serializationObject.companions;
            if (!Array.isArray(companions) || companions.length !== 0) {
                throw new TypeError("companions must be an empty array in the basic OBJ workflow.");
            }

            if (primary === null && source === null && sourceKind === "") {
                this._primary = null;
                this._source = null;
                this._sourceKind = null;
                return;
            }
            if (
                typeof primary !== "object" ||
                primary === null ||
                Array.isArray(primary) ||
                typeof primary.path !== "string" ||
                primary.path.trim().length === 0 ||
                typeof source !== "string" ||
                source.trim().length === 0 ||
                source !== primary.path ||
                (sourceKind !== "url" && sourceKind !== "upload")
            ) {
                throw new TypeError("primary, source, and sourceKind must be present together.");
            }
            if (sourceKind === "upload" && !IsOBJFileName(primary.path)) {
                throw new TypeError("an uploaded primary path must end in .obj.");
            }

            this._primary = CloneSourceFile({ path: primary.path, bytes: DecodeSerializedBytes(primary.bytes) });
            this._source = source;
            this._sourceKind = sourceKind;
        } catch (error) {
            throw new TypeError(`The "${this.name}" block has invalid persisted OBJ source state: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }
}

RegisterBlock(ReadOBJBlock.ClassName, (name, nodeAsset) => new ReadOBJBlock(name, nodeAsset));
