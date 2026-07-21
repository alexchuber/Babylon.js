import { NullEngine } from "core/Engines/nullEngine";
import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { Tools } from "core/Misc/tools.pure";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

import "loaders/OBJ/objFileLoader";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { IsOBJSourceAsset } from "../representations/objSourceAsset";

/** Parses an OBJ source payload and explicitly crosses into Universal. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class OBJToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "OBJToUniversalBlock";

    /** The shallow OBJ source payload. */
    public readonly input: NodeAssetConnectionPoint;
    /** The Universal working payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates an OBJ-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.OBJ_SOURCE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Loads the OBJ scene, exports it to GLB, and wraps the resulting Universal document. */
    public override async _buildBlockAsync(): Promise<void> {
        if (!IsOBJSourceAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive an OBJ source payload.`);
        }
        const source = this.input.value;
        const primary = source.primary;
        const engine = new NullEngine();
        let scene: Scene | undefined;
        try {
            scene = new Scene(engine);
            const rootUrl = source.sourceKind === "url" ? Tools.GetFolderPath(source.source) : "";
            const obj = new TextDecoder().decode(primary.bytes);
            const container = await LoadAssetContainerAsync(`data:${obj}`, scene, { pluginExtension: ".obj", rootUrl });
            container.addAllToScene();

            const glbData = await GLTF2Export.GLBAsync(scene, "obj-universal", { exportWithoutWaitingForScene: true });
            const glb = glbData.files["obj-universal.glb"];
            const bytes = glb instanceof Blob ? new Uint8Array(await glb.arrayBuffer()) : new TextEncoder().encode(glb);
            const { WebIO } = await import("@gltf-transform/core");
            const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
            const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);
            this.output.value = new GltfAsset(document, {
                identity: source.source,
                revision: 0,
                manifest: { format: "universal", importedFrom: "obj", source: source.source },
            });
        } catch (error) {
            throw new Error(`The "${this.name}" block failed to convert "${source.source}" to Universal: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        } finally {
            try {
                scene?.dispose();
            } finally {
                engine.dispose();
            }
        }
    }
}

RegisterBlock(OBJToUniversalBlock.ClassName, (name, nodeAsset) => new OBJToUniversalBlock(name, nodeAsset));
