import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Selects a prim or property from a {@link UsdAsset} (USD_STAGE) using a query string and
 * exposes the result as a JSON object.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class USDSelectorBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "USDSelectorBlock";

    /** The USD stage to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The query string identifying the element to select. */
    public readonly query: NodeAssetConnectionPoint;

    /** The selected element as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new USD selector block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
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

RegisterBlock(USDSelectorBlock.ClassName, (name, nodeAsset) => new USDSelectorBlock(name, nodeAsset));
