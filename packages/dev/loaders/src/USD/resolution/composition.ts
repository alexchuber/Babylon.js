import { type USDLoadingOptions } from "../usdLoadingOptions";
import { UsdCompositionError, UsdLayerLoadError, UsdResourceLimitError, UsdUnsupportedFormatError, ValidateResourceLimit } from "../usdErrors";
import { ResolveAssetIdentifier } from "./assetPath";
import { type IResolvedDiagnostic } from "./resolvedStage";
import { DecodeUsdLayerText, GetUsdLayerByteLength, type IUsdLayerSource, type UsdLayerSourceData } from "./layerSource";
import { ParseUsdaWithDiagnostics, DefaultUsdaParserLimits, type IUsdaParserLimits } from "./parser/usda/usdaParser";
import { ReadListOpItems, type ISdfListOp } from "./sdf/sdfListOp";
import { type ISdfLayer, type ISdfPrimSpec, type ISdfReference } from "./sdf/sdfLayer";
import { type ISdfPropertySpec } from "./sdf/sdfSpec";

const DefaultMaxLayerCount = 64;
const DefaultMaxLayerDepth = 32;
const DefaultMaxLayerNodes = 1_000_000;
const DefaultMaxCompositionWork = 10_000_000;

interface ICompositionLimits {
    readonly maxLayerBytes: number;
    readonly maxLayerCount: number;
    readonly maxLayerDepth: number;
    readonly maxLayerNodes: number;
    readonly maxCompositionWork: number;
    readonly parserLimits: Partial<IUsdaParserLimits>;
}

interface ICompositionState {
    readonly source: IUsdLayerSource;
    readonly limits: ICompositionLimits;
    readonly diagnostics: IResolvedDiagnostic[];
    readonly composedLayers: Map<string, ISdfLayer>;
    readonly activeIdentifiers: string[];
    layerCount: number;
    layerNodes: number;
    compositionWork: number;
    metadataLayer?: ISdfLayer;
}

/**
 * Result of composing authored references into one normalized layer.
 */
export interface IUsdCompositionResult {
    /** Composed layer ready for the single-layer policy and stage mapper. */
    readonly layer: ISdfLayer;
    /** Non-fatal diagnostics emitted while composing the layer graph. */
    readonly diagnostics: IResolvedDiagnostic[];
}

/**
 * Resolves the supported external-reference subset into one normalized SDF layer.
 *
 * Only authored references are composed. The reference target is grafted beneath the local prim,
 * local opinions remain stronger, and referenced up-axis/unit metadata supplies the stage conversion
 * when a reference is present. Other composition arcs remain for the single-layer policy to reject.
 *
 * @param rootLayer already-parsed root layer
 * @param source normalized external layer source
 * @param options loader resource limits
 * @returns normalized composed layer and non-fatal diagnostics
 */
export async function ComposeUsdLayersAsync(rootLayer: ISdfLayer, source: IUsdLayerSource, options: Readonly<USDLoadingOptions>): Promise<IUsdCompositionResult> {
    const limits = ResolveCompositionLimits(options);
    const state: ICompositionState = {
        source,
        limits,
        diagnostics: [],
        composedLayers: new Map(),
        activeIdentifiers: [rootLayer.identifier],
        layerCount: 1,
        layerNodes: 0,
        compositionWork: 0,
    };

    if (state.layerCount > limits.maxLayerCount) {
        throw new UsdResourceLimitError("layer-count", limits.maxLayerCount, `USD: layer count exceeds the ${limits.maxLayerCount}-layer resource cap.`, {
            actual: state.layerCount,
            path: rootLayer.identifier,
        });
    }
    CountLayerNodes(rootLayer, state);
    const composedRootPrims = await ComposeLayerPrims(rootLayer, 0, state);
    const layer = state.metadataLayer
        ? {
              ...rootLayer,
              upAxis: state.metadataLayer.upAxis ?? rootLayer.upAxis,
              metersPerUnit: state.metadataLayer.metersPerUnit ?? rootLayer.metersPerUnit,
              timeCodesPerSecond: rootLayer.timeCodesPerSecond ?? state.metadataLayer.timeCodesPerSecond,
              framesPerSecond: rootLayer.framesPerSecond ?? state.metadataLayer.framesPerSecond,
          }
        : rootLayer;

    return { layer: { ...layer, rootPrims: composedRootPrims }, diagnostics: state.diagnostics };
}

