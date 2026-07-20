import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { GetSerializedStringUnionArray, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** Selectable Universal vertex attribute kinds. */
export enum UniversalAttributeKind {
    /** Vertex normal attributes. */
    Normal = "NORMAL",
    /** Vertex tangent attributes. */
    Tangent = "TANGENT",
    /** Texture-coordinate attribute sets. */
    TextureCoordinate = "TEXCOORD",
    /** Vertex color attribute sets. */
    Color = "COLOR",
    /** Skin joint attribute sets. */
    Joints = "JOINTS",
    /** Skin weight attribute sets. */
    Weights = "WEIGHTS",
}

const UniversalAttributeKinds = Object.values(UniversalAttributeKind);

function MatchesAttributeKind(semantic: string, kind: UniversalAttributeKind): boolean {
    return semantic === kind || semantic.startsWith(`${kind}_`);
}

/** Removes selected vertex and morph-target attribute kinds from Universal content. */
export class StripAttributesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "StripAttributesBlock";

    /** The Universal content to process. */
    public readonly input: NodeAssetConnectionPoint;
    /** The processed Universal content. */
    public readonly output: NodeAssetConnectionPoint;
    /** The attribute kinds to remove. */
    public selectedAttributeKinds: UniversalAttributeKind[] = [];

    /**
     * Creates a Strip Attributes block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Removes the selected attribute kinds and passes the same Universal payload onward. */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" operator block has no input document.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);
        for (const mesh of asset.document.getRoot().listMeshes()) {
            for (const primitive of mesh.listPrimitives()) {
                for (const semantic of primitive.listSemantics()) {
                    if (this.selectedAttributeKinds.some((kind) => MatchesAttributeKind(semantic, kind))) {
                        const accessor = primitive.getAttribute(semantic);
                        primitive.setAttribute(semantic, null);
                        if (accessor?.listParents().length === 1) {
                            accessor.dispose();
                        }
                    }
                }
                for (const target of primitive.listTargets()) {
                    for (const semantic of target.listSemantics()) {
                        if (this.selectedAttributeKinds.some((kind) => MatchesAttributeKind(semantic, kind))) {
                            const accessor = target.getAttribute(semantic);
                            target.setAttribute(semantic, null);
                            if (accessor?.listParents().length === 1) {
                                accessor.dispose();
                            }
                        }
                    }
                }
            }
        }
        this.output.value = asset;
    }

    /**
     * Serializes the block.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.selectedAttributeKinds = [...this.selectedAttributeKinds];
        return serializationObject;
    }

    /**
     * Restores the block.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.selectedAttributeKinds = GetSerializedStringUnionArray(serializationObject, "selectedAttributeKinds", UniversalAttributeKinds, []);
    }
}

RegisterBlock(StripAttributesBlock.ClassName, (name, nodeAsset) => new StripAttributesBlock(name, nodeAsset));
