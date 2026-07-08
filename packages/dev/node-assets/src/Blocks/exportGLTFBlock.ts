import { type Document } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Exports the connected gltf-transform `Document` to glb bytes.
 */
export class ExportGLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ExportGLTFBlock";

    /** The gltf-transform `Document` to export. */
    public readonly input: NodeAssetConnectionPoint;

    /** The exported glb bytes; also returned by {@link NodeAsset.buildAsync}. */
    public result: Nullable<Uint8Array> = null;

    /**
     * Creates a new export block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF);
    }

    /**
     * Writes the connected `Document` to glb bytes and stores them in {@link result}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const document = this.input.value as Nullable<Document>;
        if (!document) {
            throw new Error(`The "${this.name}" export block has no input document to export.`);
        }

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const draco3dModule = await import("draco3dgltf");
        // Some bundlers wrap the CommonJS exports under `default`; normalize both shapes.
        const draco3d = (draco3dModule as typeof draco3dModule & { default?: typeof draco3dModule }).default ?? draco3dModule;

        // Register the Draco encoder so writeBinary actually encodes documents tagged by DracoCompressionBlock.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- gltf-transform dependency key
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "draco3d.encoder": await draco3d.createEncoderModule() });
        this.result = await io.writeBinary(document);
    }
}