function ResolveCompositionLimits(options: Readonly<USDLoadingOptions>): ICompositionLimits {
    const maxLayerBytes =
        options.maxLayerBytes !== undefined
            ? ValidateResourceLimit(options.maxLayerBytes, "maxLayerBytes")
            : options.maxInputBytes !== undefined
              ? ValidateResourceLimit(options.maxInputBytes, "maxInputBytes")
              : DefaultUsdaParserLimits.maxInputBytes;
    const maxLayerCount = options.maxLayerCount !== undefined ? ValidateResourceLimit(options.maxLayerCount, "maxLayerCount") : DefaultMaxLayerCount;
    const maxLayerDepth = options.maxLayerDepth !== undefined ? ValidateResourceLimit(options.maxLayerDepth, "maxLayerDepth") : DefaultMaxLayerDepth;
    const maxLayerNodes = options.maxLayerNodes !== undefined ? ValidateResourceLimit(options.maxLayerNodes, "maxLayerNodes") : DefaultMaxLayerNodes;
    const maxCompositionWork = options.maxCompositionWork !== undefined ? ValidateResourceLimit(options.maxCompositionWork, "maxCompositionWork") : DefaultMaxCompositionWork;

    return {
        maxLayerBytes,
        maxLayerCount,
        maxLayerDepth,
        maxLayerNodes,
        maxCompositionWork,
        parserLimits: {
            maxInputBytes: maxLayerBytes,
            ...(options.maxTokenCount !== undefined ? { maxTokenCount: ValidateResourceLimit(options.maxTokenCount, "maxTokenCount") } : {}),
            ...(options.maxParserWork !== undefined ? { maxParserWork: ValidateResourceLimit(options.maxParserWork, "maxParserWork") } : {}),
        },
    };
}

async function ComposeLayerPrims(layer: ISdfLayer, depth: number, state: ICompositionState): Promise<ISdfPrimSpec[]> {
    const prims: ISdfPrimSpec[] = [];
    for (const prim of layer.rootPrims) {
        AddCompositionWork(state, prim.path);
        // Preserve authored order and deterministic fetch/cache behavior.
        // eslint-disable-next-line no-await-in-loop
        prims.push(await ComposePrim(prim, layer, depth, state));
    }
    return prims;
}

async function ComposePrim(prim: ISdfPrimSpec, layer: ISdfLayer, depth: number, state: ICompositionState): Promise<ISdfPrimSpec> {
    let composed: ISdfPrimSpec = {
        ...prim,
        children: [],
    };
    for (const child of prim.children) {
        AddCompositionWork(state, child.path);
        // Preserve authored child order.
        // eslint-disable-next-line no-await-in-loop
        composed.children.push(await ComposePrim(child, layer, depth, state));
    }

    if (!prim.references) {
        return composed;
    }

    const references = ReadReferenceOpinions(prim.references, prim.path, state);
    composed = { ...composed, references: undefined };
    const seenReferences = new Set<string>();
    for (const reference of references) {
        AddCompositionWork(state, prim.path);
        const referenceIdentifier = ResolveReferenceIdentifier(reference, layer.identifier, prim.path, state);
        if (!referenceIdentifier) {
            continue;
        }

        // Preserve list-op order so stronger local/reference opinions remain deterministic.
        // eslint-disable-next-line no-await-in-loop
        const referencedLayer = await ResolveLayer(referenceIdentifier, depth + 1, prim.path, state);
        const targetPath = ResolveReferenceTargetPath(reference.primPath, referencedLayer, prim.path, state);
        if (!targetPath) {
            continue;
        }

        const duplicateKey = `${referenceIdentifier}#${targetPath}`;
        if (seenReferences.has(duplicateKey)) {
            AddCompositionDiagnostic(state, "error", prim.path, `Duplicate reference '${referenceIdentifier}' targeting '${targetPath}' was ignored.`);
            continue;
        }
        seenReferences.add(duplicateKey);

        const referencedPrim = FindPrimByPath(referencedLayer.rootPrims, targetPath);
        if (!referencedPrim) {
            AddCompositionDiagnostic(state, "error", prim.path, `Referenced prim '${targetPath}' does not exist in layer '${referenceIdentifier}'.`);
            continue;
        }

        state.metadataLayer ??= referencedLayer;
        const graftedPrim = RemapPrimPaths(referencedPrim, prim.path);
        composed = MergePrimOpinions(composed, graftedPrim);
    }

    return composed;
}

