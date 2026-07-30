import { type TransformNode } from "core/Meshes/transformNode.pure";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { type AssetContainer } from "core/assetContainer";

import { type IResolvedPrim } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "../usdExternalAssetHandler";
import { ValidateResourceLimit } from "../usdErrors";
import { type IUsdAdapterContext } from "./sceneGraphAdapter";

/** Default limits for external asset handler invocations per load operation. */
const DefaultMaxExternalAssetRequests = 64;
const DefaultMaxExternalAssetDepth = 32;

/**
 * Mutable state for the external asset handler within a single load operation.
 * Tracks canonical-URI deduplication and request counts.
 */
export interface IExternalAssetState {
    /**
     * Canonical URI → off-scene source container template. `null` means the handler reported
     * unsupported. Every occurrence (including the first) is instantiated from the template via
     * `instantiateModelsToScene`; the template itself never enters the scene.
     */
    readonly sourceCache: Map<string, AssetContainer | null>;
    /** Number of handler invocations issued so far. */
    requestCount: number;
    /** Validated maximum handler invocations. */
    readonly maxRequests: number;
    /** Validated maximum external asset URI ancestry depth. */
    readonly maxDepth: number;
}

/**
 * Creates a fresh external asset state for one load operation, validating limits from options.
 * @param options loader options containing limit overrides
 * @returns initialized state
 */
export function CreateExternalAssetState(options: Readonly<USDLoadingOptions>): IExternalAssetState {
    return {
        sourceCache: new Map(),
        requestCount: 0,
        maxRequests:
            options.maxExternalAssetRequests !== undefined ? ValidateResourceLimit(options.maxExternalAssetRequests, "maxExternalAssetRequests") : DefaultMaxExternalAssetRequests,
        maxDepth: options.maxExternalAssetDepth !== undefined ? ValidateResourceLimit(options.maxExternalAssetDepth, "maxExternalAssetDepth") : DefaultMaxExternalAssetDepth,
    };
}

/**
 * Disposes all off-scene source container templates after all external assets have been
 * instantiated. Each template was only used via `instantiateModelsToScene` (with material
 * cloning), so disposing it does not affect scene-owned clones.
 * @param state the external asset state to clean up
 */
export function DisposeSourceContainers(state: IExternalAssetState): void {
    for (const [, container] of state.sourceCache) {
        if (container) {
            container.dispose();
        }
    }
    state.sourceCache.clear();
}

/**
 * Builds the bounded ancestry array for a resolved prim from its path segments.
 * The first element is the prim itself; subsequent elements are its ancestors up to
 * (but not including) the stage root `/`.
 * @param prim the prim to compute ancestry for
 * @returns ordered ancestor paths
 */
export function BuildAncestry(prim: IResolvedPrim): readonly string[] {
    const ancestry: string[] = [prim.path];
    const segments = prim.path.split("/").filter(Boolean);
    for (let depth = segments.length - 1; depth > 0; depth--) {
        ancestry.push("/" + segments.slice(0, depth).join("/"));
    }
    return ancestry;
}

/**
 * Processes all unhandled asset properties on a single prim, invoking the handler for each.
 *
 * URI ancestry cycle protection and depth limiting are driven by `ancestorUris`, which is
 * the set of canonical external-asset URIs from ancestor prims in the current prim-tree
 * recursion. This models external-asset request chains through the resolved prim hierarchy
 * rather than tracking async call depth.
 *
 * @param prim the resolved prim with unhandled asset properties
 * @param node the Babylon transform node representing this prim
 * @param context the adapter context
 * @param state external asset handler state
 * @param layerIdentifier the source layer identifier
 * @param ancestorUris canonical URIs from ancestor prims' external asset properties
 * @returns a promise that resolves when all handler invocations are complete
 */
