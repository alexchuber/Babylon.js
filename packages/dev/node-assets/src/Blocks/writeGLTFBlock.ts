import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type IExportBlock } from "../blockFoundation/exportBlock";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { GetSerializedString, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { GetDracoModuleOptions, ResolveDraco3DGltfModule } from "./dracoWasm";

/** Writes a glTF delivery payload as terminal GLB bytes. */
export class WriteGLTFBlock extends NodeAssetBlock implements IExportBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "WriteGLTFBlock";

    /** Marks this block as a terminal export block. */
    public readonly isExportTerminal = true;

    /** The glTF delivery payload. */
    public readonly input: NodeAssetConnectionPoint;

    /** Base file name, without the `.glb` extension. */
    public fileName = "scene";

    /** The built GLB bytes. */
    public result: Nullable<Uint8Array> = null;

    /** Optional URL of the Draco encoder wasm binary. */
    public dracoEncoderWasmUrl: string | undefined = undefined;

    /**
     * Creates a glTF write block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /** Writes the connected glTF payload as GLB. */
    public override async _buildBlockAsync(): Promise<void> {
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const draco3d = ResolveDraco3DGltfModule(await import("draco3dgltf"));
        const dracoModuleOptions = GetDracoModuleOptions(this.dracoEncoderWasmUrl);
        // eslint-disable-next-line @typescript-eslint/naming-convention -- gltf-transform dependency key
        const dependencies = { "draco3d.encoder": dracoModuleOptions ? await draco3d.createEncoderModule(dracoModuleOptions) : await draco3d.createEncoderModule() };
        this.result = await new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(dependencies).writeBinary(asset.document);
    }

    /**
     * Serializes the configured file name.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return { ...super.serialize(), fileName: this.fileName };
    }

    /**
     * Restores the configured file name.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.fileName = GetSerializedString(serializationObject, "fileName", "scene");
    }
}

RegisterBlock(WriteGLTFBlock.ClassName, (name, nodeAsset) => new WriteGLTFBlock(name, nodeAsset));
