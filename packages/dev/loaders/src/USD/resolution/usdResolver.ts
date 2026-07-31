import { type USDLoadingOptions } from "../usdLoadingOptions";
import { FreezeResolvedStage, type IResolvedStage, type IResolvedDiagnostic } from "./resolvedStage";
import { type ISdfLayer } from "./sdf/index";
import { ParseUsdaWithDiagnostics, DefaultUsdaParserLimits, type IUsdaParseDiagnostic, type IUsdaParserLimits } from "./parser/usda/usdaParser";
import { ParseCrate, type ICrateDecoderOptions } from "./parser/crate/crateReader";
import { MapLayerToResolvedStage } from "./mapping/stageMapper";
import { UsdResourceLimitError, UsdZipArchiveError, ValidateResourceLimit } from "../usdErrors";
import { ApplySingleLayerPolicy, type ISingleLayerPolicyDiagnostic } from "./singleLayerPolicy";
import { ComposeUsdLayersAsync } from "./composition";
import { GetUsdLayerByteLength, type IUsdAssetSource } from "./layerSource";
import { FindUsdZipRoot, ParseUsdZipArchive, type IUsdZipArchiveLimits } from "./usdZipArchive";

/** The concrete on-disk USD container format, sniffed from magic bytes rather than the file extension. */
export type UsdFormat = "usda" | "usdc" | "usdz";

const CrateMagic = [0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43]; // "PXR-USDC"
const ZipMagic = [0x50, 0x4b]; // "PK"

/**
 * Detects the USD container format from raw bytes (or a string, which is always treated as ASCII USDA).
 * A `.usd` file may be ASCII or binary crate, so detection is always done from content, never the extension.
 * @param data the raw file data
 * @returns the detected format and, for ASCII input, the decoded text
 */
export function DetectUsdFormat(data: ArrayBuffer | string): { format: UsdFormat; text?: string } {
    if (typeof data === "string") {
        return { format: "usda", text: data };
    }

    const bytes = new Uint8Array(data);
    if (bytes.length >= CrateMagic.length && CrateMagic.every((value, index) => bytes[index] === value)) {
        return { format: "usdc" };
    }
    if (bytes.length >= ZipMagic.length && ZipMagic.every((value, index) => bytes[index] === value)) {
        return { format: "usdz" };
    }

    return { format: "usda", text: new TextDecoder().decode(bytes) };
}

/**
 * Resolves raw USD data into a fully-resolved {@link IResolvedStage}.
 *
 * This is the single entry point of the USD resolution layer. It sniffs the container format from the
 * data's magic bytes, parses USDA text or a bounded USDC crate, extracts and validates a USDZ package's
 * embedded USDC root, optionally composes authored external references through the configured layer
 * source, validates and normalizes the resulting layer, and maps it to a resolved stage.
 *
 * @param data the raw USD data (USDA text, USDC bytes, or USDZ package bytes)
 * @param rootUrl root url to resolve external assets against
 * @param fileName name of the file being loaded, used for diagnostics
 * @param options loader options (composition, crate/parser resource limits and animation baking)
 * @returns a promise resolving to the fully-resolved stage
 */
