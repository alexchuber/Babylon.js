import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { type NodeAsset } from "../nodeAsset";
import { type ImagePayload } from "./imagePayload";

/**
 * Composes individual PBR material components (metallic, roughness, base color, normal, emissive)
 * into a JSON description suitable for applying to a glTF material. Numeric factors are clamped to
 * [0, 1] per the glTF spec. Texture presence is indicated by boolean flags; the actual image data
 * is not embedded in the JSON output since it is not JSON-serializable.
 */
export class ComposeGLTFMaterialBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ComposeGLTFMaterialBlock";

    /** The metallic factor input. */
    public readonly metallic: NodeAssetConnectionPoint;

    /** The roughness factor input. */
    public readonly roughness: NodeAssetConnectionPoint;

    /** The base color texture image input. */
    public readonly baseColor: NodeAssetConnectionPoint;

    /** The normal map image input. */
    public readonly normal: NodeAssetConnectionPoint;

    /** The emissive texture image input. */
    public readonly emissive: NodeAssetConnectionPoint;

    /** The composed material description as JSON. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new compose glTF material block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.metallic = this._registerInput("metallic", NodeAssetConnectionPointType.NUMBER);
        this.roughness = this._registerInput("roughness", NodeAssetConnectionPointType.NUMBER);
        this.baseColor = this._registerInput("baseColor", NodeAssetConnectionPointType.IMAGE);
        this.normal = this._registerInput("normal", NodeAssetConnectionPointType.IMAGE);
        this.emissive = this._registerInput("emissive", NodeAssetConnectionPointType.IMAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Collects all connected inputs into a JSON material descriptor object. Numeric factors
     * default to glTF spec values (metallic=1, roughness=1) when their inputs are null, and are
     * clamped to [0, 1]. Texture channels are indicated by boolean presence flags.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const metallicRaw = typeof this.metallic.value === "number" ? this.metallic.value : 1.0;
        const roughnessRaw = typeof this.roughness.value === "number" ? this.roughness.value : 1.0;
        const metallicFactor = Math.max(0, Math.min(1, metallicRaw));
        const roughnessFactor = Math.max(0, Math.min(1, roughnessRaw));

        const hasBaseColor = IsImagePayload(this.baseColor.value);
        const hasNormal = IsImagePayload(this.normal.value);
        const hasEmissive = IsImagePayload(this.emissive.value);

        const descriptor: NodeAssetJsonObject = {
            pbrMetallicRoughness: {
                metallicFactor,
                roughnessFactor,
            },
            hasBaseColorTexture: hasBaseColor,
            hasNormalTexture: hasNormal,
            hasEmissiveTexture: hasEmissive,
        };

        this.output.value = descriptor;
    }
}

/**
 * Tests whether a runtime value looks like a valid {@link ImagePayload}.
 * @param value - The value to test.
 * @returns Whether the value has the shape of an ImagePayload.
 */
function IsImagePayload(value: unknown): value is ImagePayload {
    if (value == null || typeof value !== "object") {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return candidate.data instanceof Uint8Array && typeof candidate.mimeType === "string";
}

RegisterBlock(ComposeGLTFMaterialBlock.ClassName, (name, nodeAsset) => new ComposeGLTFMaterialBlock(name, nodeAsset));
