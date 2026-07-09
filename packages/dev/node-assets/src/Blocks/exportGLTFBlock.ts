import { type Document } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetDracoModuleOptions, ResolveDraco3DGltfModule } from "./dracoWasm";

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
     * URL of the Draco encoder wasm binary. Left undefined, Draco resolves the sidecar from its package
     * default location for headless Node usage.
     */
    public dracoEncoderWasmUrl: string | undefined = undefined;

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
        const draco3d = ResolveDraco3DGltfModule(await import("draco3dgltf"));
        const dracoModuleOptions = GetDracoModuleOptions(this.dracoEncoderWasmUrl);

        // Register the Draco encoder so writeBinary actually encodes documents tagged by DracoCompressionBlock.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- gltf-transform dependency key
        const dependencies = { "draco3d.encoder": dracoModuleOptions ? await draco3d.createEncoderModule(dracoModuleOptions) : await draco3d.createEncoderModule() };
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(dependencies);
        this.result = await io.writeBinary(document);
    }
}
