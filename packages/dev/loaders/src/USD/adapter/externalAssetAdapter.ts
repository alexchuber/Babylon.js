import { type TransformNode } from "core/Meshes/transformNode.pure";

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
 * Tracks canonical-URI deduplication and request counts.
 */
export interface IExternalAssetState {
    /** Canonical URI → handler result cache for deduplication. */
    readonly resultCache: Map<string, UsdExternalAssetResult>;
    /** Number of handler invocations issued so far. */
    requestCount: number;
    /** Validated maximum handler invocations. */
    readonly maxRequests: number;
    /** Validated maximum ancestry depth. */
    readonly maxDepth: number;
}

/**
 * Creates a fresh external asset state for one load operation, validating limits from options.
 * @param options loader options containing limit overrides
 * @returns initialized state
 */
export function CreateExternalAssetState(options: Readonly<USDLoadingOptions>): IExternalAssetState {
    return {
        resultCache: new Map(),
        requestCount: 0,
        maxRequests:
            options.maxExternalAssetRequests !== undefined ? ValidateResourceLimit(options.maxExternalAssetRequests, "maxExternalAssetRequests") : DefaultMaxExternalAssetRequests,
        maxDepth: options.maxExternalAssetDepth !== undefined ? ValidateResourceLimit(options.maxExternalAssetDepth, "maxExternalAssetDepth") : DefaultMaxExternalAssetDepth,
    };
}

/**
 * Builds the bounded ancestry array for a resolved prim by walking up the prim tree.
 * The first element is the prim itself, subsequent elements are its ancestors up to
 * (but not including) the stage root `/`.
 * @param prim the prim to compute ancestry for
 * @param stageRoot the resolved stage root prim
 * @returns ordered ancestor paths
 */
export function BuildAncestry(prim: IResolvedPrim, stageRoot: IResolvedPrim): readonly string[] {
    const ancestry: string[] = [prim.path];
    // Ancestry is derived from the prim path segments
    const segments = prim.path.split("/").filter(Boolean);
    for (let depth = segments.length - 1; depth > 0; depth--) {
        ancestry.push("/" + segments.slice(0, depth).join("/"));
    }
    return ancestry;
}

/**
 * Processes all unhandled asset properties on a single prim, invoking the handler for each.
 * Handles deduplication, request limits, depth limits, and container
 * root instantiation under the prim's transform node.
 *
 * @param prim the resolved prim with unhandled asset properties
 * @param node the Babylon transform node representing this prim
 * @param context the adapter context
 * @param state external asset handler state
 * @param layerIdentifier the source layer identifier
 * @param stageRoot the resolved stage root for ancestry computation
 * @returns a promise that resolves when all handler invocations are complete
 */
export async function ProcessExternalAssets(
    prim: IResolvedPrim,
    node: TransformNode,
    context: IUsdAdapterContext,
    state: IExternalAssetState,
    layerIdentifier: string,
    stageRoot: IResolvedPrim
): Promise<void> {
    const handler = context.options.externalAssetHandler;
    const properties = prim.unhandledAssetProperties;
    if (!properties || properties.length === 0) {
        return;
    }

    const ancestry = BuildAncestry(prim, stageRoot);

    // Depth limit: ancestry length is the nesting depth (prim itself = 1, child = 2, etc.)
    if (ancestry.length > state.maxDepth) {
        context.diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `External asset properties skipped: prim depth ${ancestry.length} exceeds the ${state.maxDepth}-level depth limit.`,
        });
        return;
    }

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

    // Canonical-URI deduplication: reuse a previous result for the same resolved URI
    const cached = state.resultCache.get(canonicalUri);
    if (cached) {
        if (cached.handled) {
            InstantiateContainerRoots(cached.container, node, context);
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

    // Handler exceptions propagate as normal SceneLoader failures
    const result = await handler(request);
    state.resultCache.set(canonicalUri, result);

    if (result.handled) {
        InstantiateContainerRoots(result.container, node, context);
    } else {
        context.diagnostics.push({
            severity: "info",
            path: `${prim.path}.${property.propertyName}`,
            message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
        });
    }
}

/**
 * Instantiates the root nodes from a handler-returned AssetContainer under the given
 * parent transform node, and registers them in the adapter context for ownership tracking.
 * @param container the handler-returned asset container
 * @param parentNode the Babylon transform node to parent roots under
 * @param context the adapter context for ownership tracking
 */
function InstantiateContainerRoots(container: import("core/assetContainer").AssetContainer, parentNode: TransformNode, context: IUsdAdapterContext): void {
    // Add all container entities to scene first
    container.addAllToScene();

    // Re-parent root meshes and transform nodes under the USD prim's transform node.
    // Root entities are those whose parent is null (scene root) after addAllToScene.
    for (const mesh of container.meshes) {
        if (!mesh.parent) {
            mesh.parent = parentNode;
        }
        if (!context.meshes.includes(mesh)) {
            context.meshes.push(mesh);
        }
    }
    for (const transformNode of container.transformNodes) {
        if (!transformNode.parent) {
            transformNode.parent = parentNode;
        }
        if (!context.transformNodes.includes(transformNode)) {
            context.transformNodes.push(transformNode);
        }
    }
    for (const skeleton of container.skeletons) {
        if (!context.skeletons.includes(skeleton)) {
            context.skeletons.push(skeleton);
        }
    }
    for (const animationGroup of container.animationGroups) {
        if (!context.animationGroups.includes(animationGroup)) {
            context.animationGroups.push(animationGroup);
        }
    }
}
