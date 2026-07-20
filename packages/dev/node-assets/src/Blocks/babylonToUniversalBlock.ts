import { NullEngine } from "core/Engines/nullEngine";
import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

import "core/Loading/Plugins/babylonFileLoader";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { IsBabylonSource } from "../representations/babylonSource";
import { GltfAsset } from "../representations/gltfAsset";

/** Parses a Babylon source payload and explicitly crosses into Universal. */
export class BabylonToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "BabylonToUniversalBlock";

    /** The shallow Babylon source payload. */
    public readonly input: NodeAssetConnectionPoint;
    /** The Universal working payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Babylon-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SOURCE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Loads the Babylon scene, exports it to GLB, and wraps the resulting Universal document. */
    public override async _buildBlockAsync(): Promise<void> {
        if (!IsBabylonSource(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive a Babylon source payload.`);
        }
        const source = this.input.value;
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const json = new TextDecoder().decode(source.data);
            const container = await LoadAssetContainerAsync(`data:${json}`, scene, { pluginExtension: ".babylon", rootUrl: source.rootUrl });
            container.addAllToScene();

            const glbData = await GLTF2Export.GLBAsync(scene, "babylon-universal", { exportWithoutWaitingForScene: true });
            const glb = glbData.files["babylon-universal.glb"];
            const bytes = glb instanceof Blob ? new Uint8Array(await glb.arrayBuffer()) : new TextEncoder().encode(glb);
            const { WebIO } = await import("@gltf-transform/core");
            const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
            const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);
            this.output.value = new GltfAsset(document, {
                identity: source.source,
                revision: 0,
                manifest: { format: "universal", importedFrom: "babylon", source: source.source },
            });
        } catch (error) {
            throw new Error(`The "${this.name}" block failed to convert "${source.source}" to Universal: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        } finally {
            scene.dispose();
            engine.dispose();
        }
    }
}

RegisterBlock(BabylonToUniversalBlock.ClassName, (name, nodeAsset) => new BabylonToUniversalBlock(name, nodeAsset));
