import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { GetSerializedNullableString, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { GetDracoModuleOptions, ResolveDraco3DGltfModule } from "./dracoWasm";

/**
 * Imports glTF/glb bytes into a {@link GltfAsset} and exposes it on its output.
 */
export class ImportGLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportGLTFBlock";

    /** The source glTF/glb bytes to import (set by the caller / editor file picker). */
    public data: Nullable<Uint8Array> = null;

    /**
     * A human-readable label for where {@link data} came from: the source URL when fetched from one, or
     * the uploaded file's name when picked locally. Purely descriptive (the build reads {@link data}, not
     * this); the editor surfaces it in the block's "Source" field.
     */
    public source: Nullable<string> = null;

    /** The imported glTF representation. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * URL of the Draco decoder wasm binary. Left undefined, Draco resolves the sidecar from its package
     * default location for headless Node usage.
     */
    public dracoDecoderWasmUrl: string | undefined = undefined;

    /**
     * Creates a new import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Reads {@link data} into a glTF representation and sets it as the output value.
     * @param scope The optional build scope used to account source bytes before parsing.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        const data = this.data;
        if (!data) {
            throw new Error(`The "${this.name}" import block has no data to import.`);
        }
        scope?.accountSourceBytes(data.byteLength);

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const draco3d = ResolveDraco3DGltfModule(await import("draco3dgltf"));
        const dracoModuleOptions = GetDracoModuleOptions(this.dracoDecoderWasmUrl);

        // Register the Draco decoder so Draco-compressed glbs (e.g. from DracoCompressionBlock) read back.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- gltf-transform dependency key
        const dependencies = { "draco3d.decoder": dracoModuleOptions ? await draco3d.createDecoderModule(dracoModuleOptions) : await draco3d.createDecoderModule() };
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(dependencies);
        const document = await io.readBinary(data);
        this.output.value = new GltfAsset(document, {
            identity: this.source ?? this.name,
            revision: 0,
            manifest: {
                format: "gltf",
                source: this.source,
            },
        });
    }

    /**
     * Serializes this block, encoding its {@link data} bytes as base64 so the source glTF roundtrips
     * through save/load, alongside its {@link source} label.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.data = this.data ? EncodeArrayBufferToBase64(this.data) : null;
        serializationObject.source = this.source;
        return serializationObject;
    }

    /**
     * Restores this block's {@link data} bytes from a base64 string produced by {@link serialize}.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const data = GetSerializedNullableString(serializationObject, "data");
        this.data = data ? new Uint8Array(DecodeBase64ToBinary(data)) : null;
        this.source = GetSerializedNullableString(serializationObject, "source");
    }
}

RegisterBlock(ImportGLTFBlock.ClassName, (name, nodeAsset) => new ImportGLTFBlock(name, nodeAsset));
