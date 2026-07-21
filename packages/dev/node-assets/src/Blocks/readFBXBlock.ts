import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";
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
// eslint-disable-next-line @typescript-eslint/naming-convention
export type FBXSourceKind = "upload";

/** Resolves uploaded `.fbx` bytes into a raw FBX source payload. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class ReadFBXBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadFBXBlock";

    /** The raw FBX source payload. */
    public readonly output: NodeAssetConnectionPoint;

    private _data: Nullable<Uint8Array> = null;
    private _source: Nullable<string> = null;
    private _sourceKind: Nullable<FBXSourceKind> = null;

    /**
     * Creates an FBX read block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.FBX_SOURCE);
    }

    /** A defensive copy of the active FBX bytes, or null when cleared. */
    public get data(): Nullable<Uint8Array> {
        return this._data?.slice() ?? null;
    }

    /** The active uploaded file name, or null when cleared. */
    public get source(): Nullable<string> {
        return this._source;
    }

    /** Whether the active source was loaded from an upload. */
    public get sourceKind(): Nullable<FBXSourceKind> {
        return this._sourceKind;
    }

    /**
     * Makes uploaded bytes the active source.
     * @param data The uploaded `.fbx` bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        if (!fileName.trim()) {
            throw new Error("An FBX upload must have a nonempty source label.");
        }
        this._data = data.slice();
        this._source = fileName;
        this._sourceKind = "upload";
    }

    /** Clears the active source. */
    public clearSource(): void {
        this._data = null;
        this._source = null;
        this._sourceKind = null;
    }

    /**
     * Emits the active uploaded bytes without parsing the FBX scene.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this._data;
        const source = this._source;
        if (!data || !source || this._sourceKind !== "upload") {
            throw new Error(`The "${this.name}" read block has no FBX source.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        this.output.value = new FBXSource(data, source);
    }

    /**
     * Serializes the source bytes and active source choice.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return {
            ...super.serialize(),
            data: this._data ? EncodeArrayBufferToBase64(this._data) : null,
            source: this._source,
            sourceKind: this._sourceKind ?? "",
        };
    }

    /**
     * Restores the source bytes and active source choice.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const encodedData = GetSerializedNullableString(serializationObject, "data");
        const source = GetSerializedNullableString(serializationObject, "source");
        const sourceKind = GetSerializedStringUnion(serializationObject, "sourceKind", ["upload", ""] as const, "") || null;
        if (encodedData === null && source === null && sourceKind === null) {
            this.clearSource();
            return;
        }
        if (encodedData === null || source === null || source.trim().length === 0 || sourceKind !== "upload") {
            throw new Error(`The serialized "${this.name}" block has an invalid FBX source state.`);
        }
        this._data = new Uint8Array(DecodeBase64ToBinary(encodedData));
        this._source = source;
        this._sourceKind = sourceKind;
    }
}

RegisterBlock(ReadFBXBlock.ClassName, (name, nodeAsset) => new ReadFBXBlock(name, nodeAsset));
