import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { IsBabylonAsset } from "../representations/babylonAsset";

/**
 * Parses a dot/bracket property path (e.g. `meshes[0].position.x`) into ordered segments.
 * @param path - The property path string.
 * @returns An array of string and number segments.
 */
function ParsePropertyPath(path: string): Array<string | number> {
    const segments: Array<string | number> = [];
    const regex = /([^.\[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(path)) !== null) {
        if (match[2] !== undefined) {
            segments.push(Number(match[2]));
        } else {
            segments.push(match[1]);
        }
    }
    return segments;
}

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
     * Navigates the property path on the input scene and sets the target property to the
     * given value. The same (mutated) {@link BabylonAsset} is emitted on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" block has no input scene.`);
        }
        if (!IsBabylonAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive a BabylonAsset.`);
        }
        const babylonAsset = this.input.value;

        const path = this.propertyPath.value as string;
        if (!path) {
            throw new Error(`The "${this.name}" block has no property path to set.`);
        }

        const segments = ParsePropertyPath(path);
        if (segments.length === 0) {
            throw new Error(`The "${this.name}" block has an empty property path.`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let target: any = babylonAsset.scene;
        for (let i = 0; i < segments.length - 1; i++) {
            target = target[segments[i]];
            if (target == null) {
                throw new Error(`The "${this.name}" block could not navigate path "${path}": segment "${segments[i]}" is null or undefined.`);
            }
        }

        const lastSegment = segments[segments.length - 1];
        target[lastSegment] = this.value.value;

        this.output.value = babylonAsset;
    }
}

RegisterBlock(SetBabylonPropertyBlock.ClassName, (name, nodeAsset) => new SetBabylonPropertyBlock(name, nodeAsset));
