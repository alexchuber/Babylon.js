import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { type ImagePayload } from "./imagePayload";
import { ResolvePointerToImageAccessor } from "../selector/pointerToAccessor";

/**
 * Writes an IMAGE into the material texture slot addressed by a glTF Object Model JSON Pointer within a
 * SCENE and passes the (same, in-place-mutated) SCENE through. It resolves the texture-slot pointer to
 * an image accessor via NAE's path→accessor converter and calls `accessor.set(image)`, which replaces
 * the slot texture's image bytes and mime type, creating the `Texture` and wiring it into the slot when
 * the slot is empty. Together with `ExtractTexture` it closes the extract → process → set round-trip:
 * a reprocessed texture can be put back on the model.
 *
 * It is the IMAGE-typed sibling of `SetProperty`: same pointer, same converter, different value port
 * kind. It owns no pointer/mapping logic of its own and does not touch gltf-transform `Texture`
 * directly. In-place mutation is retained: the incoming `Document` is mutated and the same reference is
 * emitted. Fan-out safety (copy-on-fan-out) is the evaluator's job; this block does not clone.
 */
export class SetTexture extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "SetTexture";

    /** The SCENE `Document` to write the texture into. */
    public readonly scene: NodeAssetConnectionPoint;

    /** The glTF Object Model JSON Pointer naming the material texture slot to write. */
    public readonly pointer: NodeAssetConnectionPoint;

    /** The IMAGE payload to write into the texture slot. */
    public readonly image: NodeAssetConnectionPoint;

    /** The same SCENE `Document`, mutated in place. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new SetTexture block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.scene = this._registerInput("scene", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.pointer = this._registerInput("pointer", NodeAssetConnectionPointType.STRING);
        this.image = this._registerInput("image", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Resolves the texture-slot pointer against the input `Document`, writes the IMAGE into the slot,
     * and emits the same document.
     * @throws If no input document is connected, or the converter cannot resolve the pointer to a
     * texture slot.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.scene.value == null) {
            throw new Error(`The "${this.name}" SetTexture block has no input document to write.`);
        }
        const asset = GetGltfAsset(this.scene.value, this.scene.name);

        const accessor = ResolvePointerToImageAccessor(asset.document, this.pointer.value as string);
        accessor.set(this.image.value as ImagePayload);
        // In-place mutation: emit the same reference (copy-on-fan-out is handled by the evaluator).
        this.output.value = asset;
    }
}

RegisterBlock(SetTexture.ClassName, (name, nodeAsset) => new SetTexture(name, nodeAsset));