function ReadReferenceOpinions(listOp: NonNullable<ISdfPrimSpec["references"]>, path: string, state: ICompositionState): ISdfReference[] {
    if ((listOp.deleted?.length ?? 0) > 0 || (listOp.ordered?.length ?? 0) > 0) {
        AddCompositionDiagnostic(state, "error", path, "Reference list operations using delete or reorder are not supported; supported additions were still composed.");
    }

    const references = ReadListOpItems(listOp);
    if (references.length === 0 && (listOp.isExplicit || listOp.deleted?.length || listOp.ordered?.length)) {
        AddCompositionDiagnostic(state, "error", path, "Reference list opinion contains no supported reference additions.");
    }
    return references;
}

function ResolveReferenceIdentifier(reference: ISdfReference, layerIdentifier: string, path: string, state: ICompositionState): string | undefined {
    if (!reference.assetPath.trim()) {
        AddCompositionDiagnostic(state, "error", path, "Internal references without an authored layer asset path are not supported.");
        return undefined;
    }
    if (reference.layerOffset && (!Number.isFinite(reference.layerOffset.offset) || !Number.isFinite(reference.layerOffset.scale) || reference.layerOffset.scale === 0)) {
        AddCompositionDiagnostic(state, "error", path, "Reference layer offsets must have finite values and a non-zero scale.");
        return undefined;
    }

    try {
        return ResolveAssetIdentifier(reference.assetPath, layerIdentifier);
    } catch {
        AddCompositionDiagnostic(state, "error", path, "Reference asset path could not be resolved against its authoring layer.");
        return undefined;
    }
}

function ResolveReferenceTargetPath(authoredPath: string | undefined, referencedLayer: ISdfLayer, path: string, state: ICompositionState): string | undefined {
    const targetPath = authoredPath ?? referencedLayer.defaultPrim;
    if (!targetPath) {
        AddCompositionDiagnostic(state, "error", path, "Reference has no prim path and the referenced layer has no defaultPrim.");
        return undefined;
    }
    if (!targetPath.startsWith("/")) {
        AddCompositionDiagnostic(state, "error", path, `Reference prim path '${targetPath}' must be absolute.`);
        return undefined;
    }
    const normalized = NormalizePrimPath(targetPath);
    if (normalized === "/") {
        AddCompositionDiagnostic(state, "error", path, "References to the layer root are not supported.");
        return undefined;
    }
    return normalized;
}

