import { Tools } from "core/Misc/tools.pure";

import { type USDLoadingOptions } from "../usdLoadingOptions";
import { type IResolvedStage, type IResolvedDiagnostic, type ResolvedDiagnosticSeverity } from "./resolvedStage";
import { type ISdfLayer } from "./sdf";
import { type ISdfListOp } from "./sdf/sdfListOp";
import { type ISdfCompositionFields, type ISdfPrimSpec } from "./sdf/sdfSpec";
import { ParseUsda } from "./parser/usda/usdaParser";
import { ComposeLayerStack, type ICompositionDiagnostic } from "./composition/composeLayerStack";
import { MapLayerToResolvedStage } from "./mapping/stageMapper";

/** The concrete on-disk USD container format, sniffed from magic bytes rather than the file extension. */
export type UsdFormat = "usda" | "usdc" | "usdz";

const CrateMagic = [0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43]; // "PXR-USDC"
const ZipMagic = [0x50, 0x4b]; // "PK"

/**
 * Loads the raw bytes (or text) of an external USD layer addressed by a fully-resolved identifier.
 *
 * Isolating file IO behind this callback keeps composition and mapping pure and synchronous, and lets
 * tests drive multi-layer composition from an in-memory layer set without touching the network.
 */
export type FetchUsdAsset = (resolvedIdentifier: string) => Promise<ArrayBuffer | string>;

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
 * This is the single entry point of the USD resolution layer. It detects the container format and
 * drives parsing, composition (LIVERPS) and stage/time evaluation. The returned stage is pure data:
 * every USD semantic has been resolved, so the Babylon adapter performs no further USD reasoning.
 *
 * @param data the raw USD data (ArrayBuffer for binary/usdz, string for ASCII usda)
 * @param rootUrl root url to resolve external assets against
 * @param fileName name of the file being loaded, used for diagnostics
 * @param options loader options (used by the USDZ/crate readers)
 * @returns a promise resolving to the fully-resolved stage
 */
export async function ResolveUsdStageAsync(
    data: ArrayBuffer | string,
    rootUrl: string,
    fileName: string | undefined,
    options: Readonly<USDLoadingOptions>
): Promise<IResolvedStage> {
    return await ResolveUsdStageWithFetcherAsync(data, rootUrl, fileName, options, async (identifier) => await Tools.LoadFileAsync(identifier, true));
}

/**
 * Resolution pipeline with an injectable external-layer fetcher. The public {@link ResolveUsdStageAsync}
 * supplies a Babylon file-IO fetcher; tests can supply an in-memory one to exercise multi-layer
 * composition deterministically and offline.
 * @param data the raw USD data
 * @param rootUrl root url external assets are resolved against
 * @param fileName name of the file being loaded
 * @param _options loader options
 * @param fetchAsset callback fetching an external layer's bytes by resolved identifier
 * @returns a promise resolving to the fully-resolved stage
 */
export async function ResolveUsdStageWithFetcherAsync(
    data: ArrayBuffer | string,
    rootUrl: string,
    fileName: string | undefined,
    _options: Readonly<USDLoadingOptions>,
    fetchAsset: FetchUsdAsset
): Promise<IResolvedStage> {
    const diagnostics: IResolvedDiagnostic[] = [];
    const detected = DetectUsdFormat(data);
    const rootIdentifier = `${rootUrl ?? ""}${fileName ?? "stage.usda"}`;

    if (detected.format === "usdc") {
        throw new Error(`USD: USDC (crate) decoding is not yet implemented (${fileName ?? rootIdentifier}).`);
    }
    if (detected.format === "usdz") {
        throw new Error(`USD: USDZ archive reading is not yet implemented (${fileName ?? rootIdentifier}).`);
    }

    const rootLayer = ParseUsda(detected.text ?? "", rootIdentifier);
    const layers = await PrefetchLayerStackAsync(rootLayer, fetchAsset, diagnostics);

    const resolveLayer = (assetPath: string, fromIdentifier: string): ISdfLayer | undefined => layers.get(ResolveLayerIdentifier(assetPath, fromIdentifier));
    const composed = ComposeLayerStack(rootLayer, resolveLayer);
    for (const compositionDiagnostic of composed.diagnostics) {
        diagnostics.push(ToResolvedDiagnostic(compositionDiagnostic));
    }

    const stage = MapLayerToResolvedStage(composed.layer);
    stage.diagnostics.unshift(...diagnostics);
    return stage;
}

// Walks the root layer's composition arcs breadth-first, fetching every reachable external USDA layer
// into an identifier-keyed map the synchronous composition resolver can read from. Each wave of layers
// is fetched concurrently. Binary external layers and fetch failures are recorded as non-fatal
// diagnostics so valid content still loads (composition errors must not prevent loading).
async function PrefetchLayerStackAsync(rootLayer: ISdfLayer, fetchAsset: FetchUsdAsset, diagnostics: IResolvedDiagnostic[]): Promise<Map<string, ISdfLayer>> {
    const layers = new Map<string, ISdfLayer>([[rootLayer.identifier, rootLayer]]);
    const visited = new Set<string>([rootLayer.identifier]);
    await FetchLayerWaveAsync([rootLayer], fetchAsset, layers, visited, diagnostics);
    return layers;
}

