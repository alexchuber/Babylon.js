import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Decomposes a glTF material selected from a {@link GltfAsset} into its individual PBR components:
 * metallic factor, roughness factor, base color image, normal image, and emissive image.
 */
export class DecomposeGLTFMaterialBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DecomposeGLTFMaterialBlock";

    /** The glTF document containing the material to decompose. */
    public readonly input: NodeAssetConnectionPoint;

    /** A JSON selector identifying which material to decompose. */
    public readonly selector: NodeAssetConnectionPoint;

    /** The material's metallic factor. */
    public readonly metallic: NodeAssetConnectionPoint;

    /** The material's roughness factor. */
    public readonly roughness: NodeAssetConnectionPoint;

    /** The material's base color texture image. */
    public readonly baseColor: NodeAssetConnectionPoint;

    /** The material's normal map image. */
    public readonly normal: NodeAssetConnectionPoint;

    /** The material's emissive texture image. */
    public readonly emissive: NodeAssetConnectionPoint;

    /**
     * Creates a new decompose glTF material block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.selector = this._registerInput("selector", NodeAssetConnectionPointType.JSON);
        this.metallic = this._registerOutput("metallic", NodeAssetConnectionPointType.NUMBER);
        this.roughness = this._registerOutput("roughness", NodeAssetConnectionPointType.NUMBER);
        this.baseColor = this._registerOutput("baseColor", NodeAssetConnectionPointType.IMAGE);
        this.normal = this._registerOutput("normal", NodeAssetConnectionPointType.IMAGE);
        this.emissive = this._registerOutput("emissive", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Not yet implemented.
     * @throws Always throws — this is a husk block.
     */
    public override async _buildBlockAsync(): Promise<void> {
        throw new Error(`${this.getClassName()}._buildBlockAsync is not yet implemented.`);
    }
}

RegisterBlock(DecomposeGLTFMaterialBlock.ClassName, (name, nodeAsset) => new DecomposeGLTFMaterialBlock(name, nodeAsset));
