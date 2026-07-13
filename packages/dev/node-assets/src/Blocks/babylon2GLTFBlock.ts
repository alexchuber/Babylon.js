import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { IsBabylonAsset } from "../representations/babylonAsset";
import { GltfAsset } from "../representations/gltfAsset";

/**
 * Transcodes a {@link BabylonAsset} (BABYLON_SCENE) into a {@link GltfAsset} (GLTF_DOCUMENT).
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class Babylon2GLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "Babylon2GLTFBlock";

    /** The Babylon scene to transcode. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting glTF document. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new Babylon-to-glTF transcoder block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SCENE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Exports the input Babylon scene to GLB bytes via {@link GLTF2Export.GLBAsync}, then
     * re-reads the bytes into a glTF-Transform Document wrapped in a {@link GltfAsset}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" block has no input scene to transcode.`);
        }
        if (!IsBabylonAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive a BabylonAsset.`);
        }
        const babylonAsset = this.input.value;

        const glbData = await GLTF2Export.GLBAsync(babylonAsset.scene, "export", {
            exportWithoutWaitingForScene: true,
        });

        const glbBlob = glbData.files["export.glb"];
        let glbBytes: Uint8Array;
        if (glbBlob instanceof Blob) {
            glbBytes = new Uint8Array(await glbBlob.arrayBuffer());
        } else {
            const encoder = new TextEncoder();
            glbBytes = encoder.encode(glbBlob);
        }

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const document = await io.readBinary(glbBytes);

        this.output.value = new GltfAsset(document, {
            identity: babylonAsset.identity,
            revision: babylonAsset.revision,
            manifest: { format: "gltf", source: "babylon-transcode" },
        });
    }
}

RegisterBlock(Babylon2GLTFBlock.ClassName, (name, nodeAsset) => new Babylon2GLTFBlock(name, nodeAsset));
