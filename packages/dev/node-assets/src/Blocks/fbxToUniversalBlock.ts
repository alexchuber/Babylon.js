import { type AssetContainer } from "core/assetContainer";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { FBXFileLoader } from "loaders/FBX/fbxFileLoader.pure";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { IsFBXSource } from "../representations/fbxSource";
import { GltfAsset } from "../representations/gltfAsset";

/** Parses an FBX source payload and explicitly crosses into Universal. */
export class FBXToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FBXToUniversalBlock";

    /** The immutable FBX source payload. */
    public readonly input: NodeAssetConnectionPoint;

    /** The Universal working payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates an FBX-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.FBX_SOURCE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Loads FBX content with the pure loader, exports it to GLB, and wraps the Universal document. */
    public override async _buildBlockAsync(): Promise<void> {
        if (!IsFBXSource(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive an FBX source payload.`);
        }

        const source = this.input.value;
        const engine = new NullEngine();
        const scene = new Scene(engine);
        let container: AssetContainer | undefined;
        try {
            const loader = new FBXFileLoader();
            container = await loader.loadAssetContainerAsync(scene, source.data, source.rootUrl, undefined, source.source);
            container.addAllToScene();

            const glbData = await GLTF2Export.GLBAsync(scene, "fbx-universal", { exportWithoutWaitingForScene: true });
            const glb = glbData.files["fbx-universal.glb"];
            const bytes = glb instanceof Blob ? new Uint8Array(await glb.arrayBuffer()) : new TextEncoder().encode(glb);
            const { WebIO } = await import("@gltf-transform/core");
            const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
            const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);
            this.output.value = new GltfAsset(document, {
                identity: source.source,
                revision: 0,
                manifest: { format: "universal", importedFrom: "fbx", source: source.source },
            });
        } catch (error) {
            throw new Error(`The "${this.name}" block failed to convert "${source.source}" to Universal: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        } finally {
            try {
                container?.dispose();
            } finally {
                try {
                    scene.dispose();
                } finally {
                    engine.dispose();
                }
            }
        }
    }
}

RegisterBlock(FBXToUniversalBlock.ClassName, (name, nodeAsset) => new FBXToUniversalBlock(name, nodeAsset));