export async function ProcessExternalAssets(
    prim: IResolvedPrim,
    node: TransformNode,
    context: IUsdAdapterContext,
    state: IExternalAssetState,
    layerIdentifier: string,
    ancestorUris: ReadonlySet<string>
): Promise<void> {
    const handler = context.options.externalAssetHandler;
    const properties = prim.unhandledAssetProperties;
    if (!properties || properties.length === 0) {
        return;
    }

    const ancestry = BuildAncestry(prim);

    for (const property of properties) {
        if (!handler) {
            context.diagnostics.push({
                severity: "info",
                path: `${prim.path}.${property.propertyName}`,
                message: `Unhandled asset-valued property '${property.propertyName}' references '${property.authoredPath}'; no external asset handler is configured.`,
            });
            continue;
        }

        const canonicalUri = property.resolvedPath;

        // Ancestry-based cycle protection: reject if this canonical URI appears in any
        // ancestor prim's external asset properties (would indicate a recursive chain).
        if (ancestorUris.has(canonicalUri)) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset cycle detected: '${property.authoredPath}' (resolved '${canonicalUri}') is already in the ancestor URI chain.`,
            });
            continue;
        }

        // URI ancestry depth limit: the number of ancestor external-asset URIs is the
        // chain depth. This is independent of prim namespace nesting.
        if (ancestorUris.size >= state.maxDepth) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset depth limit reached: URI chain depth ${ancestorUris.size} has reached the ${state.maxDepth}-level limit.`,
            });
            continue;
        }

        // Request count limit
        if (state.requestCount >= state.maxRequests) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler request skipped: request count ${state.requestCount} has reached the ${state.maxRequests}-request limit.`,
            });
            continue;
        }

        // Canonical-URI deduplication: reuse a cached template without re-invoking the handler.
        if (state.sourceCache.has(canonicalUri)) {
            const cachedContainer = state.sourceCache.get(canonicalUri);
            if (cachedContainer) {
                InstantiateFromTemplate(cachedContainer, node, context);
            } else {
                context.diagnostics.push({
                    severity: "info",
                    path: `${prim.path}.${property.propertyName}`,
                    message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
                });
            }
            continue;
        }

        const request: IUsdExternalAssetRequest = {
            primPath: prim.path,
            propertyName: property.propertyName,
            authoredUri: property.authoredPath,
            resolvedUri: property.resolvedPath,
            sourceLayerIdentifier: layerIdentifier,
            scene: context.scene,
            ancestry,
        };

        state.requestCount++;

        // Handler exceptions propagate as normal SceneLoader failures
        // eslint-disable-next-line no-await-in-loop
        const result = await handler(request);

        if (result.handled) {
            state.sourceCache.set(canonicalUri, result.container);
            InstantiateFromTemplate(result.container, node, context);
        } else {
            state.sourceCache.set(canonicalUri, null);
            context.diagnostics.push({
                severity: "info",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
            });
        }
    }
}

/**
 * Returns the set of ancestor URIs extended with any canonical URIs from this prim's own
 * unhandled asset properties. Used to thread URI ancestry through child prim processing
 * so that cycle detection and depth limiting work across the prim-tree recursion.
 * @param prim the prim whose external asset URIs should be added
 * @param ancestorUris the current set of ancestor URIs
 * @returns a new set if this prim adds URIs, or the same set if it has none
 */
export function ExtendAncestorUris(prim: IResolvedPrim, ancestorUris: ReadonlySet<string>): ReadonlySet<string> {
    if (!prim.unhandledAssetProperties || prim.unhandledAssetProperties.length === 0) {
        return ancestorUris;
    }
    const extended = new Set(ancestorUris);
    for (const property of prim.unhandledAssetProperties) {
        extended.add(property.resolvedPath);
    }
    return extended;
}

/**
 * Creates a distinct instance from an off-scene source container template and parents its
 * root nodes under the given prim transform node.
 *
 * Every occurrence (including the first) goes through `instantiateModelsToScene` with
 * material cloning enabled. The template stays off-scene and is disposed after all prims
 * have been processed.
 * @param template the handler-returned source container (kept off-scene)
 * @param parentNode the Babylon transform node to parent instantiated roots under
 * @param context the adapter context for ownership tracking
 */
function InstantiateFromTemplate(template: AssetContainer, parentNode: TransformNode, context: IUsdAdapterContext): void {
    const entries = template.instantiateModelsToScene(undefined, true, { doNotInstantiate: false });

    for (const rootNode of entries.rootNodes) {
        rootNode.parent = parentNode;
        if (IsAbstractMesh(rootNode)) {
            if (!context.meshes.includes(rootNode)) {
                context.meshes.push(rootNode);
            }
        } else {
            const tn = rootNode as TransformNode;
            if (!context.transformNodes.includes(tn)) {
                context.transformNodes.push(tn);
            }
        }
        for (const child of rootNode.getChildMeshes(false)) {
            if (!context.meshes.includes(child)) {
                context.meshes.push(child);
            }
        }
    }
    for (const skeleton of entries.skeletons) {
        if (!context.skeletons.includes(skeleton)) {
            context.skeletons.push(skeleton);
        }
    }
    for (const animationGroup of entries.animationGroups) {
        if (!context.animationGroups.includes(animationGroup)) {
            context.animationGroups.push(animationGroup);
        }
    }
}

function IsAbstractMesh(node: import("core/node").Node): node is AbstractMesh {
    return "geometry" in node;
}
