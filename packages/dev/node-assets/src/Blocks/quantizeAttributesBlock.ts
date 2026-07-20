import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import {
    GetSerializedBoolean,
    GetSerializedIntegerInRange,
    GetSerializedString,
    GetSerializedStringUnion,
    type NodeAssetBlockSerialization,
} from "../serialization/nodeAssetSerialization";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

const MinimumQuantizationBits = 8;
const MaximumQuantizationBits = 16;
const DefaultAttributePattern = ".*";

/**
 * Bounds used to derive the position quantization grid.
 */
export enum QuantizationVolume {
    /** Derive independent bounds for each mesh. */
    Mesh = "mesh",
    /** Derive shared bounds across the complete scene. */
    Scene = "scene",
}

function InvalidProperty(property: string): TypeError {
    return new TypeError(`Invalid serialized block property "${property}".`);
}

function ValidatePattern(pattern: string, property: string): void {
    if (typeof pattern !== "string") {
        throw InvalidProperty(property);
    }
    try {
        new RegExp(pattern);
    } catch {
        throw InvalidProperty(property);
    }
}

function ValidateOptions(block: QuantizeAttributesBlock): void {
    for (const [property, value] of [
        ["positionBits", block.positionBits],
        ["normalBits", block.normalBits],
        ["textureCoordinateBits", block.textureCoordinateBits],
        ["colorBits", block.colorBits],
        ["weightBits", block.weightBits],
        ["genericBits", block.genericBits],
    ] as const) {
        if (!Number.isInteger(value) || value < MinimumQuantizationBits || value > MaximumQuantizationBits) {
            throw InvalidProperty(property);
        }
    }
    if (typeof block.normalizeWeights !== "boolean") {
        throw InvalidProperty("normalizeWeights");
    }
    ValidatePattern(block.attributePattern, "attributePattern");
    ValidatePattern(block.morphTargetPattern, "morphTargetPattern");
    if (block.quantizationVolume !== QuantizationVolume.Mesh && block.quantizationVolume !== QuantizationVolume.Scene) {
        throw InvalidProperty("quantizationVolume");
    }
    if (typeof block.cleanup !== "boolean") {
        throw InvalidProperty("cleanup");
    }
}

/**
 * Reduces the precision of selected Universal vertex attributes while preserving a valid Universal
 * payload.
 */
export class QuantizeAttributesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "QuantizeAttributesBlock";

    /** The Universal content to quantize. */
    public readonly input: NodeAssetConnectionPoint;

    /** The quantized Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Bits used for position attributes. */
    public positionBits = 14;

    /** Bits used for normal and tangent attributes. */
    public normalBits = 10;

    /** Bits used for texture-coordinate attributes. */
    public textureCoordinateBits = 12;

    /** Bits used for color attributes. */
    public colorBits = 8;

    /** Bits used for skin-weight attributes. */
    public weightBits = 8;

    /** Bits used for application-specific attributes. */
    public genericBits = 12;

    /** Whether skin weights are normalized after quantization. */
    public normalizeWeights = true;

    /** Regular-expression source selecting vertex attribute semantics. */
    public attributePattern = DefaultAttributePattern;

    /** Regular-expression source selecting morph-target semantics. */
    public morphTargetPattern = DefaultAttributePattern;

    /** Bounds used to derive the position quantization grid. */
    public quantizationVolume = QuantizationVolume.Mesh;

    /** Whether temporary and duplicate resources are cleaned up after quantization. */
    public cleanup = true;

    /**
     * Creates a Quantize Attributes block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Quantizes selected attributes and forwards the Universal payload. */
    public override async _buildBlockAsync(): Promise<void> {
        ValidateOptions(this);
        const { quantize } = await import("@gltf-transform/functions");
        await ApplyOperatorTransformsAsync(
            this,
            quantize({
                quantizePosition: this.positionBits,
                quantizeNormal: this.normalBits,
                quantizeTexcoord: this.textureCoordinateBits,
                quantizeColor: this.colorBits,
                quantizeWeight: this.weightBits,
                quantizeGeneric: this.genericBits,
                normalizeWeights: this.normalizeWeights,
                pattern: new RegExp(this.attributePattern),
                patternTargets: new RegExp(this.morphTargetPattern),
                quantizationVolume: this.quantizationVolume,
                cleanup: this.cleanup,
            })
        );
    }

    /**
     * Serializes all quantization options.
     * @returns The serialized block.
     */
    public override serialize(): NodeAssetBlockSerialization {
        ValidateOptions(this);
        return {
            ...super.serialize(),
            positionBits: this.positionBits,
            normalBits: this.normalBits,
            textureCoordinateBits: this.textureCoordinateBits,
            colorBits: this.colorBits,
            weightBits: this.weightBits,
            genericBits: this.genericBits,
            normalizeWeights: this.normalizeWeights,
            attributePattern: this.attributePattern,
            morphTargetPattern: this.morphTargetPattern,
            quantizationVolume: this.quantizationVolume,
            cleanup: this.cleanup,
        };
    }

    /**
     * Restores all quantization options.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.positionBits = GetSerializedIntegerInRange(serializationObject, "positionBits", MinimumQuantizationBits, MaximumQuantizationBits, 14);
        this.normalBits = GetSerializedIntegerInRange(serializationObject, "normalBits", MinimumQuantizationBits, MaximumQuantizationBits, 10);
        this.textureCoordinateBits = GetSerializedIntegerInRange(serializationObject, "textureCoordinateBits", MinimumQuantizationBits, MaximumQuantizationBits, 12);
        this.colorBits = GetSerializedIntegerInRange(serializationObject, "colorBits", MinimumQuantizationBits, MaximumQuantizationBits, 8);
        this.weightBits = GetSerializedIntegerInRange(serializationObject, "weightBits", MinimumQuantizationBits, MaximumQuantizationBits, 8);
        this.genericBits = GetSerializedIntegerInRange(serializationObject, "genericBits", MinimumQuantizationBits, MaximumQuantizationBits, 12);
        this.normalizeWeights = GetSerializedBoolean(serializationObject, "normalizeWeights", true);
        this.attributePattern = GetSerializedString(serializationObject, "attributePattern", DefaultAttributePattern);
        this.morphTargetPattern = GetSerializedString(serializationObject, "morphTargetPattern", DefaultAttributePattern);
        this.quantizationVolume = GetSerializedStringUnion(serializationObject, "quantizationVolume", [QuantizationVolume.Mesh, QuantizationVolume.Scene], QuantizationVolume.Mesh);
        this.cleanup = GetSerializedBoolean(serializationObject, "cleanup", true);
        ValidateOptions(this);
    }
}

RegisterBlock(QuantizeAttributesBlock.ClassName, (name, nodeAsset) => new QuantizeAttributesBlock(name, nodeAsset));
