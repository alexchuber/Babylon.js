import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";

/** Explicitly crosses from Universal into the glTF delivery lane. */
export class UniversalToGLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "UniversalToGLTFBlock";

    /** The Universal working payload. */
    public readonly input: NodeAssetConnectionPoint;
    /** The glTF delivery payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Universal-to-glTF transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /** Crosses the explicit type seam while retaining the proof-of-concept document payload. */
    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = GetGltfAsset(this.input.value, this.input.name);
    }
}

RegisterBlock(UniversalToGLTFBlock.ClassName, (name, nodeAsset) => new UniversalToGLTFBlock(name, nodeAsset));
