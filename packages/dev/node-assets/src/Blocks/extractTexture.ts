import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { ResolvePointerToImageAccessor } from "../selector/pointerToAccessor";

/**
 * Reads the texture addressed by a glTF Object Model JSON Pointer out of a SCENE and emits it as an
 * IMAGE. It resolves the texture-slot pointer to an image accessor via NAE's path→accessor converter
 * and returns `accessor.get()` (the slot texture's encoded bytes plus mime type), letting a pipeline
 * pull a texture out of a model and feed it into the 2D image lane — without a bespoke per-slot block.
 *
 * It is the IMAGE-typed sibling of `GetProperty`: same pointer, same converter, different terminating
 * port kind. It **reads**: it neither mutates nor outputs the SCENE, and owns no pointer/mapping logic
 * of its own.
 */
export class ExtractTexture extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ExtractTexture";

    /** The SCENE `Document` to read the texture from. */
    public readonly scene: NodeAssetConnectionPoint;

    /** The glTF Object Model JSON Pointer naming the material texture slot to read. */
    public readonly pointer: NodeAssetConnectionPoint;

    /** The referenced texture's image bytes and mime type, emitted as an IMAGE payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new ExtractTexture block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.scene = this._registerInput("scene", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.pointer = this._registerInput("pointer", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Resolves the texture-slot pointer against the input `Document` and emits the slot texture's image
     * payload on the output.
     * @throws If no input document is connected, or the converter cannot resolve the pointer to a
     * texture slot with a readable image.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.scene.value == null) {
            throw new Error(`The "${this.name}" ExtractTexture block has no input document to read.`);
        }
        const asset = GetGltfAsset(this.scene.value, this.scene.name);

        const accessor = ResolvePointerToImageAccessor(asset.document, this.pointer.value as string);
        this.output.value = accessor.get();
    }
}

RegisterBlock(ExtractTexture.ClassName, (name, nodeAsset) => new ExtractTexture(name, nodeAsset));
