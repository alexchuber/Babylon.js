import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Imports a Node Geometry graph from a URL or snippet ID and exposes it as a
 * {@link NodeGeometryAsset} on its output.
 */
export class ImportNodeGeometryBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportNodeGeometryBlock";

    /** The URL or snippet ID to load the Node Geometry from. */
    public readonly url: NodeAssetConnectionPoint;

    /** The imported Node Geometry representation. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new Node Geometry import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.url = this._registerInput("url", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    }

    /**
     * Not yet implemented.
     * @throws Always throws — this is a husk block.
     */
    public override async _buildBlockAsync(): Promise<void> {
        throw new Error(`${this.getClassName()}._buildBlockAsync is not yet implemented.`);
    }
}

RegisterBlock(ImportNodeGeometryBlock.ClassName, (name, nodeAsset) => new ImportNodeGeometryBlock(name, nodeAsset));