// Fetches one breadth-first wave of external layers concurrently, then recurses for the layers it
// discovered. Recursion (rather than a loop with an awaited body) keeps each fetch wave parallel while
// honoring the project's no-await-in-loop rule.
async function FetchLayerWaveAsync(
    frontier: ISdfLayer[],
    fetchAsset: FetchUsdAsset,
    layers: Map<string, ISdfLayer>,
    visited: Set<string>,
    diagnostics: IResolvedDiagnostic[]
): Promise<void> {
    const requests: { assetPath: string; identifier: string }[] = [];
    for (const layer of frontier) {
        for (const assetPath of CollectExternalAssetPaths(layer)) {
            const identifier = ResolveLayerIdentifier(assetPath, layer.identifier);
            if (!visited.has(identifier)) {
                visited.add(identifier);
                requests.push({ assetPath, identifier });
            }
        }
    }

    if (requests.length === 0) {
        return;
    }

    const fetched = await Promise.all(
        requests.map(async (request) => {
            try {
                return { request, data: await fetchAsset(request.identifier) };
            } catch (error) {
                return { request, error };
            }
        })
    );

    const nextFrontier: ISdfLayer[] = [];
    for (const result of fetched) {
        if ("error" in result) {
            const message = result.error instanceof Error ? result.error.message : String(result.error);
            diagnostics.push({ severity: "warning", message: `Could not load external layer '${result.request.assetPath}': ${message}`, path: result.request.identifier });
            continue;
        }

        const detected = DetectUsdFormat(result.data);
        if (detected.format !== "usda") {
            diagnostics.push({
                severity: "warning",
                message: `External ${detected.format.toUpperCase()} layer '${result.request.assetPath}' is not yet supported and was skipped.`,
                path: result.request.identifier,
            });
            continue;
        }

        const childLayer = ParseUsda(detected.text ?? "", result.request.identifier);
        layers.set(result.request.identifier, childLayer);
        nextFrontier.push(childLayer);
    }

    if (nextFrontier.length > 0) {
        await FetchLayerWaveAsync(nextFrontier, fetchAsset, layers, visited, diagnostics);
    }
}

// Collects every external (non-empty) sublayer, reference and payload asset path authored anywhere in a
// layer, including those inside variant subtrees (composition may select any variant).
function CollectExternalAssetPaths(layer: ISdfLayer): string[] {
    const paths: string[] = [];

    for (const subLayer of layer.subLayers) {
        if (subLayer.assetPath) {
            paths.push(subLayer.assetPath);
        }
    }

    function visitFields(fields: ISdfCompositionFields): void {
        for (const reference of ListOpItems(fields.references)) {
            if (reference.assetPath) {
                paths.push(reference.assetPath);
            }
        }
        for (const payload of ListOpItems(fields.payloads)) {
            if (payload.assetPath) {
                paths.push(payload.assetPath);
            }
        }
        for (const variantSet of fields.variantSets ?? []) {
            for (const variant of Object.values(variantSet.variants)) {
                visitFields(variant);
                for (const variantChild of variant.children) {
                    visitPrim(variantChild);
                }
            }
        }
    }

    function visitPrim(prim: ISdfPrimSpec): void {
        visitFields(prim);
        for (const child of prim.children) {
            visitPrim(child);
        }
    }

    for (const prim of layer.rootPrims) {
        visitPrim(prim);
    }

    return paths;
}

// Flattens the addition-side opinions of a list op (explicit/prepended/appended/added) into one array.
function ListOpItems<T>(listOp: ISdfListOp<T> | undefined): readonly T[] {
    if (!listOp) {
        return [];
    }
    return [...(listOp.explicit ?? []), ...(listOp.prepended ?? []), ...(listOp.appended ?? []), ...(listOp.added ?? [])];
}

// Resolves an authored asset path against the identifier of the layer that referenced it. Absolute URLs
// and absolute paths pass through unchanged; relative paths are joined onto the referrer's directory and
// normalized. Must match the keys PrefetchLayerStackAsync stores layers under.
function ResolveLayerIdentifier(assetPath: string, fromIdentifier: string): string {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(assetPath) || assetPath.startsWith("/")) {
        return assetPath;
    }

    const lastSlash = fromIdentifier.lastIndexOf("/");
    const baseDirectory = lastSlash >= 0 ? fromIdentifier.slice(0, lastSlash + 1) : "";

    const segments: string[] = [];
    for (const segment of `${baseDirectory}${assetPath}`.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment === ".." && segments.length > 0 && segments[segments.length - 1] !== "..") {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }

    const prefix = baseDirectory.startsWith("/") ? "/" : "";
    return `${prefix}${segments.join("/")}`;
}

// Maps a composition diagnostic onto the resolved-stage diagnostic shape consumed by the loader.
function ToResolvedDiagnostic(diagnostic: ICompositionDiagnostic): IResolvedDiagnostic {
    const severity: ResolvedDiagnosticSeverity = diagnostic.severity;
    return {
        severity,
        message: `[${diagnostic.code}] ${diagnostic.message}`,
        path: diagnostic.primPath ?? diagnostic.assetPath ?? diagnostic.layerIdentifier,
    };
}
