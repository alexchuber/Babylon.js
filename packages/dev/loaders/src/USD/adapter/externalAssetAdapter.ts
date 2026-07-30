import { type TransformNode } from "core/Meshes/transformNode.pure";
import { type AssetContainer } from "core/assetContainer";

import { type IResolvedPrim, type IResolvedUnhandledAssetProperty } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "../usdExternalAssetHandler";
import { ValidateResourceLimit } from "../usdErrors";
import { type IUsdAdapterContext } from "./sceneGraphAdapter";

/** Default limits for external asset handler invocations per load operation. */
const DefaultMaxExternalAssetRequests = 64;
const DefaultMaxExternalAssetDepth = 32;

/**
 * Mutable state for the external asset handler within a single load operation.
 * Tracks canonical-URI deduplication, request counts, and the active URI chain
 * for ancestry-based cycle protection.
 */
export interface IExternalAssetState {
    /** Canonical URI → source container cache for deduplication. `null` means the handler reported unsupported. */
    readonly sourceCache: Map<string, AssetContainer | null>;
    /** Number of handler invocations issued so far. */
    requestCount: number;
    /** Validated maximum handler invocations. */
    readonly maxRequests: number;
    /** Validated maximum external asset request chain depth. */
    readonly maxDepth: number;
    /** Active canonical URI chain for ancestry-based cycle detection. A URI is added before handler invocation and removed after. */
    readonly activeUriChain: Set<string>;
    /** Source containers that have already been instantiated once (used for clone-on-reuse logic). */
    readonly alreadyUsed: Set<AssetContainer>;
}

/**
 * Disposes all source containers cached during the load operation. Called once after all
 * external asset instantiations are complete. Source containers that were used via
 * `addAllToScene` (first use) have their arrays cleared without disposing scene-owned
 * entities; containers only used for cloning are fully disposed.
 * @param state the external asset state whose source containers should be cleaned up
 */
export function DisposeSourceContainers(state: IExternalAssetState): void {
    for (const [, container] of state.sourceCache) {
        if (container) {
            if (state.alreadyUsed.has(container)) {
                // First-use container: entities are scene-owned. Clear arrays to release references
                // without disposing the entities themselves.
                container.meshes.length = 0;
                container.transformNodes.length = 0;
                container.skeletons.length = 0;
                container.animationGroups.length = 0;
                container.materials.length = 0;
                container.textures.length = 0;
                container.geometries.length = 0;
            }
            container.dispose();
        }
    }
    state.sourceCache.clear();
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
        activeUriChain: new Set(),
        alreadyUsed: new Set(),
    };
}

/**
 * Builds the bounded ancestry array for a resolved prim by walking up the prim tree.
 * The first element is the prim itself, subsequent elements are its ancestors up to
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
 * Handles canonical-URI deduplication, per-prim instantiation, request limits, external-chain
 * depth limits, ancestry-based cycle protection, and container root instantiation.
 *
 * @param prim the resolved prim with unhandled asset properties
 * @param node the Babylon transform node representing this prim
 * @param context the adapter context
 * @param state external asset handler state
 * @param layerIdentifier the source layer identifier
 * @returns a promise that resolves when all handler invocations are complete
 */