export async function ResolveUsdStageAsync(
    data: ArrayBuffer | string,
    rootUrl: string,
    fileName: string | undefined,
    options: Readonly<USDLoadingOptions>
): Promise<IResolvedStage> {
    const diagnostics: IResolvedDiagnostic[] = [];
    const parserLimits = ResolveParserLimits(options);
    const crateOptions = ResolveCrateOptions(options);
    const rootIdentifier = `${rootUrl ?? ""}${fileName ?? "stage.usda"}`;

    const zipInput = IsZipInput(data);
    if (zipInput) {
        const zipLimits = ResolveZipLimits(options);
        if (zipLimits.maxInputBytes !== undefined && data.byteLength > zipLimits.maxInputBytes) {
            throw new UsdZipArchiveError(
                "input-bytes",
                `USDZ archive input exceeds the ${zipLimits.maxInputBytes}-byte resource cap.`,
                rootIdentifier,
                undefined,
                zipLimits.maxInputBytes,
                data.byteLength
            );
        }
    } else {
        // Reject oversized root data before DetectUsdFormat/TextDecoder allocates a decoded copy, so the
        // configured input/layer byte cap actually bounds the expensive allocation it promises to bound.
        const maxInputBytes = parserLimits.maxInputBytes ?? DefaultUsdaParserLimits.maxInputBytes;
        if (GetUsdLayerByteLength(data) > maxInputBytes) {
            const kind = options.maxLayerBytes !== undefined ? "layer-bytes" : "input-bytes";
            throw new UsdResourceLimitError(kind, maxInputBytes, `USD: input size exceeds the ${maxInputBytes}-byte resource cap.`, {
                actual: GetUsdLayerByteLength(data),
                path: rootIdentifier,
            });
        }
    }

    const detected = DetectUsdFormat(data);

    // Sniffed USDA, USDC, and USDZ input share the same SDF layer seam. Package bytes are extracted
    // before they can be decoded as text.
    let rootLayer: ISdfLayer;
    let assetSource: IUsdAssetSource | undefined;
    if (detected.format === "usdc") {
        rootLayer = ParseCrate(data as ArrayBuffer, rootIdentifier, crateOptions);
    } else if (detected.format === "usdz") {
        const archive = ParseUsdZipArchive(data as ArrayBuffer, rootIdentifier, ResolveZipLimits(options));
        const rootEntry = FindUsdZipRoot(archive);
        rootLayer = ParseCrate(archive.readEntry(rootEntry.name), `${rootIdentifier}#${rootEntry.name}`, crateOptions);
        assetSource = archive.assetSource;
    } else {
        rootLayer = ParseRootUsdaLayer(detected.text ?? "", rootIdentifier, diagnostics, parserLimits);
    }

    let normalizedLayer = rootLayer;
    if (options.layerSource) {
        const composed = await ComposeUsdLayersAsync(rootLayer, options.layerSource, options);
        normalizedLayer = composed.layer;
        diagnostics.push(...composed.diagnostics);
    }
    return FreezeResolvedStage(MapSingleLayerToStage(normalizedLayer, diagnostics, assetSource));
}

// Maps one parsed USDA layer to a resolved stage through the single-layer policy seam. The policy
// validates and normalizes the composed layer (rejecting unsupported composition-bearing and
// undefined-prim constructs and pruning inactive/duplicate opinions) before the mapper runs.
function MapSingleLayerToStage(rootLayer: ISdfLayer, diagnostics: IResolvedDiagnostic[], assetSource?: IUsdAssetSource): IResolvedStage {
    const normalized = ApplySingleLayerPolicy(rootLayer);
    for (const policyDiagnostic of normalized.diagnostics) {
        diagnostics.push(ToResolvedDiagnosticFromSingleLayerPolicy(policyDiagnostic));
    }

    const stage = MapLayerToResolvedStage(normalized.layer, assetSource);
    stage.diagnostics.unshift(...diagnostics);
    return stage;
}

function ResolveZipLimits(options: Readonly<USDLoadingOptions>): IUsdZipArchiveLimits {
    return {
        ...(options.maxZipInputBytes !== undefined ? { maxInputBytes: ValidateResourceLimit(options.maxZipInputBytes, "maxZipInputBytes") } : {}),
        ...(options.maxInputBytes !== undefined && options.maxZipInputBytes === undefined ? { maxInputBytes: ValidateResourceLimit(options.maxInputBytes, "maxInputBytes") } : {}),
        ...(options.maxZipEntries !== undefined ? { maxEntries: ValidateResourceLimit(options.maxZipEntries, "maxZipEntries") } : {}),
        ...(options.maxZipCompressedBytes !== undefined ? { maxCompressedBytes: ValidateResourceLimit(options.maxZipCompressedBytes, "maxZipCompressedBytes") } : {}),
        ...(options.maxZipUncompressedBytes !== undefined ? { maxUncompressedBytes: ValidateResourceLimit(options.maxZipUncompressedBytes, "maxZipUncompressedBytes") } : {}),
        ...(options.maxZipEntryBytes !== undefined ? { maxEntryBytes: ValidateResourceLimit(options.maxZipEntryBytes, "maxZipEntryBytes") } : {}),
        ...(options.maxZipDecompressionWork !== undefined ? { maxDecompressionWork: ValidateResourceLimit(options.maxZipDecompressionWork, "maxZipDecompressionWork") } : {}),
    };
}

