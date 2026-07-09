import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/**
 * Checks that a string is a well-formed glTF Object Model JSON Pointer by **shape**: it must start
 * with `/` and have no empty segments (so no leading/trailing/doubled slashes). This is a syntactic
 * check only — it does not verify the pointer resolves against any `Document`.
 * @param pointer - The candidate pointer string.
 * @returns True when the pointer is shape-valid.
 */
function IsWellFormedPointer(pointer: string): boolean {
    if (!pointer.startsWith("/")) {
        return false;
    }
    return pointer
        .slice(1)
        .split("/")
        .every((segment) => segment.length > 0);
}

/**
 * Emits a glTF Object Model JSON Pointer (e.g. `/nodes/0/translation`,
 * `/materials/2/pbrMetallicRoughness/baseColorFactor`) as a STRING for {@link GetProperty} /
 * {@link SetProperty} to act on. The pointer is authored in the properties pane and can be overridden
 * by an upstream STRING input.
 *
 * The block validates only the pointer's **shape** (a well-formed JSON Pointer); it does not resolve
 * it against a SCENE `Document` — that is the converter's job, invoked by Get/Set. Pointers are
 * single-target and index-based; wildcard/query syntax is a later, additive extension.
 */
export class Selector extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "Selector";

    /** The authored glTF Object Model JSON Pointer, edited in the properties pane. */
    public pointer = "";

    /** Optional STRING override; when connected, its value wins over the authored {@link pointer}. */
    public readonly pointerOverride: NodeAssetConnectionPoint;

    /** The resolved pointer, emitted as a STRING. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new selector block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.pointerOverride = this._registerInput("pointerOverride", NodeAssetConnectionPointType.STRING, true);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.STRING);
    }

    /**
     * Picks the override value when the override input is connected, else the authored {@link pointer},
     * validates its shape, and emits it on the output.
     * @throws If the chosen pointer is not a well-formed JSON Pointer.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const pointer = this.pointerOverride.isConnected ? (this.pointerOverride.value as string) : this.pointer;
        if (!IsWellFormedPointer(pointer)) {
            throw new Error(`The "${this.name}" selector block has a malformed pointer "${pointer}": a pointer must start with "/" and have no empty segments.`);
        }
        this.output.value = pointer;
    }

    /**
     * Serializes this block's authored {@link pointer}.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.pointer = this.pointer;
        return serializationObject;
    }

    /**
     * Restores this block's authored {@link pointer}.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        this.pointer = serializationObject.pointer ?? "";
    }
}

RegisterBlock(Selector.ClassName, (name, nodeAsset) => new Selector(name, nodeAsset));