async function ResolveLayer(identifier: string, depth: number, referencePath: string, state: ICompositionState): Promise<ISdfLayer> {
    if (state.activeIdentifiers.includes(identifier)) {
        throw new UsdCompositionError("cycle", `USD reference cycle detected while resolving '${identifier}'.`, {
            identifier,
            path: referencePath,
        });
    }
    if (depth > state.limits.maxLayerDepth) {
        throw new UsdResourceLimitError("layer-depth", state.limits.maxLayerDepth, `USD: reference depth exceeds the ${state.limits.maxLayerDepth}-layer depth cap.`, {
            actual: depth,
            path: referencePath,
        });
    }
    const cached = state.composedLayers.get(identifier);
    if (cached) {
        return cached;
    }
    if (state.layerCount >= state.limits.maxLayerCount) {
        throw new UsdResourceLimitError("layer-count", state.limits.maxLayerCount, `USD: layer count exceeds the ${state.limits.maxLayerCount}-layer resource cap.`, {
            actual: state.layerCount + 1,
            path: identifier,
        });
    }

    let data: UsdLayerSourceData | undefined;
    try {
        data = await state.source.loadLayerAsync(identifier);
    } catch (cause) {
        if (cause instanceof UsdLayerLoadError) {
            throw cause;
        }
        const kind = IsMissingLayerSourceError(cause) ? "missing-layer" : "fetch-failed";
        const message = kind === "missing-layer" ? `USD: referenced layer '${identifier}' was not found.` : `USD: failed to fetch referenced layer '${identifier}'.`;
        throw new UsdLayerLoadError(kind, identifier, message, { path: referencePath, cause });
    }
    if (data === undefined) {
        throw new UsdLayerLoadError("missing-layer", identifier, `USD: referenced layer '${identifier}' was not found.`, { path: referencePath });
    }
    if (GetUsdLayerByteLength(data) > state.limits.maxLayerBytes) {
        throw new UsdResourceLimitError("layer-bytes", state.limits.maxLayerBytes, `USD: layer exceeds the ${state.limits.maxLayerBytes}-byte resource cap.`, {
            actual: GetUsdLayerByteLength(data),
            path: identifier,
        });
    }

    let layer: ISdfLayer;
    try {
        const text = DecodeUsdLayerText(data, identifier);
        const parsed = ParseUsdaWithDiagnostics(text, identifier, state.limits.parserLimits);
        for (const diagnostic of parsed.diagnostics) {
            state.diagnostics.push({
                severity: "warning",
                message: diagnostic.message,
                path: identifier,
                sourceLocation: { line: diagnostic.line, column: diagnostic.column },
            });
        }
        layer = parsed.layer;
    } catch (error) {
        if (error instanceof UsdResourceLimitError || error instanceof UsdUnsupportedFormatError) {
            throw error;
        }
        throw new UsdCompositionError("invalid-layer", `USD: referenced layer '${identifier}' could not be parsed.`, { identifier, path: referencePath });
    }

    state.layerCount++;
    CountLayerNodes(layer, state);
    ReportReferencedLayerPolicyDiagnostics(layer, state);
    state.activeIdentifiers.push(identifier);
    try {
        const composed = { ...layer, rootPrims: await ComposeLayerPrims(layer, depth, state) };
        state.composedLayers.set(identifier, composed);
        return composed;
    } finally {
        state.activeIdentifiers.pop();
    }
}

function ReportReferencedLayerPolicyDiagnostics(layer: ISdfLayer, state: ICompositionState): void {
    for (const subLayer of layer.subLayers) {
        AddCompositionDiagnostic(state, "error", layer.identifier, `[usda-sublayer-unsupported] Sublayer '${subLayer.assetPath}' was ignored because sublayers are not supported.`);
    }
    if (layer.metadata?.relocates !== undefined) {
        AddCompositionDiagnostic(state, "error", layer.identifier, "[usda-relocates-unsupported] Layer relocates were ignored because relocates are not supported.");
    }
}

function CountLayerNodes(layer: ISdfLayer, state: ICompositionState): void {
    const visit = (prim: ISdfPrimSpec) => {
        state.layerNodes++;
        if (state.layerNodes > state.limits.maxLayerNodes) {
            throw new UsdResourceLimitError("layer-nodes", state.limits.maxLayerNodes, `USD: layer node count exceeds the ${state.limits.maxLayerNodes}-node resource cap.`, {
                actual: state.layerNodes,
                path: prim.path,
            });
        }
        prim.children.forEach(visit);
    };
    layer.rootPrims.forEach(visit);
}

function AddCompositionWork(state: ICompositionState, path: string): void {
    state.compositionWork++;
    if (state.compositionWork > state.limits.maxCompositionWork) {
        throw new UsdResourceLimitError(
            "composition-work",
            state.limits.maxCompositionWork,
            `USD: composition work exceeds the ${state.limits.maxCompositionWork}-unit resource cap.`,
            { actual: state.compositionWork, path }
        );
    }
}

