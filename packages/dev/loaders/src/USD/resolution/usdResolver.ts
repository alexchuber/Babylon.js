import { type USDLoadingOptions } from "../usdLoadingOptions";
import { type IResolvedStage, type IResolvedDiagnostic } from "./resolvedStage";
import { ReadUsdaSpike } from "./parser/usda/usdaSpikeReader";

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
    if (bytes.length >= CrateMagic.length && CrateMagic.every((b, i) => bytes[i] === b)) {
        return { format: "usdc" };
    }
    if (bytes.length >= ZipMagic.length && ZipMagic.every((b, i) => bytes[i] === b)) {
        return { format: "usdz" };
    }

    return { format: "usda", text: new TextDecoder().decode(bytes) };
}

/**
 * Resolves raw USD data into a fully-resolved {@link IResolvedStage}.
 *
 * This is the single entry point of the USD resolution layer. It detects the container format and
 * drives parsing, composition and stage/time evaluation. The returned stage is pure data: every USD
 * semantic has been resolved and the Babylon adapter performs no further USD reasoning.
 *
 * Phase 0 status: only a minimal ASCII USDA vertical slice is implemented, proving the
 * parse → resolve → adapt pipeline end to end. Phase 1 replaces the body with the full
 * `readLayer → compose → evaluate` pipeline (Sdf data model, USDA/USDC/USDZ readers, LIVERPS
 * composition and stage/time evaluation).
 *
 * @param data the raw USD data (ArrayBuffer for binary/usdz, string for ASCII usda)
 * @param _rootUrl root url to resolve external assets against (used by Phase 1 asset resolution)
 * @param fileName name of the file being loaded, used for diagnostics
 * @param _options loader options (used by Phase 1 USDZ/crate readers)
 * @returns a promise resolving to the fully-resolved stage
 */
export async function ResolveUsdStageAsync(
    data: ArrayBuffer | string,
    _rootUrl: string,
    fileName: string | undefined,
    _options: Readonly<USDLoadingOptions>
): Promise<IResolvedStage> {
    const diagnostics: IResolvedDiagnostic[] = [];
    const detected = DetectUsdFormat(data);
    const source = fileName ? ` (${fileName})` : "";

    switch (detected.format) {
        case "usda":
            return ReadUsdaSpike(detected.text ?? "", diagnostics);
        case "usdc":
            throw new Error(`USD: USDC (crate) decoding is not yet implemented${source}.`);
        case "usdz":
            throw new Error(`USD: USDZ archive reading is not yet implemented${source}.`);
    }
}
