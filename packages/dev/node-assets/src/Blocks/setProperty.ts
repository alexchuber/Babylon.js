import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { ResolvePointerToAccessor } from "../selector/pointerToAccessor";

/**
 * Writes a JSON value at the property addressed by a glTF Object Model JSON Pointer into a SCENE and
 * passes the (same, in-place-mutated) SCENE through. It resolves the pointer to a property accessor via
 * NAE's path→accessor converter and calls `accessor.set(value)`. One block recolours a material,
 * repositions a node, or stamps arbitrary `extras` — replacing an unbounded family of property-specific
 * nodes.
 *
 * In-place mutation is retained: the incoming `Document` is mutated and the same reference is emitted.
 * Fan-out safety (copy-on-fan-out) is deferred to a later slice; this block does not clone.
 */
export class SetProperty extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "SetProperty";

    /** The SCENE `Document` to write into. */
    public readonly scene: NodeAssetConnectionPoint;

    /** The glTF Object Model JSON Pointer naming the property to write. */
    public readonly pointer: NodeAssetConnectionPoint;

    /** The JSON value to write at the pointer. */
    public readonly value: NodeAssetConnectionPoint;

    /** The same SCENE `Document`, mutated in place. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new SetProperty block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.scene = this._registerInput("scene", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.pointer = this._registerInput("pointer", NodeAssetConnectionPointType.STRING);
        this.value = this._registerInput("value", NodeAssetConnectionPointType.JSON);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Resolves the pointer against the input `Document`, writes the value, and emits the same document.
     * @throws If no input document is connected, or the converter cannot resolve the pointer.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.scene.value == null) {
            throw new Error(`The "${this.name}" SetProperty block has no input document to write.`);
        }
        const asset = GetGltfAsset(this.scene.value, this.scene.name);

        const accessor = ResolvePointerToAccessor(asset.document, this.pointer.value as string);
        accessor.set(this.value.value);
        // In-place mutation: emit the same reference (copy-on-fan-out is deferred to a later slice).
        this.output.value = asset;
    }
}

RegisterBlock(SetProperty.ClassName, (name, nodeAsset) => new SetProperty(name, nodeAsset));
