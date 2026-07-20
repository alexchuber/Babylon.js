import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";

/** Explicitly crosses from the glTF source lane into Universal. */
export class GLTFToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GLTFToUniversalBlock";

    /** The glTF source payload. */
    public readonly input: NodeAssetConnectionPoint;
    /** The Universal working payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a glTF-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Crosses the explicit type seam while retaining the proof-of-concept document payload. */
    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = GetGltfAsset(this.input.value, this.input.name);
    }
}

RegisterBlock(GLTFToUniversalBlock.ClassName, (name, nodeAsset) => new GLTFToUniversalBlock(name, nodeAsset));
