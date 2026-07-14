import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedNumber, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { type ImagePayload } from "./imagePayload";

/**
 * Stamps an overlay `IMAGE` onto a base `IMAGE` at a pixel offset, emitting the composited result as
 * a new `IMAGE` payload the size of the base. It decodes both inputs, draws the base into a
 * base-sized canvas, draws the overlay at ({@link offsetX}, {@link offsetY}) over it (source-over, at
 * the overlay's natural size), and re-encodes preserving the base mime type. The canvas work lives in
 * the shared `imageCanvas` helper, so this block only supplies the overlay and its offset. This is the
 * image lane's two-input op — the watermark / badge / logo primitive.
 */
export class CompositeImageBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "CompositeImageBlock";

    /** Horizontal offset, in pixels, of the overlay's left edge from the base's left edge. */
    public offsetX = 0;

    /** Vertical offset, in pixels, of the overlay's top edge from the base's top edge. */
    public offsetY = 0;

    /** The base `IMAGE` payload the overlay is stamped onto; sets the output size and mime type. */
    public readonly base: NodeAssetConnectionPoint;

    /** The overlay `IMAGE` payload stamped onto the base at ({@link offsetX}, {@link offsetY}). */
    public readonly overlay: NodeAssetConnectionPoint;

    /** The composited image, emitted as a new `IMAGE` payload the size of the base. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new image composite block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.base = this._registerInput("base", NodeAssetConnectionPointType.IMAGE);
        this.overlay = this._registerInput("overlay", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Draws the connected overlay onto the base at ({@link offsetX}, {@link offsetY}) and sets the
     * composited result, sized and mime-typed to follow the base, as the output.
     * @throws If either the base or the overlay input image is missing.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const base = this.base.value as Nullable<ImagePayload>;
        if (!base) {
            throw new Error(`The "${this.name}" composite block has no base image to composite onto.`);
        }
        const overlay = this.overlay.value as Nullable<ImagePayload>;
        if (!overlay) {
            throw new Error(`The "${this.name}" composite block has no overlay image to composite.`);
        }

        const { ProcessImageAsync } = await import("./imageCanvas");
        this.output.value = await ProcessImageAsync(base, {
            composite: { overlay, offsetX: this.offsetX, offsetY: this.offsetY },
        });
    }

    /**
     * Serializes this block's overlay offset.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.offsetX = this.offsetX;
        serializationObject.offsetY = this.offsetY;
        return serializationObject;
    }

    /**
     * Restores this block's overlay offset.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.offsetX = GetSerializedNumber(serializationObject, "offsetX", 0);
        this.offsetY = GetSerializedNumber(serializationObject, "offsetY", 0);
    }
}

RegisterBlock(CompositeImageBlock.ClassName, (name, nodeAsset) => new CompositeImageBlock(name, nodeAsset));
