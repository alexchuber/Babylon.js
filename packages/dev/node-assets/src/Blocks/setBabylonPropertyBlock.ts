import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Sets a property on a {@link BabylonAsset} (BABYLON_SCENE) identified by a path string,
 * using a JSON value, and outputs the modified scene.
 */
export class SetBabylonPropertyBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "SetBabylonPropertyBlock";

    /** The Babylon scene to modify. */
    public readonly input: NodeAssetConnectionPoint;

    /** The property path to set. */
    public readonly propertyPath: NodeAssetConnectionPoint;

    /** The value to assign. */
    public readonly value: NodeAssetConnectionPoint;

    /** The modified Babylon scene. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new set Babylon property block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SCENE);
        this.propertyPath = this._registerInput("propertyPath", NodeAssetConnectionPointType.STRING);
        this.value = this._registerInput("value", NodeAssetConnectionPointType.JSON);
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

RegisterBlock(SetBabylonPropertyBlock.ClassName, (name, nodeAsset) => new SetBabylonPropertyBlock(name, nodeAsset));
