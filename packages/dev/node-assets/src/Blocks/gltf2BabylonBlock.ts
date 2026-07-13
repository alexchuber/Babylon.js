import { NullEngine } from "core/Engines/nullEngine";
import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { Scene } from "core/scene";

// Side-effect imports: register the glTF file loader plugin and the 2.0 loader extension.
import "loaders/glTF/glTFFileLoader";
import "loaders/glTF/2.0/glTFLoader";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { BabylonAsset } from "../representations/babylonAsset";
import { GetGltfAsset } from "../representations/gltfAsset";

/**
 * Transcodes a {@link GltfAsset} (GLTF_DOCUMENT) into a {@link BabylonAsset} (BABYLON_SCENE).
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class GLTF2BabylonBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GLTF2BabylonBlock";

    /** The glTF document to transcode. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting Babylon scene. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new glTF-to-Babylon transcoder block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.BABYLON_SCENE);
    }

    /**
     * Serializes the input glTF document to GLB bytes and loads them into a NullEngine scene,
     * wrapping the result in a {@link BabylonAsset}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" block has no input document to transcode.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const glbBytes = await io.writeBinary(asset.document);

        const engine = new NullEngine();
        try {
            const scene = new Scene(engine);
            scene.useRightHandedSystem = true;

            const container = await LoadAssetContainerAsync(new Uint8Array(glbBytes), scene, {
                pluginExtension: ".glb",
                pluginOptions: {
                    gltf: {
                        animationStartMode: 0, // NONE
                    },
                },
            });
            container.addAllToScene();

            this.output.value = new BabylonAsset(engine, scene, {
                identity: asset.identity,
                revision: asset.revision,
                manifest: { format: "babylon", source: "gltf-transcode" },
            });
        } catch (error) {
            engine.dispose();
            throw new Error(`The "${this.name}" block failed to transcode glTF to Babylon: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }
}

RegisterBlock(GLTF2BabylonBlock.ClassName, (name, nodeAsset) => new GLTF2BabylonBlock(name, nodeAsset));
