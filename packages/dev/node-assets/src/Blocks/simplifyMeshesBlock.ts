import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetSerializedBoolean, GetSerializedNumber, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

function InvalidProperty(property: string): TypeError {
    return new TypeError(`Invalid serialized block property "${property}".`);
}

function ValidateRatio(value: number, property: string): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw InvalidProperty(property);
    }
}

/**
 * Reduces mesh geometry in Universal content toward a target ratio and error limit.
 */
export class SimplifyMeshesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "SimplifyMeshesBlock";

    /** The Universal content to simplify. */
    public readonly input: NodeAssetConnectionPoint;

    /** The simplified Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Target ratio of mesh geometry to keep. */
    public targetRatio = 0.5;

    /** Maximum geometric error as a fraction of mesh radius. */
    public errorLimit = 0.001;

    /** Whether topological mesh borders remain locked during simplification. */
    public lockBorder = false;

    /**
     * Creates a Simplify Meshes block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Simplifies mesh geometry and forwards the Universal payload. */
    public override async _buildBlockAsync(): Promise<void> {
        ValidateRatio(this.targetRatio, "targetRatio");
        ValidateRatio(this.errorLimit, "errorLimit");
        if (typeof this.lockBorder !== "boolean") {
            throw InvalidProperty("lockBorder");
        }
        const { simplify } = await import("@gltf-transform/functions");
        const { MeshoptSimplifier } = await import("meshoptimizer");
        await MeshoptSimplifier.ready;
        await ApplyOperatorTransformsAsync(
            this,
            simplify({
                simplifier: MeshoptSimplifier,
                ratio: this.targetRatio,
                error: this.errorLimit,
                lockBorder: this.lockBorder,
            })
        );
    }

    /**
     * Serializes all simplification options.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        ValidateRatio(this.targetRatio, "targetRatio");
        ValidateRatio(this.errorLimit, "errorLimit");
        if (typeof this.lockBorder !== "boolean") {
            throw InvalidProperty("lockBorder");
        }
        return {
            ...super.serialize(),
            targetRatio: this.targetRatio,
            errorLimit: this.errorLimit,
            lockBorder: this.lockBorder,
        };
    }

    /**
     * Restores all simplification options.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.targetRatio = GetSerializedNumber(serializationObject, "targetRatio", 0.5);
        this.errorLimit = GetSerializedNumber(serializationObject, "errorLimit", 0.001);
        this.lockBorder = GetSerializedBoolean(serializationObject, "lockBorder", false);
        ValidateRatio(this.targetRatio, "targetRatio");
        ValidateRatio(this.errorLimit, "errorLimit");
    }
}

RegisterBlock(SimplifyMeshesBlock.ClassName, (name, nodeAsset) => new SimplifyMeshesBlock(name, nodeAsset));