function IsZipInput(data: ArrayBuffer | string): data is ArrayBuffer {
    if (typeof data === "string" || data.byteLength < 2) {
        return false;
    }
    const bytes = new Uint8Array(data);
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

// Maps a single-layer policy diagnostic onto the resolved-stage diagnostic shape consumed by the
// loader, folding the machine-readable code into the message.
function ToResolvedDiagnosticFromSingleLayerPolicy(diagnostic: ISingleLayerPolicyDiagnostic): IResolvedDiagnostic {
    return { severity: diagnostic.severity, message: `[${diagnostic.code}] ${diagnostic.message}`, path: diagnostic.path };
}

// Extracts and validates the parser resource limits from the loader options at the public boundary so
// an invalid configuration fails fast (typed UsdConfigurationError) before any parsing. The parser
// validates again defensively at its own entry point.
function ResolveParserLimits(options: Readonly<USDLoadingOptions>): Partial<IUsdaParserLimits> {
    const limits: Partial<IUsdaParserLimits> = {};
    if (options.maxLayerBytes !== undefined) {
        limits.maxInputBytes = ValidateResourceLimit(options.maxLayerBytes, "maxLayerBytes");
    } else if (options.maxInputBytes !== undefined) {
        limits.maxInputBytes = ValidateResourceLimit(options.maxInputBytes, "maxInputBytes");
    }
    if (options.maxTokenCount !== undefined) {
        limits.maxTokenCount = ValidateResourceLimit(options.maxTokenCount, "maxTokenCount");
    }
    if (options.maxParserWork !== undefined) {
        limits.maxParserWork = ValidateResourceLimit(options.maxParserWork, "maxParserWork");
    }
    return limits;
}

function ResolveCrateOptions(options: Readonly<USDLoadingOptions>): ICrateDecoderOptions {
    const limits: ICrateDecoderOptions = {};
    if (options.maxCrateTableEntries !== undefined) {
        limits.maxTableEntries = ValidateResourceLimit(options.maxCrateTableEntries, "maxCrateTableEntries");
    }
    if (options.maxCrateValueBytes !== undefined) {
        limits.maxValueBytes = ValidateResourceLimit(options.maxCrateValueBytes, "maxCrateValueBytes");
    }
    if (options.maxCrateWork !== undefined) {
        limits.maxWork = ValidateResourceLimit(options.maxCrateWork, "maxCrateWork");
    }
    if (options.maxCrateDepth !== undefined) {
        limits.maxDepth = ValidateResourceLimit(options.maxCrateDepth, "maxCrateDepth");
    }
    return limits;
}

// Parses the root USDA layer and lifts its recoverable parser diagnostics onto the resolution diagnostics
// list, so a source that only parsed after error recovery is surfaced on the resolved stage instead of
// staying hidden in opaque layer metadata. Fatal parse failures (missing/invalid header, resource-limit
// breaches) are thrown by the parser and reject the load rather than being recorded as diagnostics.
function ParseRootUsdaLayer(text: string, identifier: string, diagnostics: IResolvedDiagnostic[], limits?: Partial<IUsdaParserLimits>): ISdfLayer {
    const result = ParseUsdaWithDiagnostics(text, identifier, limits);
    for (const parserDiagnostic of result.diagnostics) {
        diagnostics.push(ToResolvedParserDiagnostic(parserDiagnostic, identifier));
    }
    return result.layer;
}

// Converts a recoverable USDA parser diagnostic into a resolved-stage diagnostic, preserving its 1-based
// source location. Recoverable diagnostics are warnings: the parser recovered and continued, so the stage
// still loads but must advertise the problem rather than appear clean.
function ToResolvedParserDiagnostic(diagnostic: IUsdaParseDiagnostic, layerIdentifier: string): IResolvedDiagnostic {
    return {
        severity: "warning",
        message: diagnostic.message,
        path: layerIdentifier,
        sourceLocation: { line: diagnostic.line, column: diagnostic.column },
    };
}
