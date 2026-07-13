import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Retrieves a mesh from a {@link BabylonAsset} (BABYLON_SCENE) by name and exposes its
 * properties as a JSON object.
 */
export class GetBabylonMeshBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GetBabylonMeshBlock";

    /** The Babylon scene to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The name of the mesh to retrieve. */
    public readonly meshName: NodeAssetConnectionPoint;

    /** The mesh properties as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new get Babylon mesh block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SCENE);
        this.meshName = this._registerInput("meshName", NodeAssetConnectionPointType.STRING);
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

RegisterBlock(GetBabylonMeshBlock.ClassName, (name, nodeAsset) => new GetBabylonMeshBlock(name, nodeAsset));
