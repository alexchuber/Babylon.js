import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Composes individual PBR material components (metallic, roughness, base color, normal, emissive)
 * into a JSON description suitable for applying to a glTF material.
 */
export class ComposeGLTFMaterialBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ComposeGLTFMaterialBlock";

    /** The metallic factor input. */
    public readonly metallic: NodeAssetConnectionPoint;

    /** The roughness factor input. */
    public readonly roughness: NodeAssetConnectionPoint;

    /** The base color texture image input. */
    public readonly baseColor: NodeAssetConnectionPoint;

    /** The normal map image input. */
    public readonly normal: NodeAssetConnectionPoint;

    /** The emissive texture image input. */
    public readonly emissive: NodeAssetConnectionPoint;

    /** The composed material description as JSON. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new compose glTF material block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.metallic = this._registerInput("metallic", NodeAssetConnectionPointType.NUMBER);
        this.roughness = this._registerInput("roughness", NodeAssetConnectionPointType.NUMBER);
        this.baseColor = this._registerInput("baseColor", NodeAssetConnectionPointType.IMAGE);
        this.normal = this._registerInput("normal", NodeAssetConnectionPointType.IMAGE);
        this.emissive = this._registerInput("emissive", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Not yet implemented.
     * @throws Always throws — this is a husk block.
     */
    public override async _buildBlockAsync(): Promise<void> {
        throw new Error(`${this.getClassName()}._buildBlockAsync is not yet implemented.`);
    }
}

RegisterBlock(ComposeGLTFMaterialBlock.ClassName, (name, nodeAsset) => new ComposeGLTFMaterialBlock(name, nodeAsset));
