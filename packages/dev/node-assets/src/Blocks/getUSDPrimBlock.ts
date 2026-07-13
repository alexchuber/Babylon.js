import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Retrieves a prim from a {@link UsdAsset} (USD_STAGE) by path and exposes its properties
 * as a JSON object.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class GetUSDPrimBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GetUSDPrimBlock";

    /** The USD stage to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The prim path to retrieve. */
    public readonly primPath: NodeAssetConnectionPoint;

    /** The prim properties as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new get USD prim block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
        this.primPath = this._registerInput("primPath", NodeAssetConnectionPointType.STRING);
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

RegisterBlock(GetUSDPrimBlock.ClassName, (name, nodeAsset) => new GetUSDPrimBlock(name, nodeAsset));
