import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Transcodes a {@link UsdAsset} (USD_STAGE) into a {@link BabylonAsset} (BABYLON_SCENE).
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class USD2BabylonBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "USD2BabylonBlock";

    /** The USD stage to transcode. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting Babylon scene. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new USD-to-Babylon transcoder block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
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

RegisterBlock(USD2BabylonBlock.ClassName, (name, nodeAsset) => new USD2BabylonBlock(name, nodeAsset));
