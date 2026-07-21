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
export type FBXSourceKind = "upload";

function InvalidFBXSourceState(): TypeError {
    return new TypeError("Invalid serialized FBX source state.");
}

function ValidateFBXSourceState(data: Nullable<Uint8Array>, source: Nullable<string>, sourceKind: Nullable<FBXSourceKind>): void {
    if (data === null && source === null && sourceKind === null) {
        return;
    }
    if (data !== null && source !== null && source.length > 0 && sourceKind === "upload") {
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

/** Resolves uploaded `.fbx` bytes into an immutable FBX source payload. */
export class ReadFBXBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ReadFBXBlock";

    /** Uploaded `.fbx` bytes. */
    public data: Nullable<Uint8Array> = null;

    /** The uploaded file name. */
    public source: Nullable<string> = null;

    /** Whether the active source was uploaded. */
    public sourceKind: Nullable<FBXSourceKind> = null;

    /** The immutable FBX source payload. */
    public readonly output: NodeAssetConnectionPoint;

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
        this.data = data.slice();
        this.source = fileName;
        this.sourceKind = "upload";
    }

    /** Clears the uploaded source state. */
    public clearSource(): void {
        this.data = null;
        this.source = null;
        this.sourceKind = null;
    }

    /**
     * Emits the uploaded source without parsing the FBX document.
     * @param scope The build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        const source = this.source;
        if (!data || !source || this.sourceKind !== "upload") {
            throw new Error(`The "${this.name}" read block has no FBX source. Upload a .fbx file before building.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        this.output.value = new FBXSource(data, source);
    }

    /**
     * Serializes the uploaded source bytes and active source state.
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
        const sourceKind = GetSerializedStringUnion(serializationObject, "sourceKind", ["upload", ""] as const, "") || null;
        ValidateFBXSourceState(data, source, sourceKind);
        this.data = data;
        this.source = source;
        this.sourceKind = sourceKind;
    }
}

RegisterBlock(ReadFBXBlock.ClassName, (name, nodeAsset) => new ReadFBXBlock(name, nodeAsset));
