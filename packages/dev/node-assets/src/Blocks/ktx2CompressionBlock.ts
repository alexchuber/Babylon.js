import { type KTX2Options } from "ktx2-encoder/gltf-transform";
import { type Document, type Texture } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import {
    GetSerializedBoolean,
    GetSerializedIntegerInRange,
    GetSerializedNullableString,
    GetSerializedNumber,
    GetSerializedString,
    GetSerializedStringUnion,
    type NodeAssetBlockSerialization,
} from "../serialization/nodeAssetSerialization";
import { GetGltfAsset } from "../representations/gltfAsset";

/** Source mime types the Basis encoder accepts; mirrors `ktx2-encoder`'s own filter. */
const Ktx2SupportedSourceMimeTypes: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * The standard glTF core material texture slot edge names the `colorTextureSlots` /
 * `dataTextureSlots` filters are designed to select between (base color / emissive as color,
 * normal / metallic-roughness / occlusion as data). Used to detect filter patterns that would
 * match the same slot for both codecs.
 */
const KnownTextureSlotEdgeNames: readonly string[] = ["baseColorTexture", "emissiveTexture", "normalTexture", "metallicRoughnessTexture", "occlusionTexture"];

/**
 * Lists the known texture slots matched by both the color and data slot filters.
 * @param colorSlotsRe - The color slot filter.
 * @param dataSlotsRe - The data slot filter.
 * @returns The overlapping slot names; an empty list means the filters do not conflict.
 */
function GetOverlappingTextureSlots(colorSlotsRe: RegExp, dataSlotsRe: RegExp): string[] {
    return KnownTextureSlotEdgeNames.filter((slot) => colorSlotsRe.test(slot) && dataSlotsRe.test(slot));
}

/**
 * Lists the named material/extension slots a texture is attached to (e.g. `baseColorTexture`,
 * `normalTexture`), mirroring the slot resolution `ktx2-encoder`'s gltf-transform integration
 * uses to filter textures by the block's `colorTextureSlots` / `dataTextureSlots` patterns.
 * @param document - The document the texture belongs to.
 * @param texture - The texture to inspect.
 * @returns The distinct parent edge names.
 */
function ListTextureSlotNames(document: Document, texture: Texture): string[] {
    const root = document.getRoot();
    const slots = texture
        .getGraph()
        .listParentEdges(texture)
        .filter((edge) => edge.getParent() !== root)
        .map((edge) => edge.getName());
    return Array.from(new Set(slots));
}

/**
 * Determines whether `ktx2-encoder` would attempt to encode this texture under the given pattern
 * and slot filters, replicating its own eligibility checks (mime type, pattern, slots) so a
 * texture that qualifies but does not end up KTX2-encoded can be treated as a genuine failure
 * rather than an intentional skip.
 * @param document - The document the texture belongs to.
 * @param texture - The texture to check.
 * @param patternRe - The optional texture name/URI pattern filter.
 * @param slotsRe - The color or data slot filter.
 * @returns Whether the texture is eligible for encoding under these filters.
 */
function IsEligibleForKtx2Encode(document: Document, texture: Texture, patternRe: RegExp | null, slotsRe: RegExp): boolean {
    if (texture.getMimeType() === "image/ktx2") {
        return false;
    }
    if (!Ktx2SupportedSourceMimeTypes.includes(texture.getMimeType())) {
        return false;
    }
    if (!texture.getImage()) {
        return false;
    }
    if (patternRe && !patternRe.test(texture.getName()) && !patternRe.test(texture.getURI())) {
        return false;
    }
    const slots = ListTextureSlotNames(document, texture);
    if (slots.length > 0 && !slots.some((slot) => slotsRe.test(slot))) {
        return false;
    }
    return true;
}

/**
 * Labels a texture for diagnostics, preferring its URI, then its name, then its position.
 * @param texture - The texture to label.
 * @param textures - All textures in the document, used to compute a positional fallback.
 * @returns A human-readable texture label.
 */
function GetTextureLabel(texture: Texture, textures: readonly Texture[]): string {
    return texture.getURI() || texture.getName() || `texture ${textures.indexOf(texture) + 1}/${textures.length}`;
}

/** The texture payload container emitted by the Basis encoder. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type KTX2OutputContainer = "ktx2" | "basis";

/** The source interpretation used by the Basis HDR encoder. */
export type KTX2HDRSourceType = "hdr" | "exr" | "raster";

