import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNullableString, GetSerializedString, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { type ImagePayload } from "./imagePayload";

/**
 * Imports source image bytes into an `IMAGE` payload and exposes it on its output. A pure boundary
 * block: it wraps the encoded bytes plus their mime type without decoding them (canvas-free), so
 * `width`/`height` stay undefined until a later op decodes the pixels.
 */
export class ImportImageBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportImageBlock";

    /** The source image bytes to import (set by the caller / editor file picker). */
    public data: Nullable<Uint8Array> = null;

    /** The mime type of the source image, e.g. from the picker or file extension. */
    public mimeType = "image/png";

    /**
     * A human-readable label for where {@link data} came from: the source URL when fetched from one, or
     * the uploaded file's name when picked locally. Purely descriptive (the build reads {@link data}, not
     * this); the editor surfaces it in the block's "Source" field.
     */
    public source: Nullable<string> = null;

    /** The imported image, emitted as an {@link ImagePayload}. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new image import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Wraps {@link data} and {@link mimeType} into an {@link ImagePayload} and sets it as the output
     * value. The bytes are carried encoded; `width`/`height` are decoded by a later op, not here.
     * @param scope The optional build scope used to account source bytes.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        if (!data) {
            throw new Error(`The "${this.name}" import block has no data to import.`);
        }
        scope?.accountSourceBytes(data.byteLength);
        const payload: ImagePayload = { data, mimeType: this.mimeType };
        this.output.value = payload;
    }

    /**
     * Serializes this block, encoding its {@link data} bytes as base64 so the source image roundtrips
     * through save/load, alongside its {@link mimeType} and {@link source} label.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.data = this.data ? EncodeArrayBufferToBase64(this.data) : null;
        serializationObject.mimeType = this.mimeType;
        serializationObject.source = this.source;
        return serializationObject;
    }

    /**
     * Restores this block's {@link data} bytes (from base64) and {@link mimeType}.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const data = GetSerializedNullableString(serializationObject, "data");
        this.data = data ? new Uint8Array(DecodeBase64ToBinary(data)) : null;
        this.mimeType = GetSerializedString(serializationObject, "mimeType", "image/png");
        this.source = GetSerializedNullableString(serializationObject, "source");
    }
}

RegisterBlock(ImportImageBlock.ClassName, (name, nodeAsset) => new ImportImageBlock(name, nodeAsset));
