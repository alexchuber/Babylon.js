import { type Document } from "@gltf-transform/core";

import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Imports glTF/glb bytes into a gltf-transform `Document` and exposes it on its output.
 */
export class ImportGLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportGLTFBlock";

    /** The source glTF/glb bytes to import (set by the caller / editor file picker). */
    public data: Nullable<Uint8Array> = null;

    /** The imported gltf-transform `Document`. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF);
    }

    /**
     * Reads {@link data} into a gltf-transform `Document` and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (!this.data) {
            throw new Error(`The "${this.name}" import block has no data to import.`);
        }

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const document: Document = await io.readBinary(this.data);
        this.output.value = document;
    }

    /**
     * Serializes this block, encoding its {@link data} bytes as base64 so the source glTF roundtrips
     * through save/load.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.data = this.data ? EncodeArrayBufferToBase64(this.data) : null;
        return serializationObject;
    }

    /**
     * Restores this block's {@link data} bytes from a base64 string produced by {@link serialize}.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.data = serializationObject.data ? new Uint8Array(DecodeBase64ToBinary(serializationObject.data)) : null;
    }
}