function ValidateRegularExpression(value: string | null, property: string): void {
    if (value === null) {
        return;
    }
    try {
        new RegExp(value);
    } catch {
        throw new TypeError(`Invalid serialized block property "${property}".`);
    }
}

function GetSerializedNumberInRange(serializationObject: NodeAssetBlockSerialization, property: string, minimum: number, maximum: number, defaultValue: number): number {
    const value = GetSerializedNumber(serializationObject, property, defaultValue);
    if (value < minimum || value > maximum) {
        throw new TypeError(`Invalid serialized block property "${property}".`);
    }
    return value;
}

function GetSerializedStringRecord(serializationObject: NodeAssetBlockSerialization, property: string): Record<string, string> {
    const value = serializationObject[property];
    if (value === undefined) {
        return {};
    }
    if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.values(value).every((entry) => typeof entry === "string")) {
        throw new TypeError(`Invalid serialized block property "${property}".`);
    }
    return value as Record<string, string>;
}

/**
 * Compresses a glTF `Document`'s textures to KTX2 / Basis Universal in place and flags the
 * `KHR_texture_basisu` extension, so an `ImportGLTFBlock -> KTX2CompressionBlock -> ExportGLTFBlock`
 * graph writes a glb whose textures are KTX2.
 *
 * The encode runs inside this block (not at export time) via the `ktx2-encoder` library, which
 * wraps the Basis Universal WASM encoder and integrates with gltf-transform. Two passes implement
 * the color/data codec split from the design:
 * - ETC1S for color textures (sRGB base color / emissive slots).
 * - UASTC for non-color data textures (normal / metallic-roughness / occlusion slots).
 *
 * Textures the encoder cannot or should not handle pass through unchanged and the export stays
 * valid: unsupported source formats (e.g. HDR, or anything other than jpeg/png/webp) and already
 * KTX2 textures are skipped by the library, and any per-texture encode failure is caught and left
 * as-is.
 *
 * Note: the design also calls for skipping textures whose dimensions are not a multiple of four.
 * The Basis encoder used here handles arbitrary dimensions without corruption, so that check is
 * treated as a documented simplification rather than implemented as a bespoke pre-filter.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KTX2CompressionBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "KTX2CompressionBlock";

    /** The gltf-transform `Document` whose textures will be compressed. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same `Document`, with compatible textures replaced by KTX2 payloads. */
    public readonly output: NodeAssetConnectionPoint;

    /** Whether to generate mipmaps while encoding. */
    public generateMipmaps = false;

    /** Optional regular expression matched against texture names and URIs. */
    public texturePattern: string | null = null;

    /** Regular expression matching color texture slots encoded with ETC1S. */
    public colorTextureSlots = "baseColor|emissive";

    /** Regular expression matching data texture slots encoded with UASTC. */
    public dataTextureSlots = "normal|metallicRoughness|occlusion";

    /** The Basis encoder output container. glTF delivery requires `ktx2`. */
    public outputContainer: KTX2OutputContainer = "ktx2";

    /** ETC1S quality level from 1 to 255. */
    public etc1sQualityLevel = 150;

    /** ETC1S encoder compression level from 0 to 6. */
    public etc1sCompressionLevel = 2;

    /** UASTC LDR quality level from 0 to 3. */
    public uastcQualityLevel = 1;

    /** Whether color textures use perceptual metrics. */
    public colorPerceptual = true;

    /** Whether data textures use perceptual metrics. */
    public dataPerceptual = false;

    /** Whether color textures declare the sRGB transfer function. */
    public colorSRGBTransferFunction = true;

    /** Whether data textures declare the sRGB transfer function. */
    public dataSRGBTransferFunction = false;

    /** Whether UASTC LDR rate-distortion optimization is enabled. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public enableRDO = false;

    /** UASTC RDO quality scalar from 0 to 10. */
    public rdoQualityLevel = 1;

    /** Whether UASTC textures use Zstandard supercompression. */
    public useZstandard = true;

    /** Whether UASTC data textures use the encoder's normal-map tuning. */
    public normalMapTuning = false;

    /** Whether source textures are flipped vertically before encoding. */
    public flipY = false;

    /** Whether UASTC data textures use HDR encoding. */
    public hdr = false;

    /** The HDR source format passed to the Basis encoder. */
    public hdrSourceType: KTX2HDRSourceType = "hdr";

    /** UASTC HDR quality level from 0 to 4. */
    public hdrQualityLevel = 1;

    /** String metadata written into each encoded KTX2 payload. */
    public metadata: Record<string, string> = {};

    /** Whether the Basis encoder writes debug output. */
    public enableDebug = false;

    /**
     * Decodes a source image (png/jpeg/webp bytes) to raw RGBA for the encoder. Required in non-DOM
     * environments such as Node/unit tests; in browsers the encoder decodes via canvas, so this can
     * be left undefined.
     */
    public imageDecoder: KTX2Options["imageDecoder"] = undefined;

    /**
     * URL of the Basis encoder wasm binary. Left undefined, the encoder falls back to its own default
     * (an external CDN in the browser). Hosts that bundle the encoder should point this at a served
     * copy so the encode has no external dependency.
     */
    public wasmUrl: KTX2Options["wasmUrl"] = undefined;

    /**
     * URL of the Basis encoder JS glue module. Left undefined, the encoder falls back to its own
     * default, which does not resolve under a bundler; hosts that bundle the encoder should point this
     * at a served copy of the matching glue module.
     */
    public jsUrl: KTX2Options["jsUrl"] = undefined;

    /**
     * Creates a new KTX2 compression block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Compresses the input `Document`'s textures to KTX2 in place and sets it as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" KTX2 block has no input document to compress.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const compatibilityIssues = this.getCompatibilityIssues(asset.document);
        if (compatibilityIssues.length > 0) {
            throw new Error(`The "${this.name}" KTX2 options are incompatible: ${compatibilityIssues.join(" ")}`);
        }

        const { ktx2 } = await import("ktx2-encoder/gltf-transform");

        const patternRe = this.texturePattern === null ? null : new RegExp(this.texturePattern);
        const colorSlotsRe = new RegExp(this.colorTextureSlots, "i");
        const dataSlotsRe = new RegExp(this.dataTextureSlots, "i");

        // ktx2-encoder catches per-texture encode failures internally and only logs a warning
        // (see its gltf-transform integration), so a failing encode never rejects `transform` and
        // would otherwise look like a successful build that quietly left some textures unconverted.
        // Snapshot which textures the encoder is expected to touch before running it, so any of them
        // still not KTX2 afterward can be reported as an actionable build failure.
        const textures = asset.document.getRoot().listTextures();
        const eligibleTextures = textures.filter(
            (texture) => IsEligibleForKtx2Encode(asset.document, texture, patternRe, colorSlotsRe) || IsEligibleForKtx2Encode(asset.document, texture, patternRe, dataSlotsRe)
        );

        // The encoder's option names (isUASTC, isKTX2File, ...) are external API and do not follow
        // the repo's camelCase convention, hence the scoped disable.
        /* eslint-disable @typescript-eslint/naming-convention */
        const baseOptions: Partial<KTX2Options> = {
            isKTX2File: this.outputContainer === "ktx2",
            generateMipmap: this.generateMipmaps,
            pattern: patternRe,
            isYFlip: this.flipY,
            kvData: Object.keys(this.metadata).length === 0 ? undefined : this.metadata,
            enableDebug: this.enableDebug,
            imageDecoder: this.imageDecoder,
            wasmUrl: this.wasmUrl,
            jsUrl: this.jsUrl,
        };

        // ETC1S for color (sRGB) textures.
        const compressColor = ktx2({
            ...baseOptions,
            isUASTC: false,
            isHDR: false,
            qualityLevel: this.etc1sQualityLevel,
            compressionLevel: this.etc1sCompressionLevel,
            isPerceptual: this.colorPerceptual,
            isSetKTX2SRGBTransferFunc: this.colorSRGBTransferFunction,
            slots: colorSlotsRe,
        });

        // UASTC for non-color (linear) data textures. Color textures are already KTX2 by now and
        // are skipped by the library, so this pass only touches the remaining data textures.
        const compressData = ktx2({
            ...baseOptions,
            isUASTC: true,
            isHDR: false,
            uastcLDRQualityLevel: this.uastcQualityLevel,
            enableRDO: this.enableRDO,
            rdoQualityLevel: this.rdoQualityLevel,
            needSupercompression: this.useZstandard,
            isNormalMap: this.normalMapTuning,
            isPerceptual: this.dataPerceptual,
            isSetKTX2SRGBTransferFunc: this.dataSRGBTransferFunction,
            slots: dataSlotsRe,
        });
        /* eslint-enable @typescript-eslint/naming-convention */

        await asset.document.transform(compressColor, compressData);

        const failedTextures = eligibleTextures.filter((texture) => texture.getMimeType() !== "image/ktx2");
        if (failedTextures.length > 0) {
            const labels = failedTextures.map((texture) => GetTextureLabel(texture, textures));
            throw new Error(
                `The "${this.name}" KTX2 block failed to encode ${failedTextures.length} eligible texture(s) to KTX2: ${labels.join(", ")}. Check the console for the encoder's underlying error.`
            );
        }

        this.output.value = asset;
    }

    /**
     * Lists option combinations that the glTF KTX2 delivery adapter cannot encode safely.
     * @param document - The optional document to validate texture slot overlap against. Without it,
     * overlap is only checked against the known core PBR slot names (used for editor display before
     * a document is available); with it, every texture's actual slots are checked, which also catches
     * extension texture slots and a texture shared between a color and a data slot.
     * @returns Actionable compatibility issues; an empty list means the current options are supported.
     */
    public getCompatibilityIssues(document?: Document): readonly string[] {
        const issues: string[] = [];
        if (this.outputContainer !== "ktx2") {
            issues.push("glTF KHR_texture_basisu requires the KTX2 output container; choose KTX2.");
        }
        if (this.hdr) {
            issues.push("The current glTF texture adapter accepts JPEG, PNG, and WebP sources only; disable HDR.");
        }
        if (this.normalMapTuning && this.dataPerceptual) {
            issues.push("Normal map tuning requires Data perceptual metric to be disabled.");
        }
        if (this.normalMapTuning && this.dataSRGBTransferFunction) {
            issues.push("Normal map tuning requires the Data sRGB transfer function to be disabled.");
        }
        try {
            const colorSlotsRe = new RegExp(this.colorTextureSlots, "i");
            const dataSlotsRe = new RegExp(this.dataTextureSlots, "i");
            if (document) {
                const patternRe = this.texturePattern === null ? null : new RegExp(this.texturePattern);
                const textures = document.getRoot().listTextures();
                const overlappingTextures = textures.filter(
                    (texture) => IsEligibleForKtx2Encode(document, texture, patternRe, colorSlotsRe) && IsEligibleForKtx2Encode(document, texture, patternRe, dataSlotsRe)
                );
                if (overlappingTextures.length > 0) {
                    const labels = overlappingTextures.map((texture) => GetTextureLabel(texture, textures));
                    issues.push(`Color and data texture slot filters both match ${labels.join(", ")}; use non-overlapping patterns so a texture is only encoded by one codec.`);
                }
            } else {
                const overlappingSlots = GetOverlappingTextureSlots(colorSlotsRe, dataSlotsRe);
                if (overlappingSlots.length > 0) {
                    issues.push(
                        `Color and data texture slot filters both match ${overlappingSlots.join(", ")}; use non-overlapping patterns so a texture is only encoded by one codec.`
                    );
                }
            }
        } catch {
            // An invalid pattern already fails loudly with a SyntaxError when the encode runs
            // (`new RegExp(...)` in `_buildBlockAsync`); skip the overlap check rather than mask it.
        }
        return issues;
    }

    /**
     * Describes the active KTX2 codec split or any incompatible selections.
     * @returns Compatibility guidance suitable for editor display.
     */
    public getCompatibilitySummary(): string {
        const issues = this.getCompatibilityIssues();
        return issues.length > 0 ? issues.join(" ") : "Compatible with glTF: color slots use ETC1S and data slots use UASTC in KTX2.";
    }

    /**
     * Serializes this block's build-affecting options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.generateMipmaps = this.generateMipmaps;
        serializationObject.texturePattern = this.texturePattern;
        serializationObject.colorTextureSlots = this.colorTextureSlots;
        serializationObject.dataTextureSlots = this.dataTextureSlots;
        serializationObject.outputContainer = this.outputContainer;
        serializationObject.etc1sQualityLevel = this.etc1sQualityLevel;
        serializationObject.etc1sCompressionLevel = this.etc1sCompressionLevel;
        serializationObject.uastcQualityLevel = this.uastcQualityLevel;
        serializationObject.colorPerceptual = this.colorPerceptual;
        serializationObject.dataPerceptual = this.dataPerceptual;
        serializationObject.colorSRGBTransferFunction = this.colorSRGBTransferFunction;
        serializationObject.dataSRGBTransferFunction = this.dataSRGBTransferFunction;
        serializationObject.enableRDO = this.enableRDO;
        serializationObject.rdoQualityLevel = this.rdoQualityLevel;
        serializationObject.useZstandard = this.useZstandard;
        serializationObject.normalMapTuning = this.normalMapTuning;
        serializationObject.flipY = this.flipY;
        serializationObject.hdr = this.hdr;
        serializationObject.hdrSourceType = this.hdrSourceType;
        serializationObject.hdrQualityLevel = this.hdrQualityLevel;
        serializationObject.metadata = this.metadata;
        serializationObject.enableDebug = this.enableDebug;
        serializationObject.jsUrl = this.jsUrl ?? null;
        serializationObject.wasmUrl = this.wasmUrl ?? null;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.generateMipmaps = GetSerializedBoolean(serializationObject, "generateMipmaps", false);
        this.texturePattern = GetSerializedNullableString(serializationObject, "texturePattern");
        this.colorTextureSlots = GetSerializedString(serializationObject, "colorTextureSlots", "baseColor|emissive");
        this.dataTextureSlots = GetSerializedString(serializationObject, "dataTextureSlots", "normal|metallicRoughness|occlusion");
        ValidateRegularExpression(this.texturePattern, "texturePattern");
        ValidateRegularExpression(this.colorTextureSlots, "colorTextureSlots");
        ValidateRegularExpression(this.dataTextureSlots, "dataTextureSlots");
        this.outputContainer = GetSerializedStringUnion(serializationObject, "outputContainer", ["ktx2", "basis"] as const, "ktx2");
        this.etc1sQualityLevel = GetSerializedIntegerInRange(serializationObject, "etc1sQualityLevel", 1, 255, 150);
        this.etc1sCompressionLevel = GetSerializedIntegerInRange(serializationObject, "etc1sCompressionLevel", 0, 6, 2);
        this.uastcQualityLevel = GetSerializedIntegerInRange(serializationObject, "uastcQualityLevel", 0, 3, 1);
        this.colorPerceptual = GetSerializedBoolean(serializationObject, "colorPerceptual", true);
        this.dataPerceptual = GetSerializedBoolean(serializationObject, "dataPerceptual", false);
        this.colorSRGBTransferFunction = GetSerializedBoolean(serializationObject, "colorSRGBTransferFunction", true);
        this.dataSRGBTransferFunction = GetSerializedBoolean(serializationObject, "dataSRGBTransferFunction", false);
        this.enableRDO = GetSerializedBoolean(serializationObject, "enableRDO", false);
        this.rdoQualityLevel = GetSerializedNumberInRange(serializationObject, "rdoQualityLevel", 0, 10, 1);
        this.useZstandard = GetSerializedBoolean(serializationObject, "useZstandard", true);
        this.normalMapTuning = GetSerializedBoolean(serializationObject, "normalMapTuning", false);
        this.flipY = GetSerializedBoolean(serializationObject, "flipY", false);
        this.hdr = GetSerializedBoolean(serializationObject, "hdr", false);
        this.hdrSourceType = GetSerializedStringUnion(serializationObject, "hdrSourceType", ["hdr", "exr", "raster"] as const, "hdr");
        this.hdrQualityLevel = GetSerializedIntegerInRange(serializationObject, "hdrQualityLevel", 0, 4, 1);
        this.metadata = GetSerializedStringRecord(serializationObject, "metadata");
        this.enableDebug = GetSerializedBoolean(serializationObject, "enableDebug", false);
        this.jsUrl = GetSerializedNullableString(serializationObject, "jsUrl") ?? undefined;
        this.wasmUrl = GetSerializedNullableString(serializationObject, "wasmUrl") ?? undefined;
    }
}

RegisterBlock(KTX2CompressionBlock.ClassName, (name, nodeAsset) => new KTX2CompressionBlock(name, nodeAsset));