export async function ProcessExternalAssets(
    prim: IResolvedPrim,
    node: TransformNode,
    context: IUsdAdapterContext,
    state: IExternalAssetState,
    layerIdentifier: string
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

        // Request count limit
        if (state.requestCount >= state.maxRequests) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler request skipped: request count ${state.requestCount} has reached the ${state.maxRequests}-request limit.`,
            });
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await DispatchExternalAsset(prim, property, node, context, state, layerIdentifier, ancestry);
    }
}

async function DispatchExternalAsset(
    prim: IResolvedPrim,
    property: IResolvedUnhandledAssetProperty,
    node: TransformNode,
    context: IUsdAdapterContext,
    state: IExternalAssetState,
    layerIdentifier: string,
    ancestry: readonly string[]
): Promise<void> {
    const handler = context.options.externalAssetHandler!;
    const canonicalUri = property.resolvedPath;

    // Ancestry-based cycle protection: reject if this canonical URI is already being
    // processed in the current request chain (would indicate recursive asset loading).
    if (state.activeUriChain.has(canonicalUri)) {
        context.diagnostics.push({
            severity: "warning",
            path: `${prim.path}.${property.propertyName}`,
            message: `External asset cycle detected: '${property.authoredPath}' (resolved '${canonicalUri}') is already in the active request chain.`,
        });
        return;
    }

    // External-chain depth limit: the active URI chain depth tracks how many external
    // asset requests are nested, independent of prim nesting depth.
    if (state.activeUriChain.size >= state.maxDepth) {
        context.diagnostics.push({
            severity: "warning",
            path: `${prim.path}.${property.propertyName}`,
            message: `External asset depth limit reached: request chain depth ${state.activeUriChain.size} has reached the ${state.maxDepth}-level limit.`,
        });
        return;
    }

    // Canonical-URI deduplication: check if we already have a source container for this URI.
    if (state.sourceCache.has(canonicalUri)) {
        const cachedContainer = state.sourceCache.get(canonicalUri);
        if (cachedContainer) {
            InstantiateFromSource(cachedContainer, node, context, state.alreadyUsed);
        } else {
            // Cached unsupported result: emit diagnostic for this occurrence too
            context.diagnostics.push({
                severity: "info",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
            });
        }
        return;
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
    state.activeUriChain.add(canonicalUri);

    try {
        // Handler exceptions propagate as normal SceneLoader failures
        const result = await handler(request);

        if (result.handled) {
            // Cache the source container for deduplication
            state.sourceCache.set(canonicalUri, result.container);
            InstantiateFromSource(result.container, node, context, state.alreadyUsed);
        } else {
            // Cache null to indicate unsupported, so subsequent occurrences are fast
            state.sourceCache.set(canonicalUri, null);
            context.diagnostics.push({
                severity: "info",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
            });
        }
    } finally {
        state.activeUriChain.delete(canonicalUri);
    }
}

/**
 * Creates a distinct instance from a source AssetContainer and parents its root entities
 * under the given prim transform node. Each call adds the source container's entities to
 * the scene and re-parents rootless ones under the prim node.
 *
 * For the first call, entities are moved directly from the source container. For subsequent
 * calls (same URI via deduplication), meshes are cloned to create independent geometry.
 * @param sourceContainer the handler-returned source container (kept off-scene)
 * @param parentNode the Babylon transform node to parent instantiated roots under
 * @param context the adapter context for ownership tracking
 * @param alreadyUsed set of source containers that have already been used (for clone logic)
 */
function InstantiateFromSource(sourceContainer: AssetContainer, parentNode: TransformNode, context: IUsdAdapterContext, alreadyUsed: Set<AssetContainer>): void {
    const isReuse = alreadyUsed.has(sourceContainer);
    alreadyUsed.add(sourceContainer);

    if (!isReuse) {
        // First use: move source entities directly into the scene
        sourceContainer.addAllToScene();
        for (const mesh of sourceContainer.meshes) {
            if (!mesh.parent) {
                mesh.parent = parentNode;
            }
            if (!context.meshes.includes(mesh)) {
                context.meshes.push(mesh);
            }
        }
        for (const tn of sourceContainer.transformNodes) {
            if (!tn.parent) {
                tn.parent = parentNode;
            }
            if (!context.transformNodes.includes(tn)) {
                context.transformNodes.push(tn);
            }
        }
        for (const skeleton of sourceContainer.skeletons) {
            if (!context.skeletons.includes(skeleton)) {
                context.skeletons.push(skeleton);
            }
        }
        for (const animationGroup of sourceContainer.animationGroups) {
            if (!context.animationGroups.includes(animationGroup)) {
                context.animationGroups.push(animationGroup);
            }
        }
    } else {
        // Reuse: clone each root mesh to create an independent hierarchy
        for (const mesh of sourceContainer.meshes) {
            const cloned = mesh.clone(mesh.name, parentNode);
            if (cloned) {
                if (!context.meshes.includes(cloned)) {
                    context.meshes.push(cloned);
                }
            }
        }
        for (const tn of sourceContainer.transformNodes) {
            const cloned = tn.clone(tn.name, parentNode);
            if (cloned) {
                if (!context.transformNodes.includes(cloned)) {
                    context.transformNodes.push(cloned);
                }
            }
        }
    }
}
