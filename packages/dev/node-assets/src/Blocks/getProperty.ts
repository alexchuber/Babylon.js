import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { ResolvePointerToAccessor } from "../selector/pointerToAccessor";

/**
 * Reads the property addressed by a glTF Object Model JSON Pointer out of a SCENE and emits its value
 * as JSON. It resolves the pointer to a property accessor via NAE's path→accessor converter and
 * returns `accessor.get()`, letting a pipeline extract any mapped property — a material factor, a node
 * transform, an `extras` value — without a bespoke per-property block.
 *
 * It **reads**: it neither mutates nor outputs the SCENE, and owns no pointer/mapping logic of its own.
 */
export class GetProperty extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GetProperty";

    /** The SCENE `Document` to read from. */
    public readonly scene: NodeAssetConnectionPoint;

    /** The glTF Object Model JSON Pointer naming the property to read. */
    public readonly pointer: NodeAssetConnectionPoint;

    /** The value read at the pointer, emitted as JSON. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new GetProperty block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.scene = this._registerInput("scene", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.pointer = this._registerInput("pointer", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Resolves the pointer against the input `Document` and emits the read value on the output.
     * @throws If no input document is connected, or the converter cannot resolve the pointer.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.scene.value == null) {
            throw new Error(`The "${this.name}" GetProperty block has no input document to read.`);
        }
        const asset = GetGltfAsset(this.scene.value, this.scene.name);

        const accessor = ResolvePointerToAccessor(asset.document, this.pointer.value as string);
        this.output.value = accessor.get();
    }
}

RegisterBlock(GetProperty.ClassName, (name, nodeAsset) => new GetProperty(name, nodeAsset));