function AddCompositionDiagnostic(state: ICompositionState, severity: IResolvedDiagnostic["severity"], path: string, message: string): void {
    state.diagnostics.push({ severity, path, message });
}

function IsMissingLayerSourceError(error: unknown): boolean {
    if (!IsRecord(error) || !IsRecord(error.request)) {
        return false;
    }
    return error.request.status === 404 || error.request.status === 410;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function FindPrimByPath(prims: readonly ISdfPrimSpec[], path: string): ISdfPrimSpec | undefined {
    for (const prim of prims) {
        if (prim.path === path) {
            return prim;
        }
        const nested = FindPrimByPath(prim.children, path);
        if (nested) {
            return nested;
        }
    }
    return undefined;
}

function RemapPrimPaths(prim: ISdfPrimSpec, targetPath: string): ISdfPrimSpec {
    const remap = (source: ISdfPrimSpec): ISdfPrimSpec => {
        const suffix = source.path === prim.path ? "" : source.path.slice(prim.path.length);
        const path = `${targetPath}${suffix}`;
        return {
            ...source,
            name: path.slice(path.lastIndexOf("/") + 1),
            path,
            properties: RemapPropertyPaths(source.properties, prim.path, targetPath),
            children: source.children.map(remap),
        };
    };
    return remap(prim);
}

function RemapPropertyPaths(properties: Record<string, ISdfPropertySpec>, sourceRoot: string, targetRoot: string): Record<string, ISdfPropertySpec> {
    return Object.fromEntries(Object.entries(properties).map(([name, property]) => [name, RemapPropertyPath(property, sourceRoot, targetRoot)]));
}

function RemapPropertyPath(property: ISdfPropertySpec, sourceRoot: string, targetRoot: string): ISdfPropertySpec {
    const path = property.path ? RemapAuthoredPrimPath(property.path, sourceRoot, targetRoot) : property.path;
    if (property.kind === "relationship") {
        return { ...property, path, targets: RemapListOpPaths(property.targets, sourceRoot, targetRoot) };
    }
    return {
        ...property,
        path,
        connections: property.connections ? RemapListOpPaths(property.connections, sourceRoot, targetRoot) : property.connections,
    };
}

function RemapListOpPaths(listOp: ISdfListOp<string>, sourceRoot: string, targetRoot: string): ISdfListOp<string> {
    const map = (items: string[] | undefined): string[] | undefined => items?.map((item) => RemapAuthoredPrimPath(item, sourceRoot, targetRoot));
    return {
        ...listOp,
        explicit: map(listOp.explicit),
        prepended: map(listOp.prepended),
        appended: map(listOp.appended),
        added: map(listOp.added),
        deleted: map(listOp.deleted),
        ordered: map(listOp.ordered),
    };
}

function RemapAuthoredPrimPath(path: string, sourceRoot: string, targetRoot: string): string {
    if (path === sourceRoot) {
        return targetRoot;
    }
    if (path.startsWith(`${sourceRoot}/`) || path.startsWith(`${sourceRoot}.`)) {
        return `${targetRoot}${path.slice(sourceRoot.length)}`;
    }
    return path;
}

function MergePrimOpinions(local: ISdfPrimSpec, referenced: ISdfPrimSpec): ISdfPrimSpec {
    const localChildrenByName = new Map(local.children.map((child) => [child.name, child]));
    const children = referenced.children.map((child) => {
        const localChild = localChildrenByName.get(child.name);
        if (localChild) {
            localChildrenByName.delete(child.name);
            return MergePrimOpinions(localChild, child);
        }
        return child;
    });
    children.push(...localChildrenByName.values());

    return {
        ...referenced,
        ...local,
        properties: { ...referenced.properties, ...local.properties },
        children,
        references: undefined,
    };
}

function NormalizePrimPath(path: string): string {
    const segments: string[] = [];
    for (const segment of path.split("/")) {
        if (!segment || segment === ".") {
            continue;
        }
        if (segment === "..") {
            segments.pop();
        } else {
            segments.push(segment);
        }
    }
    return `/${segments.join("/")}`;
}
