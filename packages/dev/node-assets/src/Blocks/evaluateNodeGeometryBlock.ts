import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Evaluates a {@link NodeGeometryAsset} (NODE_GEOMETRY) graph and produces a
 * {@link BabylonAsset} (BABYLON_SCENE) containing the resulting geometry.
 */
export class EvaluateNodeGeometryBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "EvaluateNodeGeometryBlock";

    /** The Node Geometry graph to evaluate. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting Babylon scene containing the evaluated geometry. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new evaluate Node Geometry block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.BABYLON_SCENE);
    }

    /**
     * Not yet implemented.
     * @throws Always throws — this is a husk block.
     */
    public override async _buildBlockAsync(): Promise<void> {
        throw new Error(`${this.getClassName()}._buildBlockAsync is not yet implemented.`);
    }
}

RegisterBlock(EvaluateNodeGeometryBlock.ClassName, (name, nodeAsset) => new EvaluateNodeGeometryBlock(name, nodeAsset));
