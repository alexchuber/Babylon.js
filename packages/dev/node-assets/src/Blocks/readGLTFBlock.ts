import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { GetSerializedNullableString, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { GetDracoModuleOptions, ResolveDraco3DGltfModule } from "./dracoWasm";

/** The active source kind for a Read glTF block. */
export type GLTFSourceKind = "url" | "upload";

/** Minimal response surface used to load a glTF URL. */
export interface IGLTFSourceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

/** Fetch-compatible loader used by {@link ReadGLTFBlock.setUrlAsync}. */
export type GLTFSourceFetcher = (url: string) => Promise<IGLTFSourceResponse>;

/** Reads glTF or GLB bytes into a glTF source payload. */
export class ReadGLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadGLTFBlock";

    /** Uploaded glTF or GLB bytes. */
    public data: Nullable<Uint8Array> = null;

    /** The active source URL or uploaded file name. */
    public source: Nullable<string> = null;

    /** Whether the active source was loaded from a URL or upload. */
    public sourceKind: Nullable<GLTFSourceKind> = null;

    /** The glTF source payload. */
    public readonly output: NodeAssetConnectionPoint;

    /** Optional URL of the Draco decoder wasm binary. */
    public dracoDecoderWasmUrl: string | undefined = undefined;

    private _sourceAttempt = 0;
    private _lastSuccessfulSourceAttempt = 0;

    /**
     * Creates a glTF read block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Makes uploaded bytes the active source.
     * @param data The uploaded glTF or GLB bytes.
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
     * @param url The glTF or GLB URL.
     * @param fetcher The fetch-compatible loader.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     */
    public async setUrlAsync(url: string, fetcher: GLTFSourceFetcher = async (sourceUrl) => await fetch(sourceUrl), canApplyResult: () => boolean = () => true): Promise<void> {
        const sourceAttempt = ++this._sourceAttempt;
        let data: Uint8Array;
        try {
            const response = await fetcher(url);
            if (!response.ok) {
                throw new Error(`Could not load glTF from "${url}" (${response.status} ${response.statusText}).`);
            }
            data = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
                return;
            }
            throw error;
        }
        if (!canApplyResult() || sourceAttempt < this._lastSuccessfulSourceAttempt) {
            return;
        }
        this._lastSuccessfulSourceAttempt = sourceAttempt;
        this.data = data;
        this.source = url;
        this.sourceKind = "url";
    }

    /**
     * Reads the active uploaded bytes into a glTF payload.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        if (!data) {
            throw new Error(`The "${this.name}" read block has no glTF source.`);
        }
        scope?.accountSourceBytes(data.byteLength);

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const draco3d = ResolveDraco3DGltfModule(await import("draco3dgltf"));
        const dracoModuleOptions = GetDracoModuleOptions(this.dracoDecoderWasmUrl);
        // eslint-disable-next-line @typescript-eslint/naming-convention -- gltf-transform dependency key
        const dependencies = { "draco3d.decoder": dracoModuleOptions ? await draco3d.createDecoderModule(dracoModuleOptions) : await draco3d.createDecoderModule() };
        const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(dependencies).readBinary(data);
        this.output.value = new GltfAsset(document, {
            identity: this.source ?? this.name,
            revision: 0,
            manifest: { format: "gltf", source: this.source },
        });
    }

    /**
     * Serializes uploaded bytes and their source label.
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
     * Restores uploaded bytes and their source label.
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

RegisterBlock(ReadGLTFBlock.ClassName, (name, nodeAsset) => new ReadGLTFBlock(name, nodeAsset));
