import { type Document } from "@gltf-transform/core";

import { type Nullable } from "core/types";

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
}
