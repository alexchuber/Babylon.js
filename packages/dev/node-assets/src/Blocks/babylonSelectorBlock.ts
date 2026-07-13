import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Selects an entity from a {@link BabylonAsset} (BABYLON_SCENE) using a query string and
 * exposes the result as a JSON object.
 */
export class BabylonSelectorBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "BabylonSelectorBlock";

    /** The Babylon scene to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The query string identifying the entity to select. */
    public readonly query: NodeAssetConnectionPoint;

    /** The selected entity as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new Babylon selector block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SCENE);
        this.query = this._registerInput("query", NodeAssetConnectionPointType.STRING);
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

RegisterBlock(BabylonSelectorBlock.ClassName, (name, nodeAsset) => new BabylonSelectorBlock(name, nodeAsset));
